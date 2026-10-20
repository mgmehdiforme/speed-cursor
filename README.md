# Speed Cursor — Dynamic Velocity Pointer, Fire-Breathing Halo & Comet-Fire Trail for GNOME

**Speed Cursor** is a lightweight GNOME Shell extension (for **GNOME 45 – 50+**, Wayland & X11) that makes your mouse pointer impossible to lose and effortless to track across large or multi-monitor displays:

1. **⚡ Dynamic Velocity Scaling:** Smoothly enlarges your mouse pointer as soon as it starts moving and scales it progressively larger the faster you move it.
2. **🔥 Fire-Breathing (Halo of Light):** Animates a living, breathing aura of light around your pointer (both while parked and stoked brighter when moving) so you can spot it immediately.
3. **☄️ Comet-Fire (Motion Trail):** Ignites a directional, tapering comet-fire trail behind your moving cursor so your eyes immediately see where the pointer came from and where it went.

All three effects can be toggled independently from the **top-right GNOME Quick Settings menu** or the **Speed Cursor Settings** app!

---

## ✨ Features

- **Continuous Velocity Scaling:** Smoothly interpolates pointer size from normal (`1.0x`) when stationary $\rightarrow$ slightly larger (`1.3x`) when moving slowly $\rightarrow$ largest (`4.0x`–`8.0x`) when moving quickly.
- **Fire-Breathing Halo of Light:** Dual-harmonic breathing glow around the cursor with optional stationary pulsing ("Always Breathe") and velocity stoking.
- **Comet-Fire Motion Trail:** Zero-GC object-pooled particle ribbon with upward thermal buoyancy, flame turbulence, and smooth tail tapering.
- **5 Built-In Flame Color Themes:**
  - 🔥 **Ember Fire** (Golden core + Orange/Red flame)
  - ☀️ **Solar Gold** (White-Gold core + Bright Amber)
  - ⚡ **Blue Plasma** (Ice-White core + Cyan/Electric Blue)
  - 🟢 **Emerald Wildfire** (Lime core + Neon Green)
  - 🌹 **Crimson Phoenix** (Rose core + Ruby/Magenta)
- **Quick Settings Integration:** Toggle **Speed Size Scaling**, **Fire-Breathing Halo**, and **Comet-Fire Trail** or pick size presets right from the top-right GNOME system menu.
- **Fullscreen Media & Game Aware:** Automatically pauses visuals when a video player or game hides the hardware cursor.

---

## 🚀 Quick Installation

### Option 1: Clone & Run the Installer (Recommended)

```bash
git clone https://github.com/mgmehdiforme/speed-cursor.git
cd speed-cursor
./install.sh
```

### Option 2: Install From Release `.shell-extension.zip` Bundle

Download `speed-cursor@local.shell-extension.zip` from the [Releases page](https://github.com/mgmehdiforme/speed-cursor/releases) and run:

```bash
gnome-extensions install --force speed-cursor@local.shell-extension.zip
gnome-extensions enable speed-cursor@local
```

---

## ⚙️ Configuration & Settings

Open the settings window using any of these methods:

1. **Top-Right Quick Settings Menu:** Open the GNOME system menu $\rightarrow$ click the arrow (`>`) on **Speed Cursor** $\rightarrow$ toggle individual effects or click **Speed Cursor Settings…**.
2. **Applications Menu / Search:** Press the `Super` key and search for **Speed Cursor Settings**.
3. **Terminal:**
   ```bash
   gnome-extensions prefs speed-cursor@local
   ```

---

## 🗑️ Uninstallation

```bash
./uninstall.sh
```

---

## 📄 License

Released under the [MIT License](LICENSE).
