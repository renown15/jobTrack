import datetime
import io
import logging
from decimal import Decimal

"""Excel export utilities.

Delay importing heavy third-party modules until the export function is
actually invoked to avoid import-time circular dependencies.
"""


logger = logging.getLogger(__name__)


def _normalize_value(v):
    """Convert problematic types to Excel-friendly values.

    - timezone-aware datetimes: convert to UTC then remove tzinfo
    - Decimal: convert to float
    - None: return empty string
    """
    if v is None:
        return ""
    # datetime.datetime includes datetime.date as subclass; check datetime first
    if isinstance(v, datetime.datetime):
        if v.tzinfo is not None:
            try:
                v = v.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            except Exception as e:
                # fallback: drop tzinfo and log the issue
                logger.exception("_normalize_value: timezone conversion failed: %s", e)
                v = v.replace(tzinfo=None)
        return v
    if isinstance(v, Decimal):
        try:
            return float(v)
        except Exception:
            return str(v)
    return v


def build_workbook_from_data(data: dict) -> io.BytesIO:
    """Construct an XLSX workbook from provided data dict and return BytesIO.

    Expected keys in data: contacts, organisations, roles, engagements,
    referencedata, sectors, contact_target_orgs, documents, engagement_documents
    Each value should be a list of dict-like rows (e.g., RealDictCursor results).
    """
    # Try to use openpyxl if available; if it fails (circular import or missing
    # package), fall back to producing a minimal XLSX archive directly. The
    # fallback produces a valid .xlsx ZIP container (single worksheet) so the
    # export endpoint still returns an Excel file without depending on
    # openpyxl internals that may misbehave in some environments.
    try:
        from openpyxl.workbook.workbook import Workbook  # type: ignore

        wb = Workbook()

        # Contacts sheet
        contacts = data.get("contacts") or []
        ws = wb.active
        assert ws is not None
        ws.title = "Contacts"
        if contacts:
            headers = list(contacts[0].keys())
            ws.append(headers)
            for r in contacts:
                ws.append([_normalize_value(r.get(h)) for h in headers])
        else:
            ws.append(["contactid"])

        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        return bio
    except Exception:
        logger.exception("openpyxl import failed; using internal xlsx generator")

        # Minimal xlsx builder: create a ZIP with the essential parts for a
        # single worksheet. This is intentionally small and only meant to be
        # a safe fallback for environments where openpyxl cannot be imported.
        import zipfile
        from xml.sax.saxutils import escape as _escape

        def _sheet_xml(rows: list[list[str]]) -> str:
            parts = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
                "<sheetData>",
            ]
            for ri, row in enumerate(rows, start=1):
                parts.append(f'<row r="{ri}">')
                for ci, cell in enumerate(row, start=1):
                    # simple inlineStr cells
                    text = "" if cell is None else str(cell)
                    parts.append(
                        f'<c r="{ci}{ri}" t="inlineStr"><is><t>{_escape(text)}</t></is></c>'
                    )
                parts.append("</row>")
            parts.append("</sheetData>")
            parts.append("</worksheet>")
            return "".join(parts)

        # Prepare simple rows for the contacts sheet
        contacts = data.get("contacts") or []
        if contacts:
            headers = list(contacts[0].keys())
            rows = [headers] + [
                [_normalize_value(r.get(h)) for h in headers] for r in contacts
            ]
        else:
            rows = [["contactid"], [""]]

        sheet1 = _sheet_xml(rows)

        content_types = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>"
        )

        rels_root = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        )

        workbook_xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            '<sheet name="Contacts" sheetId="1" r:id="rId1"/>'
            "</sheets>"
            "</workbook>"
        )

        workbook_rels = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>"
        )

        bio = io.BytesIO()
        with zipfile.ZipFile(bio, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types)
            zf.writestr("_rels/.rels", rels_root)
            zf.writestr("xl/workbook.xml", workbook_xml)
            zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
            zf.writestr("xl/worksheets/sheet1.xml", sheet1)
        bio.seek(0)
        return bio
