from pathlib import Path
from PIL import Image, ImageDraw

root = Path("tmp/pdfs-20260720")
imgs = []
for path in sorted(root.glob("*/*.png")):
    image = Image.open(path).convert("RGB")
    image.thumbnail((255, 330))
    tile = Image.new("RGB", (275, 365), "white")
    tile.paste(image, ((275 - image.width) // 2, 10))
    ImageDraw.Draw(tile).text((8, 345), f"{path.parent.name[:29]}/{path.stem}", fill="black")
    imgs.append(tile)

for start in range(0, len(imgs), 20):
    sheet = Image.new("RGB", (1375, 1460), "#dddddd")
    for index, image in enumerate(imgs[start:start + 20]):
        sheet.paste(image, ((index % 5) * 275, (index // 5) * 365))
    sheet.save(root / f"contact-{start // 20 + 1}.jpg", quality=88)

print(f"{len(imgs)} pages, {(len(imgs) + 19) // 20} contact sheets")
