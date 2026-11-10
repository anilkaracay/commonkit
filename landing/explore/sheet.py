# Contact sheet per direction from the shots. Usage (from landing/explore): python3 sheet.py
from PIL import Image, ImageDraw, ImageFont
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'))
names = {'a': 'A  Drawing set', 'b': 'B  Service tag', 'c': 'C  Public ledger'}
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 28)
except OSError:
    font = ImageFont.load_default()
def fit(im, w):
    return im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
for d, title in names.items():
    hero = Image.open(f'{d}-hero-1440.png').convert('RGB')
    h390 = fit(Image.open(f'{d}-hero-390.png').convert('RGB'), 390)
    c390 = fit(Image.open(f'{d}-card-390.png').convert('RGB'), 374)
    sec = fit(Image.open(f'{d}-section-1440.png').convert('RGB'), 1440)
    card = fit(Image.open(f'{d}-card-1440.png').convert('RGB'), 1440)
    pad = 40
    W = pad * 4 + 1440 + 390 + 374
    H = pad * 4 + 60 + 900 + sec.height + card.height
    sheet = Image.new('RGB', (W, H), (32, 32, 30))
    ImageDraw.Draw(sheet).text((pad, pad), f'COMMONKIT art direction {title}  ·  hero, section, card at 1440 and 390', fill=(235, 235, 230), font=font)
    y = pad + 60
    sheet.paste(hero, (pad, y))
    sheet.paste(sec, (pad, y + 900 + pad))
    sheet.paste(card, (pad, y + 900 + pad + sec.height + pad))
    sheet.paste(h390, (pad * 2 + 1440, y))
    sheet.paste(c390, (pad * 3 + 1440 + 390, y))
    sheet.save(f'{d}-sheet.png', optimize=True)
    print(d, sheet.size)
