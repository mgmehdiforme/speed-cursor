#!/usr/bin/env python3
"""Generate the themed SVG sprites used by Speed Cursor.

Run from the repository root:  python3 tools/gen-icons.py

Every theme gets:
  flame-<theme>.svg   directional flame tongue (head at x=20, tail to the right)
  spark-<theme>.svg   tiny white-hot ember with a coloured glow
  corona-<theme>.svg  ring of irregular flame tongues (rotated in the shell)
"""
import math
import os
import random

THEMES = {
    #           white-hot   core        mid         outer       deep
    "ember":   ("#fffbe8", "#ffe27a", "#ff9a2e", "#ff4a0a", "#a81200"),
    "solar":   ("#ffffff", "#fff6b8", "#ffd23a", "#ffa000", "#c25e00"),
    "plasma":  ("#ffffff", "#d8fbff", "#6fd6ff", "#2a8cff", "#3a1fd0"),
    "emerald": ("#f6fff2", "#d4ffa8", "#6cf07a", "#16c45a", "#006640"),
    "crimson": ("#fff2f6", "#ffc2d6", "#ff5c8e", "#e01a5a", "#78003a"),
}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")


def flame(c):
    hot, core, mid, outer, deep = c
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="body" x1="6" y1="32" x2="62" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{hot}" stop-opacity="0.95"/>
      <stop offset="0.22" stop-color="{core}" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="{mid}" stop-opacity="0.62"/>
      <stop offset="0.72" stop-color="{outer}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="{outer}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="20" cy="32" r="19" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{hot}" stop-opacity="0.8"/>
      <stop offset="0.4" stop-color="{core}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="{mid}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.8"/>
    </filter>
  </defs>
  <g filter="url(#soft)">
    <path d="M 20 19.5 C 33 19.5 45 25 62 32 C 45 39 33 44.5 20 44.5 A 12.5 12.5 0 0 1 20 19.5 Z" fill="url(#body)"/>
    <circle cx="20" cy="32" r="19" fill="url(#glow)"/>
  </g>
</svg>
"""


def spark(c):
    hot, core, mid, outer, _deep = c
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <radialGradient id="s" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="0.16" stop-color="{hot}" stop-opacity="1"/>
      <stop offset="0.34" stop-color="{core}" stop-opacity="0.75"/>
      <stop offset="0.6" stop-color="{mid}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="{outer}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="16" cy="16" r="16" fill="url(#s)"/>
</svg>
"""


def corona(c, seed):
    hot, core, mid, outer, deep = c
    rnd = random.Random(seed)

    def polar(r, a):
        return 64 + r * math.cos(a), 64 + r * math.sin(a)

    tongues = []
    count = 16
    for i in range(count):
        a = i / count * math.tau + rnd.uniform(-0.12, 0.12)
        length = rnd.uniform(9, 22)
        half_w = rnd.uniform(0.17, 0.27)       # half base width in radians
        curl = rnd.uniform(0.18, 0.42)         # swirl: tips lean the same way
        r0 = 34
        tip = polar(r0 + length, a + curl)
        b1 = polar(r0, a - half_w)
        b2 = polar(r0, a + half_w)
        c1 = polar(r0 + length * 0.62, a - half_w * 0.35 + curl * 0.45)
        c2 = polar(r0 + length * 0.5, a + half_w * 0.9 + curl * 0.75)
        tongues.append(
            f"M {b1[0]:.2f} {b1[1]:.2f} Q {c1[0]:.2f} {c1[1]:.2f} {tip[0]:.2f} {tip[1]:.2f} "
            f"Q {c2[0]:.2f} {c2[1]:.2f} {b2[0]:.2f} {b2[1]:.2f} Z"
        )
    d = " ".join(tongues)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="c" cx="64" cy="64" r="60" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{core}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="{core}" stop-opacity="0"/>
      <stop offset="0.6" stop-color="{hot}" stop-opacity="0.9"/>
      <stop offset="0.72" stop-color="{mid}" stop-opacity="0.75"/>
      <stop offset="0.86" stop-color="{outer}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="{deep}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ring" cx="64" cy="64" r="44" gradientUnits="userSpaceOnUse">
      <stop offset="0.62" stop-color="{mid}" stop-opacity="0"/>
      <stop offset="0.8" stop-color="{core}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="{outer}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
  </defs>
  <g filter="url(#soft)">
    <circle cx="64" cy="64" r="44" fill="url(#ring)"/>
    <path fill="url(#c)" d="{d}"/>
  </g>
</svg>
"""


def main():
    for i, (name, colors) in enumerate(THEMES.items()):
        for prefix, svg in (
            ("flame", flame(colors)),
            ("spark", spark(colors)),
            ("corona", corona(colors, 1000 + i)),
        ):
            with open(os.path.join(OUT, f"{prefix}-{name}.svg"), "w") as f:
                f.write(svg)
    print("icons written to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
