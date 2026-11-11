"""API tests for /api/health and /api/health/capabilities."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_root_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "RuangKerja API"
    assert data["health"] == "/api/health"


def test_health_endpoint_returns_engines_and_storage() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] in {"healthy", "degraded"}
    assert payload["temp_storage"]["writable"] is True
    assert payload["max_upload_size_mb"] >= 1
    engine_names = {engine["name"] for engine in payload["engines"]}
    assert {
        "Pillow",
        "PyMuPDF",
        "pypdf",
        "ReportLab",
        "openpyxl",
        "xlrd",
        "pandas",
        "pytesseract",
        "qrcode",
        "Tesseract OCR Binary",
    }.issubset(engine_names)


def test_capabilities_endpoint_lists_five_categories() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health/capabilities")
    assert response.status_code == 200
    payload = response.json()

    assert payload["phase"] >= 6
    categories = [item["category"] for item in payload["categories"]]
    assert categories == ["pdf", "images", "spreadsheets", "calculator", "qr"]
    assert all(item["phase_implemented"] is True for item in payload["categories"])
    assert all(isinstance(item["required_engines_ready"], bool) for item in payload["categories"])


def test_security_headers_present() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"


def test_settings_parses_comma_separated_cors_origins(monkeypatch) -> None:
    from app.core.config import Settings

    monkeypatch.setenv(
        "RUANGKERJA_CORS_ORIGINS",
        "http://localhost:3000, http://127.0.0.1:3000",
    )
    settings = Settings()
    assert settings.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]
