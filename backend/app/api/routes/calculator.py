"""REST API endpoints for Calculator & Converter Tools."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.calculator import (
    DateDiffRequest,
    DateDiffResponse,
    ExpressionRequest,
    ExpressionResponse,
    NumberBaseRequest,
    NumberBaseResponse,
    PercentageRequest,
    PercentageResponse,
    UnitConvertRequest,
    UnitConvertResponse,
)
from app.services import calculator_service

router = APIRouter(prefix="/calculator", tags=["Calculator & Converter"])


@router.post("/evaluate", response_model=ExpressionResponse)
async def evaluate_expression_endpoint(payload: ExpressionRequest) -> ExpressionResponse:
    """Evaluate arithmetic or scientific expressions safely."""
    return calculator_service.evaluate_math_expression(
        payload.expression, angle_mode=payload.angle_mode
    )


@router.post("/percentage", response_model=PercentageResponse)
async def percentage_endpoint(payload: PercentageRequest) -> PercentageResponse:
    """Calculate percentage, discount, and tax breakdowns."""
    return calculator_service.compute_percentage_discount_tax(
        base_value=payload.base_value,
        rate_percent=payload.rate_percent,
        discount_percent=payload.discount_percent,
        tax_percent=payload.tax_percent,
    )


@router.post("/date-diff", response_model=DateDiffResponse)
async def date_diff_endpoint(payload: DateDiffRequest) -> DateDiffResponse:
    """Calculate days, weeks, and weekdays between two dates."""
    return calculator_service.compute_date_diff(payload.start_date, payload.end_date)


@router.post("/unit-convert", response_model=UnitConvertResponse)
async def unit_convert_endpoint(payload: UnitConvertRequest) -> UnitConvertResponse:
    """Convert physical measurement units."""
    return calculator_service.convert_unit(
        payload.category, payload.value, payload.from_unit, payload.to_unit
    )


@router.post("/number-base", response_model=NumberBaseResponse)
async def number_base_endpoint(payload: NumberBaseRequest) -> NumberBaseResponse:
    """Convert integer numbers across binary, octal, decimal, and hex."""
    return calculator_service.convert_number_base(payload.value, payload.from_base)

