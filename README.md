# Finances

**Live App:** https://finances.lnks.info

A personal finance management platform for tracking expenses, monitoring account balances, organizing financial records, and visualizing financial history.

## Features

- **Secure Authentication**: Email-based sign-up and login (custom server auth, with legacy Supabase mode during migration)
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
- **Custom auth client** for server-managed sessions (legacy Supabase mode supported during migration)
- **CSS Modules** for component-scoped styling

### Backend
- **Express.js** with TypeScript
- **Node.js** runtime
- **Express.js API** with Neon Postgres and custom auth
- **Python** integration for statement parsing

### Database
- **PostgreSQL** (Neon)
- SQL migrations for schema management
- Secure user authentication

## Getting Started

### Prerequisites
- Node.js 18+ and pnpm 10+
- Python 3.8+ (for statement parsing features)
- A Neon Postgres database URL

### Installation

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
	- Create `.env.development` from `.env.development.example`
	- Set `DATABASE_URL` and `JWT_SECRET` for custom auth + Neon
	- Keep legacy Supabase values only while migrating remaining data flows

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
├── frontend/               # Frontend React application
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
```

### Development Workflow

This project follows a lightweight issue-driven workflow:

1. Ideas
2. Issues
3. Sub-issues (optional)
4. Branch
5. Development
6. Commit(s)
7. PR
8. Squash merge
9. Delete branch

Optional release step:

- Tag commits for release versions when needed.

### Authentication Flow

The app supports a migration-safe auth strategy:
- Users sign up or log in with email
- OTP verification via email
- Server-managed JWT session cookie
- Legacy Supabase mode toggle with `VITE_AUTH_MODE=legacy-supabase`

See [frontend/screens/Auth/](frontend/screens/Auth/) for the authentication screens.

## Expense Management

### Bank Statement Parser

The app includes a powerful expense parser that can extract transaction data from bank statements in multiple formats (PDF, CSV, text).

#### Testing Parsers In The UI

Use the built-in parser test flow in the Expenses screen:

1. Go to Expenses > Manage.
2. Select an account.
3. Open Parser.
4. Click Test Parser.
5. Upload a statement file and review the grouped results.

This uses the same frontend + backend execution path as normal statement parsing.
#### Testing Parsers In The UI

Use the built-in parser test flow in the Expenses screen:

1. Go to Expenses > Manage.
2. Select an account.
3. Open Parser.
4. Click Test Parser.
5. Upload a statement file and review the grouped results.

This uses the same frontend + backend execution path as normal statement parsing.

#### Creating a Custom Parser

Your parser must export a `parse_statement_text(statement_text)` function that returns a normalized expense structure compatible with the parser test modal and statement parsing endpoints.
Your parser must export a `parse_statement_text(statement_text)` function that returns a normalized expense structure compatible with the parser test modal and statement parsing endpoints.

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
