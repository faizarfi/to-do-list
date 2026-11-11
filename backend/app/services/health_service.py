"""Health and runtime capability inspection service."""

from __future__ import annotations

import importlib
import importlib.metadata
import platform
import shutil
import subprocess
from datetime import datetime, timezone

from app.core.config import Settings
from app.schemas.common import (
    CapabilitiesResponse,
    CategoryReadiness,
    EngineStatus,
    HealthResponse,
    TempStorageStatus,
)
from app.utils.file_security import count_active_job_dirs, is_dir_writable


def _check_python_package(
    display_name: str,
    import_name: str,
    dist_name: str | None = None,
    note: str | None = None,
) -> EngineStatus:
    try:
        importlib.import_module(import_name)
        pkg_name = dist_name or import_name
        try:
            version = importlib.metadata.version(pkg_name)
        except importlib.metadata.PackageNotFoundError:
            version = "installed"
        return EngineStatus(name=display_name, available=True, version=version, note=note)
    except ImportError:
        return EngineStatus(
            name=display_name,
            available=False,
            version=None,
            note=f"Paket Python '{import_name}' belum terpasang.",
        )


def _check_tesseract_binary(tesseract_cmd: str | None) -> EngineStatus:
    cmd = tesseract_cmd or shutil.which("tesseract")
    if not cmd:
        return EngineStatus(
            name="Tesseract OCR Binary",
            available=False,
            version=None,
            note="Opsional untuk OCR PDF (#15). Belum ditemukan di PATH.",
        )
    try:
        completed = subprocess.run(
            [cmd, "--version"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        first_line = (completed.stdout or completed.stderr).splitlines()[0].strip() if (completed.stdout or completed.stderr) else "detected"
        return EngineStatus(
            name="Tesseract OCR Binary",
            available=completed.returncode == 0,
            version=first_line,
            note=None if completed.returncode == 0 else "Gagal menjalankan tesseract --version.",
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return EngineStatus(
            name="Tesseract OCR Binary",
            available=False,
            version=None,
            note=f"Tidak dapat mengakses binary tesseract: {exc}",
        )


def get_engine_statuses(settings: Settings) -> list[EngineStatus]:
    """Check availability of all processing libraries used across RuangKerja phases."""
    return [
        _check_python_package("Pillow", "PIL", "Pillow"),
        _check_python_package("PyMuPDF", "pymupdf", "PyMuPDF"),
        _check_python_package("pypdf", "pypdf", "pypdf"),
        _check_python_package("ReportLab", "reportlab", "reportlab"),
        _check_python_package("openpyxl", "openpyxl", "openpyxl"),
        _check_python_package("xlrd", "xlrd", "xlrd"),
        _check_python_package("pandas", "pandas", "pandas"),
        _check_python_package("pytesseract", "pytesseract", "pytesseract"),
        _check_python_package("qrcode", "qrcode", "qrcode"),
        _check_python_package("PyYAML", "yaml", "PyYAML"),
        _check_tesseract_binary(settings.tesseract_cmd),
    ]


def build_health_response(settings: Settings) -> HealthResponse:
    """Build full health status payload."""
    writable = is_dir_writable(settings.temp_dir)
    engines = get_engine_statuses(settings)
    return HealthResponse(
        status="healthy" if writable else "degraded",
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.env,
        python_version=platform.python_version(),
        timestamp=datetime.now(timezone.utc),
        max_upload_size_mb=settings.max_upload_size_mb,
        temp_storage=TempStorageStatus(
            path=str(settings.temp_dir),
            writable=writable,
            active_job_dirs=count_active_job_dirs(settings.temp_dir),
            ttl_seconds=settings.temp_ttl_seconds,
        ),
        engines=engines,
    )


def build_capabilities_response(settings: Settings) -> CapabilitiesResponse:
    """Summarize backend module readiness for all 5 tool categories."""
    engine_map = {engine.name: engine.available for engine in get_engine_statuses(settings)}

    return CapabilitiesResponse(
        phase=6,
        categories=[
            CategoryReadiness(
                category="pdf",
                endpoint_prefix="/api/pdf",
                ready_for_phase=2,
                phase_implemented=True,
                required_engines_ready=all(
                    engine_map.get(name, False) for name in ("PyMuPDF", "pypdf", "ReportLab", "Pillow")
                ),
                notes="Seluruh 20 fitur PDF & Dokumen aktif.",
            ),
            CategoryReadiness(
                category="images",
                endpoint_prefix="/api/images",
                ready_for_phase=3,
                phase_implemented=True,
                required_engines_ready=engine_map.get("Pillow", False),
                notes="Seluruh 18 fitur Image Tools aktif.",
            ),
            CategoryReadiness(
                category="spreadsheets",
                endpoint_prefix="/api/spreadsheets",
                ready_for_phase=4,
                phase_implemented=True,
                required_engines_ready=all(
                    engine_map.get(name, False)
                    for name in ("openpyxl", "xlrd", "pandas", "ReportLab")
                ),
                notes="Seluruh 14 fitur Excel & Data Tools aktif.",
            ),
            CategoryReadiness(
                category="calculator",
                endpoint_prefix="/api/calculator",
                ready_for_phase=5,
                phase_implemented=True,
                required_engines_ready=True,
                notes="Endpoint Calculator & Converter aktif.",
            ),
            CategoryReadiness(
                category="qr",
                endpoint_prefix="/api/qr",
                ready_for_phase=6,
                phase_implemented=True,
                required_engines_ready=engine_map.get("qrcode", False),
                notes="Endpoint QR Code Generator & Utilitas (/api/utility) aktif.",
            ),
        ],
    )
