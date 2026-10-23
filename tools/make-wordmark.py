"""Détoure le logo : recadre sur l'encre et rend le fond noir transparent."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

src = Image.open(PUBLIC / "logo-bely-mechoui.jpg").convert("RGB")
pixels = src.load()
w, h = src.size

# Fond noir -> transparent, en gardant l'anti-aliasing
out = Image.new("RGBA", (w, h))
target = out.load()
for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        target[x, y] = (255, 255, 255, min(255, int(max(r, g, b) * 1.15)))

bbox = out.getbbox()
trimmed = out.crop(bbox)
trimmed.save(PUBLIC / "logo-bely-wordmark.png", optimize=True)
print(f"logo-bely-wordmark.png — {trimmed.width}x{trimmed.height}, {(PUBLIC / 'logo-bely-wordmark.png').stat().st_size/1024:.0f} Ko")
