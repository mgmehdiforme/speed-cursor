import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const FIRE_THEMES = [
    { id: 'ember', label: '🔥 Ember Fire (Orange / Gold)' },
    { id: 'solar', label: '☀️ Solar Gold (Bright Amber)' },
    { id: 'plasma', label: '⚡ Blue Plasma (Cyan / Electric Blue)' },
    { id: 'emerald', label: '🟢 Emerald Wildfire (Neon Green)' },
    { id: 'crimson', label: '🌹 Crimson Phoenix (Ruby / Magenta)' },
];

export default class SpeedCursorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 720);

        // =====================================================================
        // PAGE 1: Speed Scaling
        // =====================================================================
        const scalingPage = new Adw.PreferencesPage({
            title: 'Speed Scaling',
            icon_name: 'input-mouse-symbolic',
        });
        window.add(scalingPage);

        const generalGroup = new Adw.PreferencesGroup({
            title: 'Dynamic Velocity Scaling',
            description: 'Enlarge the mouse pointer when moving and scale it bigger with speed.',
        });
        scalingPage.add(generalGroup);

        const enableRow = new Adw.SwitchRow({
            title: 'Enable Speed Size Scaling',
            subtitle: 'Dynamically enlarge mouse pointer based on movement velocity',
        });
        settings.bind(
            'effect-enabled',
            enableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        generalGroup.add(enableRow);

        generalGroup.add(
            this._createScaleRow(
                settings,
                'min-move-scale',
                'Minimum Moving Size (Multiplier)',
                'Size multiplier as soon as the mouse starts moving (1.0 = normal)',
                1.0,
                3.0,
                0.05,
                2
            )
        );

        generalGroup.add(
            this._createScaleRow(
                settings,
                'max-fast-scale',
                'Maximum Fast Size (Multiplier)',
                'Size multiplier when moving the mouse at high speed',
                1.5,
                8.0,
                0.1,
                1
            )
        );

        const speedGroup = new Adw.PreferencesGroup({
            title: 'Velocity & Animation Smoothness',
            description: 'Tune how sensitive the scaling is to pointer speed and how smoothly it animates.',
        });
        scalingPage.add(speedGroup);

        speedGroup.add(
            this._createScaleRow(
                settings,
                'max-speed-threshold',
                'Fast Speed Threshold (px/sec)',
                'Lower values make the cursor reach maximum size with slower movements',
                500.0,
                6000.0,
                100.0,
                0
            )
        );

        speedGroup.add(
            this._createScaleRow(
                settings,
                'grow-smoothing',
                'Expansion Speed',
                'How rapidly the cursor grows when accelerating',
                0.05,
                1.0,
                0.05,
                2
            )
        );

        speedGroup.add(
            this._createScaleRow(
                settings,
                'shrink-smoothing',
                'Shrink Speed',
                'How rapidly the cursor returns to normal size when stopping',
                0.03,
                0.5,
                0.01,
                2
            )
        );

        const behaviorGroup = new Adw.PreferencesGroup({
            title: 'System Cursor Behavior',
        });
        scalingPage.add(behaviorGroup);

        const hideRow = new Adw.SwitchRow({
            title: 'Hide System Cursor While Animated',
            subtitle: 'Hides the native small cursor while the enlarged cursor is active',
        });
        settings.bind(
            'hide-system-cursor',
            hideRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        behaviorGroup.add(hideRow);

        // =====================================================================
        // PAGE 2: Fire-Breathing Halo & Comet-Fire Trail
        // =====================================================================
        const firePage = new Adw.PreferencesPage({
            title: 'Fire Halo & Comet',
            icon_name: 'weather-clear-symbolic',
        });
        window.add(firePage);

        const themeGroup = new Adw.PreferencesGroup({
            title: 'Flame Color Palette',
            description: 'Choose the visual color theme for both Fire-Breathing Halo and Comet-Fire Trail.',
        });
        firePage.add(themeGroup);

        const themeModel = new Gtk.StringList();
        for (const t of FIRE_THEMES)
            themeModel.append(t.label);

        const themeRow = new Adw.ComboRow({
            title: 'Fire Color Theme',
            subtitle: 'Applies to the breathing halo and comet motion trail',
            model: themeModel,
        });

        const currentThemeId = settings.get_string('fire-theme');
        const initialIdx = Math.max(0, FIRE_THEMES.findIndex(t => t.id === currentThemeId));
        themeRow.set_selected(initialIdx);

        themeRow.connect('notify::selected', () => {
            const idx = themeRow.get_selected();
            const chosen = FIRE_THEMES[idx] ?? FIRE_THEMES[0];
            settings.set_string('fire-theme', chosen.id);
        });
        themeGroup.add(themeRow);

        // Fire-Breathing Halo Group
        const haloGroup = new Adw.PreferencesGroup({
            title: 'Fire-Breathing (Halo of Light)',
            description: 'Animates a living, breathing aura of light around your pointer so you can spot it immediately.',
        });
        firePage.add(haloGroup);

        const haloEnableRow = new Adw.SwitchRow({
            title: 'Enable Fire-Breathing Halo',
            subtitle: 'Pulse a glowing halo of light around the mouse pointer',
        });
        settings.bind(
            'fire-breathing-enabled',
            haloEnableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        haloGroup.add(haloEnableRow);

        const haloAlwaysRow = new Adw.SwitchRow({
            title: 'Always Breathe (Even When Stationary)',
            subtitle: 'Keep the halo gently breathing when the mouse stops so a parked pointer is never lost',
        });
        settings.bind(
            'fire-breathing-always',
            haloAlwaysRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        haloGroup.add(haloAlwaysRow);

        haloGroup.add(
            this._createScaleRow(
                settings,
                'fire-breathing-size',
                'Halo Diameter (px)',
                'Size of the breathing light aura around the cursor',
                40.0,
                220.0,
                4.0,
                0
            )
        );

        haloGroup.add(
            this._createScaleRow(
                settings,
                'fire-breathing-intensity',
                'Halo Glow Intensity',
                'Brightness and opacity of the breathing halo',
                0.15,
                1.0,
                0.05,
                2
            )
        );

        haloGroup.add(
            this._createScaleRow(
                settings,
                'fire-breathing-speed',
                'Breathing Pulse Frequency (Hz)',
                'How fast the halo breathes in and out',
                0.3,
                4.0,
                0.1,
                1
            )
        );

        // Comet-Fire Trail Group
        const cometGroup = new Adw.PreferencesGroup({
            title: 'Comet-Fire (Motion Trail)',
            description: 'Leaves a glowing comet tail when moving so you can see where the pointer came from and where it went.',
        });
        firePage.add(cometGroup);

        const cometEnableRow = new Adw.SwitchRow({
            title: 'Enable Comet-Fire Trail',
            subtitle: 'Ignite a directional flame trail when moving the mouse',
        });
        settings.bind(
            'comet-fire-enabled',
            cometEnableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        cometGroup.add(cometEnableRow);

        cometGroup.add(
            this._createIntScaleRow(
                settings,
                'comet-fire-length',
                'Comet Trail Length (Particles)',
                'Number of glowing flame nodes in the comet tail',
                6,
                28,
                1
            )
        );

        cometGroup.add(
            this._createScaleRow(
                settings,
                'comet-fire-size',
                'Comet Head Thickness (px)',
                'Width of the flame trail right behind the pointer',
                14.0,
                80.0,
                2.0,
                0
            )
        );

        cometGroup.add(
            this._createScaleRow(
                settings,
                'comet-fire-duration',
                'Trail Burnout Duration (sec)',
                'How long the comet trail lingers before fading out',
                0.10,
                0.80,
                0.02,
                2
            )
        );

        // =====================================================================
        // PAGE 3: Click Ripple (Screen Recording)
        // =====================================================================
        const clickPage = new Adw.PreferencesPage({
            title: 'Click Ripple',
            icon_name: 'media-record-symbolic',
        });
        window.add(clickPage);

        const clickGroup = new Adw.PreferencesGroup({
            title: 'On-Click Animation (Screen Recording Helper)',
            description: 'Spawns an expanding concentric shockwave ring at the exact screen position where you click so viewers can clearly follow every click in tutorials, demos, and screen recordings.',
        });
        clickPage.add(clickGroup);

        const clickEnableRow = new Adw.SwitchRow({
            title: 'Enable On-Click Ripple Animation',
            subtitle: 'Show an expanding visual pulse at the cursor tip whenever a mouse button is pressed',
        });
        settings.bind(
            'click-effect-enabled',
            clickEnableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        clickGroup.add(clickEnableRow);

        const clickColorByButtonRow = new Adw.SwitchRow({
            title: 'Color-Code by Mouse Button',
            subtitle: 'Left Click = Amber Gold, Right Click = Electric Cyan, Middle Click = Neon Emerald (when off, uses your Fire Color Theme)',
        });
        settings.bind(
            'click-color-by-button',
            clickColorByButtonRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        clickGroup.add(clickColorByButtonRow);

        clickGroup.add(
            this._createScaleRow(
                settings,
                'click-effect-size',
                'Ripple Expansion Diameter (px)',
                'Maximum diameter of the expanding click ring',
                48.0,
                240.0,
                4.0,
                0
            )
        );

        clickGroup.add(
            this._createScaleRow(
                settings,
                'click-effect-duration',
                'Ripple Animation Duration (sec)',
                'How long each click shockwave stays visible on screen',
                0.15,
                1.00,
                0.05,
                2
            )
        );

        clickGroup.add(
            this._createScaleRow(
                settings,
                'click-effect-intensity',
                'Ripple Glow Opacity',
                'Peak brightness and visibility of the click shockwave ring',
                0.20,
                1.00,
                0.05,
                2
            )
        );

        // Reset Group
        const resetGroup = new Adw.PreferencesGroup({
            title: 'Reset',
        });
        clickPage.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: 'Reset All Settings to Defaults',
            subtitle: 'Restore Speed Scaling, Fire Halo, Comet Trail, and Click Ripple defaults',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset Defaults',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetButton.connect('clicked', () => {
            for (const key of [
                'effect-enabled',
                'min-move-scale',
                'max-fast-scale',
                'max-speed-threshold',
                'grow-smoothing',
                'shrink-smoothing',
                'hide-system-cursor',
                'fire-breathing-enabled',
                'fire-breathing-always',
                'fire-breathing-size',
                'fire-breathing-intensity',
                'fire-breathing-speed',
                'comet-fire-enabled',
                'comet-fire-length',
                'comet-fire-size',
                'comet-fire-duration',
                'fire-theme',
                'click-effect-enabled',
                'click-color-by-button',
                'click-effect-size',
                'click-effect-duration',
                'click-effect-intensity',
            ]) {
                settings.reset(key);
            }
            themeRow.set_selected(0);
        });
        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);
    }

    _createScaleRow(settings, key, title, subtitle, min, max, step, digits) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
        });

        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
            value: settings.get_double(key),
        });

        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment,
            digits,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            width_request: 210,
        });

        adjustment.connect('value-changed', () => {
            settings.set_double(key, adjustment.get_value());
        });

        const connId = settings.connect(`changed::${key}`, () => {
            const val = settings.get_double(key);
            if (Math.abs(adjustment.get_value() - val) > 1e-4)
                adjustment.set_value(val);
        });

        row.connect('destroy', () => {
            settings.disconnect(connId);
        });

        row.add_suffix(scale);
        return row;
    }

    _createIntScaleRow(settings, key, title, subtitle, min, max, step) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
        });

        const adjustment = new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 4,
            value: settings.get_int(key),
        });

        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment,
            digits: 0,
            draw_value: true,
            hexpand: true,
            valign: Gtk.Align.CENTER,
            width_request: 210,
        });

        adjustment.connect('value-changed', () => {
            settings.set_int(key, Math.round(adjustment.get_value()));
        });

        const connId = settings.connect(`changed::${key}`, () => {
            const val = settings.get_int(key);
            if (Math.round(adjustment.get_value()) !== val)
                adjustment.set_value(val);
        });

        row.connect('destroy', () => {
            settings.disconnect(connId);
        });

        row.add_suffix(scale);
        return row;
    }
}
