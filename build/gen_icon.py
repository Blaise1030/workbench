#!/usr/bin/env python3
"""Generate a square 1024x1024 icon-source.png with metallic 'In' letters."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import os

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), "icon-source.png")

# ── dark background ───────────────────────────────────────────────────────────
bg = Image.new("RGBA", (SIZE, SIZE), (15, 15, 18, 255))

# ── metallic gradient (vertical, broadcast to full width) ─────────────────────
stops_y =  [0,   100,  300,  500,  700,  900,  SIZE-1]
stops_v =  [255, 230,  150,  200,  240,  200,  180   ]
ys = np.arange(SIZE, dtype=np.float32)
vs = np.interp(ys, stops_y, stops_v).astype(np.uint8)
grad_row = vs.reshape(SIZE, 1)                     # (SIZE, 1)
grad = np.broadcast_to(grad_row, (SIZE, SIZE))     # (SIZE, SIZE) – no copy
grad = np.ascontiguousarray(grad)

metallic_r = np.clip(grad.astype(np.int16) + 20, 0, 255).astype(np.uint8)
metallic_g = np.clip(grad.astype(np.int16) + 20, 0, 255).astype(np.uint8)
metallic_b = np.clip(grad.astype(np.int16) + 35, 0, 255).astype(np.uint8)
alpha_full = np.full((SIZE, SIZE), 255, dtype=np.uint8)

metallic_img = Image.fromarray(
    np.stack([metallic_r, metallic_g, metallic_b, alpha_full], axis=-1), "RGBA"
)

# ── text mask ────────────────────────────────────────────────────────────────
mask = Image.new("L", (SIZE, SIZE), 0)
draw = ImageDraw.Draw(mask)

font = None
font_size = 600
candidates = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/Library/Fonts/Georgia Bold.ttf",
    "/System/Library/Fonts/NewYork.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNSText.ttf",
]
for path in candidates:
    if os.path.exists(path):
        try:
            font = ImageFont.truetype(path, font_size)
            print(f"Using font: {path}")
            break
        except Exception:
            continue

if font is None:
    print("WARNING: No TTF found, using default font (will look small/rough)")
    font = ImageFont.load_default()

bbox = draw.textbbox((0, 0), "In", font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - tw) // 2 - bbox[0]
y = (SIZE - th) // 2 - bbox[1]
draw.text((x, y), "In", fill=255, font=font)

# slight blur for anti-alias smoothness
mask = mask.filter(ImageFilter.GaussianBlur(radius=1))

# ── composite ─────────────────────────────────────────────────────────────────
result = bg.copy()
result.paste(metallic_img, (0, 0), mask)

result.save(OUT, "PNG")
print(f"Saved {OUT}  ({SIZE}x{SIZE})")
