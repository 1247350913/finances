"""
Capital One statement parser (purchases + vendor refunds, section-aware).

Contract expected by app:
- parse_statement_text(statement_text: str) -> dict
- returns:
  {
    "month": str,
    "expense_count": int,
    "total_expenses_amount": str,
    "expenses": [{"date": str, "description": str, "amount": str}, ...]
  }

Behavior:
- Includes purchases/charges (positive) and vendor refunds/credits (negative).
- Excludes cardholder payments/autopay/thank-you payments.
- Reads transaction-like rows only (date ... amount), with table section preference.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional

# Row example:
# 01/12/2026 AMAZON MKTPL*8R4XZ38L3 Amzn.com/bill WA 367.18
ROW_RE = re.compile(
    r"^(?P<date>\d{1,2}/\d{1,2}/\d{2,4})\s+(?P<description>.+?)\s+(?P<amount>-?\$?\d{1,3}(?:,\d{3})*\.\d{2})$"
)

MONTH_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}\b",
    re.IGNORECASE,
)

CLOSING_DATE_RE = re.compile(r"statement\s+closing\s+date\s+(\d{1,2}/\d{1,2}/20\d{2})", re.IGNORECASE)
DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/(20\d{2})")

SECTION_START_RE = re.compile(
    r"(details\s+of\s+your\s+transactions|transactions|purchases\s+and\s+adjustments)",
    re.IGNORECASE,
)
TABLE_HEADER_RE = re.compile(
    r"(trans\s+date|transaction\s+date).*(description|description/location).*(amount)",
    re.IGNORECASE,
)
SECTION_END_RE = re.compile(
    r"^(fees|interest\s+charged|interest\s+charge\s+calculation|additional\s+important\s+messages|"
    r"what\s+to\s+do\s+if\s+you\s+think|customer\s+service|total\s+fees\s+for\s+this\s+period|"
    r"total\s+interest\s+for\s+this\s+period|\d{4}\s+totals\s+year\s+to\s+date)\b",
    re.IGNORECASE,
)

PAYMENT_KEYWORDS = {
    "payment",
    "autopay",
    "thank you",
    "save on interest payment",
    "minimum payment",
}


def parse_statement_text(statement_text: str) -> dict:
    expenses = _extract_transactions(statement_text)
    total = sum((row["amount"] for row in expenses), Decimal("0"))

    return {
        "month": _extract_statement_month(statement_text, expenses),
        "expense_count": len(expenses),
        "total_expenses_amount": _money_to_string(total),
        "expenses": [
            {
                "date": row["date"],
                "description": row["description"],
                "amount": _money_to_string(row["amount"]),
            }
            for row in expenses
        ],
    }


def _extract_transactions(text: str) -> List[Dict[str, Decimal]]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    # First pass: section-aware extraction.
    section_rows = _extract_section_rows(lines)
    if section_rows:
        return section_rows

    # Fallback pass: strict row matching across whole document.
    rows: List[Dict[str, Decimal]] = []
    for line in lines:
        parsed = _parse_transaction_row(line)
        if not parsed:
            continue
        date, description, amount = parsed
        if amount == Decimal("0"):
            continue
        if _is_card_payment(description):
            continue
        rows.append({"date": date, "description": description, "amount": amount})

    return rows


def _extract_section_rows(lines: List[str]) -> List[Dict[str, Decimal]]:
    rows: List[Dict[str, Decimal]] = []
    in_section = False
    saw_header = False

    for line in lines:
        if SECTION_START_RE.search(line):
            in_section = True
            saw_header = False
            continue

        if not in_section:
            continue

        if TABLE_HEADER_RE.search(line):
            saw_header = True
            continue

        if not saw_header:
            continue

        if SECTION_END_RE.search(line):
            in_section = False
            saw_header = False
            continue

        if line.startswith("(CONTINUED"):
            continue

        parsed = _parse_transaction_row(line)
        if not parsed:
            continue

        date, description, amount = parsed
        if amount == Decimal("0"):
            continue
        if _is_card_payment(description):
            continue

        rows.append({"date": date, "description": description, "amount": amount})

    return rows


def _parse_transaction_row(line: str) -> Optional[tuple[str, str, Decimal]]:
    match = ROW_RE.match(line)
    if not match:
        return None

    date = match.group("date")
    description_raw = match.group("description")
    amount_raw = match.group("amount")

    amount = _to_decimal(amount_raw)
    if amount is None:
        return None

    description = _clean_description(description_raw)
    if not description:
        return None

    return date, description, amount


def _clean_description(value: str) -> str:
    text = re.sub(r"\s+", " ", value).strip()
    text = re.sub(r"\s+CREDIT$", "", text, flags=re.IGNORECASE).strip()

    # Remove common trailing state token and trailing phone token.
    text = re.sub(r"\s+[A-Z]{2}$", "", text)
    text = re.sub(r"\s+\d{3}-\d{3}-\d{4}$", "", text)

    return text.strip(" -:")


def _is_card_payment(description: str) -> bool:
    lower = description.lower()
    return any(token in lower for token in PAYMENT_KEYWORDS)


def _extract_statement_month(text: str, expenses: List[Dict[str, Decimal]]) -> str:
    closing = CLOSING_DATE_RE.search(text)
    if closing:
        return _month_from_date_string(closing.group(1))

    month_match = MONTH_PATTERN.search(text)
    if month_match:
        return month_match.group(0)

    if expenses:
        return _month_from_date_string(expenses[0]["date"])

    first_year = DATE_RE.search(text)
    if first_year:
        return f"Unknown Month {first_year.group(1)}"

    return "Unknown Month"


def _month_from_date_string(value: str) -> str:
    parts = value.split("/")
    if len(parts) != 3:
        return "Unknown Month"

    month_num = int(parts[0])
    year = parts[2] if len(parts[2]) == 4 else f"20{parts[2]}"

    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]

    if 1 <= month_num <= 12:
        return f"{month_names[month_num - 1]} {year}"

    return "Unknown Month"


def _to_decimal(value: str) -> Optional[Decimal]:
    cleaned = value.replace("$", "").replace(",", "")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _money_to_string(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")
