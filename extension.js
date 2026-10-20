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
const HALO_RENDER_SIZE = 128;
const COMET_RENDER_SIZE = 64;
const MAX_COMET_POOL = 28;
const HOT_X_RATIO = 16 / 96;
const HOT_Y_RATIO = 12 / 96;
const FRAME_INTERVAL_MS = 16; // ~60 FPS
const STOP_TIMEOUT_US = 65000; // 65ms without movement counts as stopped
const VALID_THEMES = ['ember', 'solar', 'plasma', 'emerald', 'crimson'];

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
            subtitle: 'Dynamic Effects',
            iconName: 'input-mouse-symbolic',
            toggleMode: true,
        });

        this._settings = settings;
        this._openPrefsCallback = openPrefsCallback;

        this.connect('clicked', () => {
            const anyActive = this._isAnyFeatureEnabled();
            const target = !anyActive;
            this._settings.set_boolean('effect-enabled', target);
            this._settings.set_boolean('fire-breathing-enabled', target);
            this._settings.set_boolean('comet-fire-enabled', target);
        });

        this.menu.setHeader(
            'input-mouse-symbolic',
            'Speed Cursor & Fire FX',
            'Velocity scaling, breathing halo & comet trail'
        );

        const featuresSection = new PopupMenu.PopupMenuSection();

        this._scaleSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Speed Size Scaling',
            this._settings.get_boolean('effect-enabled')
        );
        this._scaleSwitch.connect('toggled', (_item, state) => {
            this._settings?.set_boolean('effect-enabled', state);
        });
        featuresSection.addMenuItem(this._scaleSwitch);

        this._haloSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Fire-Breathing Halo',
            this._settings.get_boolean('fire-breathing-enabled')
        );
        this._haloSwitch.connect('toggled', (_item, state) => {
            this._settings?.set_boolean('fire-breathing-enabled', state);
        });
        featuresSection.addMenuItem(this._haloSwitch);

        this._cometSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Comet-Fire Motion Trail',
            this._settings.get_boolean('comet-fire-enabled')
        );
        this._cometSwitch.connect('toggled', (_item, state) => {
            this._settings?.set_boolean('comet-fire-enabled', state);
        });
        featuresSection.addMenuItem(this._cometSwitch);

        this.menu.addMenuItem(featuresSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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

        this._syncState();
        this._settingsConnId = this._settings.connect('changed', () => {
            this._syncState();
        });
    }

    _isAnyFeatureEnabled() {
        if (!this._settings)
            return false;
        return (
            this._settings.get_boolean('effect-enabled') ||
            this._settings.get_boolean('fire-breathing-enabled') ||
            this._settings.get_boolean('comet-fire-enabled')
        );
    }

    _syncState() {
        if (!this._settings)
            return;

        const scaleOn = this._settings.get_boolean('effect-enabled');
        const haloOn = this._settings.get_boolean('fire-breathing-enabled');
        const cometOn = this._settings.get_boolean('comet-fire-enabled');
        const maxScale = this._settings.get_double('max-fast-scale');

        this.checked = scaleOn || haloOn || cometOn;
        this._scaleSwitch?.setToggleState(scaleOn);
        this._haloSwitch?.setToggleState(haloOn);
        this._cometSwitch?.setToggleState(cometOn);

        const activeParts = [];
        if (scaleOn)
            activeParts.push(`${maxScale.toFixed(1)}x`);
        if (haloOn)
            activeParts.push('Halo');
        if (cometOn)
            activeParts.push('Comet');

        this.subtitle = activeParts.length > 0 ? activeParts.join(' • ') : 'Off';

        if (this._presetItems) {
            for (const p of this._presetItems) {
                const isMatch = scaleOn && Math.abs(maxScale - p.max) < 0.15;
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
        this._scaleSwitch = null;
        this._haloSwitch = null;
        this._cometSwitch = null;
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

        const [initX, initY] = global.get_pointer();
        this._lastX = initX;
        this._lastY = initY;
        this._lastMoveTimeUs = GLib.get_monotonic_time();
        this._lastFrameTimeUs = this._lastMoveTimeUs;
        this._smoothSpeed = 0.0;
        this._currentScale = 1.0;
        this._haloFade = 0.0;
        this._breathPhase = 0.0;
        this._animLoopId = 0;

        this._hotOffsetX = ICON_RENDER_SIZE * HOT_X_RATIO;
        this._hotOffsetY = ICON_RENDER_SIZE * HOT_Y_RATIO;

        this._createActors();
        this._loadConfig();

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._loadConfig();
        });

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

        if (this._fireBreathingEnabled && this._fireBreathingAlways)
            this._startAnimationLoop();
    }

    _createActors() {
        // 1. Comet-Fire trail particle pool (lowest layer)
        this._cometPool = [];
        this._cometSpawnCursor = 0;
        const cometGicon = this._getThemeGIcon('comet', 'ember');

        for (let i = 0; i < MAX_COMET_POOL; i++) {
            const particle = new St.Icon({
                gicon: cometGicon,
                icon_size: COMET_RENDER_SIZE,
                style: 'padding: 0px; margin: 0px;',
                reactive: false,
                can_focus: false,
                visible: false,
            });
            particle.set_size(COMET_RENDER_SIZE, COMET_RENDER_SIZE);
            particle.set_pivot_point(0.5, 0.5);
            Main.uiGroup.add_child(particle);

            this._cometPool.push({
                actor: particle,
                active: false,
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                age: 0,
                maxAge: 0.25,
                baseSize: 32,
                phase: i * 0.7,
            });
        }

        // 2. Fire-Breathing Halo layers (middle layer, centered on pointer tip)
        const haloGicon = this._getThemeGIcon('halo', 'ember');
        this._haloOuter = new St.Icon({
            gicon: haloGicon,
            icon_size: HALO_RENDER_SIZE,
            style: 'padding: 0px; margin: 0px;',
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._haloOuter.set_size(HALO_RENDER_SIZE, HALO_RENDER_SIZE);
        this._haloOuter.set_pivot_point(0.5, 0.5);
        Main.uiGroup.add_child(this._haloOuter);

        this._haloCore = new St.Icon({
            gicon: haloGicon,
            icon_size: HALO_RENDER_SIZE,
            style: 'padding: 0px; margin: 0px;',
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._haloCore.set_size(HALO_RENDER_SIZE, HALO_RENDER_SIZE);
        this._haloCore.set_pivot_point(0.5, 0.5);
        Main.uiGroup.add_child(this._haloCore);

        // 3. Sharp vector cursor arrow (topmost layer)
        const cursorGicon = Gio.Icon.new_for_string(`${this.path}/icons/cursor.svg`);
        this._actor = new St.Icon({
            gicon: cursorGicon,
            icon_size: ICON_RENDER_SIZE,
            style: 'padding: 0px; margin: 0px;',
            reactive: false,
            can_focus: false,
            visible: false,
        });
        this._actor.set_size(ICON_RENDER_SIZE, ICON_RENDER_SIZE);
        this._actor.set_pivot_point(HOT_X_RATIO, HOT_Y_RATIO);
        Main.uiGroup.add_child(this._actor);
    }

    _getThemeGIcon(prefix, theme) {
        const safeTheme = VALID_THEMES.includes(theme) ? theme : 'ember';
        return Gio.Icon.new_for_string(`${this.path}/icons/${prefix}-${safeTheme}.svg`);
    }

    _updateThemeIcons(theme) {
        if (this._currentTheme === theme)
            return;
        this._currentTheme = theme;

        const haloGicon = this._getThemeGIcon('halo', theme);
        const cometGicon = this._getThemeGIcon('comet', theme);

        if (this._haloOuter)
            this._haloOuter.gicon = haloGicon;
        if (this._haloCore)
            this._haloCore.gicon = haloGicon;

        if (this._cometPool) {
            for (const node of this._cometPool)
                node.actor.gicon = cometGicon;
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

        // Fire-Breathing settings
        this._fireBreathingEnabled = this._settings.get_boolean('fire-breathing-enabled');
        this._fireBreathingAlways = this._settings.get_boolean('fire-breathing-always');
        this._fireBreathingSize = Math.max(32.0, this._settings.get_double('fire-breathing-size'));
        this._fireBreathingIntensity = Math.min(
            1.0,
            Math.max(0.1, this._settings.get_double('fire-breathing-intensity'))
        );
        this._fireBreathingSpeed = Math.max(0.2, this._settings.get_double('fire-breathing-speed'));

        // Comet-Fire settings
        this._cometFireEnabled = this._settings.get_boolean('comet-fire-enabled');
        this._cometFireLength = Math.min(
            MAX_COMET_POOL,
            Math.max(4, this._settings.get_int('comet-fire-length'))
        );
        this._cometFireSize = Math.max(12.0, this._settings.get_double('comet-fire-size'));
        this._cometFireDuration = Math.max(0.08, this._settings.get_double('comet-fire-duration'));

        const theme = this._settings.get_string('fire-theme') || 'ember';
        this._updateThemeIcons(theme);

        if (!this._hideSystemCursorPref && this._cursorVisibleInhibited)
            this._showSystemCursor();

        if (!this._effectEnabled && this._actor) {
            this._actor.hide();
            this._showSystemCursor();
        }

        if (!this._fireBreathingEnabled) {
            this._haloOuter?.hide();
            this._haloCore?.hide();
            this._haloFade = 0.0;
        } else if (this._fireBreathingAlways && !this._animLoopId) {
            this._startAnimationLoop();
        }

        if (!this._cometFireEnabled && this._cometPool) {
            for (const node of this._cometPool) {
                node.active = false;
                node.actor.hide();
            }
        }
    }

    _stopAnimationAndRestoreCursor() {
        if (this._animLoopId) {
            GLib.Source.remove(this._animLoopId);
            this._animLoopId = 0;
        }
        this._currentScale = 1.0;
        this._smoothSpeed = 0.0;
        this._haloFade = 0.0;
        this._actor?.hide();
        this._haloOuter?.hide();
        this._haloCore?.hide();
        if (this._cometPool) {
            for (const node of this._cometPool) {
                node.active = false;
                node.actor.hide();
            }
        }
        this._showSystemCursor();
    }

    _isPointerVisibleBySystem() {
        if (!this._cursorTracker)
            return true;
        if (typeof this._cursorTracker.get_pointer_visible === 'function')
            return this._cursorTracker.get_pointer_visible();
        return true;
    }

    _spawnCometSegment(x0, y0, x1, y1, instantSpeed) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist < 2.5)
            return;

        // Interpolate 1 to 3 flame nodes along fast movement segments for a seamless tail
        const steps = Math.min(3, Math.max(1, Math.floor(dist / 14)));
        const speedFactor = Math.min(1.4, Math.max(0.65, instantSpeed / 1400));

        for (let s = 1; s <= steps; s++) {
            const frac = s / steps;
            const px = x0 + dx * frac;
            const py = y0 + dy * frac;

            const idx = this._cometSpawnCursor % this._cometFireLength;
            this._cometSpawnCursor = (this._cometSpawnCursor + 1) % this._cometFireLength;

            const node = this._cometPool[idx];
            node.active = true;
            node.x = px;
            node.y = py;
            // Subtle backward drift + upward thermal buoyancy (rising flame effect)
            node.vx = (-dx / dist) * 18 + (Math.random() - 0.5) * 22;
            node.vy = (-dy / dist) * 18 - 28 - Math.random() * 20;
            node.age = 0.0;
            node.maxAge = this._cometFireDuration * (0.85 + 0.3 * (s / steps));
            node.baseSize = this._cometFireSize * speedFactor;
            node.actor.show();
        }
    }

    _raiseActorsToTop() {
        if (this._haloOuter?.visible)
            Main.uiGroup.set_child_above_sibling(this._haloOuter, null);
        if (this._haloCore?.visible)
            Main.uiGroup.set_child_above_sibling(this._haloCore, null);
        if (this._actor?.visible)
            Main.uiGroup.set_child_above_sibling(this._actor, null);
    }

    _onPointerMoved(x, y) {
        if (!this._effectEnabled && !this._fireBreathingEnabled && !this._cometFireEnabled)
            return;

        const nowUs = GLib.get_monotonic_time();
        const dtSec = Math.max(0.004, (nowUs - this._lastMoveTimeUs) / 1e6);
        const prevX = this._lastX;
        const prevY = this._lastY;
        const dist = Math.hypot(x - prevX, y - prevY);

        this._lastX = x;
        this._lastY = y;
        this._lastMoveTimeUs = nowUs;

        // If another application intentionally hid the cursor (e.g. video player / game), skip
        if (!this._cursorVisibleInhibited && !this._isPointerVisibleBySystem())
            return;

        // Calculate instantaneous speed (px/sec) and blend into smoothed velocity
        const instantSpeed = Math.min(dist / dtSec, this._maxSpeedThreshold * 2.0);
        if (instantSpeed > this._smoothSpeed)
            this._smoothSpeed = this._smoothSpeed * 0.55 + instantSpeed * 0.45;
        else
            this._smoothSpeed = this._smoothSpeed * 0.78 + instantSpeed * 0.22;

        if (this._effectEnabled && this._actor)
            this._actor.set_position(x - this._hotOffsetX, y - this._hotOffsetY);

        if (this._cometFireEnabled)
            this._spawnCometSegment(prevX, prevY, x, y, instantSpeed);

        if (!this._animLoopId)
            this._startAnimationLoop();
    }

    _startAnimationLoop() {
        if (this._animLoopId)
            return;

        this._lastFrameTimeUs = GLib.get_monotonic_time();
        this._animLoopId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FRAME_INTERVAL_MS,
            this._onAnimationFrame.bind(this)
        );
        GLib.Source.set_name_by_id(this._animLoopId, '[speed-cursor] animationFrame');
    }

    _onAnimationFrame() {
        const nowUs = GLib.get_monotonic_time();
        const dt = Math.min(0.05, Math.max(0.004, (nowUs - this._lastFrameTimeUs) / 1e6));
        this._lastFrameTimeUs = nowUs;

        // If another app hid the system pointer (fullscreen video/game), pause visuals
        if (!this._cursorVisibleInhibited && !this._isPointerVisibleBySystem()) {
            this._actor?.hide();
            this._haloOuter?.hide();
            this._haloCore?.hide();
            return GLib.SOURCE_CONTINUE;
        }

        const elapsedSinceMoveUs = nowUs - this._lastMoveTimeUs;
        const isMoving = elapsedSinceMoveUs < STOP_TIMEOUT_US;
        const [curX, curY] = global.get_pointer();

        if (!isMoving) {
            this._smoothSpeed *= 0.80;
            if (this._smoothSpeed <= 40.0)
                this._smoothSpeed = 0.0;
        }

        const speedNorm = Math.min(1.0, this._smoothSpeed / this._maxSpeedThreshold);

        // 1. Update Comet-Fire trail particles
        let activeCometCount = 0;
        if (this._cometFireEnabled && this._cometPool) {
            for (let i = 0; i < this._cometPool.length; i++) {
                const node = this._cometPool[i];
                if (!node.active)
                    continue;

                node.age += dt;
                if (node.age >= node.maxAge) {
                    node.active = false;
                    node.actor.hide();
                    continue;
                }

                activeCometCount++;
                const progress = node.age / node.maxAge;
                const life = 1.0 - progress;

                // Organic flame turbulence + upward drift
                const flicker = Math.sin(node.age * 22.0 + node.phase) * 14.0 * dt;
                node.x += node.vx * dt + flicker;
                node.y += node.vy * dt;

                const currentDiameter = node.baseSize * Math.pow(life, 0.95);
                const scale = currentDiameter / COMET_RENDER_SIZE;
                const half = COMET_RENDER_SIZE * 0.5;

                node.actor.set_position(node.x - half, node.y - half);
                node.actor.set_scale(scale, scale);
                node.actor.opacity = Math.round(255 * Math.pow(life, 1.35) * 0.9);
            }
        }

        // 2. Update Fire-Breathing Halo around pointer
        let haloActive = false;
        if (this._fireBreathingEnabled && this._haloOuter && this._haloCore) {
            const wantHalo = this._fireBreathingAlways || isMoving || this._smoothSpeed > 10.0;
            if (wantHalo)
                this._haloFade = Math.min(1.0, this._haloFade + dt * 6.0);
            else
                this._haloFade = Math.max(0.0, this._haloFade - dt * 3.5);

            if (this._haloFade > 0.01) {
                haloActive = true;
                if (!this._haloOuter.visible) {
                    this._haloOuter.show();
                    this._haloCore.show();
                    this._raiseActorsToTop();
                }

                // Advance breathing phase (faster when stoked by mouse movement)
                const stokedFreq = this._fireBreathingSpeed * (1.0 + 0.85 * speedNorm);
                this._breathPhase = (this._breathPhase + dt * stokedFreq * Math.PI * 2.0) % (Math.PI * 200);

                // Dual-harmonic wave for natural "fire-breathing" expansion & flicker
                const primaryWave = 0.5 + 0.5 * Math.sin(this._breathPhase);
                const harmonicFlicker = 0.5 + 0.5 * Math.sin(this._breathPhase * 2.7 + 1.1);
                const breathFactor = 0.72 * primaryWave + 0.28 * harmonicFlicker;

                // Halo expands with breathing pulse AND stokes larger when moving fast
                const outerDiameter =
                    this._fireBreathingSize *
                    (0.82 + 0.34 * breathFactor + 0.42 * speedNorm);
                const coreDiameter =
                    this._fireBreathingSize *
                    (0.45 + 0.22 * harmonicFlicker + 0.25 * speedNorm);

                const outerScale = outerDiameter / HALO_RENDER_SIZE;
                const coreScale = coreDiameter / HALO_RENDER_SIZE;
                const halfHalo = HALO_RENDER_SIZE * 0.5;

                this._haloOuter.set_position(curX - halfHalo, curY - halfHalo);
                this._haloOuter.set_scale(outerScale, outerScale);

                this._haloCore.set_position(curX - halfHalo, curY - halfHalo);
                this._haloCore.set_scale(coreScale, coreScale);

                const baseOp = this._fireBreathingIntensity * this._haloFade;
                const stokedOp = Math.min(1.0, baseOp * (0.72 + 0.28 * breathFactor + 0.25 * speedNorm));
                this._haloOuter.opacity = Math.round(255 * stokedOp);
                this._haloCore.opacity = Math.round(255 * Math.min(1.0, stokedOp * 1.15));
            } else {
                this._haloOuter.hide();
                this._haloCore.hide();
            }
        }

        // 3. Update Speed-Scaled Cursor Arrow
        let cursorScalingActive = false;
        if (this._effectEnabled && this._actor) {
            let targetScale = 1.0;
            if (isMoving) {
                const curvedSpeed = Math.pow(speedNorm, 0.75);
                targetScale =
                    this._minMoveScale +
                    (this._maxFastScale - this._minMoveScale) * curvedSpeed;
            } else if (this._smoothSpeed > 40.0) {
                targetScale = 1.0 + (this._maxFastScale - 1.0) * Math.pow(speedNorm, 0.85);
            }

            if (targetScale > this._currentScale)
                this._currentScale += (targetScale - this._currentScale) * this._growSmoothing;
            else
                this._currentScale += (targetScale - this._currentScale) * this._shrinkSmoothing;

            if (isMoving || this._currentScale > 1.02) {
                cursorScalingActive = true;
                if (!this._actor.visible) {
                    this._actor.show();
                    this._raiseActorsToTop();
                }
                if (this._hideSystemCursorPref)
                    this._hideSystemCursor();

                this._actor.set_position(curX - this._hotOffsetX, curY - this._hotOffsetY);
                const visualSize = this._baseCursorSize * this._currentScale;
                const actorScale = visualSize / ICON_RENDER_SIZE;
                this._actor.set_scale(actorScale, actorScale);
            } else {
                this._currentScale = 1.0;
                this._actor.hide();
                this._showSystemCursor();
            }
        }

        // Stop the animation loop when completely idle and no persistent halo is active
        if (!isMoving && !cursorScalingActive && !haloActive && activeCometCount === 0) {
            this._animLoopId = 0;
            this._showSystemCursor();
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

        if (this._cometPool) {
            for (const node of this._cometPool)
                node.actor.destroy();
            this._cometPool = null;
        }

        if (this._haloOuter) {
            this._haloOuter.destroy();
            this._haloOuter = null;
        }

        if (this._haloCore) {
            this._haloCore.destroy();
            this._haloCore = null;
        }

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
