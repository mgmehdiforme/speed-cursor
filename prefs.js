import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SpeedCursorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Speed Cursor',
            icon_name: 'input-mouse-symbolic',
        });
        window.add(page);

        const generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(generalGroup);

        const enableRow = new Adw.SwitchRow({
            title: 'Enable Speed Cursor',
            subtitle: 'Dynamically enlarge mouse pointer when moving',
        });
        settings.bind(
            'effect-enabled',
            enableRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        generalGroup.add(enableRow);

        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Cursor Scaling',
            description: 'Configure how much the pointer grows when moving slowly vs. fast.',
        });
        page.add(sizeGroup);

        sizeGroup.add(
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

        sizeGroup.add(
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
        page.add(speedGroup);

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
            title: 'Behavior',
        });
        page.add(behaviorGroup);

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

        const resetRow = new Adw.ActionRow({
            title: 'Reset to Defaults',
            subtitle: 'Restore all Speed Cursor settings to their recommended default values',
        });
        const resetButton = new Gtk.Button({
            label: 'Reset',
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
            ]) {
                settings.reset(key);
            }
        });
        resetRow.add_suffix(resetButton);
        behaviorGroup.add(resetRow);
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
            width_request: 220,
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
}
