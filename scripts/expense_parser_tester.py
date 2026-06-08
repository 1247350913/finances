#!/usr/bin/env python3
"""
Local tester for custom expense statement parsers.

Usage examples:
  python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt
  python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.pdf --expected path/to/expected.json

Parser contract expected by this project:
  parse_statement_text(statement_text: str) -> dict
  {
    "month": str,
    "expense_count": int,
    "total_expenses_amount": "123.45",
    "expenses": [
      {"date": str, "description": str, "amount": "12.34"}
    ]
  }
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Callable


@dataclass
class ParsedExpense:
    date: str
    description: str
    amount: Decimal


@dataclass
class NormalizedResult:
    month: str
    expense_count: int
    total_expenses_amount: Decimal
    expenses: list[ParsedExpense]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run and validate an expense parser against a statement file.")
    parser.add_argument("--parser", required=True, help="Path to parser Python file.")
    parser.add_argument("--statement", required=True, help="Path to statement file (txt/csv/json/pdf).")
    parser.add_argument("--expected", help="Optional path to expected output JSON for comparison.")
    parser.add_argument("--show", type=int, default=20, help="Number of expense rows to preview (default: 20).")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    parser_path = pathlib.Path(args.parser).expanduser().resolve()
    statement_path = pathlib.Path(args.statement).expanduser().resolve()

    if not parser_path.exists():
        fail(f"Parser file not found: {parser_path}")
    if not statement_path.exists():
        fail(f"Statement file not found: {statement_path}")

    parse_statement_text = load_parser_callable(parser_path)
    statement_text = read_statement_text(statement_path)

    raw_result = parse_statement_text(statement_text)
    normalized, warnings = normalize_result(raw_result)

    print_summary(parser_path, statement_path, statement_text, normalized, warnings, args.show)

    if args.expected:
        expected_path = pathlib.Path(args.expected).expanduser().resolve()
        if not expected_path.exists():
            fail(f"Expected file not found: {expected_path}")

        expected_json = json.loads(expected_path.read_text(encoding="utf-8"))
        ok, diff = compare_expected(expected_json, normalized)
        if ok:
            print("\nExpected comparison: PASS")
        else:
            print("\nExpected comparison: FAIL")
            print(diff)
            return 2

    return 0


def load_parser_callable(parser_path: pathlib.Path) -> Callable[[str], Any]:
    module_name = f"expense_parser_{parser_path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, parser_path)
    if not spec or not spec.loader:
        fail(f"Could not load parser module: {parser_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    parse_fn = getattr(module, "parse_statement_text", None)
    if not callable(parse_fn):
        fail("Parser must expose parse_statement_text(statement_text: str) -> dict")
    return parse_fn


def read_statement_text(statement_path: pathlib.Path) -> str:
    suffix = statement_path.suffix.lower()

    if suffix == ".pdf":
        return read_pdf_text(statement_path)

    if suffix in {".txt", ".csv", ".tsv", ".log", ".md"}:
        return read_text_with_fallbacks(statement_path)

    if suffix == ".json":
        data = json.loads(read_text_with_fallbacks(statement_path))
        if isinstance(data, dict) and isinstance(data.get("statement_text"), str):
            return data["statement_text"]
        return json.dumps(data, ensure_ascii=True, indent=2)

    return read_text_with_fallbacks(statement_path)


def read_pdf_text(statement_path: pathlib.Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError:
        fail(
            "PDF support requires pypdf. Install it with: pip install pypdf\n"
            "Or convert the PDF to text and pass a .txt file instead."
        )

    reader = PdfReader(str(statement_path))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def read_text_with_fallbacks(path: pathlib.Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    fail(f"Could not decode file as text: {path}")


def normalize_result(raw_result: Any) -> tuple[NormalizedResult, list[str]]:
    if not isinstance(raw_result, dict):
        fail("Parser output must be a dict.")

    warnings: list[str] = []

    month = str(raw_result.get("month", "")).strip()
    if not month:
        warnings.append("month is empty")

    raw_expenses = raw_result.get("expenses")
    if not isinstance(raw_expenses, list):
        fail("Parser output field expenses must be a list.")

    expenses: list[ParsedExpense] = []
    for idx, item in enumerate(raw_expenses):
        if not isinstance(item, dict):
            fail(f"expenses[{idx}] must be an object.")

        date = str(item.get("date", "")).strip()
        description = str(item.get("description", "")).strip()
        amount = to_decimal(item.get("amount"), f"expenses[{idx}].amount")

        if amount <= 0:
            warnings.append(f"expenses[{idx}] has non-positive amount: {amount}")

        if not description:
            warnings.append(f"expenses[{idx}] has empty description")

        expenses.append(ParsedExpense(date=date, description=description, amount=amount))

    stated_count = int(raw_result.get("expense_count", len(expenses)))
    computed_count = len(expenses)
    if stated_count != computed_count:
        warnings.append(
            f"expense_count mismatch: parser={stated_count}, computed={computed_count}"
        )

    stated_total = to_decimal(raw_result.get("total_expenses_amount", "0"), "total_expenses_amount")
    computed_total = sum((row.amount for row in expenses), Decimal("0"))
    if stated_total != computed_total:
        warnings.append(
            f"total_expenses_amount mismatch: parser={money(stated_total)}, computed={money(computed_total)}"
        )

    normalized = NormalizedResult(
        month=month,
        expense_count=stated_count,
        total_expenses_amount=stated_total,
        expenses=expenses,
    )

    return normalized, warnings


def to_decimal(value: Any, field_name: str) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"))

    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, ValueError):
        fail(f"Field {field_name} must be a decimal-like value. Got: {value!r}")

    return decimal_value.quantize(Decimal("0.01"))


def print_summary(
    parser_path: pathlib.Path,
    statement_path: pathlib.Path,
    statement_text: str,
    result: NormalizedResult,
    warnings: list[str],
    show_rows: int,
) -> None:
    print("Parser test run")
    print(f"- parser: {parser_path}")
    print(f"- statement: {statement_path}")
    print(f"- statement chars: {len(statement_text)}")

    print("\nNormalized result")
    print(f"- month: {result.month or '<empty>'}")
    print(f"- expense_count: {result.expense_count}")
    print(f"- total_expenses_amount: {money(result.total_expenses_amount)}")

    if warnings:
        print("\nWarnings")
        for warning in warnings:
            print(f"- {warning}")

    print("\nExpense preview")
    rows = result.expenses[: max(show_rows, 0)]
    if not rows:
        print("- (no expenses)")
    else:
        for idx, row in enumerate(rows, start=1):
            print(f"{idx:>3}. {row.date or '--':<12} {money(row.amount):>12}  {row.description}")

    if len(result.expenses) > len(rows):
        print(f"... and {len(result.expenses) - len(rows)} more rows")

    payload = {
        "month": result.month,
        "expense_count": result.expense_count,
        "total_expenses_amount": money(result.total_expenses_amount),
        "expenses": [
            {
                "date": row.date,
                "description": row.description,
                "amount": money(row.amount),
            }
            for row in result.expenses
        ],
    }

    print("\nOutput JSON")
    print(json.dumps(payload, ensure_ascii=True, indent=2))

    print("\nQuestion: does this look right?")


def compare_expected(expected_json: Any, actual: NormalizedResult) -> tuple[bool, str]:
    actual_json = {
        "month": actual.month,
        "expense_count": actual.expense_count,
        "total_expenses_amount": money(actual.total_expenses_amount),
        "expenses": [
            {
                "date": row.date,
                "description": row.description,
                "amount": money(row.amount),
            }
            for row in actual.expenses
        ],
    }

    expected_text = json.dumps(expected_json, ensure_ascii=True, sort_keys=True, indent=2)
    actual_text = json.dumps(actual_json, ensure_ascii=True, sort_keys=True, indent=2)

    if expected_text == actual_text:
        return True, ""

    return False, (
        "Expected and actual differ.\n"
        f"--- expected ---\n{expected_text}\n"
        f"--- actual ---\n{actual_text}"
    )


def money(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    raise SystemExit(main())
