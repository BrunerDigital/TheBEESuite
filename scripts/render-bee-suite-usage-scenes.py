from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, shutil

ROOT = Path.cwd()
BRAND = ROOT / 'public/brand/the-bee-suite'
USAGE = BRAND / 'usage'
OUT = USAGE / 'current'
SOURCE = OUT / 'source'
SHOTS = BRAND / 'screenshots/current'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
SOURCE_REUSE = {
  'family-kiosk-check-in': 'front-desk-check-in',
  'enrollment-inquiries': 'director-school-operations',
  'family-messaging': 'classroom-daily-reports',
  'school-data-migration': 'director-school-operations',
  'mr-bee-draft-review': 'director-school-operations',
}
W, H, PHOTO_W = 1586, 992, 760
NAVY = '#071018'
GOLD = '#F5B51B'
WHITE = '#FFFDF7'
MUTED = '#B8C1CA'


def font(size, bold=False):
    # Bundled Inter is licensed under scripts/assets/fonts/OFL.txt.
    path = ROOT / 'scripts/assets/fonts/Inter-variable.ttf'
    face = ImageFont.truetype(str(path), size)
    face.set_variation_by_axes([min(32, max(14, size)), 700 if bold else 400])
    return face

FONT_LABEL = font(19, True)
FONT_TITLE = font(34, True)
FONT_COPY = font(18)
FONT_DEVICE = font(17, True)

# Each image combines a real BEE Suite school-use scene with the corresponding
# current privacy-safe role screens. Screens remain pixel-authentic in the device frames.
scenes = [
  {
    'id':'front-desk-check-in', 'title':'Welcome families. Keep the roster close.',
    'eyebrow':'FRONT DESK + FAMILY VIEW', 'description':'Teacher roster and parent overview',
    'photo':'bee-suite-lobby-check-in.png', 'crop':(0, 0, 620, 992),
    'devices':[
      {'path':'teacher-ipad-roster-light.png','kind':'tablet','label':'TEACHER ROSTER'},
      {'path':'parent-iphone-overview-light.png','kind':'phone','label':'PARENT OVERVIEW'},
    ],
  },
  {
    'id':'classroom-daily-reports', 'title':'From classroom notes to family updates.',
    'eyebrow':'CLASSROOM TO FAMILY', 'description':'Teachers record the day. Families review updates.',
    'photo':'bee-suite-classroom-daily-updates.png', 'crop':(0, 0, 680, 992),
    'devices':[
      {'path':'teacher-ipad-daily-report-light.png','kind':'tablet','label':'TEACHER DAILY REPORT'},
      {'path':'parent-iphone-daily-reports-light.png','kind':'phone','label':'PARENT DAILY REPORT'},
    ],
  },
  {
    'id':'classroom-roster-activities', 'title':'Keep classroom work moving.',
    'eyebrow':'TEACHER + FAMILY WORKFLOWS', 'description':'Classroom roster beside family activities',
    'photo':'bee-suite-classroom-daily-updates.png', 'crop':(0, 0, 680, 992),
    'devices':[
      {'path':'teacher-ipad-roster-light.png','kind':'tablet','label':'CLASSROOM ROSTER'},
      {'path':'parent-iphone-activities-light.png','kind':'phone','label':'FAMILY ACTIVITIES'},
    ],
  },
  {
    'id':'director-school-operations', 'title':'See the school. Find the next step.',
    'eyebrow':'DIRECTOR OPERATIONS', 'description':'School operations and daily-report view',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[
      {'path':'director-desktop-dashboard-light.png','kind':'desktop','label':'SCHOOL OPERATIONS'},
    ],
  },
  {
    'id':'school-and-family-billing', 'title':'Billing stays connected to the family.',
    'eyebrow':'SCHOOL + FAMILY BILLING', 'description':'Authorized school billing and parent balance view',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[
      {'path':'director-desktop-billing-light.png','kind':'desktop','label':'DIRECTOR BILLING'},
      {'path':'parent-iphone-billing-light.png','kind':'phone','label':'PARENT BILLING'},
    ],
  },
  {
    'id':'executive-school-reporting', 'title':'Portfolio visibility with school context.',
    'eyebrow':'EXECUTIVE + MULTI-LOCATION', 'description':'Executive dashboard and multi-location FTE reporting',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[
      {'path':'executive-desktop-dashboard-light.png','kind':'desktop','label':'EXECUTIVE DASHBOARD'},
      {'path':'executive-desktop-fte-light.png','kind':'desktop','label':'FTE REPORTING'},
    ],
  },
  {
    'id':'executive-administration', 'title':'Keep portfolio administration in view.',
    'eyebrow':'EXECUTIVE ADMINISTRATION', 'description':'Location, role, access, and audit views',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[
      {'path':'executive-desktop-admin-light.png','kind':'desktop','label':'ADMIN + ACCESS'},
    ],
  },
  {
    'id':'family-kiosk-check-in', 'title':'A clear arrival for every family.',
    'eyebrow':'FAMILY CHECK-IN', 'description':'Family PIN entry on the BEE Suite kiosk',
    'photo':'bee-suite-lobby-check-in.png', 'crop':(0, 0, 620, 992),
    'devices':[{'path':'family-kiosk-check-in-light.png','kind':'phone','label':'FAMILY CHECK-IN'}],
  },
  {
    'id':'enrollment-inquiries', 'title':'Follow each family from inquiry to enrollment.',
    'eyebrow':'INQUIRY + ENROLLMENT', 'description':'Inquiry pipeline and school enrollment form',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[{'path':'director-desktop-enrollment-light.png','kind':'desktop','label':'ENROLLMENT PIPELINE'}],
  },
  {
    'id':'family-messaging', 'title':'Keep family conversations in view.',
    'eyebrow':'FAMILY MESSAGING', 'description':'Parent portal conversation and reply composer',
    'photo':'bee-suite-classroom-daily-updates.png', 'crop':(0, 0, 680, 992),
    'devices':[{'path':'parent-iphone-messages-light.png','kind':'phone','label':'PARENT MESSAGES'}],
  },
  {
    'id':'school-data-migration', 'title':'Prepare school records with a guided review.',
    'eyebrow':'SCHOOL DATA MIGRATION', 'description':'Previous-system import preparation and review gates',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[{'path':'director-desktop-procare-import-light.png','kind':'desktop','label':'IMPORT PREPARATION'}],
  },
  {
    'id':'mr-bee-draft-review', 'title':'Draft the next step with human review.',
    'eyebrow':'MR. BEE ASSISTANT', 'description':'Mr. Bee follow-up options for human review',
    'photo':'bee-suite-director-operations.png', 'crop':(80, 0, 840, 992),
    'devices':[{'path':'director-mobile-mr-bee-light.png','kind':'phone','label':'MR. BEE DRAFT'}],
  },
]


def fit_cover(im, size):
    tw, th = size
    ratio = max(tw / im.width, th / im.height)
    resized = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def fit_contain(im, size):
    tw, th = size
    ratio = min(tw / im.width, th / im.height)
    return im.resize((max(1, round(im.width * ratio)), max(1, round(im.height * ratio))), Image.Resampling.LANCZOS)


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,*im.size), radius=radius, fill=255)
    im.putalpha(mask)
    return im


def draw_device(canvas, d, box):
    x, y, maxw, maxh = box
    kind = d['kind']
    screen = Image.open(SHOTS / d['path']).convert('RGB')
    outer = {'desktop':12,'tablet':28,'phone':34}[kind]
    inset = {'desktop':9,'tablet':13,'phone':7}[kind]
    label_h = 38
    avail_w, avail_h = maxw - inset*2, maxh - label_h - inset*2
    if kind == 'desktop':
      frame_w = maxw
      frame_h = min(avail_h, round(frame_w * 0.694))
      shown = fit_contain(screen, (frame_w - inset*2, frame_h - inset*2))
      frame = Image.new('RGBA', (frame_w, frame_h), '#1c242c')
      draw = ImageDraw.Draw(frame)
      draw.rounded_rectangle((0,0,frame_w-1,frame_h-1), radius=outer, fill='#26313a', outline='#64717b', width=2)
      sx = (frame_w - shown.width)//2; sy=(frame_h-shown.height)//2
      frame.alpha_composite(shown.convert('RGBA'), (sx,sy))
      ImageDraw.Draw(frame).rounded_rectangle((sx-2,sy-2,sx+shown.width+1,sy+shown.height+1), radius=5, outline='#111820', width=3)
    else:
      # Preserve the real screenshot aspect ratio so the screen is not cropped or redrawn.
      ratio = screen.width / screen.height
      screen_h = min(avail_h, int(avail_w / ratio))
      screen_w = int(screen_h * ratio)
      if kind == 'phone':
        screen_h = min(avail_h, screen_h)
        screen_w = int(screen_h * ratio)
      else:
        screen_w = min(avail_w, screen_w)
        screen_h = int(screen_w / ratio)
      frame_w, frame_h = screen_w + inset*2, screen_h + inset*2
      frame = Image.new('RGBA', (frame_w, frame_h), '#121820')
      ImageDraw.Draw(frame).rounded_rectangle((0,0,frame_w-1,frame_h-1), radius=outer, fill='#202a33', outline='#68747d', width=2)
      shown = screen.resize((screen_w, screen_h), Image.Resampling.LANCZOS)
      frame.alpha_composite(shown.convert('RGBA'), (inset,inset))
      ImageDraw.Draw(frame).rounded_rectangle((inset-1,inset-1,inset+screen_w,inset+screen_h), radius=6 if kind=='tablet' else 2, outline='#090d11', width=2)
    # Soft shadow gives the app-bearing device a place in the composition.
    shadow = Image.new('RGBA', (frame.width+36, frame.height+36), (0,0,0,0))
    ImageDraw.Draw(shadow).rounded_rectangle((18,18,frame.width+17,frame.height+17), radius=outer, fill=(0,0,0,155))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow, (x-18,y-10))
    canvas.alpha_composite(frame, (x,y))
    dbox = ImageDraw.Draw(canvas)
    label = d['label']
    bx = x + max(0,(maxw-dbox.textbbox((0,0),label,font=FONT_DEVICE)[2])//2)
    dbox.text((bx,y+frame.height+10), label, fill=WHITE, font=FONT_DEVICE)


def render(item):
    source_name = f"{item['id']}-people-scene.png"
    source_path = SOURCE / source_name
    if not source_path.exists():
      reused = SOURCE_REUSE.get(item['id'])
      if reused:
        shutil.copyfile(SOURCE / f'{reused}-people-scene.png', source_path)
      else:
        photo = Image.open(USAGE / item['photo']).convert('RGB')
        source_scene = fit_cover(photo.crop(item['crop']), (PHOTO_W, H))
        source_scene.save(source_path, format='PNG', optimize=True)
    scene = Image.open(source_path).convert('RGB')
    canvas = Image.new('RGBA',(W,H),NAVY)
    canvas.paste(scene.convert('RGBA'), (0,0))
    # Subtle separator and clear branded product-proof surface.
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((PHOTO_W,0,W,H), fill=NAVY)
    draw.rectangle((PHOTO_W,0,PHOTO_W+5,H), fill=GOLD)
    draw.text((PHOTO_W+42,42), item['eyebrow'], font=FONT_LABEL, fill=GOLD)
    title_y = 83
    title_lines = []
    words = item['title'].split()
    line = ''
    max_width = W-PHOTO_W-78
    for word in words:
      trial = (line+' '+word).strip()
      if ImageDraw.Draw(canvas).textbbox((0,0),trial,font=FONT_TITLE)[2] <= max_width:
        line=trial
      else:
        title_lines.append(line); line=word
    if line: title_lines.append(line)
    for line in title_lines:
      draw.text((PHOTO_W+42,title_y), line, font=FONT_TITLE, fill=WHITE)
      title_y += 42
    draw.text((PHOTO_W+42,title_y+8), item['description'], font=FONT_COPY, fill=MUTED)
    devices=item['devices']
    body_top=title_y+64
    body_h=H-body_top-62
    if len(devices)==2 and devices[0]['kind']!='desktop' and devices[1]['kind']=='phone':
      # One full-size tablet and one phone, both displaying the exact role UI screenshot.
      boxes=[(PHOTO_W+24,body_top+10,450,650),(PHOTO_W+490,body_top+5,250,660)]
    elif len(devices)==2:
      boxes=[(PHOTO_W+26,body_top+70,360,350),(PHOTO_W+422,body_top+70,360,350)]
    elif len(devices)==1:
      boxes=[(PHOTO_W+32,body_top+20,W-PHOTO_W-64,body_h-95)]
    else:
      boxes=[(PHOTO_W+85,body_top+35,W-PHOTO_W-170,body_h-70)]
    for d,box in zip(devices,boxes): draw_device(canvas,d,box)
    # Add a small BEE mark at the footer as a brand anchor.
    footer=ImageDraw.Draw(canvas)
    footer.text((PHOTO_W+42,H-42),'THE BEE SUITE  •  CHILDCARE CRM + OPERATIONS',font=FONT_LABEL,fill='#82909a')
    path=OUT/f"{item['id']}.png"
    canvas.convert('RGB').save(path,format='PNG',optimize=True)
    return path

for item in scenes:
    render(item)

# Existing landing-page and email surfaces keep their established asset URLs, now backed by
# the improved composites. The original source photos remain tracked in Git history.
for scene_id, legacy in [
  ('front-desk-check-in','bee-suite-lobby-check-in.png'),
  ('classroom-daily-reports','bee-suite-classroom-daily-updates.png'),
  ('director-school-operations','bee-suite-director-operations.png'),
]:
    shutil.copyfile(OUT/f"{scene_id}.png", USAGE/legacy)

manifest={
  'title':'The BEE Suite people and product screens',
  'releaseVersion':'current',
  'sourceScenePolicy':'Existing synthetic school-use photography paired with current role screenshots; no production data.',
  'scenes':[
    {
      'id':item['id'],'file':f"{item['id']}.png",'roleAndUseCase':item['eyebrow'],
      'summary':item['description'],'peopleSource':f"public/brand/the-bee-suite/usage/current/source/{item['id']}-people-scene.png",
      'screens':[{'path':f"public/brand/the-bee-suite/screenshots/current/{d['path']}",'label':d['label']} for d in item['devices']]
    } for item in scenes
  ],
  'coverageNotes':[
    'People scenes pair with teacher roster and daily reports, parent overview, family activities, messaging, check-in, school operations, enrollment, billing, executive dashboard, FTE reporting, executive administration, school data migration, and Mr. Bee draft review.',
    'The migration image shows preparation and review controls only; it does not imply a live import or school activation. Mr. Bee appears as a draft for human review, not as a sent message.',
    'Screens retain their captured interface content and labels with proportional scaling inside device frames.'
  ]
}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')

# Build a review page for all scenes at the canonical current path.
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The BEE Suite people and product screens</title><style>body{margin:0;background:#f7f4ec;color:#101820;font:16px/1.5 Inter,Segoe UI,Arial,sans-serif}header{padding:38px clamp(20px,5vw,72px);background:#071018;color:#fff}h1{margin:0;color:#ffd247;font-size:clamp(30px,4vw,52px)}header p{max-width:850px;color:#ccd3d9}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:24px;padding:clamp(20px,4vw,60px)}article{overflow:hidden;border:1px solid #e1d8c5;border-radius:20px;background:white;box-shadow:0 15px 38px #09131a14}article img{display:block;width:100%;height:auto}article h2{margin:20px 22px 4px;font-size:23px}article p{margin:0 22px 22px;color:#53606a}</style><header><h1>People using The BEE Suite</h1><p>Real school-use scenes paired with the current privacy-safe BEE Suite role screens. Product UI remains exact inside the device frames.</p></header><main class="grid">'''
for item in scenes:
  html+=f'<article><img src="{item["id"]}.png" alt="{item["eyebrow"]}: {item["description"]}"><h2>{item["eyebrow"].title()}</h2><p>{item["description"]}</p></article>'
html+='</main></html>\n'
(OUT/'index.html').write_text(html,encoding='utf-8')
print(f'Rendered {len(scenes)} people-and-product images in {OUT}')
