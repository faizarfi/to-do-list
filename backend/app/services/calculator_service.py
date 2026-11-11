"""Pure safe mathematical, date/time, unit, and base conversion services."""

from __future__ import annotations

import ast
import datetime as dt
import math
import operator
from typing import Callable

from app.core.exceptions import AppError
from app.schemas.calculator import (
    DateDiffResponse,
    ExpressionResponse,
    NumberBaseResponse,
    PercentageResponse,
    UnitConvertResponse,
)

_BINARY_OPS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS: dict[type[ast.unaryop], Callable[[float], float]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_UNIT_FACTORS: dict[str, dict[str, float]] = {
    "length": {
        "mm": 0.001,
        "cm": 0.01,
        "m": 1.0,
        "km": 1000.0,
        "inch": 0.0254,
        "ft": 0.3048,
        "yd": 0.9144,
        "mile": 1609.344,
    },
    "weight": {
        "mg": 0.001,
        "g": 1.0,
        "kg": 1000.0,
        "ton": 1_000_000.0,
        "oz": 28.349523125,
        "lb": 453.59237,
    },
    "area": {
        "mm2": 1e-6,
        "cm2": 1e-4,
        "m2": 1.0,
        "ha": 10_000.0,
        "km2": 1_000_000.0,
        "ft2": 0.09290304,
        "acre": 4046.8564224,
    },
    "volume": {
        "ml": 0.001,
        "l": 1.0,
        "m3": 1000.0,
        "tsp": 0.00492892159375,
        "tbsp": 0.01478676478125,
        "floz": 0.0295735295625,
        "gal": 3.785411784,
    },
}


def evaluate_math_expression(expression: str, *, angle_mode: str = "deg") -> ExpressionResponse:
    """Safely evaluate arithmetic and scientific math expressions via AST (no eval)."""
    cleaned = expression.strip().replace("^", "**").replace("×", "*").replace("÷", "/")
    if not cleaned:
        raise AppError("Ekspresi matematika tidak boleh kosong.", code="EMPTY_EXPRESSION")

    def to_rad(x: float) -> float:
        return math.radians(x) if angle_mode == "deg" else x

    def from_rad(x: float) -> float:
        return math.degrees(x) if angle_mode == "deg" else x

    funcs: dict[str, Callable[[float], float]] = {
        "sin": lambda x: math.sin(to_rad(x)),
        "cos": lambda x: math.cos(to_rad(x)),
        "tan": lambda x: math.tan(to_rad(x)),
        "asin": lambda x: from_rad(math.asin(x)),
        "acos": lambda x: from_rad(math.acos(x)),
        "atan": lambda x: from_rad(math.atan(x)),
        "sqrt": math.sqrt,
        "abs": abs,
        "log": math.log10,
        "ln": math.log,
        "exp": math.exp,
        "fact": lambda x: float(math.factorial(int(x))),
    }
    constants = {"pi": math.pi, "e": math.e}

    def _eval(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.Name) and node.id in constants:
            return constants[node.id]
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            return _UNARY_OPS[type(node.op)](_eval(node.operand))
        if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPS:
            left = _eval(node.left)
            right = _eval(node.right)
            if isinstance(node.op, (ast.Div, ast.Mod)) and right == 0:
                raise AppError("Pembagian atau modulo dengan nol tidak diizinkan.", code="DIVISION_BY_ZERO")
            return _BINARY_OPS[type(node.op)](left, right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in funcs:
            if len(node.args) != 1 or node.keywords:
                raise AppError("Fungsi hanya menerima 1 argumen.", code="INVALID_FUNCTION_ARGS")
            arg_val = _eval(node.args[0])
            return funcs[node.func.id](arg_val)
        raise AppError("Ekspresi mengandung operasi atau simbol yang tidak didukung.", code="INVALID_EXPRESSION")

    try:
        tree = ast.parse(cleaned, mode="eval")
        val = _eval(tree)
    except AppError:
        raise
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError) as exc:
        raise AppError(f"Ekspresi matematika tidak valid: {exc}", code="INVALID_EXPRESSION") from exc

    if math.isnan(val) or math.isinf(val):
        raise AppError("Hasil perhitungan di luar batas numerik.", code="MATH_OVERFLOW")

    rounded = round(val, 12)
    formatted = str(int(rounded)) if rounded.is_integer() else f"{rounded:.10g}"
    return ExpressionResponse(expression=expression, result=rounded, formatted=formatted)


def compute_percentage_discount_tax(
    *,
    base_value: float,
    rate_percent: float,
    discount_percent: float = 0.0,
    tax_percent: float = 0.0,
) -> PercentageResponse:
    """Calculate percentage share, discount reduction, and tax total."""
    percent_of_base = base_value * (rate_percent / 100.0)
    discount_amount = base_value * (discount_percent / 100.0)
    after_discount = base_value - discount_amount
    tax_amount = after_discount * (tax_percent / 100.0)
    final_total = after_discount + tax_amount
    return PercentageResponse(
        percent_of_base=round(percent_of_base, 6),
        discount_amount=round(discount_amount, 6),
        after_discount=round(after_discount, 6),
        tax_amount=round(tax_amount, 6),
        final_total=round(final_total, 6),
    )


def compute_date_diff(start_date: dt.date, end_date: dt.date) -> DateDiffResponse:
    """Compute exact days, weeks, weekdays, and weekend days between two dates."""
    total_days = (end_date - start_date).days
    abs_days = abs(total_days)
    low, high = (start_date, end_date) if start_date <= end_date else (end_date, start_date)

    weekdays = 0
    weekends = 0
    for offset in range(abs_days):
        day = low + dt.timedelta(days=offset)
        if day.weekday() < 5:
            weekdays += 1
        else:
            weekends += 1

    return DateDiffResponse(
        total_days=total_days,
        absolute_days=abs_days,
        weeks=abs_days // 7,
        remaining_days=abs_days % 7,
        weekdays=weekdays,
        weekend_days=weekends,
    )


def convert_unit(category: str, value: float, from_unit: str, to_unit: str) -> UnitConvertResponse:
    """Convert values across length, weight, temperature, area, and volume."""
    if category == "temperature":
        f_u = from_unit.upper()
        t_u = to_unit.upper()
        if f_u not in {"C", "F", "K"} or t_u not in {"C", "F", "K"}:
            raise AppError("Satuan suhu harus C, F, atau K.", code="INVALID_UNIT")
        celsius = value if f_u == "C" else ((value - 32.0) * 5.0 / 9.0 if f_u == "F" else value - 273.15)
        result = celsius if t_u == "C" else (celsius * 9.0 / 5.0 + 32.0 if t_u == "F" else celsius + 273.15)
        return UnitConvertResponse(
            category=category, value=value, from_unit=f_u, to_unit=t_u, result=round(result, 8)
        )

    factors = _UNIT_FACTORS.get(category)
    if not factors or from_unit not in factors or to_unit not in factors:
        raise AppError(f"Satuan '{from_unit}' atau '{to_unit}' tidak valid untuk {category}.", code="INVALID_UNIT")

    base_val = value * factors[from_unit]
    result = base_val / factors[to_unit]
    return UnitConvertResponse(
        category=category, value=value, from_unit=from_unit, to_unit=to_unit, result=round(result, 10)
    )


def convert_number_base(value: str, from_base: int) -> NumberBaseResponse:
    """Convert integer representation across decimal, binary, octal, and hexadecimal."""
    cleaned = value.strip()
    try:
        parsed = int(cleaned, from_base)
    except ValueError as exc:
        raise AppError(
            f"Nilai '{cleaned}' tidak valid untuk basis {from_base}.",
            code="INVALID_NUMBER_BASE",
        ) from exc

    sign = "-" if parsed < 0 else ""
    mag = abs(parsed)
    return NumberBaseResponse(
        decimal=f"{sign}{mag}",
        binary=f"{sign}{bin(mag)[2:]}",
        octal=f"{sign}{oct(mag)[2:]}",
        hexadecimal=f"{sign}{hex(mag)[2:].upper()}",
    )

