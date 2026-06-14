# finances

**Live Production App:** https://finances.lnks.info

A personal finance management platform for tracking expenses, organizing bank statements, and gaining insights into your spending habits.

## Features

- **Secure Authentication**: Email-based sign-up and login powered by Supabase
- **Expense Tracking**: Log and categorize expenses with a clean, intuitive interface
- **Bank Statement Parser**: Automatically parse and import expenses from bank statements (PDF, CSV, and text formats)
- **Custom Parsers**: Create and test custom statement parsers for your specific bank format
- **Account Management**: Manage multiple accounts and organize expenses by account
- **Spending Overview**: Visualize your spending patterns with summary views
- **User Profiles**: Manage profile settings and preferences

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for fast build and dev experience
- **React Router** for navigation
- **Supabase JS** for authentication and real-time updates
- **CSS Modules** for component-scoped styling

### Backend
- **Express.js** with TypeScript
- **Node.js** runtime
- **Supabase** for database and authentication
- **Python** integration for statement parsing

### Database
- **PostgreSQL** (via Supabase)
- SQL migrations for schema management
- Secure user authentication

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm 10+
- Python 3.8+ (for statement parsing features)
- A Supabase project and credentials

### Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
   - Create `.env.development` with your Supabase credentials
   - Backend and frontend will read their respective configs

4. Start development:
```bash
pnpm dev
```

This runs both the client (port 5173) and server concurrently.

### Build for Production

```bash
pnpm build
```

## Project Structure

```
├── src/                    # Frontend React application
│   ├── app/               # App root component and routes
│   ├── components/        # Reusable React components
│   ├── screens/           # Full-page screens
│   │   ├── Auth/         # Authentication screens
│   │   ├── Expenses/     # Expense management screens
│   │   ├── Home/         # Home/dashboard screen
│   │   └── Profile/      # User profile screen
│   ├── lib/              # Utilities and API helpers
│   ├── primitives/       # Basic UI primitives (Button, Input)
│   └── styles/           # Global stylesheets
├── server/                # Express backend server
├── database/              # Database schema and migrations
├── scripts/               # Utility scripts (expense parser tester)
├── package.json           # Project dependencies
└── vite.config.ts         # Vite configuration
```

## Development

### Available Scripts

```bash
# Start development (client + server)
pnpm dev

# Start only frontend
pnpm dev:client

# Start only backend
pnpm dev:server

# Build for production
pnpm build

# Preview production build
pnpm preview

# Test expense parser locally
pnpm test:parser
```

### Authentication Flow

The app uses Supabase for secure email-based authentication:
- Users sign up or log in with email
- OTP verification via email
- JWT-based session management
- Automatic token refresh

See [src/screens/Auth/](src/screens/Auth/) for the authentication screens.

## Expense Management

### Bank Statement Parser

The app includes a powerful expense parser that can extract transaction data from bank statements in multiple formats (PDF, CSV, text).

#### Local Testing

If your statement parsing looks incorrect in the UI, test the parser locally first:

```bash
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt
```

**Features:**
- Validates parser output shape and decimal amounts
- Checks for common issues (count/total mismatches, empty fields)
- Provides expense row preview
- Outputs full JSON for debugging

**Options:**
```bash
# PDF support (requires pypdf)
pip install pypdf
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.pdf

# Compare with expected output
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt --expected path/to/expected.json

# Control preview rows
python scripts/expense_parser_tester.py --parser path/to/my_parser.py --statement path/to/statement.txt --show 50
```

#### Creating a Custom Parser

Your parser must export a `parse_statement_text(statement_text)` function that returns a normalized expense structure. See the tester output for the expected JSON schema.

### Supported Statement Formats

- **PDF**: Bank statement PDFs (parsed via backend)
- **CSV**: Comma-separated values
- **TXT**: Plain text or tab-separated formats
- **JSON**: Pre-structured expense data

## Database

Database schema and migrations are stored in the [database/](database/) directory. Run migrations as part of your deployment process.

## Contributing

This is a personal finance project. For contributions or issues, please follow the standard Git workflow with clear commit messages.

## License

ISC

- parse_statement_text(statement_text: str) -> dict

Expected result keys:

- month: string
- expense_count: integer
- total_expenses_amount: decimal string (example: "1234.56")
- expenses: list of
	- date: string
	- description: string
	- amount: decimal string
