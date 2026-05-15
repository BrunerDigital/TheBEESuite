from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
import re
import sys

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def col_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref or "A1")
    number = 0
    for character in match.group(1):
        number = number * 26 + ord(character) - 64
    return number - 1


def read_sheet(path: Path, sheet_name: str) -> list[dict[str, str]]:
    with ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [
                "".join(text.text or "" for text in item.findall(".//a:t", NS))
                for item in root.findall("a:si", NS)
            ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relmap = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        selected_path = ""
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            if sheet.attrib["name"] == sheet_name:
                relation_id = sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
                target = relmap[relation_id]
                selected_path = (
                    "xl/" + target.lstrip("/")
                    if not target.startswith("xl/")
                    else target
                )
                break

        if not selected_path:
            return []

        root = ET.fromstring(archive.read(selected_path))
        rows: list[list[str]] = []
        for row in root.findall("a:sheetData/a:row", NS):
            values: list[str] = []
            for cell in row.findall("a:c", NS):
                index = col_index(cell.attrib.get("r", "A1"))
                while len(values) <= index:
                    values.append("")
                value_node = cell.find("a:v", NS)
                if value_node is None:
                    value = ""
                elif cell.attrib.get("t") == "s":
                    value = shared[int(value_node.text)] if value_node.text else ""
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(
                        text.text or "" for text in cell.findall(".//a:t", NS)
                    )
                else:
                    value = value_node.text or ""
                values[index] = value.strip()
            rows.append(values)

    if not rows:
        return []

    header = [cell.strip() for cell in rows[0]]
    records: list[dict[str, str]] = []
    for row in rows[1:]:
        if not any(row):
            continue
        record = {
            header[index]: row[index].strip()
            for index in range(min(len(header), len(row)))
            if header[index]
        }
        if any(record.values()):
            records.append(record)
    return records


def clean_decimal_text(value: str) -> str:
    if not value:
        return ""
    try:
        decimal = Decimal(value)
    except InvalidOperation:
        return value.strip()
    if decimal == decimal.to_integral_value():
        return str(decimal.quantize(Decimal(1)))
    return format(decimal.normalize(), "f")


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", clean_decimal_text(value))
    return digits


def normalize_email(value: str) -> str:
    email = value.strip().lower().replace("’", "").replace("'", "")
    return re.sub(r"\s+", "", email)


def normalize_postal(value: str) -> str:
    return clean_decimal_text(value)


def parse_excel_datetime(value: str) -> str | None:
    if not value:
        return None
    value = value.strip()
    try:
        decimal = Decimal(value)
        base = datetime(1899, 12, 30, tzinfo=timezone.utc)
        return (base + timedelta(days=float(decimal))).isoformat()
    except (InvalidOperation, ValueError, OverflowError):
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def normalize_stage(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    mapping = {
        "new_inquiry": "NEW_INQUIRY",
        "new_lead": "NEW_INQUIRY",
        "previously_inquired": "NEW_INQUIRY",
        "contacted": "CONTACTED",
        "tour_scheduled": "TOUR_SCHEDULED",
        "tour_completed": "TOUR_COMPLETED",
        "application": "APPLICATION_STARTED",
        "application_started": "APPLICATION_STARTED",
        "application_sent": "APPLICATION_SENT",
        "application_submitted": "APPLICATION_SUBMITTED",
        "documents_pending": "DOCUMENTS_PENDING",
        "deposit_pending": "DEPOSIT_PENDING",
        "enrolled": "ENROLLED",
        "waitlisted": "WAITLISTED",
        "waitlist": "WAITLISTED",
        "lost": "LOST_NOT_A_FIT",
        "lost_not_a_fit": "LOST_NOT_A_FIT",
    }
    return mapping.get(key, "CONTACTED" if key else "NEW_INQUIRY")


def unique_by(items: list[dict[str, Any]], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        marker = "|".join(str(item.get(key, "")).lower() for key in keys)
        if marker in seen:
            continue
        seen.add(marker)
        output.append(item)
    return output


def main() -> None:
    default_source = Path("tmp/kidcity-crm-export/Kid City USA - CRM (Live)")
    source_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else default_source
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("tmp/kidcity-crm-normalized.json")
    )

    live = source_dir / "Kid City CRM (Live).xlsx"
    locations_rows = read_sheet(live, "locations")
    users_rows = (
        read_sheet(live, "users")
        + read_sheet(source_dir / "users_exec_production.xlsx", "users_exec_production.csv")
        + read_sheet(source_dir / "users_school_production.xlsx", "users_school_production.csv")
        + read_sheet(source_dir / "users_merged.xlsx", "users_merged.csv")
    )
    lead_rows = (
        read_sheet(source_dir / "leads_production.xlsx", "leads_production.csv")
        + read_sheet(live, "leads")
        + read_sheet(live, "Sheet1")
    )

    locations = []
    for row in locations_rows:
        crm_id = row.get("crm_location_id", "").strip()
        location_id = row.get("Location ID", "").strip()
        if not crm_id and not location_id:
            continue
        city = row.get("City", "").strip()
        state = row.get("State", "").strip()
        name = location_id or crm_id
        locations.append(
            {
                "crmLocationId": crm_id or location_id,
                "locationId": location_id or crm_id,
                "name": name,
                "address": row.get("Address", "").strip(),
                "city": city,
                "state": state,
                "postalCode": normalize_postal(row.get("Postal Code", "")),
                "phone": row.get("Phone Number", "").strip(),
                "licensedCapacity": 0,
                "customFields": {
                    "description": row.get("Description", "").strip(),
                    "hours": {
                        "monday": row.get("Hours > Monday", "").strip(),
                        "tuesday": row.get("Hours > Tuesday", "").strip(),
                        "wednesday": row.get("Hours > Wednesday", "").strip(),
                        "thursday": row.get("Hours > Thursday", "").strip(),
                        "friday": row.get("Hours > Friday", "").strip(),
                    },
                    "categories": [
                        row.get("Categories 1", "").strip(),
                        row.get("Categories 2", "").strip(),
                        row.get("Categories 3", "").strip(),
                    ],
                },
            }
        )

    users = []
    for row in users_rows:
        email = normalize_email(row.get("email", ""))
        if not email:
            continue
        role = row.get("role", "").strip()
        crm_id = row.get("crm_location_id", "").strip()
        full_name = row.get("full_name", "").strip() or email.split("@")[0].replace(".", " ").title()
        users.append(
            {
                "email": email,
                "name": full_name,
                "role": "BRAND_ADMIN" if role == "executive_user" else "CENTER_DIRECTOR",
                "crmLocationId": crm_id,
                "legacyRole": role,
                "isActive": row.get("is_active", "1").strip() != "0",
            }
        )

    leads = []
    for row in lead_rows:
        lead_id = clean_decimal_text(row.get("lead_id", ""))
        email = normalize_email(row.get("email", ""))
        phone = normalize_phone(row.get("phone", ""))
        first = row.get("first_name", "").strip()
        family = row.get("family_name", "").strip()
        parent_name = " ".join(part for part in [first, family] if part).strip()
        if not parent_name:
            parent_name = email.split("@")[0].replace(".", " ").title() if email else "Unknown Family"
        crm_id = row.get("crm_location_id", "").strip() or "UNASSIGNED"
        raw_stage = row.get("pipeline_stage", "").strip() or row.get("status", "").strip()
        leads.append(
            {
                "externalId": lead_id,
                "crmLocationId": crm_id,
                "familyName": parent_name,
                "parentFirstName": first,
                "parentLastName": family,
                "email": email,
                "phone": phone,
                "leadSource": row.get("source", "").strip() or "Old CRM Import",
                "status": row.get("status", "").strip() or "imported",
                "stage": normalize_stage(raw_stage),
                "createdAt": parse_excel_datetime(row.get("created_at", "")),
                "notes": row.get("notes", "").strip(),
                "rawPipelineStage": raw_stage,
            }
        )

    normalized = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceDirectory": str(source_dir),
        "locations": unique_by(locations, ("crmLocationId", "locationId")),
        "users": unique_by(users, ("email",)),
        "leads": unique_by(leads, ("externalId", "crmLocationId", "email")),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(output_path),
                "locations": len(normalized["locations"]),
                "users": len(normalized["users"]),
                "leads": len(normalized["leads"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
