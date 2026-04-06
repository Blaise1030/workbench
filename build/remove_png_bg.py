#!/usr/bin/env python3
"""Make near-black or near-white pixels transparent (PNG).

Examples:
  # App header asset (black studio backdrop)
  python3 build/remove_png_bg.py src/assets/workbench-logo.png --mode black

  # Screenshot pasted into the repo (white page around the icon)
  python3 build/remove_png_bg.py src/assets/my-capture.png -o out.png --mode white
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def remove_background(
    arr: np.ndarray,
    *,
    mode: str,
    hard: float,
    soft: float,
) -> np.ndarray:
    """Return RGBA array with adjusted alpha. `hard`/`soft` are distance bands (0-441 for euclidean on 0-255)."""
    rgb = arr[:, :, :3].astype(np.float32)
    if mode == "black":
        ref = np.zeros(3, dtype=np.float32)
    else:
        ref = np.full(3, 255.0, dtype=np.float32)
    d = np.sqrt(np.sum((rgb - ref) ** 2, axis=2))
    # 0 opacity where d <= hard; full keep where d >= hard+soft; linear ramp between
    denom = max(soft, 1e-6)
    factor = np.clip((d - hard) / denom, 0.0, 1.0)
    out = arr.copy()
    out[:, :, 3] = np.clip(out[:, :, 3].astype(np.float32) * factor, 0, 255).astype(np.uint8)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path, help="Input PNG path")
    p.add_argument("-o", "--output", type=Path, help="Output path (default: overwrite input)")
    p.add_argument("--mode", choices=("black", "white"), required=True)
    p.add_argument(
        "--hard",
        type=float,
        default=None,
        help="Fully transparent within this color distance (default: 28 black / 36 white)",
    )
    p.add_argument(
        "--soft",
        type=float,
        default=None,
        help="Feather band width in distance units (default: 32)",
    )
    args = p.parse_args()

    hard = args.hard if args.hard is not None else (28.0 if args.mode == "black" else 36.0)
    soft = args.soft if args.soft is not None else 32.0

    img = Image.open(args.input).convert("RGBA")
    arr = np.array(img)
    out_arr = remove_background(arr, mode=args.mode, hard=hard, soft=soft)
    out = Image.fromarray(out_arr, "RGBA")

    outp = args.output or args.input
    out.save(outp, optimize=True)
    print(f"Wrote {outp} ({out.size[0]}x{out.size[1]}, mode={args.mode})")


if __name__ == "__main__":
    main()
