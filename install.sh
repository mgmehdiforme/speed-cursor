#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="speed-cursor@local"
EXT_BASE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
TARGET_DIR="$EXT_BASE_DIR/$UUID"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$APPS_DIR/speed-cursor-settings.desktop"

echo "==> Checking dependencies..."
for cmd in glib-compile-schemas gsettings; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: Required command '$cmd' not found. Please install glib2 / libglib2.0-bin." >&2
        exit 1
    fi
done

echo "==> Compiling GSettings schema..."
glib-compile-schemas --strict "$SCRIPT_DIR/schemas/"

echo "==> Installing extension files to $TARGET_DIR..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR/icons" "$TARGET_DIR/schemas"

cp "$SCRIPT_DIR/metadata.json" "$TARGET_DIR/"
cp "$SCRIPT_DIR/extension.js" "$TARGET_DIR/"
cp "$SCRIPT_DIR/prefs.js" "$TARGET_DIR/"
cp "$SCRIPT_DIR/icons/cursor.svg" "$TARGET_DIR/icons/"
cp "$SCRIPT_DIR/schemas/org.gnome.shell.extensions.speed-cursor.gschema.xml" "$TARGET_DIR/schemas/"
cp "$SCRIPT_DIR/schemas/gschemas.compiled" "$TARGET_DIR/schemas/"

echo "==> Installing desktop settings launcher..."
mkdir -p "$APPS_DIR"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Speed Cursor Settings
Comment=Configure mouse pointer dynamic speed scaling and animation
Exec=gnome-extensions prefs $UUID
Icon=input-mouse
Terminal=false
Type=Application
Categories=GNOME;GTK;Settings;DesktopSettings;Utility;
Keywords=mouse;cursor;pointer;size;speed;wiggle;shake;zoom;accessibility;settings;
StartupNotify=true
EOF

echo "==> Enabling $UUID in GNOME Shell..."
CURRENT=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "[]")
if [[ "$CURRENT" != *"'$UUID'"* ]]; then
    if [[ "$CURRENT" == "@as []" || "$CURRENT" == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']" || true
    else
        UPDATED="${CURRENT%]}, '$UUID']"
        gsettings set org.gnome.shell enabled-extensions "$UPDATED" || true
    fi
fi

if command -v gnome-extensions >/dev/null 2>&1; then
    if ! gnome-extensions info "$UUID" >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
        echo "==> Registering extension with running GNOME Shell session..."
        python3 - <<'PYEOF' || true
import time
try:
    import gi
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, GLib

    settings = Gio.Settings.new("org.gnome.shell")
    old_cmd = settings.get_strv("command-history")
    old_lg = settings.get_strv("looking-glass-history")

    js_cmd = (
        'Main.extensionManager.loadExtension('
        'Main.extensionManager.createExtensionObject("speed-cursor@local", '
        'Gio.File.new_for_path(GLib.get_home_dir() + "/.local/share/gnome-shell/extensions/speed-cursor@local"), 2)'
        '); Main.lookingGlass.close();'
    )

    settings.set_strv("command-history", old_cmd + ["lg"])
    settings.set_strv("looking-glass-history", old_lg + [js_cmd])
    Gio.Settings.sync()

    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    res = bus.call_sync(
        "org.gnome.Mutter.RemoteDesktop",
        "/org/gnome/Mutter/RemoteDesktop",
        "org.gnome.Mutter.RemoteDesktop",
        "CreateSession",
        None,
        GLib.VariantType("(o)"),
        Gio.DBusCallFlags.NONE,
        -1,
        None,
    )
    path = res.unpack()[0]

    def call_session(method, params=None):
        return bus.call_sync(
            "org.gnome.Mutter.RemoteDesktop",
            path,
            "org.gnome.Mutter.RemoteDesktop.Session",
            method,
            params,
            None,
            Gio.DBusCallFlags.NONE,
            -1,
            None,
        )

    def key_press_release(keysym, delay=0.03):
        call_session("NotifyKeyboardKeysym", GLib.Variant("(ub)", (keysym, True)))
        time.sleep(delay)
        call_session("NotifyKeyboardKeysym", GLib.Variant("(ub)", (keysym, False)))

    call_session("Start")
    time.sleep(0.1)
    call_session("NotifyKeyboardKeysym", GLib.Variant("(ub)", (0xffe9, True)))
    time.sleep(0.03)
    key_press_release(0xffbf)
    time.sleep(0.03)
    call_session("NotifyKeyboardKeysym", GLib.Variant("(ub)", (0xffe9, False)))
    time.sleep(0.25)
    key_press_release(0xff52)
    time.sleep(0.05)
    key_press_release(0xff0d)
    time.sleep(0.35)
    key_press_release(0xff52)
    time.sleep(0.05)
    key_press_release(0xff0d)
    time.sleep(0.2)
    call_session("Stop")

    settings.set_strv("command-history", old_cmd)
    settings.set_strv("looking-glass-history", old_lg)
    Gio.Settings.sync()
except Exception:
    pass
PYEOF
    fi
    gnome-extensions enable "$UUID" 2>/dev/null || true
fi

echo ""
echo "✅ Speed Cursor ($UUID) has been installed and enabled!"
echo "   • Top-right Quick Settings menu: toggle 'Speed Cursor' or open settings"
echo "   • App Launcher: search for 'Speed Cursor Settings'"
echo "   • CLI: run 'gnome-extensions prefs $UUID'"
