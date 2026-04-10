#!/usr/bin/env python3
"""Remove the dark studio floor / matte under the toolbox in app icon PNGs.

The source art is mostly transparent at the edges, but a dark neutral opaque region
often remains under the subject. Flood-fill from transparent seeds removes only
dark, low-saturation pixels connected to the outside (so red metal and highlights stay).

  python3 build/remove_icon_dark_floor.py build/icon-source.png -o build/icon-source.png

Then regenerate platform icons (see electron-builder.yml)."""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def remove_dark_floor_connected(arr: np.ndarray, *, alpha_cutoff: int = 20) -> np.ndarray:
    """Return RGBA array with dark neutral background pixels set to transparent."""
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.float32)
    al = arr[:, :, 3].astype(np.float32)

    def is_walkable(y: int, x: int) -> bool:
        if al[y, x] < alpha_cutoff:
            return True
        r, g, b = rgb[y, x]
        mx = max(r, g, b)
        mn = min(r, g, b)
        sat = mx - mn
        lum = (r + g + b) / 3.0
        # Dark neutral: not red toolbox (r stays below strong red), low chroma
        return sat < 38 and lum < 100 and r < 180

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for y in range(h):
        for x in range(w):
            if al[y, x] < alpha_cutoff:
                visited[y, x] = True
                q.append((y, x))

    dirs = ((0, 1), (0, -1), (1, 0), (-1, 0))
    while q:
        y, x = q.popleft()
        for dy, dx in dirs:
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w or visited[ny, nx]:
                continue
            if is_walkable(ny, nx):
                visited[ny, nx] = True
                q.append((ny, nx))

    out = arr.copy()
    clear = visited & (al >= alpha_cutoff)
    out[clear, 3] = 0
    out[clear, :3] = 0
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path)
    p.add_argument("-o", "--output", type=Path, help="Output path (default: overwrite input)")
    args = p.parse_args()

    img = Image.open(args.input).convert("RGBA")
    out_arr = remove_dark_floor_connected(np.array(img))
    out = Image.fromarray(out_arr).convert("RGBA")
    outp = args.output or args.input
    out.save(outp, optimize=True)
    print(f"Wrote {outp} ({out.size[0]}x{out.size[1]})")


if __name__ == "__main__":
    main()
