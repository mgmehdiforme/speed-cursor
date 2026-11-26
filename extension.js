import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

// Sprite render sizes (textures are rasterised once at this size and then
// only transformed on the GPU, so per-frame work is just matrix updates).
const CURSOR_RENDER_SIZE = 128;
const HALO_RENDER_SIZE = 128;
const FLAME_RENDER_SIZE = 64;
const SPARK_RENDER_SIZE = 32;
const CLICK_RENDER_SIZE = 128;

const MAX_FLAME_POOL = 28;
const MAX_SPARK_POOL = 64;
const MAX_CLICK_POOL = 12;

// Hotspot of icons/cursor.svg (tip at 16,12 in a 96x96 viewBox)
const HOT_X_RATIO = 16 / 96;
const HOT_Y_RATIO = 12 / 96;
// Head of the flame tongue in icons/flame-*.svg (x = 20 of 64)
const FLAME_PIVOT_X = 20 / 64;

const STOP_TIMEOUT_US = 70000; // no movement for 70 ms counts as stopped
const TAU = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

const VALID_THEMES = ['ember', 'solar', 'plasma', 'emerald', 'crimson'];
// Theme used for click sparks when "colour by button" is on
const BUTTON_THEMES = { 1: 'solar', 2: 'emerald', 3: 'plasma' };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// Frame-rate independent smoothing factor for an exponential approach
const expAlpha = (rate, dt) => 1 - Math.exp(-rate * dt);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const easeOutCubic = p => 1 - (1 - p) ** 3;
const easeOutExpo = p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));

const SpeedCursorQuickToggle = GObject.registerClass(
class SpeedCursorQuickToggle extends QuickSettings.QuickMenuToggle {
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
            const target = !this._isAnyFeatureEnabled();
            for (const key of [
                'effect-enabled',
                'fire-breathing-enabled',
                'comet-fire-enabled',
                'click-effect-enabled',
            ])
                this._settings.set_boolean(key, target);
        });

        this.menu.setHeader(
            'input-mouse-symbolic',
            'Speed Cursor & Fire FX',
            'Velocity scaling, living fire halo, comet trail & click ripples'
        );

        const featuresSection = new PopupMenu.PopupMenuSection();
        this._switches = [
            ['effect-enabled', 'Speed Size Scaling'],
            ['fire-breathing-enabled', 'Fire-Breathing Halo'],
            ['comet-fire-enabled', 'Comet-Fire Motion Trail'],
            ['comet-sparks-enabled', 'Flying Ember Sparks'],
            ['click-effect-enabled', 'Click Ripple (Screen Recording)'],
        ].map(([key, label]) => {
            const item = new PopupMenu.PopupSwitchMenuItem(
                label,
                this._settings.get_boolean(key)
            );
            item.connect('toggled', (_item, state) => {
                this._settings.set_boolean(key, state);
            });
            featuresSection.addMenuItem(item);
            return { key, item };
        });

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
            Main.panel.statusArea.quickSettings.menu.close();
            this._openPrefsCallback();
        });
        prefsItem.visible = Main.sessionMode.allowSettings;

        this._syncState();
        this._settingsConnId = this._settings.connect('changed', () => {
            this._syncState();
        });
    }

    _isAnyFeatureEnabled() {
        return (
            this._settings.get_boolean('effect-enabled') ||
            this._settings.get_boolean('fire-breathing-enabled') ||
            this._settings.get_boolean('comet-fire-enabled') ||
            this._settings.get_boolean('click-effect-enabled')
        );
    }

    _syncState() {
        const scaleOn = this._settings.get_boolean('effect-enabled');
        const haloOn = this._settings.get_boolean('fire-breathing-enabled');
        const cometOn = this._settings.get_boolean('comet-fire-enabled');
        const clickOn = this._settings.get_boolean('click-effect-enabled');
        const maxScale = this._settings.get_double('max-fast-scale');

        this.checked = scaleOn || haloOn || cometOn || clickOn;
        for (const { key, item } of this._switches)
            item.setToggleState(this._settings.get_boolean(key));

        const activeParts = [];
        if (scaleOn)
            activeParts.push(`${maxScale.toFixed(1)}x`);
        if (haloOn)
            activeParts.push('Halo');
        if (cometOn)
            activeParts.push('Comet');
        if (clickOn)
            activeParts.push('Click');
        this.subtitle = activeParts.length > 0 ? activeParts.join(' • ') : 'Off';

        for (const p of this._presetItems) {
            const isMatch = scaleOn && Math.abs(maxScale - p.max) < 0.15;
            p.item.setOrnament(isMatch ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
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
        this._switches = null;
        super.destroy();
    }
});

const SpeedCursorIndicator = GObject.registerClass(
class SpeedCursorIndicator extends QuickSettings.SystemIndicator {
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
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._cursorTracker = global.backend.get_cursor_tracker();
        this._seat = Clutter.get_default_backend().get_default_seat();

        this._cursorUnfocusInhibited = false;
        this._cursorVisibleInhibited = false;
        this._running = false;
        this._idleBreathing = false;
        this._currentTheme = null;
        this._pressedButtonsMask = 0;
        this._gicons = new Map();

        this._baseCursorSize = this._interfaceSettings.get_int('cursor-size') || 24;
        this._interfaceSettingsChangedId = this._interfaceSettings.connect(
            'changed::cursor-size',
            () => {
                this._baseCursorSize = this._interfaceSettings.get_int('cursor-size') || 24;
            }
        );

        const [x, y] = global.get_pointer();
        this._resetMotionState(x, y);

        this._createActors();
        this._loadConfig();

        // One frame-clock driven timeline replaces the old 16 ms GLib timer:
        // it ticks exactly once per displayed frame (60/120/144 Hz …) and
        // costs nothing while stopped.
        this._timeline = new Clutter.Timeline({
            actor: this._layer,
            duration: 1000,
            repeat_count: -1,
        });
        this._timeline.connect('new-frame', () => this._onFrame());

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._loadConfig();
            this._wake();
        });

        // Event-driven wake-up: mutter tells us whenever the pointer moves,
        // so nothing polls while the mouse is still.
        this._positionChangedId = this._cursorTracker.connect(
            'position-invalidated',
            () => this._onPointerMoved()
        );

        this._stageEventId = global.stage.connect(
            'captured-event::button',
            this._onStageButtonEvent.bind(this)
        );

        this._visibilityChangedId = this._cursorTracker.connect(
            'visibility-changed',
            () => this._onPointerVisibilityChanged()
        );

        this._indicator = new SpeedCursorIndicator(this._settings, () => this.openPreferences());
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._wake();
    }

    _resetMotionState(x, y) {
        this._prevX = x;
        this._prevY = y;
        this._velX = 0;
        this._velY = 0;
        this._speed = 0;
        this._lastMoveTimeUs = 0;
        this._lastFrameTimeUs = GLib.get_monotonic_time();
        this._scale = 1.0;
        this._scaleVel = 0;
        this._lean = 0;
        this._haloFade = 0;
        this._haloTime = 0;
        this._haloOffX = 0;
        this._haloOffY = 0;
        this._coronaAngleA = 0;
        this._coronaAngleB = 0;
        this._sparkAccum = 0;
    }

    // ------------------------------------------------------------------
    // Actors
    // ------------------------------------------------------------------

    _gicon(name) {
        let icon = this._gicons.get(name);
        if (!icon) {
            icon = Gio.Icon.new_for_string(`${this.path}/icons/${name}.svg`);
            this._gicons.set(name, icon);
        }
        return icon;
    }

    _themeName(prefix, theme) {
        return `${prefix}-${VALID_THEMES.includes(theme) ? theme : 'ember'}`;
    }

    _makeSprite(name, size, pivotX = 0.5, pivotY = 0.5) {
        const sprite = new St.Icon({
            gicon: this._gicon(name),
            icon_size: size,
            style: 'padding: 0px; margin: 0px;',
            reactive: false,
            can_focus: false,
            visible: false,
        });
        sprite.set_size(size, size);
        sprite.set_pivot_point(pivotX, pivotY);
        this._layer.add_child(sprite);
        return sprite;
    }

    _createActors() {
        // A single full-stage, non-reactive layer holds every sprite. It has
        // no content of its own, so it never paints; it just lets us raise all
        // effects with one call and gives the timeline a frame clock.
        this._layer = new Clutter.Actor({ reactive: false, name: 'speed-cursor-layer' });
        this._layer.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        Main.uiGroup.add_child(this._layer);

        // Bottom → top: halo glow, coronas, flames, sparks, click rings, core, cursor
        this._haloOuter = this._makeSprite('halo-ember', HALO_RENDER_SIZE);
        this._coronaA = this._makeSprite('corona-ember', HALO_RENDER_SIZE);
        this._coronaB = this._makeSprite('corona-ember', HALO_RENDER_SIZE);

        this._flamePool = [];
        this._flameCursor = 0;
        for (let i = 0; i < MAX_FLAME_POOL; i++) {
            this._flamePool.push({
                actor: this._makeSprite('flame-ember', FLAME_RENDER_SIZE, FLAME_PIVOT_X, 0.5),
                active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: 0.3,
                size: 30, stretch: 1, phase: i * 1.7, angle: 0,
            });
        }

        this._sparkPool = [];
        this._sparkCursor = 0;
        for (let i = 0; i < MAX_SPARK_POOL; i++) {
            this._sparkPool.push({
                actor: this._makeSprite('spark-ember', SPARK_RENDER_SIZE),
                active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, maxAge: 0.5,
                size: 6, drag: 2.5, lift: 110, phase: i * 2.3, iconName: 'spark-ember',
            });
        }

        this._clickPool = [];
        this._clickCursor = 0;
        for (let i = 0; i < MAX_CLICK_POOL; i++) {
            this._clickPool.push({
                actor: this._makeSprite('click-left', CLICK_RENDER_SIZE),
                active: false, kind: 'ring', x: 0, y: 0, age: 0, maxAge: 0.4,
                diameter: 80, peak: 1, iconName: 'click-left',
            });
        }

        this._haloCore = this._makeSprite('halo-ember', HALO_RENDER_SIZE);

        this._cursor = this._makeSprite('cursor', CURSOR_RENDER_SIZE, HOT_X_RATIO, HOT_Y_RATIO);
        this._hotOffsetX = CURSOR_RENDER_SIZE * HOT_X_RATIO;
        this._hotOffsetY = CURSOR_RENDER_SIZE * HOT_Y_RATIO;

        this._haloActors = [this._haloOuter, this._coronaA, this._coronaB, this._haloCore];
    }

    _setSpriteIcon(node, name) {
        if (node.iconName !== name) {
            node.iconName = name;
            node.actor.gicon = this._gicon(name);
        }
    }

    _updateTheme(theme) {
        if (this._currentTheme === theme)
            return;
        this._currentTheme = theme;

        const halo = this._gicon(this._themeName('halo', theme));
        const corona = this._gicon(this._themeName('corona', theme));
        this._haloOuter.gicon = halo;
        this._haloCore.gicon = halo;
        this._coronaA.gicon = corona;
        this._coronaB.gicon = corona;

        const flame = this._gicon(this._themeName('flame', theme));
        for (const node of this._flamePool)
            node.actor.gicon = flame;

        this._themeSpark = this._themeName('spark', theme);
        this._themeClick = this._themeName('click', theme);
    }

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    _loadConfig() {
        const s = this._settings;
        this._effectEnabled = s.get_boolean('effect-enabled');
        this._minMoveScale = Math.max(1.0, s.get_double('min-move-scale'));
        this._maxFastScale = Math.max(this._minMoveScale, s.get_double('max-fast-scale'));
        this._maxSpeedThreshold = Math.max(200.0, s.get_double('max-speed-threshold'));
        // The smoothing settings were historically "fraction per 60 Hz frame";
        // map them onto spring stiffness so motion is identical at any refresh rate.
        const grow = clamp(s.get_double('grow-smoothing'), 0.05, 1.0);
        const shrink = clamp(s.get_double('shrink-smoothing'), 0.02, 1.0);
        this._growStiffness = 60 + 1100 * grow * grow + 260 * grow;
        this._shrinkStiffness = 12 + 900 * shrink * shrink + 140 * shrink;
        this._hideSystemCursorPref = s.get_boolean('hide-system-cursor');
        this._leanEnabled = s.get_boolean('cursor-lean-enabled');

        this._fireBreathingEnabled = s.get_boolean('fire-breathing-enabled');
        this._fireBreathingAlways = s.get_boolean('fire-breathing-always');
        this._fireBreathingSize = Math.max(32.0, s.get_double('fire-breathing-size'));
        this._fireBreathingIntensity = clamp(s.get_double('fire-breathing-intensity'), 0.1, 1.0);
        this._fireBreathingSpeed = Math.max(0.2, s.get_double('fire-breathing-speed'));

        this._cometFireEnabled = s.get_boolean('comet-fire-enabled');
        this._cometFireLength = clamp(s.get_int('comet-fire-length'), 4, MAX_FLAME_POOL);
        this._cometFireSize = Math.max(12.0, s.get_double('comet-fire-size'));
        this._cometFireDuration = Math.max(0.08, s.get_double('comet-fire-duration'));
        this._sparksEnabled = s.get_boolean('comet-sparks-enabled');

        this._clickEffectEnabled = s.get_boolean('click-effect-enabled');
        this._clickColorByButton = s.get_boolean('click-color-by-button');
        this._clickEffectSize = Math.max(24.0, s.get_double('click-effect-size'));
        this._clickEffectDuration = Math.max(0.12, s.get_double('click-effect-duration'));
        this._clickEffectIntensity = clamp(s.get_double('click-effect-intensity'), 0.15, 1.0);

        this._updateTheme(s.get_string('fire-theme') || 'ember');

        if (!this._effectEnabled || !this._hideSystemCursorPref)
            this._showSystemCursor();
        if (!this._effectEnabled) {
            this._cursor.hide();
            this._scale = 1.0;
            this._scaleVel = 0;
        }

        this._stopIdleBreathing();
        if (!this._fireBreathingEnabled) {
            this._haloFade = 0;
            for (const a of this._haloActors)
                a.hide();
        }

        for (let i = 0; i < this._flamePool.length; i++) {
            if (!this._cometFireEnabled || i >= this._cometFireLength)
                this._killNode(this._flamePool[i]);
        }
        if (!this._cometFireEnabled || !this._sparksEnabled) {
            // Leave click-burst sparks alone; they finish on their own.
            for (const node of this._sparkPool) {
                if (node.fromTrail)
                    this._killNode(node);
            }
        }
        if (!this._clickEffectEnabled) {
            for (const node of this._clickPool)
                this._killNode(node);
        }
    }

    _killNode(node) {
        node.active = false;
        node.actor.hide();
    }

    // ------------------------------------------------------------------
    // Loop control
    // ------------------------------------------------------------------

    _anythingEnabled() {
        return this._effectEnabled || this._fireBreathingEnabled ||
            this._cometFireEnabled || this._clickEffectEnabled;
    }

    _pointerVisible() {
        return this._cursorVisibleInhibited || this._cursorTracker.get_pointer_visible();
    }

    _wake() {
        if (this._running || !this._timeline || !this._anythingEnabled())
            return;
        if (!this._pointerVisible())
            return;

        this._stopIdleBreathing();
        const [x, y] = global.get_pointer();
        this._prevX = x;
        this._prevY = y;
        this._lastFrameTimeUs = GLib.get_monotonic_time();
        Main.uiGroup.set_child_above_sibling(this._layer, null);
        this._running = true;
        this._timeline.start();
    }

    _sleep() {
        this._running = false;
        this._timeline.stop();
        this._showSystemCursor();
        if (this._fireBreathingEnabled && this._fireBreathingAlways && this._haloFade > 0.5)
            this._startIdleBreathing();
    }

    _onPointerMoved() {
        if (this._running)
            return;
        this._lastMoveTimeUs = GLib.get_monotonic_time();
        this._wake();
    }

    _onPointerVisibilityChanged() {
        if (this._pointerVisible()) {
            this._wake();
            return;
        }
        // A video player or game hid the pointer: drop every effect.
        this._stopIdleBreathing();
        this._clearAll();
        if (this._running) {
            this._running = false;
            this._timeline.stop();
        }
    }

    _clearAll() {
        for (const pool of [this._flamePool, this._sparkPool, this._clickPool]) {
            for (const node of pool)
                this._killNode(node);
        }
        for (const a of this._haloActors)
            a.hide();
        this._cursor.hide();
        this._haloFade = 0;
        this._scale = 1.0;
        this._scaleVel = 0;
        this._speed = 0;
        this._velX = 0;
        this._velY = 0;
        this._showSystemCursor();
    }

    // ------------------------------------------------------------------
    // Idle breathing: when the pointer is parked the halo keeps breathing
    // through Clutter implicit transitions, so no JavaScript runs at all.
    // ------------------------------------------------------------------

    _startIdleBreathing() {
        if (this._idleBreathing)
            return;
        this._idleBreathing = true;

        const size = this._fireBreathingSize;
        const op = this._fireBreathingIntensity;
        const period = 1000 / this._fireBreathingSpeed;
        const sine = Clutter.AnimationMode.EASE_IN_OUT_SINE;
        const props = (diam, opacity) => {
            const s = (size * diam) / HALO_RENDER_SIZE;
            return { scale_x: s, scale_y: s, opacity: Math.round(255 * clamp(op * opacity, 0, 1)) };
        };
        // Settle into the "exhale" pose first, then breathe forever between
        // exhale and inhale. Each layer uses a different period so the
        // combined glow never visibly repeats.
        const breathe = (actor, exhale, inhale, duration) => {
            actor.ease({
                ...exhale,
                duration: 400,
                mode: sine,
                onComplete: () => {
                    if (!this._idleBreathing)
                        return;
                    actor.ease({
                        ...inhale,
                        duration: Math.round(duration),
                        mode: sine,
                        repeatCount: -1,
                        autoReverse: true,
                    });
                },
            });
        };
        const spin = (actor, degrees, duration) => {
            actor.ease({
                rotation_angle_z: actor.rotation_angle_z + degrees,
                duration,
                mode: Clutter.AnimationMode.LINEAR,
                repeatCount: -1,
            });
        };

        breathe(this._haloOuter, props(0.86, 0.62), props(1.16, 1.0), period / 2);
        breathe(this._coronaA, props(0.96, 0.45), props(1.12, 0.8), period * 0.61);
        breathe(this._coronaB, props(0.78, 0.26), props(0.9, 0.5), period * 0.83);
        breathe(this._haloCore, props(0.4, 0.8), props(0.52, 1.1), period * 0.37);
        spin(this._coronaA, 360, 16000);
        spin(this._coronaB, -360, 23000);
    }

    _stopIdleBreathing() {
        if (!this._idleBreathing)
            return;
        this._idleBreathing = false;
        for (const a of this._haloActors)
            a.remove_all_transitions();
        this._coronaAngleA = this._coronaA.rotation_angle_z % 360;
        this._coronaAngleB = this._coronaB.rotation_angle_z % 360;
    }

    // ------------------------------------------------------------------
    // Clicks
    // ------------------------------------------------------------------

    _onStageButtonEvent(_stage, event) {
        if (!this._clickEffectEnabled)
            return Clutter.EVENT_PROPAGATE;

        const button = event.get_button();
        if (button < 1 || button > 3)
            return Clutter.EVENT_PROPAGATE;

        const bit = 1 << button;
        const evType = event.type();
        if (evType === Clutter.EventType.BUTTON_PRESS) {
            if ((this._pressedButtonsMask & bit) === 0) {
                this._pressedButtonsMask |= bit;
                const [x, y] = event.get_coords();
                this._spawnClick(x, y, button);
            }
        } else if (evType === Clutter.EventType.BUTTON_RELEASE) {
            this._pressedButtonsMask &= ~bit;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // Clicks delivered straight to Wayland clients never reach the stage's
    // captured-event, so we also watch the button state of the pointer.
    _syncButtons(x, y, mods) {
        if (!this._clickEffectEnabled)
            return;
        for (let button = 1; button <= 3; button++) {
            const bit = 1 << button;
            const mask = Clutter.ModifierType[`BUTTON${button}_MASK`];
            const pressed = (mods & mask) !== 0;
            if (pressed && (this._pressedButtonsMask & bit) === 0) {
                this._pressedButtonsMask |= bit;
                this._spawnClick(x, y, button);
            } else if (!pressed && (this._pressedButtonsMask & bit) !== 0) {
                this._pressedButtonsMask &= ~bit;
            }
        }
    }

    _nextClickNode() {
        const node = this._clickPool[this._clickCursor];
        this._clickCursor = (this._clickCursor + 1) % MAX_CLICK_POOL;
        return node;
    }

    _spawnClick(x, y, button) {
        if (!this._clickEffectEnabled || !this._pointerVisible())
            return;

        let ringIcon, sparkIcon;
        if (this._clickColorByButton) {
            ringIcon = button === 3 ? 'click-right' : button === 2 ? 'click-middle' : 'click-left';
            sparkIcon = `spark-${BUTTON_THEMES[button] ?? 'solar'}`;
        } else {
            ringIcon = this._themeClick;
            sparkIcon = this._themeSpark;
        }

        const size = this._clickEffectSize;
        const dur = this._clickEffectDuration;
        const peak = this._clickEffectIntensity;
        // Bright flash, main shockwave, and a softer delayed echo ring.
        const layers = [
            { kind: 'flash', icon: sparkIcon, diameter: size * 0.62, maxAge: Math.min(0.26, dur * 0.6), delay: 0, peak },
            { kind: 'ring', icon: ringIcon, diameter: size, maxAge: dur, delay: 0, peak },
            { kind: 'ring', icon: ringIcon, diameter: size * 0.62, maxAge: dur * 0.9, delay: Math.min(0.09, dur * 0.22), peak: peak * 0.55 },
        ];
        for (const l of layers) {
            const node = this._nextClickNode();
            this._setSpriteIcon(node, l.icon);
            Object.assign(node, {
                active: true, kind: l.kind, x, y, age: -l.delay,
                maxAge: l.maxAge, diameter: l.diameter, peak: l.peak,
            });
            const half = CLICK_RENDER_SIZE / 2;
            node.actor.set_translation(x - half, y - half, 0);
            node.actor.set_scale(0.01, 0.01);
            node.actor.opacity = 0;
            node.actor.show();
        }

        // A little burst of embers flying outwards.
        const count = 9;
        const spin = Math.random() * TAU;
        for (let i = 0; i < count; i++) {
            const a = spin + (i / count) * TAU + rand(-0.2, 0.2);
            const v = rand(160, 340) * (size / 110);
            this._emitSpark(x, y, Math.cos(a) * v, Math.sin(a) * v, {
                icon: sparkIcon, maxAge: rand(0.3, 0.55), size: rand(5, 10),
                drag: 5.5, lift: 35, fromTrail: false,
            });
        }

        this._wake();
    }

    // ------------------------------------------------------------------
    // Particles
    // ------------------------------------------------------------------

    _emitSpark(x, y, vx, vy, opts) {
        const node = this._sparkPool[this._sparkCursor];
        this._sparkCursor = (this._sparkCursor + 1) % MAX_SPARK_POOL;
        this._setSpriteIcon(node, opts.icon);
        Object.assign(node, {
            active: true, x, y, vx, vy, age: 0,
            maxAge: opts.maxAge, size: opts.size, drag: opts.drag,
            lift: opts.lift, fromTrail: opts.fromTrail,
        });
        // Size is fixed for the spark's whole life (it fades rather than
        // shrinks), which saves a GPU-property update per spark per frame.
        const s = opts.size / SPARK_RENDER_SIZE;
        node.actor.set_scale(s, s);
        node.actor.show();
    }

    _spawnFlames(x0, y0, x1, y1, speedNorm) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist < 1.5)
            return;

        const dirX = dx / dist;
        const dirY = dy / dist;
        // Spacing grows with flame size so density is independent of refresh rate.
        const spacing = Math.max(2.5, this._cometFireSize * 0.2);
        const steps = Math.min(6, Math.max(1, Math.round(dist / spacing)));
        const back = 30 + 260 * speedNorm;

        for (let s = 1; s <= steps; s++) {
            const f = s / steps;
            const node = this._flamePool[this._flameCursor % this._cometFireLength];
            this._flameCursor = (this._flameCursor + 1) % this._cometFireLength;

            node.active = true;
            node.x = x0 + dx * f + rand(-1.5, 1.5);
            node.y = y0 + dy * f + rand(-1.5, 1.5);
            node.vx = -dirX * back + rand(-18, 18);
            node.vy = -dirY * back + rand(-18, 18) - 25;
            node.age = 0;
            node.maxAge = this._cometFireDuration * rand(0.8, 1.2);
            node.size = this._cometFireSize * (0.72 + 0.55 * speedNorm) * rand(0.85, 1.15);
            node.stretch = 1 + 0.9 * speedNorm;
            node.angle = 1e9; // force a rotation update on the first frame
            node.actor.show();
        }
    }

    _spawnTrailSparks(x, y, dt, speedNorm) {
        if (speedNorm < 0.12)
            return;
        this._sparkAccum += (speedNorm ** 1.4) * 45 * dt;
        let budget = 2;
        const speed = Math.hypot(this._velX, this._velY) || 1;
        const dirX = this._velX / speed;
        const dirY = this._velY / speed;
        while (this._sparkAccum >= 1 && budget-- > 0) {
            this._sparkAccum -= 1;
            const back = rand(40, 140) + speed * 0.05;
            const side = rand(-110, 110);
            this._emitSpark(
                x + rand(-3, 3), y + rand(-3, 3),
                -dirX * back - dirY * side,
                -dirY * back + dirX * side - 30,
                {
                    icon: this._themeSpark, maxAge: rand(0.35, 0.8), size: rand(5, 11),
                    drag: 2.4, lift: 120, fromTrail: true,
                }
            );
        }
        this._sparkAccum = Math.min(this._sparkAccum, 2);
    }

    _updateFlames(dt) {
        let active = 0;
        const half = FLAME_RENDER_SIZE / 2;
        const pivotX = FLAME_RENDER_SIZE * FLAME_PIVOT_X;
        const drag = Math.exp(-3.2 * dt);
        for (const node of this._flamePool) {
            if (!node.active)
                continue;
            node.age += dt;
            if (node.age >= node.maxAge) {
                this._killNode(node);
                continue;
            }
            active++;
            const life = 1 - node.age / node.maxAge;

            node.vx *= drag;
            node.vy = node.vy * drag - 140 * dt; // hot gas rises
            node.x += node.vx * dt + Math.sin(node.age * 31 + node.phase) * 22 * dt;
            node.y += node.vy * dt;

            // Quick ignition swell, then the tongue shrinks as it burns out.
            const ignite = Math.min(1, node.age / 0.04);
            const s = (node.size / FLAME_RENDER_SIZE) * (0.55 + 0.45 * ignite) * (0.3 + 0.7 * life ** 0.8);
            const flick = 0.88 + 0.12 * Math.sin(node.age * 47 + node.phase);

            node.actor.set_translation(node.x - pivotX, node.y - half, 0);
            node.actor.set_scale(s * node.stretch * (0.7 + 0.3 * life), s * flick);
            const angle = Math.atan2(node.vy, node.vx) * RAD_TO_DEG;
            if (Math.abs(angle - node.angle) > 0.75) {
                node.angle = angle;
                node.actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, angle);
            }
            node.actor.set_opacity(Math.round(255 * 0.95 * life ** 1.3 * flick));
        }
        return active;
    }

    _updateSparks(dt) {
        let active = 0;
        const half = SPARK_RENDER_SIZE / 2;
        for (const node of this._sparkPool) {
            if (!node.active)
                continue;
            node.age += dt;
            if (node.age >= node.maxAge) {
                this._killNode(node);
                continue;
            }
            active++;
            const life = 1 - node.age / node.maxAge;
            const drag = Math.exp(-node.drag * dt);
            node.vx *= drag;
            node.vy = node.vy * drag - node.lift * dt;
            node.x += node.vx * dt;
            node.y += node.vy * dt;

            const twinkle = 0.65 + 0.35 * Math.sin(node.age * 38 + node.phase);
            node.actor.set_translation(node.x - half, node.y - half, 0);
            node.actor.set_opacity(Math.round(255 * life ** 0.9 * twinkle));
        }
        return active;
    }

    _updateClicks(dt) {
        let active = 0;
        for (const node of this._clickPool) {
            if (!node.active)
                continue;
            node.age += dt;
            if (node.age < 0) {
                active++;
                continue;
            }
            if (node.age >= node.maxAge) {
                this._killNode(node);
                continue;
            }
            active++;
            const p = node.age / node.maxAge;
            let d, o;
            if (node.kind === 'flash') {
                d = node.diameter * (0.55 + 0.45 * easeOutCubic(p));
                o = node.peak * (1 - p) ** 2.4;
            } else {
                d = node.diameter * (0.12 + 0.88 * easeOutExpo(p));
                // brief fade-in so the ring "pops", then a long soft fade
                o = node.peak * Math.min(1, p / 0.08) * (1 - p) ** 1.5;
            }
            const s = d / CLICK_RENDER_SIZE;
            node.actor.set_scale(s, s);
            node.actor.set_opacity(Math.round(255 * o));
        }
        return active;
    }

    // ------------------------------------------------------------------
    // Per-frame update
    // ------------------------------------------------------------------

    _onFrame() {
        const nowUs = GLib.get_monotonic_time();
        const dt = clamp((nowUs - this._lastFrameTimeUs) / 1e6, 1 / 500, 1 / 20);
        this._lastFrameTimeUs = nowUs;

        if (!this._pointerVisible()) {
            this._onPointerVisibilityChanged();
            return;
        }

        const [x, y, mods] = global.get_pointer();
        this._syncButtons(x, y, mods);

        const dx = x - this._prevX;
        const dy = y - this._prevY;
        if (dx !== 0 || dy !== 0)
            this._lastMoveTimeUs = nowUs;
        const isMoving = nowUs - this._lastMoveTimeUs < STOP_TIMEOUT_US;

        // Velocity: fast to react, slower to calm down (mice often report at
        // a lower rate than the display refreshes, so some frames see dx = 0).
        const maxV = this._maxSpeedThreshold * 2;
        const ivx = clamp(dx / dt, -maxV, maxV);
        const ivy = clamp(dy / dt, -maxV, maxV);
        const instSpeed = Math.hypot(ivx, ivy);
        const a = expAlpha(instSpeed > this._speed ? 28 : 9, dt);
        this._velX += (ivx - this._velX) * a;
        this._velY += (ivy - this._velY) * a;
        this._speed = Math.hypot(this._velX, this._velY);
        if (!isMoving && this._speed < 25) {
            this._speed = 0;
            this._velX = 0;
            this._velY = 0;
        }
        const speedNorm = Math.min(1, this._speed / this._maxSpeedThreshold);

        if (this._cometFireEnabled) {
            this._spawnFlames(this._prevX, this._prevY, x, y, speedNorm);
            if (this._sparksEnabled && isMoving)
                this._spawnTrailSparks(x, y, dt, speedNorm);
        }
        this._prevX = x;
        this._prevY = y;

        const flames = this._updateFlames(dt);
        const sparks = this._updateSparks(dt);
        const clicks = this._updateClicks(dt);
        const haloBusy = this._updateHalo(dt, x, y, isMoving, speedNorm);
        const cursorBusy = this._updateCursor(dt, x, y, isMoving, speedNorm);

        if (!isMoving && !cursorBusy && !haloBusy && flames + sparks + clicks === 0)
            this._sleep();
    }

    _updateHalo(dt, x, y, isMoving, speedNorm) {
        if (!this._fireBreathingEnabled)
            return false;

        const want = this._fireBreathingAlways || isMoving || this._speed > 10;
        this._haloFade = want
            ? Math.min(1, this._haloFade + dt * 5.0)
            : Math.max(0, this._haloFade - dt * 3.0);

        if (this._haloFade <= 0.01) {
            for (const actor of this._haloActors)
                actor.hide();
            return want; // still busy while fading in
        }

        // Organic breathing: a slow breath plus incommensurate flicker waves.
        const f = this._fireBreathingSpeed * (1 + 0.9 * speedNorm);
        this._haloTime = (this._haloTime + dt * f) % 1000;
        const t = this._haloTime * TAU;
        const breath = 0.5 + 0.5 * Math.sin(t);
        const flicker = 0.5 + 0.25 * Math.sin(t * 2.31 + 1.3) + 0.25 * Math.sin(t * 3.73 + 2.1);
        const mix = 0.72 * breath + 0.28 * flicker;

        // The fire lags a touch behind fast motion, like a real flame.
        const lagA = expAlpha(14, dt);
        const lagX = clamp(-this._velX * 0.012, -16, 16);
        const lagY = clamp(-this._velY * 0.012, -16, 16);
        this._haloOffX += (lagX - this._haloOffX) * lagA;
        this._haloOffY += (lagY - this._haloOffY) * lagA;
        const cx = x + this._haloOffX;
        const cy = y + this._haloOffY;
        const half = HALO_RENDER_SIZE / 2;

        const size = this._fireBreathingSize;
        const base = this._fireBreathingIntensity * this._haloFade;
        this._coronaAngleA = (this._coronaAngleA + dt * (22 + 260 * speedNorm)) % 360;
        this._coronaAngleB = (this._coronaAngleB - dt * (34 + 320 * speedNorm)) % 360;

        const layers = [
            [this._haloOuter, 0.86 + 0.3 * mix + 0.45 * speedNorm, 0.62 + 0.38 * mix + 0.2 * speedNorm, null],
            [this._coronaA, 0.96 + 0.16 * mix + 0.4 * speedNorm, (0.5 + 0.35 * flicker + 0.35 * speedNorm) * 0.9, this._coronaAngleA],
            [this._coronaB, 0.78 + 0.12 * flicker + 0.32 * speedNorm, (0.35 + 0.3 * breath + 0.3 * speedNorm) * 0.75, this._coronaAngleB],
            [this._haloCore, 0.4 + 0.12 * flicker + 0.22 * speedNorm, 0.8 + 0.3 * flicker, null],
        ];
        for (const [actor, diam, op, angle] of layers) {
            const s = (size * diam) / HALO_RENDER_SIZE;
            actor.set_translation(cx - half, cy - half, 0);
            actor.set_scale(s, s);
            actor.set_opacity(Math.round(255 * clamp(base * op, 0, 1)));
            if (angle !== null)
                actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, angle);
            if (!actor.visible)
                actor.show();
        }

        // Busy while fading in/out or while the speed-stoked flare settles.
        if (!want)
            return true;
        return this._haloFade < 1 || speedNorm > 0.005;
    }

    _updateCursor(dt, x, y, isMoving, speedNorm) {
        if (!this._effectEnabled)
            return false;

        const target = isMoving
            ? this._minMoveScale + (this._maxFastScale - this._minMoveScale) * speedNorm ** 0.75
            : 1.0;

        // Damped spring: a slight, playful overshoot when it grows and a
        // calm settle when it shrinks. Sub-stepped for stability.
        const growing = target > this._scale;
        const k = growing ? this._growStiffness : this._shrinkStiffness;
        const c = 2 * Math.sqrt(k) * (growing ? 0.55 : 0.9);
        const steps = Math.ceil(dt * 240);
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            this._scaleVel += (k * (target - this._scale) - c * this._scaleVel) * h;
            this._scale += this._scaleVel * h;
        }
        if (this._scale < 1) {
            this._scale = 1;
            this._scaleVel = Math.max(0, this._scaleVel);
        }

        // Gentle pendulum lean in the direction of horizontal travel.
        const leanTarget = this._leanEnabled && isMoving
            ? clamp(this._velX / this._maxSpeedThreshold, -1, 1) * 11
            : 0;
        this._lean += (leanTarget - this._lean) * expAlpha(9, dt);

        const busy = isMoving || this._scale > 1.015 || Math.abs(this._scaleVel) > 0.05 ||
            Math.abs(this._lean) > 0.2;
        if (!busy) {
            this._scale = 1;
            this._scaleVel = 0;
            this._lean = 0;
            if (this._cursor.visible)
                this._cursor.hide();
            this._showSystemCursor();
            return false;
        }

        if (this._hideSystemCursorPref)
            this._hideSystemCursor();
        const s = (this._baseCursorSize * this._scale) / CURSOR_RENDER_SIZE;
        this._cursor.set_translation(x - this._hotOffsetX, y - this._hotOffsetY, 0);
        this._cursor.set_scale(s, s);
        this._cursor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, this._lean);
        if (!this._cursor.visible)
            this._cursor.show();
        return true;
    }

    // ------------------------------------------------------------------
    // System cursor
    // ------------------------------------------------------------------

    _hideSystemCursor() {
        if (!this._cursorUnfocusInhibited) {
            this._seat.inhibit_unfocus();
            this._cursorUnfocusInhibited = true;
        }
        if (!this._cursorVisibleInhibited) {
            this._cursorTracker.inhibit_cursor_visibility();
            this._cursorVisibleInhibited = true;
        }
    }

    _showSystemCursor() {
        if (this._cursorUnfocusInhibited) {
            this._seat.uninhibit_unfocus();
            this._cursorUnfocusInhibited = false;
        }
        if (this._cursorVisibleInhibited) {
            this._cursorTracker.uninhibit_cursor_visibility();
            this._cursorVisibleInhibited = false;
        }
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;

        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }
        if (this._visibilityChangedId) {
            this._cursorTracker.disconnect(this._visibilityChangedId);
            this._visibilityChangedId = 0;
        }
        if (this._positionChangedId) {
            this._cursorTracker.disconnect(this._positionChangedId);
            this._positionChangedId = 0;
        }

        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
        this._running = false;
        this._idleBreathing = false;
        this._showSystemCursor();

        // Destroying the layer destroys every sprite (and their transitions).
        this._layer?.destroy();
        this._layer = null;
        this._flamePool = null;
        this._sparkPool = null;
        this._clickPool = null;
        this._haloActors = null;
        this._haloOuter = this._haloCore = this._coronaA = this._coronaB = null;
        this._cursor = null;
        this._gicons = null;

        if (this._interfaceSettingsChangedId) {
            this._interfaceSettings.disconnect(this._interfaceSettingsChangedId);
            this._interfaceSettingsChangedId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._interfaceSettings = null;
        this._settings = null;
        this._cursorTracker = null;
        this._seat = null;
    }
}
