import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { getPointerWatcher } from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

const ICON_RENDER_SIZE = 128;
const HOT_X_RATIO = 16 / 96;
const HOT_Y_RATIO = 12 / 96;
const FRAME_INTERVAL_MS = 16; // ~60 FPS
const STOP_TIMEOUT_US = 65000; // 65ms without movement counts as stopped

/**
 * Safely retrieve the Meta.CursorTracker instance across GNOME Shell 45–50+.
 *
 * @returns {Meta.CursorTracker | null}
 */
function getCursorTracker() {
    if (typeof global.backend?.get_cursor_tracker === 'function')
        return global.backend.get_cursor_tracker();
    if (typeof Meta.CursorTracker?.get_for_display === 'function')
        return Meta.CursorTracker.get_for_display(global.display);
    return null;
}

/**
 * Safely retrieve the default Clutter.Seat across GNOME Shell 45–50+.
 *
 * @returns {Clutter.Seat | null}
 */
function getDefaultSeat() {
    if (typeof Clutter.get_default_backend === 'function') {
        const backend = Clutter.get_default_backend();
        if (typeof backend?.get_default_seat === 'function')
            return backend.get_default_seat();
    }
    return global.stage?.context?.get_backend?.()?.get_default_seat?.() ?? null;
}

const _TYPE_SUFFIX = `${GLib.get_monotonic_time()}`;

const SpeedCursorQuickToggle = GObject.registerClass({
    GTypeName: `SpeedCursorQuickToggle_${_TYPE_SUFFIX}`,
}, class SpeedCursorQuickToggle extends QuickSettings.QuickMenuToggle {
    _init(settings, openPrefsCallback) {
        super._init({
            title: 'Speed Cursor',
            subtitle: 'Dynamic Size',
            iconName: 'input-mouse-symbolic',
            toggleMode: true,
        });

        this._settings = settings;
        this._openPrefsCallback = openPrefsCallback;

        this._settings.bind(
            'effect-enabled',
            this,
            'checked',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.menu.setHeader(
            'input-mouse-symbolic',
            'Speed Cursor',
            'Scale mouse pointer with movement speed'
        );

        const presetsSection = new PopupMenu.PopupMenuSection();
        const presets = [
            { label: 'Subtle (1.2x – 2.5x)', min: 1.2, max: 2.5 },
            { label: 'Balanced (1.3x – 4.0x)', min: 1.3, max: 4.0 },
            { label: 'Large (1.4x – 5.5x)', min: 1.4, max: 5.5 },
            { label: 'Extra Large (1.5x – 7.5x)', min: 1.5, max: 7.5 },
        ];

        this._presetItems = presets.map(preset => {
            const item = new PopupMenu.PopupMenuItem(preset.label);
            item.connect('activate', () => {
                this._settings.set_double('min-move-scale', preset.min);
                this._settings.set_double('max-fast-scale', preset.max);
                this._settings.set_boolean('effect-enabled', true);
            });
            presetsSection.addMenuItem(item);
            return { item, ...preset };
        });

        this.menu.addMenuItem(presetsSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = this.menu.addAction('Speed Cursor Settings…', () => {
            Main.panel.statusArea.quickSettings?.menu?.close();
            this._openPrefsCallback?.();
        });
        prefsItem.visible = Main.sessionMode.allowSettings;

        this._syncSubtitle();
        this._settingsConnId = this._settings.connect('changed', () => {
            this._syncSubtitle();
        });
    }

    _syncSubtitle() {
        if (!this._settings)
            return;

        const enabled = this._settings.get_boolean('effect-enabled');
        const maxScale = this._settings.get_double('max-fast-scale');
        this.subtitle = enabled ? `Up to ${maxScale.toFixed(1)}x` : 'Off';

        if (this._presetItems) {
            for (const p of this._presetItems) {
                const isMatch = Math.abs(maxScale - p.max) < 0.15;
                p.item.setOrnament(
                    isMatch
                        ? PopupMenu.Ornament.CHECK
                        : PopupMenu.Ornament.NONE
                );
            }
        }
    }

    destroy() {
        if (this._settingsConnId && this._settings) {
            this._settings.disconnect(this._settingsConnId);
            this._settingsConnId = 0;
        }
        this._settings = null;
        this._openPrefsCallback = null;
        this._presetItems = null;
        super.destroy();
    }
});

const SpeedCursorIndicator = GObject.registerClass({
    GTypeName: `SpeedCursorIndicator_${_TYPE_SUFFIX}`,
}, class SpeedCursorIndicator extends QuickSettings.SystemIndicator {
    _init(settings, openPrefsCallback) {
        super._init();
        this._toggle = new SpeedCursorQuickToggle(settings, openPrefsCallback);
        this.quickSettingsItems.push(this._toggle);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems = [];
        this._toggle = null;
        super.destroy();
    }
});

export default class SpeedCursorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });

        this._cursorTracker = getCursorTracker();
        this._seat = getDefaultSeat();

        this._cursorUnfocusInhibited = false;
        this._cursorVisibleInhibited = false;

        this._baseCursorSize = this._interfaceSettings.get_int('cursor-size') || 24;
        this._interfaceSettingsChangedId = this._interfaceSettings.connect(
            'changed::cursor-size',
            () => {
                this._baseCursorSize =
                    this._interfaceSettings?.get_int('cursor-size') || 24;
            }
        );

        this._loadConfig();
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._loadConfig();
        });

        const iconPath = `${this.path}/icons/cursor.svg`;
        const gicon = Gio.Icon.new_for_string(iconPath);

        this._hotOffsetX = ICON_RENDER_SIZE * HOT_X_RATIO;
        this._hotOffsetY = ICON_RENDER_SIZE * HOT_Y_RATIO;

        this._actor = new St.Icon({
            gicon,
            icon_size: ICON_RENDER_SIZE,
            style: 'padding: 0px; margin: 0px;',
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._actor.set_size(ICON_RENDER_SIZE, ICON_RENDER_SIZE);
        this._actor.set_pivot_point(HOT_X_RATIO, HOT_Y_RATIO);

        Main.uiGroup.add_child(this._actor);

        const [initX, initY] = global.get_pointer();
        this._lastX = initX;
        this._lastY = initY;
        this._lastMoveTimeUs = GLib.get_monotonic_time();
        this._smoothSpeed = 0.0;
        this._currentScale = 1.0;
        this._animLoopId = 0;

        this._pointerWatcher = getPointerWatcher();
        this._pointerWatch = this._pointerWatcher.addWatch(
            FRAME_INTERVAL_MS,
            this._onPointerMoved.bind(this)
        );

        if (Main.panel?.statusArea?.quickSettings) {
            this._indicator = new SpeedCursorIndicator(
                this._settings,
                () => this.openPreferences()
            );
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        }
    }

    _loadConfig() {
        if (!this._settings)
            return;

        this._effectEnabled = this._settings.get_boolean('effect-enabled');
        this._minMoveScale = Math.max(1.0, this._settings.get_double('min-move-scale'));
        this._maxFastScale = Math.max(
            this._minMoveScale,
            this._settings.get_double('max-fast-scale')
        );
        this._maxSpeedThreshold = Math.max(
            200.0,
            this._settings.get_double('max-speed-threshold')
        );
        this._growSmoothing = Math.min(
            1.0,
            Math.max(0.05, this._settings.get_double('grow-smoothing'))
        );
        this._shrinkSmoothing = Math.min(
            1.0,
            Math.max(0.02, this._settings.get_double('shrink-smoothing'))
        );
        this._hideSystemCursorPref = this._settings.get_boolean('hide-system-cursor');

        if (!this._hideSystemCursorPref && this._cursorVisibleInhibited) {
            this._showSystemCursor();
        }

        if (!this._effectEnabled) {
            this._stopAnimationAndRestoreCursor();
        }
    }

    _stopAnimationAndRestoreCursor() {
        if (this._animLoopId) {
            GLib.Source.remove(this._animLoopId);
            this._animLoopId = 0;
        }
        this._currentScale = 1.0;
        this._smoothSpeed = 0.0;
        this._actor?.hide();
        this._showSystemCursor();
    }

    _isPointerVisibleBySystem() {
        if (!this._cursorTracker)
            return true;
        if (typeof this._cursorTracker.get_pointer_visible === 'function')
            return this._cursorTracker.get_pointer_visible();
        return true;
    }

    _onPointerMoved(x, y) {
        if (!this._effectEnabled || !this._actor)
            return;

        const nowUs = GLib.get_monotonic_time();
        const dtSec = Math.max(0.004, (nowUs - this._lastMoveTimeUs) / 1e6);
        const dist = Math.hypot(x - this._lastX, y - this._lastY);

        this._lastX = x;
        this._lastY = y;
        this._lastMoveTimeUs = nowUs;

        // If another application intentionally hid the cursor (e.g. video player / game), skip
        if (!this._cursorVisibleInhibited && !this._isPointerVisibleBySystem())
            return;

        // Update position immediately for zero-latency tracking
        this._actor.set_position(x - this._hotOffsetX, y - this._hotOffsetY);

        // Calculate instantaneous speed (px/sec) and blend into smoothed velocity
        const instantSpeed = Math.min(dist / dtSec, this._maxSpeedThreshold * 2.0);
        if (instantSpeed > this._smoothSpeed) {
            this._smoothSpeed = this._smoothSpeed * 0.55 + instantSpeed * 0.45;
        } else {
            this._smoothSpeed = this._smoothSpeed * 0.78 + instantSpeed * 0.22;
        }

        if (!this._animLoopId)
            this._startAnimationLoop();
    }

    _startAnimationLoop() {
        if (this._animLoopId || !this._actor)
            return;

        this._actor.show();
        Main.uiGroup.set_child_above_sibling(this._actor, null);
        if (this._hideSystemCursorPref)
            this._hideSystemCursor();

        this._animLoopId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FRAME_INTERVAL_MS,
            this._onAnimationFrame.bind(this)
        );
        GLib.Source.set_name_by_id(this._animLoopId, '[speed-cursor] animationFrame');
    }

    _onAnimationFrame() {
        if (!this._actor || !this._effectEnabled) {
            this._animLoopId = 0;
            this._showSystemCursor();
            return GLib.SOURCE_REMOVE;
        }

        const nowUs = GLib.get_monotonic_time();
        const elapsedSinceMoveUs = nowUs - this._lastMoveTimeUs;
        const isMoving = elapsedSinceMoveUs < STOP_TIMEOUT_US;

        let targetScale = 1.0;

        if (isMoving) {
            const speedNorm = Math.min(1.0, this._smoothSpeed / this._maxSpeedThreshold);
            const curvedSpeed = Math.pow(speedNorm, 0.75);
            targetScale =
                this._minMoveScale +
                (this._maxFastScale - this._minMoveScale) * curvedSpeed;
        } else {
            this._smoothSpeed *= 0.80;
            if (this._smoothSpeed > 40.0) {
                const speedNorm = Math.min(1.0, this._smoothSpeed / this._maxSpeedThreshold);
                targetScale = 1.0 + (this._maxFastScale - 1.0) * Math.pow(speedNorm, 0.85);
            } else {
                this._smoothSpeed = 0.0;
                targetScale = 1.0;
            }
        }

        if (targetScale > this._currentScale) {
            this._currentScale += (targetScale - this._currentScale) * this._growSmoothing;
        } else {
            this._currentScale += (targetScale - this._currentScale) * this._shrinkSmoothing;
        }

        const [curX, curY] = global.get_pointer();
        this._actor.set_position(curX - this._hotOffsetX, curY - this._hotOffsetY);

        const visualSize = this._baseCursorSize * this._currentScale;
        const actorScale = visualSize / ICON_RENDER_SIZE;
        this._actor.set_scale(actorScale, actorScale);

        if (!isMoving && this._currentScale <= 1.02) {
            this._currentScale = 1.0;
            this._smoothSpeed = 0.0;
            this._actor.hide();
            this._showSystemCursor();
            this._animLoopId = 0;
            return GLib.SOURCE_REMOVE;
        }

        return GLib.SOURCE_CONTINUE;
    }

    _hideSystemCursor() {
        try {
            if (!this._cursorUnfocusInhibited && typeof this._seat?.inhibit_unfocus === 'function') {
                this._seat.inhibit_unfocus();
                this._cursorUnfocusInhibited = true;
            }

            if (!this._cursorVisibleInhibited && this._cursorTracker) {
                if (typeof this._cursorTracker.inhibit_cursor_visibility === 'function') {
                    this._cursorTracker.inhibit_cursor_visibility();
                    this._cursorVisibleInhibited = true;
                } else if (typeof this._cursorTracker.set_pointer_visible === 'function') {
                    this._cursorTracker.set_pointer_visible(false);
                    this._cursorVisibleInhibited = true;
                }
            }
        } catch (e) {
            console.warn(`[speed-cursor] Failed to hide system cursor: ${e.message}`);
        }
    }

    _showSystemCursor() {
        try {
            if (this._cursorUnfocusInhibited && typeof this._seat?.uninhibit_unfocus === 'function') {
                this._seat.uninhibit_unfocus();
                this._cursorUnfocusInhibited = false;
            }
        } catch (e) {
            console.warn(`[speed-cursor] Failed to uninhibit seat unfocus: ${e.message}`);
            this._cursorUnfocusInhibited = false;
        }

        try {
            if (this._cursorVisibleInhibited && this._cursorTracker) {
                if (typeof this._cursorTracker.uninhibit_cursor_visibility === 'function') {
                    this._cursorTracker.uninhibit_cursor_visibility();
                } else if (typeof this._cursorTracker.set_pointer_visible === 'function') {
                    this._cursorTracker.set_pointer_visible(true);
                }
                this._cursorVisibleInhibited = false;
            }
        } catch (e) {
            console.warn(`[speed-cursor] Failed to restore system cursor: ${e.message}`);
            this._cursorVisibleInhibited = false;
        }
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._pointerWatch) {
            this._pointerWatch.remove();
            this._pointerWatch = null;
        }

        this._stopAnimationAndRestoreCursor();

        if (this._actor) {
            this._actor.destroy();
            this._actor = null;
        }

        if (this._interfaceSettingsChangedId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._interfaceSettingsChangedId);
            this._interfaceSettingsChangedId = 0;
        }

        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._interfaceSettings = null;
        this._settings = null;
        this._cursorTracker = null;
        this._seat = null;
        this._pointerWatcher = null;
    }
}
