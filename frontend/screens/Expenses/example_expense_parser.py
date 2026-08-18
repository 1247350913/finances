"""
Example expense parser template.

Required contract for this project:
- Expose function: parse_statement_text(statement_text: str) -> dict
- Return keys:
  - month: str
  - expense_count: int
  - total_expenses_amount: str (decimal string, e.g. "1234.56")
  - expenses: list[dict] where each item has:
      - date: str
      - description: str
      - amount: str (decimal string)

Notes:
- This parser receives statement text, not raw PDF bytes.
- Supports common row styles such as:
    01/12/2026 MERCHANT NAME 12.34
    Jan 2 Jan 3 MERCHANT NAME $12.34
- Excludes payment-like rows.
"""

import re
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional


ROW_SLASH_RE = re.compile(
    r"^(?P<date>\d{1,2}/\d{1,2}(?:/\d{2,4})?)\s+(?P<description>.+?)\s+(?P<amount>-?\$?\d{1,3}(?:,\d{3})*\.\d{2})$"
)

ROW_MONTH_RE = re.compile(
    r"^(?P<trans_date>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})\s+"
    r"(?P<post_date>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})\s+"
    r"(?P<description>.+?)\s+(?P<amount>-?\$?\d{1,3}(?:,\d{3})*\.\d{2})$",
    re.IGNORECASE,
)

MONTH_RANGE_RE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*(\d{4})\s*-\s*"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*(\d{4})\b",
    re.IGNORECASE,
)

PAYMENT_TOKENS = (
    "payment",
    "autopay",
    "thank you",
    "save on interest payment",
    "minimum payment",
    "pymt",
)


def parse_statement_text(statement_text: str) -> dict:
    expenses = _extract_expenses(statement_text)
    total = sum((item["amount"] for item in expenses), Decimal("0"))

    return {
        "month": _extract_month_label(statement_text),
        "expense_count": len(expenses),
        "total_expenses_amount": _money_to_string(total),
        "expenses": [
            {
                "date": item["date"],
                "description": item["description"],
                "amount": _money_to_string(item["amount"]),
            }
            for item in expenses
        ],
    }


def _extract_month_label(statement_text: str) -> str:
    match = MONTH_RANGE_RE.search(statement_text)
    if not match:
        return "Unknown Month"

    # Use the ending year from the billing range when available.
    start_year = match.group(1)
    end_year = match.group(2)
    year = end_year or start_year

    # Month label is approximate from first transaction if present.
    for line in statement_text.splitlines():
        parsed = _parse_row(line.strip())
        if parsed:
            month_name = _month_name_from_date(parsed["date"])
            if month_name:
                return f"{month_name} {year}"

    return f"Unknown Month {year}" if year else "Unknown Month"


def _extract_expenses(statement_text: str) -> List[Dict[str, Decimal]]:
    items: List[Dict[str, Decimal]] = []

    for raw_line in statement_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        parsed = _parse_row(line)
        if not parsed:
            continue

        if _is_payment(parsed["description"]):
            continue

        items.append(parsed)

    return items


def _parse_row(line: str) -> Optional[Dict[str, Decimal]]:
    slash_match = ROW_SLASH_RE.match(line)
    if slash_match:
        amount = _to_decimal(slash_match.group("amount"))
        description = _clean_description(slash_match.group("description"))
        if amount is None or not description:
            return None
        return {
            "date": slash_match.group("date"),
            "description": description,
            "amount": amount,
        }

    month_match = ROW_MONTH_RE.match(line)
    if month_match:
        amount = _to_decimal(month_match.group("amount"))
        description = _clean_description(month_match.group("description"))
        if amount is None or not description:
            return None
        return {
            "date": month_match.group("trans_date"),
            "description": description,
            "amount": amount,
        }

    return None


def _to_decimal(value: str) -> Optional[Decimal]:
    cleaned = value.replace("$", "").replace(",", "")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _clean_description(value: str) -> str:
    text = re.sub(r"\s+", " ", value).strip()
    text = re.sub(r"\s+CREDIT$", "", text, flags=re.IGNORECASE).strip()
    return text.strip(" -:")


def _is_payment(description: str) -> bool:
    lower = description.lower()
    return any(token in lower for token in PAYMENT_TOKENS)


def _month_name_from_date(value: str) -> Optional[str]:
    if "/" in value:
        parts = value.split("/")
        if len(parts) >= 2:
            try:
                month_num = int(parts[0])
                return _month_num_to_name(month_num)
            except ValueError:
                return None

    token = value.split()[0].lower()
    abbreviations = {
        "jan": "January",
        "feb": "February",
        "mar": "March",
        "apr": "April",
        "may": "May",
        "jun": "June",
        "jul": "July",
        "aug": "August",
        "sep": "September",
        "oct": "October",
        "nov": "November",
        "dec": "December",
    }
    return abbreviations.get(token)


def _month_num_to_name(month_num: int) -> Optional[str]:
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    if 1 <= month_num <= 12:
        return month_names[month_num - 1]
    return None


def _money_to_string(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")
