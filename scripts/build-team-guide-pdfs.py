from __future__ import annotations

import hashlib
import html
import io
import re
import shutil
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image as RLImage
from reportlab.platypus import CondPageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "TEAM_SHARE_GUIDES_CURRENT"
PUBLICATION_DATE = "August 24, 2026"

FILES = [
    Path("docs/BEE_SUITE_COMPLETE_GUIDE.md"),
    Path("docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md"),
    Path("docs/sops/EXECUTIVE_ADMIN_SOP.md"),
    Path("docs/sops/DIRECTOR_SOP.md"),
    Path("docs/sops/DIRECTOR_PROCARE_DATA_CLEAN_START_GUIDE.md"),
    Path("docs/sops/BILLING_ADMIN_SOP.md"),
    Path("docs/sops/TEACHER_SOP.md"),
    Path("docs/sops/PARENT_PORTAL_SOP.md"),
    Path("docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md"),
    Path("docs/sops/PARENT_ACH_PAYMENT_GUIDE.md"),
    Path("docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md"),
    Path("docs/BEE_SUITE_SCHOOL_DATA_IMPORT_AND_PARENT_LAUNCH_EMAILS.md"),
    Path("docs/SUPPORT_ESCALATION_GUIDE.md"),
]

STATUS = """
> CURRENT GUIDE
>
> Confirm the correct school and an approved feature before following these steps.
""".strip()


def refresh(text: str) -> str:
    text = re.sub(
        r"(?im)^(\*\*Documentation snapshot:\*\*|\*\*Updated:\*\*|Last updated:|Updated:)\s*[^\n]+",
        lambda m: m.group(1) + f" {PUBLICATION_DATE}  ",
        text,
        count=1,
    )
    lines = text.splitlines()
    insert_at = 1
    while insert_at < len(lines) and (not lines[insert_at].strip() or "updated" in lines[insert_at].lower() or "snapshot" in lines[insert_at].lower() or "purpose" in lines[insert_at].lower() or "audience" in lines[insert_at].lower()):
        insert_at += 1
    lines[insert_at:insert_at] = ["", STATUS, ""]
    return "\n".join(lines).strip() + "\n"


def bundle_markdown_images(text: str, source: Path) -> str:
    def replace(match: re.Match[str]) -> str:
        alt, target = match.group(1), match.group(2).strip()
        if re.match(r"^(?:https?://|data:|#)", target):
            return match.group(0)
        asset = (source.parent / target).resolve()
        if not asset.is_file() or not asset.is_relative_to(ROOT.resolve()):
            return match.group(0)
        digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:10]
        bundled_name = f"{asset.stem}-{digest}{asset.suffix.lower()}"
        shutil.copy2(asset, OUT / "assets" / bundled_name)
        return f"![{alt}](../assets/{bundled_name})"

    bundled = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace, text)
    # Generated packet copies should not carry Markdown hard-break whitespace.
    # Blank lines preserve the intended separation without failing Git checks.
    bundled = re.sub(r"[ \t]+\n", "\n\n", bundled)
    return re.sub(r"\n{3,}", "\n\n", bundled)


def esc(s: str) -> str:
    s = re.sub(r"!\[([^]]*)\]\([^)]*\)", r"[Visual: \1]", s)
    s = re.sub(r"\[([^]]+)\]\(([^)]+)\)", r"\1", s)
    s = html.escape(s)
    s = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*([^*]+)\*", r"<i>\1</i>", s)
    return s


def build_pdf(md: Path, pdf: Path) -> None:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.4, leading=12.4, textColor=colors.HexColor("#252525"), spaceAfter=5)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#1F2937"), spaceAfter=12)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#A16207"), spaceBefore=8, spaceAfter=5)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#374151"), spaceBefore=6, spaceAfter=3)
    caption = ParagraphStyle("Caption", parent=body, fontName="Helvetica-Oblique", fontSize=8, leading=10, textColor=colors.HexColor("#6B7280"), alignment=TA_CENTER, spaceAfter=4)
    quote = ParagraphStyle("Quote", parent=body, backColor=colors.HexColor("#FFF7D6"), borderColor=colors.HexColor("#E0A800"), borderWidth=0.7, borderPadding=8, leftIndent=8, rightIndent=8, spaceBefore=12, spaceAfter=8)
    bullet = ParagraphStyle("Bullet", parent=body, leading=11.7, spaceAfter=2.5, leftIndent=16, firstLineIndent=-9, bulletIndent=6)
    code = ParagraphStyle("Code", parent=body, fontName="Courier", fontSize=7.5, leading=10, backColor=colors.HexColor("#F3F4F6"), borderPadding=6)
    story = []
    image_buffers: list[io.BytesIO] = []
    lines = md.read_text(encoding="utf-8").splitlines()
    i = 0
    in_code = False
    skip_code = False
    code_lines = []
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("```"):
            if in_code:
                if not skip_code:
                    story.append(Paragraph(esc("<br/>".join(code_lines)), code))
                code_lines = []
                skip_code = False
            else:
                skip_code = line.strip().lower() == "```mermaid"
            in_code = not in_code; i += 1; continue
        if in_code:
            code_lines.append(line); i += 1; continue
        image_match = re.fullmatch(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if image_match:
            alt, target = image_match.group(1), image_match.group(2).strip()
            image_path = (md.parent / target).resolve()
            if image_path.is_file() and image_path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
                screenshot_match = re.search(r"(?:iphone|ipad|desktop)", image_path.name, re.IGNORECASE)
                if screenshot_match:
                    device = screenshot_match.group(0).lower()
                    viewport_ratio = {"iphone": 16 / 9, "ipad": 4 / 3, "desktop": 10 / 16}[device]
                    with PILImage.open(image_path) as source_image:
                        viewport_height = min(source_image.height, round(source_image.width * viewport_ratio))
                        viewport_image = source_image.crop((0, 0, source_image.width, viewport_height))
                        image_buffer = io.BytesIO()
                        viewport_image.save(image_buffer, format="PNG")
                        image_buffer.seek(0)
                    image_buffers.append(image_buffer)
                    figure = RLImage(image_buffer)
                else:
                    figure = RLImage(str(image_path))
                compact_visual_guides = {
                    "BILLING_ADMIN_SOP",
                    "EXECUTIVE_ADMIN_SOP",
                    "PARENT_PORTAL_INSTALL_GUIDE",
                    "PARENT_PORTAL_SOP",
                    "SCHOOL_SYSTEM_OPERATING_MANUAL",
                    "TEACHER_SOP",
                }
                extra_compact_visual_heights = {
                    "BILLING_ADMIN_SOP": 3.0,
                    "SCHOOL_SYSTEM_OPERATING_MANUAL": 3.25,
                    "TEACHER_SOP": 3.0,
                }
                if md.stem in extra_compact_visual_heights:
                    max_figure_height = extra_compact_visual_heights[md.stem] * inch
                elif md.stem == "PARENT_ACH_PAYMENT_GUIDE":
                    max_figure_height = 3.55 * inch
                elif md.stem in compact_visual_guides:
                    max_figure_height = 3.65 * inch
                else:
                    max_figure_height = 4.35 * inch
                scale = min((6.95 * inch) / figure.imageWidth, max_figure_height / figure.imageHeight, 1)
                figure.drawWidth = figure.imageWidth * scale
                figure.drawHeight = figure.imageHeight * scale
                story.extend(
                    [
                        CondPageBreak(figure.drawHeight + 24),
                        Paragraph(f"Figure: {esc(alt)}", caption),
                        figure,
                        Spacer(1, 8),
                    ]
                )
            else:
                story.append(Paragraph(f"[Visual: {esc(alt)}]", body))
            i += 1
            continue
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", c.replace(" ", "")) for c in cells):
                    rows.append([Paragraph(esc(c), body) for c in cells])
                i += 1
            if rows:
                widths = [(6.95 * inch) / len(rows[0])] * len(rows[0])
                t = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
                t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#F7D34A")), ("TEXTCOLOR", (0,0), (-1,0), colors.HexColor("#1F2937")), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#CBD5E1")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
                story += [t, Spacer(1, 8)]
            continue
        if not line.strip(): i += 1; continue
        if line.startswith("# "): story.append(Paragraph(esc(line[2:]), h1))
        elif line.startswith("## "): story.append(Paragraph(esc(line[3:]), h2))
        elif line.startswith("### "): story.append(Paragraph(esc(line[4:]), h3))
        elif line.startswith(">"):
            q = []
            while i < len(lines) and (lines[i].startswith(">") or not lines[i].strip()):
                if lines[i].startswith(">"): q.append(lines[i].lstrip("> "))
                i += 1
            story.append(Paragraph(esc(" ".join(q)), quote)); continue
        elif re.match(r"^\s*[-*] ", line): story.append(Paragraph("- " + esc(re.sub(r"^\s*[-*] ", "", line)), bullet))
        elif re.match(r"^\s*\d+\. ", line): story.append(Paragraph(esc(line), bullet))
        elif line.startswith("---"): story.append(Spacer(1, 5))
        else: story.append(Paragraph(esc(line), body))
        i += 1

    def footer(canvas, doc):
        canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(0.7*inch, 0.45*inch, f"The BEE Suite - Team Share Copy - {PUBLICATION_DATE}")
        canvas.drawRightString(7.8*inch, 0.45*inch, f"Page {doc.page}"); canvas.restoreState()

    doc = SimpleDocTemplate(str(pdf), pagesize=letter, rightMargin=0.7*inch, leftMargin=0.7*inch, topMargin=0.65*inch, bottomMargin=0.7*inch, title=md.stem, author="The BEE Suite")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    if OUT.exists(): shutil.rmtree(OUT)
    (OUT / "markdown").mkdir(parents=True)
    (OUT / "pdf").mkdir()
    (OUT / "assets").mkdir()
    for rel in FILES:
        src = ROOT / rel
        dest = OUT / "markdown" / src.name
        refreshed = refresh(src.read_text(encoding="utf-8"))
        dest.write_text(bundle_markdown_images(refreshed, src), encoding="utf-8")
        build_pdf(dest, OUT / "pdf" / (dest.stem + ".pdf"))
    readme = f"""# The BEE Suite Team Share Guides\n\nPrepared {PUBLICATION_DATE}. This stable `CURRENT` folder replaces prior date-stamped packets and contains the canonical Markdown and PDF editions of the core product, role, onboarding, payment, kiosk, migration, and support guides.\n\n## Recommended send order\n\n1. Start with `BEE_SUITE_COMPLETE_GUIDE.pdf` or `SCHOOL_SYSTEM_OPERATING_MANUAL.pdf`.\n2. Send each person only the SOP for their role.\n3. Send parent guides only after family links and invitation readiness are approved.\n4. Send payment guidance only after the named school's billing and payment gates are approved.\n5. Use the migration email sequence for a controlled school launch; ProCare remains the source of truth until signed cutover.\n\n## Important status\n\nSetup, parent invitations, kiosk/PIN, billing, parent payments, ProCare retirement, mobile stores, and wider-wave approval are independent gates. `HELD OFF` is not `PASS`. These guides do not replace a dated school/module GO decision.\n\n## Current visuals\n\nThe packet uses the same deep navy, warm white, and BEE gold system as the current web app. Teacher guides use iPad and desktop screens. Director and executive guides use desktop screens. Parent guides use iPhone, iPad, and desktop screens, with iPhone shown most often.\n\n## Privacy of bundled visuals\n\nThe bundled visuals use seeded demo records and contain no real child, family, employee, billing, or authentication data. Do not replace them with production screenshots unless those screenshots are separately reviewed and approved for the intended audience.\n"""
    readme = readme.replace(
        "2. Send each person only the SOP for their role.\n",
        "2. Directors completing a ProCare transition use `DIRECTOR_PROCARE_DATA_CLEAN_START_GUIDE.pdf` after the Fleet Verification Packet reaches `READY_FOR_DIRECTOR_REVIEW`.\n3. Send each person only the SOP for their role.\n",
    ).replace(
        "3. Send parent guides only after family links and invitation readiness are approved.\n4. Send payment guidance only after the named school's billing and payment gates are approved.\n5. Use the migration email sequence",
        "4. Send parent guides only after family links and invitation readiness are approved.\n5. Send payment guidance only after the named school's billing and payment gates are approved.\n6. Use the migration email sequence",
    )
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    build_pdf(OUT / "README.md", OUT / "TEAM_SHARE_GUIDES_INDEX.pdf")


if __name__ == "__main__":
    main()
