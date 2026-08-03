from __future__ import annotations

import importlib.util
import re
import shutil
import sys
from pathlib import Path


sys.dont_write_bytecode = True


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "SCHOOL_TRANSITION_EMAIL_PACKET_CURRENT"
EMAIL = ROOT / "docs" / "BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md"
SOP = ROOT / "docs" / "sops" / "SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md"
MANIFEST = ROOT / "docs" / "SCHOOL_TRANSITION_EMAIL_ATTACHMENT_MANIFEST.md"
TEAM_GUIDES = ROOT / "output" / "pdf" / "TEAM_SHARE_GUIDES_CURRENT" / "pdf"

ATTACHMENTS = {
    "PARENT_PORTAL_INSTALL_GUIDE.pdf": "02_PARENT_PORTAL_INSTALL_GUIDE.pdf",
    "TEACHER_SOP.pdf": "03_TEACHER_SOP.pdf",
    "KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.pdf": "04_KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.pdf",
    "SUPPORT_ESCALATION_GUIDE.pdf": "05_SUPPORT_ESCALATION_GUIDE.pdf",
}


def load_team_guide_builder():
    builder_path = ROOT / "scripts" / "build-team-guide-pdfs.py"
    spec = importlib.util.spec_from_file_location("build_team_guide_pdfs", builder_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load PDF builder: {builder_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def publication_date() -> str:
    match = re.search(r"(?m)^\*\*Updated:\*\*\s+([^\n]+)", SOP.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError(f"Missing Updated date in {SOP}")
    return match.group(1).strip()


def require_file(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)


def main() -> None:
    for path in (EMAIL, SOP, MANIFEST):
        require_file(path)
    for source_name in ATTACHMENTS:
        require_file(TEAM_GUIDES / source_name)

    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EMAIL, OUT / "00_BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md")
    shutil.copy2(MANIFEST, OUT / "README.md")

    builder = load_team_guide_builder()
    builder.PUBLICATION_DATE = publication_date()
    builder.build_pdf(SOP, OUT / "01_SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.pdf")

    for source_name, destination_name in ATTACHMENTS.items():
        shutil.copy2(TEAM_GUIDES / source_name, OUT / destination_name)

    expected = {
        "00_BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md",
        "01_SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.pdf",
        *ATTACHMENTS.values(),
        "README.md",
    }
    missing = sorted(name for name in expected if not (OUT / name).is_file())
    if missing:
        raise RuntimeError(f"Packet build is incomplete: {missing}")

    print(f"Built {len(expected)} packet files in {OUT}")


if __name__ == "__main__":
    main()
