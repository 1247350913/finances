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
- Keep all amounts as positive expense values.
- Exclude payments and refunds unless your business rules change.
"""

from decimal import Decimal
from typing import Dict, List


def parse_statement_text(statement_text: str) -> dict:
    """
    Replace this with your institution-specific logic.
    """
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
    # Example default fallback.
    return "Unknown Month"


def _extract_expenses(statement_text: str) -> List[Dict[str, Decimal]]:
    # TODO: replace with parser logic.
    # Expected internal shape:
    # [
    #   {"date": "03/12", "description": "MERCHANT", "amount": Decimal("12.34")},
    # ]
    return []


def _money_to_string(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")
