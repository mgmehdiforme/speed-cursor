# Speed Cursor — Dynamic Velocity Mouse Pointer for GNOME

**Speed Cursor** is a lightweight, zero-idle-CPU GNOME Shell extension (for **GNOME 45 – 50+**, Wayland & X11) that smoothly enlarges your mouse pointer as soon as it starts moving and scales it progressively larger the faster you move it.

Unlike traditional "shake-to-find" extensions that only trigger after violent back-and-forth shaking, **Speed Cursor** provides continuous, fluid velocity-proportional scaling on every movement.

---

## ✨ Features

- **Continuous Velocity Scaling:** Smoothly interpolates pointer size from normal (`1.0x`) when stationary $\rightarrow$ slightly larger (`1.3x`) when moving slowly $\rightarrow$ largest (`4.0x`–`8.0x`) when moving quickly.
- **Razor-Sharp Vector Rendering:** Renders a high-resolution vector SVG cursor pinned to the exact pointer hotspot so the tip never drifts and never looks blurry at high magnification.
- **Zero CPU When Stationary:** Automatically stops its animation loop and restores the native hardware cursor as soon as the mouse stops moving.
- **Quick Settings Integration:** Adds a **Speed Cursor** toggle tile and preset selector (`Subtle`, `Balanced`, `Large`, `Extra Large`) directly to the top-right GNOME Quick Settings menu.
- **Full Libadwaita Preferences UI:** Customize minimum/maximum size multipliers, velocity sensitivity, expansion responsiveness, and shrink smoothness.
- **Fullscreen Media & Game Aware:** Respects applications (like video players and games) that intentionally hide the system pointer.
- **Broad GNOME Compatibility:** Supports GNOME Shell **45, 46, 47, 48, 49, and 50** (including Mutter 18's `inhibit_cursor_visibility()` API with automatic fallback to `set_pointer_visible()` on older releases).

---

## 🚀 Quick Installation

### Option 1: Clone & Run the Installer (Recommended)

```bash
git clone https://github.com/mgmehdiforme/speed-cursor.git
cd speed-cursor
./install.sh
```

> **Wayland Note:** After installing for the first time on Wayland, log out and log back in once so GNOME Shell discovers the new extension directory.

### Option 2: Install Using `make`

```bash
make install
```

### Option 3: Install From `.shell-extension.zip` Bundle

```bash
make pack
gnome-extensions install --force speed-cursor@local.shell-extension.zip
gnome-extensions enable speed-cursor@local
```

---

## ⚙️ Configuration & Settings

You can configure **Speed Cursor** in three ways:

1. **Top-Right Quick Settings Menu:**
   Open the GNOME system menu in the top-right corner $\rightarrow$ click the arrow (`>`) on the **Speed Cursor** tile to pick a preset or click **Speed Cursor Settings…**.
2. **Applications Menu / Search:**
   Press the `Super` key, search for **Speed Cursor Settings**, and open the app.
3. **Terminal:**
   ```bash
   gnome-extensions prefs speed-cursor@local
   ```

### Available Settings

| Setting | GSettings Key | Default | Description |
| :--- | :--- | :---: | :--- |
| **Enable Speed Cursor** | `effect-enabled` | `true` | Toggle dynamic pointer scaling on or off |
| **Minimum Moving Size** | `min-move-scale` | `1.3` | Scale multiplier as soon as the mouse starts moving slowly |
| **Maximum Fast Size** | `max-fast-scale` | `4.0` | Maximum scale multiplier when moving fast (`1.5x` – `8.0x`) |
| **Fast Speed Threshold** | `max-speed-threshold` | `2600` | Pointer speed ($\text{px/s}$) where maximum size is reached |
| **Expansion Speed** | `grow-smoothing` | `0.38` | How rapidly the cursor expands when accelerating |
| **Shrink Speed** | `shrink-smoothing` | `0.14` | How smoothly the cursor returns to `1.0x` when stopping |
| **Hide System Cursor** | `hide-system-cursor` | `true` | Hides the native small cursor while the scaled cursor is active |

---

## 🗑️ Uninstallation

```bash
./uninstall.sh
# or: make uninstall
```

---

## 📄 License

Released under the [MIT License](LICENSE).
