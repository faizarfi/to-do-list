"""Services for Business Invoice PDF (#74), Barcodes (#75), YAML<->JSON (#89), & Checksums (#92)."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

import yaml
from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.exceptions import AppError
from app.schemas.utility import (
    BarcodeGenerateRequest,
    BarcodeOutputFormat,
    BarcodeType,
    InvoicePdfRequest,
    YamlJsonDirection,
)
from app.utils.file_security import sanitize_filename
from app.utils.response_helpers import parse_hex_color_rgb_int

# Standard Code 128 bit patterns (values 0..106)
_CODE128_PATTERNS: list[str] = [
    "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
    "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
    "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
    "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
    "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
    "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
    "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
    "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
    "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
    "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
    "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
    "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
    "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
    "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
    "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
    "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
    "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
    "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
    "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
    "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
    "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
    "11010011100", "1100011101011",
]

# EAN parity and encoding tables
_EAN_PARITY = [
    "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
    "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
]
_EAN_L = [
    "0001101", "0011001", "0010011", "0111101", "0100011",
    "0110001", "0101111", "0111011", "0110111", "0001011",
]
_EAN_G = [
    "0100111", "0110011", "0011011", "0100001", "0011101",
    "0111001", "0000101", "0010001", "0001001", "0010111",
]
_EAN_R = [
    "1110010", "1100110", "1101100", "1000010", "1011100",
    "1001110", "1010000", "1000100", "1001000", "1110100",
]


def _encode_code128b(value: str) -> tuple[str, str]:
    clean = value.strip()
    if not clean:
        raise AppError("Nilai barcode tidak boleh kosong.", code="EMPTY_BARCODE")
    for ch in clean:
        code_pt = ord(ch)
        if code_pt < 32 or code_pt > 126:
            raise AppError(
                "Code 128 hanya mendukung karakter ASCII standar (huruf, angka, tanda baca).",
                code="INVALID_CODE128_CHAR",
            )
    codes = [104]  # Start B
    checksum = 104
    for idx, ch in enumerate(clean, start=1):
        val = ord(ch) - 32
        codes.append(val)
        checksum += idx * val
    codes.append(checksum % 103)
    codes.append(106)  # Stop
    bits = "".join(_CODE128_PATTERNS[c] for c in codes)
    return bits, clean


def _compute_ean_check_digit(digits: str) -> str:
    # Weights alternate 1 and 3 from right to left on payload without check digit
    total = 0
    for idx, ch in enumerate(reversed(digits)):
        weight = 3 if idx % 2 == 0 else 1
        total += int(ch) * weight
    return str((10 - (total % 10)) % 10)


def _encode_ean(value: str, expected_len: int) -> tuple[str, str]:
    digits = value.strip()
    if not digits.isdigit():
        raise AppError(
            f"EAN-{expected_len} hanya boleh berisi angka 0–9.",
            code="INVALID_EAN_DIGITS",
        )
    if len(digits) == expected_len - 1:
        digits = digits + _compute_ean_check_digit(digits)
    elif len(digits) == expected_len:
        expected_chk = _compute_ean_check_digit(digits[:-1])
        if digits[-1] != expected_chk:
            raise AppError(
                f"Digit checksum EAN-{expected_len} salah (seharusnya diakhiri '{expected_chk}').",
                code="INVALID_EAN_CHECKSUM",
            )
    else:
        raise AppError(
            f"EAN-{expected_len} membutuhkan {expected_len - 1} atau {expected_len} digit angka.",
            code="INVALID_EAN_LENGTH",
        )

    if expected_len == 13:
        first = int(digits[0])
        parity = _EAN_PARITY[first]
        left_bits = "".join(
            _EAN_L[int(d)] if parity[i] == "L" else _EAN_G[int(d)]
            for i, d in enumerate(digits[1:7])
        )
        right_bits = "".join(_EAN_R[int(d)] for d in digits[7:13])
        return f"101{left_bits}01010{right_bits}101", digits

    left_bits = "".join(_EAN_L[int(d)] for d in digits[:4])
    right_bits = "".join(_EAN_R[int(d)] for d in digits[4:8])
    return f"101{left_bits}01010{right_bits}101", digits


def generate_barcode_file(
    job_dir: Path,
    req: BarcodeGenerateRequest,
) -> tuple[Path, str, str, str]:
    """Tool #75: Generate Code 128, EAN-13, or EAN-8 barcode as crisp SVG or PNG."""
    fill_rgb = parse_hex_color_rgb_int(req.fill_color)
    back_rgb = parse_hex_color_rgb_int(req.back_color)

    if req.barcode_type == BarcodeType.CODE128:
        bits, canonical_text = _encode_code128b(req.value)
    elif req.barcode_type == BarcodeType.EAN13:
        bits, canonical_text = _encode_ean(req.value, 13)
    else:
        bits, canonical_text = _encode_ean(req.value, 8)

    quiet_modules = 8
    total_modules = len(bits) + quiet_modules * 2
    module_w = req.scale
    width_px = total_modules * module_w
    text_pad = 24 if req.show_text else 12
    top_pad = 12
    total_h = top_pad + req.height_px + text_pad

    # Collapse contiguous '1' modules into clean bar runs for vector & raster clarity
    runs: list[tuple[int, int]] = []
    i = 0
    while i < len(bits):
        if bits[i] == "1":
            start = i
            while i < len(bits) and bits[i] == "1":
                i += 1
            runs.append((start, i - start))
        else:
            i += 1

    safe_val = sanitize_filename(canonical_text, fallback="barcode")
    fill_hex = f"#{fill_rgb[0]:02x}{fill_rgb[1]:02x}{fill_rgb[2]:02x}"
    back_hex = f"#{back_rgb[0]:02x}{back_rgb[1]:02x}{back_rgb[2]:02x}"

    if req.output_format == BarcodeOutputFormat.SVG:
        rects = [
            f'<rect x="{(quiet_modules + start) * module_w}" y="{top_pad}" '
            f'width="{run_len * module_w}" height="{req.height_px}" fill="{fill_hex}" />'
            for start, run_len in runs
        ]
        text_svg = ""
        if req.show_text:
            text_svg = (
                f'<text x="{width_px / 2}" y="{top_pad + req.height_px + 16}" '
                f'text-anchor="middle" font-family="monospace" font-size="14" '
                f'font-weight="600" fill="{fill_hex}">{html.escape(canonical_text)}</text>'
            )
        svg = (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_px}" height="{total_h}" '
            f'viewBox="0 0 {width_px} {total_h}">\n'
            f'  <rect width="100%" height="100%" fill="{back_hex}" />\n'
            f'  {"".join(rects)}\n'
            f'  {text_svg}\n'
            f'</svg>\n'
        )
        out_path = job_dir / f"barcode-{safe_val}.svg"
        out_path.write_text(svg, encoding="utf-8")
        return out_path, "image/svg+xml", out_path.name, canonical_text

    im = Image.new("RGB", (width_px, total_h), back_rgb)
    draw = ImageDraw.Draw(im)
    for start, run_len in runs:
        x0 = (quiet_modules + start) * module_w
        x1 = x0 + run_len * module_w - 1
        draw.rectangle([x0, top_pad, x1, top_pad + req.height_px - 1], fill=fill_rgb)
    if req.show_text:
        draw.text(
            (width_px / 2, top_pad + req.height_px + 6),
            canonical_text,
            fill=fill_rgb,
            anchor="ma",
        )
    out_path = job_dir / f"barcode-{safe_val}.png"
    im.save(out_path, format="PNG", optimize=True)
    return out_path, "image/png", out_path.name, canonical_text


def _format_money(amount: float, currency: str) -> str:
    cur = currency.strip().upper() or "IDR"
    if cur == "IDR":
        return f"Rp {amount:,.0f}".replace(",", ".")
    return f"{cur} {amount:,.2f}"


def generate_invoice_pdf(job_dir: Path, req: InvoicePdfRequest) -> tuple[Path, float]:
    """Tool #74: Render a professional business invoice / receipt PDF via ReportLab."""
    accent_rgb = parse_hex_color_rgb_int(req.accent_color)
    accent_hex = f"#{accent_rgb[0]:02x}{accent_rgb[1]:02x}{accent_rgb[2]:02x}"
    accent_rl = colors.HexColor(accent_hex)

    safe_num = sanitize_filename(req.invoice_number, fallback="INV")
    out_path = job_dir / f"Invoice-{safe_num}.pdf"

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"{req.document_type} {req.invoice_number}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        textColor=accent_rl,
        alignment=0,
        spaceAfter=2,
    )
    label_style = ParagraphStyle(
        "InvLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        spaceAfter=2,
    )
    body_style = ParagraphStyle(
        "InvBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
    )
    right_body = ParagraphStyle("InvRight", parent=body_style, alignment=2)
    head_cell = ParagraphStyle(
        "InvTblH",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=colors.white,
    )
    head_right = ParagraphStyle("InvTblHR", parent=head_cell, alignment=2)

    avail_w = A4[0] - 32 * mm
    story: list[Any] = []

    doc_type = html.escape(req.document_type.strip().upper() or "INVOICE")
    inv_no = html.escape(req.invoice_number.strip())
    due_html = f"<br/>Jatuh Tempo: {html.escape(req.due_date.strip())}" if req.due_date.strip() else ""

    header_tbl = Table(
        [
            [
                Paragraph(doc_type, title_style),
                Paragraph(
                    f"<b>No: {inv_no}</b><br/>Tanggal: {html.escape(req.issue_date.strip())}{due_html}",
                    right_body,
                ),
            ]
        ],
        colWidths=[avail_w * 0.55, avail_w * 0.45],
    )
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(header_tbl)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=accent_rl))
    story.append(Spacer(1, 10))

    sender_html = f"<b>{html.escape(req.sender_name.strip())}</b>"
    if req.sender_details.strip():
        sender_html += "<br/>" + "<br/>".join(
            html.escape(ln.strip()) for ln in req.sender_details.splitlines() if ln.strip()
        )
    client_html = f"<b>{html.escape(req.client_name.strip())}</b>"
    if req.client_details.strip():
        client_html += "<br/>" + "<br/>".join(
            html.escape(ln.strip()) for ln in req.client_details.splitlines() if ln.strip()
        )

    parties_tbl = Table(
        [
            [Paragraph("DARI:", label_style), Paragraph("DITAGIHKAN KEPADA:", label_style)],
            [Paragraph(sender_html, body_style), Paragraph(client_html, body_style)],
        ],
        colWidths=[avail_w * 0.5, avail_w * 0.5],
    )
    parties_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(parties_tbl)
    story.append(Spacer(1, 14))

    rows_tbl: list[list[Any]] = [
        [
            Paragraph("Deskripsi Item", head_cell),
            Paragraph("Qty", head_right),
            Paragraph("Harga Satuan", head_right),
            Paragraph("Subtotal", head_right),
        ]
    ]
    subtotal = 0.0
    for item in req.items:
        line_total = item.quantity * item.unit_price
        subtotal += line_total
        qty_str = (
            str(int(item.quantity))
            if float(item.quantity).is_integer()
            else f"{item.quantity:g}"
        )
        rows_tbl.append(
            [
                Paragraph(html.escape(item.description.strip()), body_style),
                Paragraph(qty_str, right_body),
                Paragraph(_format_money(item.unit_price, req.currency), right_body),
                Paragraph(_format_money(line_total, req.currency), right_body),
            ]
        )

    items_tbl = Table(
        rows_tbl,
        colWidths=[avail_w * 0.46, avail_w * 0.12, avail_w * 0.21, avail_w * 0.21],
        repeatRows=1,
    )
    items_tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), accent_rl),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(items_tbl)
    story.append(Spacer(1, 12))

    discount_amt = subtotal * (req.discount_percent / 100.0)
    after_disc = subtotal - discount_amt
    tax_amt = after_disc * (req.tax_percent / 100.0)
    grand_total = after_disc + tax_amt

    summary_rows = [
        ["Subtotal", _format_money(subtotal, req.currency)],
    ]
    if req.discount_percent > 0:
        summary_rows.append([f"Diskon ({req.discount_percent:g}%)", f"- {_format_money(discount_amt, req.currency)}"])
    if req.tax_percent > 0:
        summary_rows.append([f"Pajak / PPN ({req.tax_percent:g}%)", _format_money(tax_amt, req.currency)])
    summary_rows.append(["TOTAL AKHIR", _format_money(grand_total, req.currency)])

    summary_tbl = Table(
        [
            [
                "",
                Paragraph(
                    f"<b>{lbl}</b>" if idx == len(summary_rows) - 1 else lbl,
                    right_body,
                ),
                Paragraph(
                    f"<b>{val}</b>" if idx == len(summary_rows) - 1 else val,
                    right_body,
                ),
            ]
            for idx, (lbl, val) in enumerate(summary_rows)
        ],
        colWidths=[avail_w * 0.50, avail_w * 0.27, avail_w * 0.23],
    )
    summary_tbl.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (1, -1), (2, -1), 1.0, accent_rl),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(summary_tbl)

    if req.notes.strip():
        story.append(Spacer(1, 16))
        story.append(Paragraph("CATATAN &amp; INSTRUKSI PEMBAYARAN:", label_style))
        notes_html = "<br/>".join(
            html.escape(ln.strip()) for ln in req.notes.splitlines() if ln.strip()
        )
        story.append(Paragraph(notes_html, body_style))

    doc.build(story)
    return out_path, round(grand_total, 2)


def convert_yaml_json(
    content: str,
    *,
    direction: YamlJsonDirection,
    indent: int = 2,
) -> str:
    """Tool #89: Convert between JSON and YAML safely via PyYAML safe loader."""
    raw = content.strip()
    if not raw:
        raise AppError("Konten input tidak boleh kosong.", code="EMPTY_INPUT")

    if direction == YamlJsonDirection.JSON_TO_YAML:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AppError(f"Format JSON tidak valid: {exc.msg}", code="INVALID_JSON") from exc
        return yaml.safe_dump(
            parsed,
            allow_unicode=True,
            sort_keys=False,
            indent=indent,
            default_flow_style=False,
        )

    try:
        parsed_yaml = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise AppError(f"Format YAML tidak valid: {exc}", code="INVALID_YAML") from exc

    return json.dumps(parsed_yaml, ensure_ascii=False, indent=indent, default=str)

