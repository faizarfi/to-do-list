"""Unit & API tests for Calculator & Converter endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_calculator_evaluate_arithmetic_and_scientific() -> None:
    with TestClient(app) as client:
        res1 = client.post("/api/calculator/evaluate", json={"expression": "(12 + 8) * 3 / 2"})
        assert res1.status_code == 200
        assert res1.json()["result"] == 30.0

        res_sin = client.post(
            "/api/calculator/evaluate",
            json={"expression": "sin(30) + sqrt(16)", "angle_mode": "deg"},
        )
        assert res_sin.status_code == 200
        assert round(res_sin.json()["result"], 4) == 4.5

        div_zero = client.post("/api/calculator/evaluate", json={"expression": "10 / 0"})
        assert div_zero.status_code == 400
        assert div_zero.json()["error"]["code"] == "DIVISION_BY_ZERO"

        mod_zero = client.post("/api/calculator/evaluate", json={"expression": "10 % 0"})
        assert mod_zero.status_code == 400
        assert mod_zero.json()["error"]["code"] == "DIVISION_BY_ZERO"


def test_calculator_percentage_date_unit_and_base() -> None:
    with TestClient(app) as client:
        pct = client.post(
            "/api/calculator/percentage",
            json={"base_value": 100000, "rate_percent": 15, "discount_percent": 20, "tax_percent": 11},
        )
        assert pct.status_code == 200
        assert pct.json()["after_discount"] == 80000
        assert pct.json()["final_total"] == 88800

        diff = client.post(
            "/api/calculator/date-diff",
            json={"start_date": "2026-11-02", "end_date": "2026-11-09"},
        )
        assert diff.status_code == 200
        assert diff.json()["total_days"] == 7
        assert diff.json()["weekdays"] == 5

        unit = client.post(
            "/api/calculator/unit-convert",
            json={"category": "temperature", "value": 100, "from_unit": "C", "to_unit": "F"},
        )
        assert unit.status_code == 200
        assert unit.json()["result"] == 212.0

        base = client.post(
            "/api/calculator/number-base",
            json={"value": "FF", "from_base": 16},
        )
        assert base.status_code == 200
        assert base.json()["decimal"] == "255"
        assert base.json()["binary"] == "11111111"

