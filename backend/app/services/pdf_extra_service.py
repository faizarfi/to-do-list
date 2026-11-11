"""Additional PDF & Document processing services (Tools #51–#55)."""

from __future__ import annotations

import html
import re
from pathlib import Path
from typing import Any

import pymupdf
from pypdf import PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, LEGAL, LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, Preformatted, SimpleDocTemplate, Spacer

from app.core.exceptions import AppError
from app.schemas.pdf import (
    PaperSize,
    PdfExtractedPageText,
    PdfMetadataResponse,
    PdfTextExtractResponse,
)
from app.services.pdf_common import (
    open_pymupdf_doc,
    open_pypdf_reader,
    parse_page_selection,
)

_INLINE_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_INLINE_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def extract_pdf_text(
    data: bytes,
    filename: str,
    *,
    pages_spec: str | None = None,
    password: str | None = None,
) -> PdfTextExtractResponse:
    """Tool #51: Extract plain text per page from a PDF document."""
    doc = open_pymupdf_doc(data, filename, password)
    try:
        total_pages = doc.page_count
        selected = parse_page_selection(pages_spec, total_pages, deduplicate=True)
        extracted: list[PdfExtractedPageText] = []
        blocks: list[str] = []
        for p_num in selected:
            page = doc.load_page(p_num - 1)
            text = page.get_text("text").strip()
            extracted.append(PdfExtractedPageText(page_number=p_num, text=text))
            blocks.append(f"--- Halaman {p_num} ---\n{text}")
        full_text = "\n\n".join(blocks)
        return PdfTextExtractResponse(
            filename=filename,
            page_count=total_pages,
            total_chars=len(full_text),
            pages=extracted,
            full_text=full_text,
        )
    finally:
        doc.close()


def protect_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    user_password: str,
    owner_password: str | None = None,
    allow_printing: bool = True,
    password: str | None = None,
) -> tuple[Path, int]:
    """Tool #52: Encrypt a PDF with an authorized password using AES-256."""
    clean_pwd = user_password.strip()
    if len(clean_pwd) < 3:
        raise AppError("Password baru minimal 3 karakter.", code="WEAK_PDF_PASSWORD")

    doc = open_pymupdf_doc(data, filename, password)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_protected.pdf"
    owner_pw = owner_password.strip() if owner_password and owner_password.strip() else clean_pwd
    perms = pymupdf.PDF_PERM_ACCESSIBILITY | pymupdf.PDF_PERM_COPY
    if allow_printing:
        perms |= pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_PRINT_HQ

    try:
        doc.save(
            str(out_path),
            encryption=pymupdf.PDF_ENCRYPT_AES_256,
            user_pw=clean_pwd,
            owner_pw=owner_pw,
            permissions=perms,
            deflate=True,
        )
        return out_path, doc.page_count
    finally:
        doc.close()


def unlock_pdf(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    password: str,
) -> tuple[Path, int]:
    """Tool #53: Remove password protection using the owner/user's authorized password."""
    clean_pwd = password.strip()
    if not clean_pwd:
        raise AppError(
            "Masukkan password PDF yang sah untuk membuka proteksi dokumen.",
            code="PDF_PASSWORD_REQUIRED",
        )
    doc = open_pymupdf_doc(data, filename, clean_pwd)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_unlocked.pdf"
    try:
        doc.save(
            str(out_path),
            encryption=pymupdf.PDF_ENCRYPT_NONE,
            deflate=True,
        )
        return out_path, doc.page_count
    finally:
        doc.close()


def read_pdf_metadata(
    data: bytes,
    filename: str,
    *,
    password: str | None = None,
) -> PdfMetadataResponse:
    """Tool #54 (read): Read standard PDF metadata fields."""
    reader = open_pypdf_reader(data, filename, password)
    meta = reader.metadata or {}
    return PdfMetadataResponse(
        filename=filename,
        page_count=len(reader.pages),
        title=str(meta.get("/Title") or ""),
        author=str(meta.get("/Author") or ""),
        subject=str(meta.get("/Subject") or ""),
        keywords=str(meta.get("/Keywords") or ""),
        creator=str(meta.get("/Creator") or ""),
        producer=str(meta.get("/Producer") or ""),
    )


def update_pdf_metadata(
    job_dir: Path,
    data: bytes,
    filename: str,
    *,
    title: str = "",
    author: str = "",
    subject: str = "",
    keywords: str = "",
    creator: str = "",
    password: str | None = None,
) -> tuple[Path, int]:
    """Tool #54 (update): Write updated metadata properties to a PDF copy."""
    reader = open_pypdf_reader(data, filename, password)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    new_meta: dict[str, str] = {}
    if reader.metadata:
        for k, v in reader.metadata.items():
            if isinstance(k, str) and v is not None:
                new_meta[k] = str(v)

    new_meta["/Title"] = title
    new_meta["/Author"] = author
    new_meta["/Subject"] = subject
    new_meta["/Keywords"] = keywords
    if creator.strip():
        new_meta["/Creator"] = creator.strip()
    elif "/Creator" not in new_meta:
        new_meta["/Creator"] = "RuangKerja"

    writer.add_metadata(new_meta)
    stem = Path(filename).stem or "dokumen"
    out_path = job_dir / f"{stem}_metadata.pdf"
    with out_path.open("wb") as handle:
        writer.write(handle)
    return out_path, len(writer.pages)


def _format_inline_markdown(raw_line: str) -> str:
    escaped = html.escape(raw_line, quote=False)
    escaped = _INLINE_CODE_RE.sub(
        r'<font name="Courier" color="#0D7A68">\1</font>', escaped
    )
    escaped = _INLINE_BOLD_RE.sub(r"<b>\1</b>", escaped)
    escaped = _INLINE_ITALIC_RE.sub(r"<i>\1</i>", escaped)
    return escaped


def markdown_to_pdf(
    job_dir: Path,
    markdown_text: str,
    *,
    document_title: str = "",
    paper_size: PaperSize = PaperSize.A4,
    margin_mm: float = 18.0,
    font_size: int = 10,
) -> Path:
    """Tool #55: Render Markdown notes/documents into a formatted ReportLab PDF."""
    cleaned = markdown_text.strip()
    if not cleaned:
        raise AppError("Konten Markdown tidak boleh kosong.", code="EMPTY_MARKDOWN")

    page_map = {
        PaperSize.A4: A4,
        PaperSize.A3: A3,
        PaperSize.LETTER: LETTER,
        PaperSize.LEGAL: LEGAL,
        PaperSize.CUSTOM: A4,
    }
    margin_pt = margin_mm * mm
    out_path = job_dir / "dokumen-markdown.pdf"

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=page_map[paper_size],
        leftMargin=margin_pt,
        rightMargin=margin_pt,
        topMargin=margin_pt,
        bottomMargin=margin_pt,
        title=document_title.strip() or "Dokumen RuangKerja",
    )

    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "RKBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=font_size,
        leading=font_size * 1.48,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=6,
    )
    h1_style = ParagraphStyle(
        "RKH1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=font_size + 8,
        leading=font_size + 13,
        textColor=colors.HexColor("#0D7A68"),
        spaceBefore=8,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "RKH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=font_size + 4,
        leading=font_size + 8,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=8,
        spaceAfter=6,
    )
    h3_style = ParagraphStyle(
        "RKH3",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=font_size + 2,
        leading=font_size + 5,
        textColor=colors.HexColor("#334155"),
        spaceBefore=6,
        spaceAfter=4,
    )
    quote_style = ParagraphStyle(
        "RKQuote",
        parent=body_style,
        leftIndent=14,
        textColor=colors.HexColor("#475569"),
        fontName="Helvetica-Oblique",
    )
    code_style = ParagraphStyle(
        "RKCode",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=max(8, font_size - 1),
        leading=font_size + 3,
        backColor=colors.HexColor("#F1F5F9"),
        textColor=colors.HexColor("#0F172A"),
        borderPadding=6,
    )

    story: list[Any] = []
    if document_title.strip():
        story.append(Paragraph(html.escape(document_title.strip()), h1_style))
        story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#CBD5E1")))
        story.append(Spacer(1, 8))

    in_code = False
    code_lines: list[str] = []

    for raw_line in cleaned.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("```"):
            if in_code:
                story.append(Preformatted("\n".join(code_lines), code_style))
                story.append(Spacer(1, 6))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(raw_line)
            continue

        if not stripped:
            story.append(Spacer(1, 4))
            continue

        if stripped in {"---", "***", "___"}:
            story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#CBD5E1")))
            story.append(Spacer(1, 6))
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(_format_inline_markdown(stripped[4:]), h3_style))
        elif stripped.startswith("## "):
            story.append(Paragraph(_format_inline_markdown(stripped[3:]), h2_style))
        elif stripped.startswith("# "):
            story.append(Paragraph(_format_inline_markdown(stripped[2:]), h1_style))
        elif stripped.startswith("> "):
            story.append(Paragraph(_format_inline_markdown(stripped[2:]), quote_style))
        elif re.match(r"^[-*]\s+", stripped):
            content = re.sub(r"^[-*]\s+", "", stripped)
            story.append(
                Paragraph(f"&bull;&nbsp;&nbsp;{_format_inline_markdown(content)}", body_style)
            )
        elif re.match(r"^\d+\.\s+", stripped):
            story.append(Paragraph(_format_inline_markdown(stripped), body_style))
        else:
            story.append(Paragraph(_format_inline_markdown(stripped), body_style))

    if in_code and code_lines:
        story.append(Preformatted("\n".join(code_lines), code_style))

    doc.build(story)
    return out_path
