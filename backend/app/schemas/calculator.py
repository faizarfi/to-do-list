"""Pydantic schemas for Calculator & Converter REST API endpoints."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ExpressionRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=256)
    angle_mode: Literal["deg", "rad"] = "deg"


class ExpressionResponse(BaseModel):
    expression: str
    result: float
    formatted: str


class PercentageRequest(BaseModel):
    base_value: float
    rate_percent: float
    discount_percent: float = 0.0
    tax_percent: float = 0.0


class PercentageResponse(BaseModel):
    percent_of_base: float
    discount_amount: float
    after_discount: float
    tax_amount: float
    final_total: float


class DateDiffRequest(BaseModel):
    start_date: date
    end_date: date


class DateDiffResponse(BaseModel):
    total_days: int
    absolute_days: int
    weeks: int
    remaining_days: int
    weekdays: int
    weekend_days: int


class UnitConvertRequest(BaseModel):
    category: Literal["length", "weight", "temperature", "area", "volume"]
    value: float
    from_unit: str
    to_unit: str


class UnitConvertResponse(BaseModel):
    category: str
    value: float
    from_unit: str
    to_unit: str
    result: float


class NumberBaseRequest(BaseModel):
    value: str = Field(min_length=1, max_length=128)
    from_base: Literal[2, 8, 10, 16]


class NumberBaseResponse(BaseModel):
    decimal: str
    binary: str
    octal: str
    hexadecimal: str

