# finances

## Expense parser tester

If your statement parsing in the UI looks wrong, run the parser locally first and inspect output before upload.

The tester is at scripts/expense_parser_tester.py.

### What it does

- Loads your parser file and calls parse_statement_text(statement_text)
- Reads statement text from txt/csv/json (and pdf if pypdf is installed)
- Validates output shape and decimal amounts
- Prints:
	- normalized summary values
	- warning checks (count/total mismatches, empty fields, invalid amounts)
	- expense row preview
	- full output JSON
	- a final prompt: "does this look right?"

### Run it

1. Basic run:

```bash
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt
```

2. PDF statement support (optional dependency):

```bash
pip install pypdf
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.pdf
```

3. Compare with an expected JSON output:

```bash
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt --expected path/to/expected.json
```

4. Control preview row count:

```bash
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt --show 50
```

### Expected parser contract

Your parser must export:

- parse_statement_text(statement_text: str) -> dict

Expected result keys:

- month: string
- expense_count: integer
- total_expenses_amount: decimal string (example: "1234.56")
- expenses: list of
	- date: string
	- description: string
	- amount: decimal string
