"""Génère public/og-bely.jpg (1200x630) pour les aperçus WhatsApp / Facebook / X."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "og-bely.jpg"

W, H = 1200, 630
PHOTO_W = 430
INK = (33, 27, 24)
CORAL = (251, 107, 80)
CREAM = (248, 244, 239)
MUTED = (176, 160, 148)

FONT_DIR = Path(r"C:\Windows\Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONT_DIR / name, FONT_DIR / "segoeui.ttf", FONT_DIR / "arial.ttf"):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


canvas = Image.new("RGB", (W, H), INK)

# Panneau photo à droite (équipe), recadré en « cover »
photo_path = PUBLIC / "bely-team-collective.webp"
if photo_path.exists():
    photo = Image.open(photo_path).convert("RGB")
    target_ratio = PHOTO_W / H
    ratio = max(PHOTO_W / photo.width, H / photo.height)
    resized = photo.resize((round(photo.width * ratio), round(photo.height * ratio)), Image.LANCZOS)
    left = (resized.width - PHOTO_W) // 2
    top = (resized.height - H) // 2
    canvas.paste(resized.crop((left, top, left + PHOTO_W, top + H)), (W - PHOTO_W, 0))

draw = ImageDraw.Draw(canvas)

# Bande corail verticale, entre texte et photo
draw.rectangle([W - PHOTO_W - 10, 0, W - PHOTO_W, H], fill=CORAL)

title = font("georgia.ttf", 76)
subtitle = font("segoeui.ttf", 38)
line1 = font("segoeui.ttf", 30)
line2 = font("segoeui.ttf", 28)

draw.text((86, 132), "BELY MECHOUI", font=title, fill=CREAM)
draw.text((88, 236), "Le goût du fait maison", font=subtitle, fill=CORAL)
draw.line([(88, 312), (330, 312)], fill=(92, 76, 66), width=2)
draw.text((88, 348), "Sebenikoro, Bamako", font=line1, fill=MUTED)
draw.text((88, 394), "Mardi au Dimanche · 10h à 20h", font=line1, fill=MUTED)
draw.text((88, 462), "Méchoui · Grillades · Plats maison", font=line2, fill=(134, 120, 110))

canvas.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
print(f"{OUT} — {OUT.stat().st_size/1024:.0f} Ko — {canvas.size[0]}x{canvas.size[1]}")
