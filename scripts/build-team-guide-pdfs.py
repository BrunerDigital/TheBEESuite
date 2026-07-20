from __future__ import annotations

import html
import re
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "TEAM_SHARE_GUIDES_2026-07-20"

FILES = [
    Path("docs/BEE_SUITE_COMPLETE_GUIDE.md"),
    Path("docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md"),
    Path("docs/sops/EXECUTIVE_ADMIN_SOP.md"),
    Path("docs/sops/DIRECTOR_SOP.md"),
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
> TEAM SHARE SNAPSHOT - JULY 20, 2026
>
> This copy was refreshed against the current application routes, role rules, module inventory, and July 20 production-readiness record. Kokomo may continue its approved normal production use. Any wider school rollout, parent invitation wave, kiosk activation, billing activation, payment activation, ProCare retirement, or store release remains separately approval-gated. Confirm the named school and module have a dated GO before treating a workflow as live.
""".strip()

LATEST = """
## July 20, 2026 capability addendum

The current application also includes the following role-gated capabilities:

- **Corporate Asset Hub:** Executives can upload approved brand, social, flyer, and training resources. Executives and school directors can search, preview, and securely download files from the private corporate library.
- **Corporate software invoice:** Authorized Kid City corporate accounting and executive users can review the monthly BEE Suite software invoice, based on active school users, and open the hosted payment flow. This is separate from family tuition billing.
- **Terminal Store:** Authorized directors and executives can purchase approved readers, docks, hubs, cases, and mounts through a BEE Suite-branded hosted checkout. Hardware pricing, shipping, fulfillment, tax treatment, and support ownership must be approved before broad use.
- **Family-level refunds:** Billing staff can start with a family-level refund amount and optionally prioritize payment references. The system allocates the amount across eligible refundable Stripe charges. If refundable charges cannot cover the full amount, the remainder must be handled as family credit or an approved manual reimbursement; it cannot be represented as a Stripe refund that did not occur.

These capabilities remain subject to role scope, tenant isolation, audit logging, school-specific readiness, and human approval. AI suggestions remain drafts and never make final safety, medical, custody, legal, billing, refund, or compliance decisions.
""".strip()


def refresh(text: str, is_complete: bool) -> str:
    text = re.sub(r"(?im)^(\*\*Documentation snapshot:\*\*|\*\*Updated:\*\*|Last updated:|Updated:)\s*[^\n]+", lambda m: m.group(1) + " July 20, 2026  ", text, count=1)
    lines = text.splitlines()
    insert_at = 1
    while insert_at < len(lines) and (not lines[insert_at].strip() or "updated" in lines[insert_at].lower() or "snapshot" in lines[insert_at].lower() or "purpose" in lines[insert_at].lower() or "audience" in lines[insert_at].lower()):
        insert_at += 1
    lines[insert_at:insert_at] = ["", STATUS, ""]
    text = "\n".join(lines).strip() + "\n"
    if is_complete:
        marker = "\n## 7. "
        pos = text.find(marker)
        if pos >= 0:
            text = text[:pos] + "\n\n" + LATEST + "\n" + text[pos:]
        else:
            text += "\n" + LATEST + "\n"
    return text


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
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.4, leading=13, textColor=colors.HexColor("#252525"), spaceAfter=6)
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#1F2937"), spaceAfter=12)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#A16207"), spaceBefore=10, spaceAfter=6)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#374151"), spaceBefore=8, spaceAfter=4)
    quote = ParagraphStyle("Quote", parent=body, backColor=colors.HexColor("#FFF7D6"), borderColor=colors.HexColor("#E0A800"), borderWidth=0.7, borderPadding=8, leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=8)
    bullet = ParagraphStyle("Bullet", parent=body, leftIndent=16, firstLineIndent=-9, bulletIndent=6)
    code = ParagraphStyle("Code", parent=body, fontName="Courier", fontSize=7.5, leading=10, backColor=colors.HexColor("#F3F4F6"), borderPadding=6)
    story = []
    lines = md.read_text(encoding="utf-8").splitlines()
    i = 0
    in_code = False
    code_lines = []
    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Paragraph(esc("<br/>".join(code_lines)), code)); code_lines = []
            in_code = not in_code; i += 1; continue
        if in_code:
            code_lines.append(line); i += 1; continue
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
        canvas.drawString(0.7*inch, 0.45*inch, "The BEE Suite - Team Share Copy - July 20, 2026")
        canvas.drawRightString(7.8*inch, 0.45*inch, f"Page {doc.page}"); canvas.restoreState()

    doc = SimpleDocTemplate(str(pdf), pagesize=letter, rightMargin=0.7*inch, leftMargin=0.7*inch, topMargin=0.65*inch, bottomMargin=0.7*inch, title=md.stem, author="The BEE Suite")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    if OUT.exists(): shutil.rmtree(OUT)
    (OUT / "markdown").mkdir(parents=True)
    (OUT / "pdf").mkdir()
    for rel in FILES:
        src = ROOT / rel
        dest = OUT / "markdown" / src.name
        dest.write_text(refresh(src.read_text(encoding="utf-8"), src.name == "BEE_SUITE_COMPLETE_GUIDE.md"), encoding="utf-8")
        build_pdf(dest, OUT / "pdf" / (dest.stem + ".pdf"))
    readme = """# The BEE Suite Team Share Guides\n\nPrepared July 20, 2026. This folder contains refreshed Markdown source copies and matching PDF editions of the core team-facing product, role, onboarding, payment, kiosk, migration, and support guides.\n\n## Recommended send order\n\n1. Start with `BEE_SUITE_COMPLETE_GUIDE.pdf` or `SCHOOL_SYSTEM_OPERATING_MANUAL.pdf`.\n2. Send each person only the SOP for their role.\n3. Send parent guides only after family links and invitation readiness are approved.\n4. Send payment guidance only after the named school's billing and payment gates are approved.\n5. Use the migration email sequence for a controlled school launch; ProCare remains the source of truth until signed cutover.\n\n## Important status\n\nKokomo may continue approved normal production use. Wider-school rollout and each sensitive module remain separately approval-gated. These guides explain the workflows; they do not replace a dated school/module GO decision.\n"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")
    build_pdf(OUT / "README.md", OUT / "TEAM_SHARE_GUIDES_INDEX.pdf")


if __name__ == "__main__":
    main()
