<div align="center">
  <img src="assets/icon-256.png" alt="Speed Cursor Icon" width="128" height="128" />
  <h1>Speed Cursor — Dynamic Size, Fire Halo &amp; Comet Trail</h1>
  <p>
    <strong>Never lose your mouse pointer again on large, 4K, or multi-monitor Linux desktops.</strong><br/>
    Smoothly enlarges your cursor with movement velocity, surrounds it with a breathing halo of light, and ignites a directional comet-fire motion trail.
  </p>

  <p>
    <a href="https://extensions.gnome.org/extension/11388/speed-cursor-dynamic-size-fire-halo-comet-trail/">
      <img src="https://img.shields.io/badge/GNOME_Extensions-Install_Now-4A86CF?style=for-the-badge&logo=gnome&logoColor=white" alt="Get it on GNOME Extensions" />
    </a>
    <a href="https://github.com/mgmehdiforme/speed-cursor/releases/latest">
      <img src="https://img.shields.io/github/v/release/mgmehdiforme/speed-cursor?style=for-the-badge&color=ff6600" alt="Latest Release" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="MIT License" />
    </a>
  </p>
</div>

---

## 📸 Preview in Action

<div align="center">
  <img src="assets/screenshot.png" alt="Speed Cursor with Fire-Breathing Halo and Comet-Fire Trail on Ubuntu GNOME" width="90%" />
  <p><em>Enlarged velocity-scaled pointer with the <strong>Fire-Breathing Halo</strong> at the tip and a curved <strong>Comet-Fire Motion Trail</strong> showing the exact path traveled.</em></p>
</div>

---

## ✨ Why Speed Cursor?

Traditional "shake-to-find" utilities only trigger after you violently shake the mouse back and forth. **Speed Cursor** is designed for effortless, continuous spatial awareness:

1. **⚡ Continuous Velocity Scaling (`Speed Size Scaling`)**
   * Smoothly scales your cursor from `1.0x` (stationary) $\rightarrow$ `1.3x` (slow movement) $\rightarrow$ up to `4.0x–8.0x` (fast sweeps).
   * Driven by a damped spring: it *pops* up with a tiny playful overshoot and settles back calmly when you stop.
   * **Living lean:** the enlarged pointer sways gently like a pendulum in the direction it travels.
   * Uses a crisp, high-resolution vector cursor locked to the exact pointer hotspot so the tip never shifts or blurs.
2. **🔥 Fire-Breathing (`Halo of Light`)**
   * Surrounds the cursor tip with a soft glow and two counter-rotating **coronas of curling flame tongues** that breathe with organic, never-repeating rhythms.
   * Automatically **stokes brighter, wider and spins faster** when you move the mouse quickly, and trails slightly behind fast motion like a real flame.
   * When the pointer is parked it keeps breathing through GPU-side Clutter transitions — **no JavaScript runs at all while idle**.
3. **☄️ Comet-Fire (`Directional Motion Trail`)**
   * Leaves a continuous ribbon of directional **flame tongues** that stretch with speed, rise with heat and burn out from white-hot to deep color.
   * **Flying ember sparks** break off on fast sweeps, drift upwards and twinkle out.
   * Built on pre-allocated particle pools with path interpolation, so density is identical at 60, 120 or 144 Hz.
4. **🎯 On-Click Ripple Animation (`Screen Recording Helper`)**
   * A bright flash, an expanding shockwave ring, a softer echo ring and a burst of embers at the exact screen coordinate `(x, y)` where you click — ideal for screen recordings, video tutorials, and live presentations.
   * Optional **Color-Coding by Mouse Button**: **Left Click** = Amber Gold, **Right Click** = Electric Cyan, **Middle Click** = Neon Emerald (or match your chosen Flame Color Theme).
5. **🎨 5 Built-In Flame Color Themes**
   * Choose between **🔥 Ember Fire**, **☀️ Solar Gold**, **⚡ Blue Plasma**, **🟢 Emerald Wildfire**, and **🌹 Crimson Phoenix** to match any wallpaper or desktop theme.
6. **🎛️ One-Click Quick Settings & Full Libadwaita Preferences**
   * Toggle **Speed Size Scaling**, **Fire-Breathing Halo**, **Comet-Fire Trail**, and **Click Ripple (Screen Recording)** independently right from the top-right GNOME Quick Settings menu, or fine-tune every slider in the native Settings window.
7. **🎬 Fullscreen Video & Game Smart Detection**
   * Automatically drops all effects the moment a video player or game hides the system pointer.
8. **🚀 Built for Performance**
   * Animation is driven by the compositor's **frame clock** (vsync-locked at your monitor's refresh rate) instead of a fixed 16 ms timer.
   * **Event-driven wake-up** from Mutter's cursor tracker — nothing polls the pointer, and the loop stops completely when nothing is animating.
   * Sprites move with GPU transforms (no relayouts), are rasterised once, and live in a single effects layer.

---

## 🚀 Easy Installation

### Option 1: Install from GNOME Extensions (1-Click)
Visit the official **[GNOME Extensions Page](https://extensions.gnome.org/extension/11388/speed-cursor-dynamic-size-fire-halo-comet-trail/)** and toggle the switch to **ON**.

### Option 2: Clone & Run the Installer
```bash
git clone https://github.com/mgmehdiforme/speed-cursor.git
cd speed-cursor
./install.sh
```

### Option 3: Install From Release `.zip` Bundle
Download the latest `.zip` from [GitHub Releases](https://github.com/mgmehdiforme/speed-cursor/releases/latest) and run:
```bash
gnome-extensions install --force speed-cursor@local.shell-extension.zip
gnome-extensions enable speed-cursor@local
```

---

## ⚙️ Configuration & Settings

You can customize **Speed Cursor** from three places:

1. **Top-Right GNOME Quick Settings Menu:**
   Click the system status menu in the top-right corner $\rightarrow$ click the arrow (`>`) on **Speed Cursor** to toggle individual effects, pick a size preset, or open **Speed Cursor Settings…**.
2. **Desktop App Launcher:**
   Press the `Super` key and search for **Speed Cursor Settings**.
3. **Terminal:**
   ```bash
   gnome-extensions prefs speed-cursor@local
   ```

| Setting | Key | Default | Description |
| :--- | :--- | :---: | :--- |
| **Speed Size Scaling** | `effect-enabled` | `true` | Enlarge pointer dynamically based on movement speed |
| **Minimum Moving Size** | `min-move-scale` | `1.3` | Scale multiplier as soon as the mouse starts moving |
| **Maximum Fast Size** | `max-fast-scale` | `4.0` | Maximum scale multiplier at high speed (`1.5x–8.0x`) |
| **Fast Speed Threshold** | `max-speed-threshold` | `2600` | Velocity ($\text{px/s}$) required to reach maximum size |
| **Fire-Breathing Halo** | `fire-breathing-enabled` | `true` | Animate a breathing halo of light around the pointer |
| **Always Breathe** | `fire-breathing-always` | `true` | Keep halo gently breathing even when mouse is parked |
| **Halo Diameter** | `fire-breathing-size` | `88` | Diameter of the breathing light aura (`40px–220px`) |
| **Comet-Fire Trail** | `comet-fire-enabled` | `true` | Ignite a directional comet trail on mouse movement |
| **Comet Trail Length** | `comet-fire-length` | `18` | Number of flame particles in the comet tail (`6–28`) |
| **Flying Ember Sparks** | `comet-sparks-enabled` | `true` | Embers break off the trail on fast movements |
| **Living Cursor Lean** | `cursor-lean-enabled` | `true` | Enlarged cursor sways in the direction of travel |
| **Flame Color Theme** | `fire-theme` | `'ember'` | `ember`, `solar`, `plasma`, `emerald`, or `crimson` |
| **On-Click Ripple** | `click-effect-enabled` | `true` | Expanding click ring for screen recordings & demos |
| **Color-Code by Button** | `click-color-by-button` | `true` | Left=Gold, Right=Cyan, Middle=Emerald |
| **Click Ripple Diameter** | `click-effect-size` | `110` | Maximum diameter of the expanding click ring (`48px–240px`) |
| **Click Ripple Duration** | `click-effect-duration` | `0.38` | Duration of each click shockwave animation (`0.15s–1.0s`) |

---

## 🛠️ Development

The themed flame, spark and corona sprites are generated:

```bash
python3 tools/gen-icons.py
```

---

## 🗑️ Uninstallation

```bash
./uninstall.sh
```

---

## 📄 License

Released under the [MIT License](LICENSE). Created by [Mehdi Golzari](https://github.com/mgmehdiforme).
