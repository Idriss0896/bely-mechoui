"""Optimise les photos de l'équipe et génère les icônes PWA."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# --- Photos de l'équipe : 1920x2560 (439-795 Ko) -> WebP 1200px de large
for name in ("bely-team-collective", "bely-team-duo", "bely-team-service"):
    src = PUBLIC / f"{name}.jpg"
    if not src.exists():
        print(f"absent : {src.name}")
        continue
    img = Image.open(src).convert("RGB")
    ratio = 1200 / img.width
    if ratio < 1:
        img = img.resize((1200, round(img.height * ratio)), Image.LANCZOS)
    out = PUBLIC / f"{name}.webp"
    img.save(out, "WEBP", quality=80, method=6)
    before, after = src.stat().st_size, out.stat().st_size
    print(f"{name}: {before/1024:.0f} Ko -> {after/1024:.0f} Ko ({img.width}x{img.height})")

# --- Icônes PWA à partir du logo
logo = Image.open(PUBLIC / "logo-bely-mechoui.jpg").convert("RGB")


def rounded(size: int) -> Image.Image:
    icon = logo.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=255)
    canvas = Image.new("RGB", (size, size), (33, 27, 24))
    canvas.paste(icon, (0, 0), mask)
    return canvas


def maskable(size: int) -> Image.Image:
    """Icône maskable : le logo n'occupe que 80 % pour respecter la zone de sécurité."""
    inner = int(size * 0.8)
    icon = logo.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (33, 27, 24))
    offset = (size - inner) // 2
    canvas.paste(icon, (offset, offset))
    return canvas


rounded(192).save(PUBLIC / "icon-192.png", optimize=True)
rounded(512).save(PUBLIC / "icon-512.png", optimize=True)
maskable(512).save(PUBLIC / "icon-maskable-512.png", optimize=True)
rounded(180).save(PUBLIC / "apple-touch-icon.png", optimize=True)

for name in ("icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"):
    print(f"{name}: {(PUBLIC / name).stat().st_size/1024:.1f} Ko")
