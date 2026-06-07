import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS } from "../../lib";
import { supabase } from "../../lib/supabaseClient";
import styles from "./Expenses.module.css";

type ExpensesMode = "read" | "manage" | "parser" | "statements";

type ExpenseAccount = {
  id: string;
  name: string;
  institution: string | null;
  card_image_data_url: string | null;
  parser_file_name: string | null;
  parser_source: string | null;
};

type AccountStatement = {
  id: string;
  statement_date: string;
  file_name: string;
  file_data_url: string;
};

type AddAccountForm = {
  name: string;
  last4: string;
};

const INITIAL_ADD_FORM: AddAccountForm = {
  name: "",
  last4: "",
};

const NO_PARSER_SOURCE_MESSAGE = "No parser uploaded yet. Upload a parser file in Manage > Add Account.";

function makeCardBadge(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "--";
  return trimmed.slice(0, 2).toUpperCase();
}

export function ExpensesView({ mode }: { mode: ExpensesMode }) {
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [statements, setStatements] = useState<AccountStatement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatementSaving, setIsStatementSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isStatementUploadOpen, setIsStatementUploadOpen] = useState(false);
  const [statementDate, setStatementDate] = useState("");
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [addForm, setAddForm] = useState<AddAccountForm>(INITIAL_ADD_FORM);
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [parserFile, setParserFile] = useState<File | null>(null);
  const [searchParams] = useSearchParams();

  const selectedAccountId = searchParams.get("account");
  const selectedAccount = useMemo(() => {
    if (selectedAccountId) {
      const matched = accounts.find((account) => account.id === selectedAccountId);
      if (matched) return matched;
    }

    return accounts[0] ?? null;
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (mode !== "statements") return;
    if (!selectedAccount) {
      setStatements([]);
      return;
    }

    void loadStatements(selectedAccount.id);
  }, [mode, selectedAccount]);

  async function loadAccounts() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,institution,card_image_data_url,parser_file_name,parser_source")
        .eq("user_id", userData.user.id)
        .eq("account_type", "expense")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAccounts(data ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load expense accounts.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = addForm.name.trim();
    const last4 = addForm.last4.trim();

    if (name.length === 0) {
      setErrorMessage("Account name is required.");
      return;
    }

    if (last4.length > 0 && !/^\d{4}$/.test(last4)) {
      setErrorMessage("Last 4 must be exactly 4 digits.");
      return;
    }

    if (!parserFile) {
      setErrorMessage("A parser file is required for this account.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const cardImageDataUrl = cardImageFile ? await readFileAsDataUrl(cardImageFile) : null;
      const parserSource = await readFileAsText(parserFile);

      const { error } = await supabase.from("accounts").insert({
        user_id: userData.user.id,
        name,
        institution: last4.length > 0 ? last4 : null,
        account_type: "expense",
        card_image_data_url: cardImageDataUrl,
        parser_file_name: parserFile.name,
        parser_source: parserSource,
      });

      if (error) throw error;

      setAddForm(INITIAL_ADD_FORM);
      setCardImageFile(null);
      setParserFile(null);
      setIsAddOpen(false);
      setStatusMessage("Account added.");
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not add account.");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadStatements(accountId: string) {
    try {
      setErrorMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("account_statements")
        .select("id,statement_date,file_name,file_data_url")
        .eq("user_id", userData.user.id)
        .eq("account_id", accountId)
        .order("statement_date", { ascending: true });

      if (error) throw error;
      setStatements(data ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load statements.");
    }
  }

  async function handleStatementUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAccount) {
      setErrorMessage("Select an account first.");
      return;
    }

    if (!statementDate) {
      setErrorMessage("Choose a statement date.");
      return;
    }

    if (!statementFile) {
      setErrorMessage("Select a statement file.");
      return;
    }

    try {
      setIsStatementSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { data: existing, error: existingError } = await supabase
        .from("account_statements")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("account_id", selectedAccount.id)
        .eq("statement_date", statementDate)
        .limit(1);

      if (existingError) throw existingError;

      if ((existing ?? []).length > 0) {
        setErrorMessage("A statement already exists for that date.");
        return;
      }

      const fileDataUrl = await readFileAsDataUrl(statementFile);

      const { error } = await supabase.from("account_statements").insert({
        user_id: userData.user.id,
        account_id: selectedAccount.id,
        statement_date: statementDate,
        file_name: statementFile.name,
        file_data_url: fileDataUrl,
      });

      if (error) throw error;

      setStatementDate("");
      setStatementFile(null);
      setIsStatementUploadOpen(false);
      setStatusMessage("Statement uploaded.");
      await loadStatements(selectedAccount.id);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not upload statement.");
    } finally {
      setIsStatementSaving(false);
    }
  }

  return (
    <div className={styles.pageShell}>
      <main className={styles.main}>
        <header className={styles.subnav}>
          <Link className={styles.backLink} to="/home" aria-label="Back to Home">
            ←
          </Link>
          <Link className={styles.subnavLink} to="/overview">Overview</Link>
          <Link className={styles.subnavLink} to="/entry">Entry</Link>
          <Link className={styles.profileLink} to="/home" aria-label="Profile">
            <img className={styles.profileIcon} src={ASSETS.defaultProfileIcon} alt="" aria-hidden="true" />
          </Link>
        </header>

        <section className={styles.body}>
          <div className={styles.bannerRow}>
            <div className={styles.messageWrap}>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>

            {mode === "read" && (
              <Link className={styles.manageButton} to="/expenses/manage">
                Manage
              </Link>
            )}

            {mode !== "read" && (
              <Link className={styles.manageButton} to="/expenses">
                Done
              </Link>
            )}
          </div>

          <div className={styles.cardsGrid}>
            {accounts.map((account) => {
              const query = `?account=${encodeURIComponent(account.id)}`;

              return (
                <article className={styles.accountCard} key={account.id}>
                  <div className={styles.cardTop}>
                    <div>
                      <p className={styles.cardName}>{account.name}</p>
                      <p className={styles.cardDigits}>{account.institution ? `...${account.institution}` : "----"}</p>
                    </div>
                    <div className={styles.cardBadge}>
                      {account.card_image_data_url ? (
                        <img className={styles.cardBadgeImage} src={account.card_image_data_url} alt="" aria-hidden="true" />
                      ) : (
                        makeCardBadge(account.name)
                      )}
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    <Link to={`/expenses/parser${query}`}>Parser</Link>
                    <Link to={`/expenses/statements${query}`}>Statements</Link>
                  </div>
                </article>
              );
            })}

            {mode === "manage" && (
              <button className={styles.addTile} type="button" onClick={() => setIsAddOpen(true)}>
                Add Account
              </button>
            )}
          </div>

          {!isLoading && accounts.length === 0 && mode === "read" && (
            <p className={styles.emptyState}>No accounts yet. Click Manage to add one.</p>
          )}

          {isLoading && <p className={styles.emptyState}>Loading accounts...</p>}

          {mode === "parser" && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>
                  {selectedAccount
                    ? `${selectedAccount.name} ${selectedAccount.parser_file_name ?? "parser.py"}`
                    : "parser.py"}
                </h2>
              </div>

              <pre className={styles.codeBlock}>{selectedAccount?.parser_source ?? NO_PARSER_SOURCE_MESSAGE}</pre>
            </section>
          )}

          {mode === "statements" && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>{selectedAccount ? `${selectedAccount.name} statements` : "Statements"}</h2>
                <button type="button" onClick={() => setIsStatementUploadOpen(true)}>Upload New</button>
              </div>

              <div className={styles.monthGrid}>
                {statements.map((statement) => (
                  <article key={statement.id} className={styles.monthTile}>
                    <span>{new Date(`${statement.statement_date}T00:00:00`).toLocaleDateString()}</span>
                    <a className={styles.statementFileLink} href={statement.file_data_url} download={statement.file_name}>
                      {statement.file_name}
                    </a>
                  </article>
                ))}
                {statements.length === 0 && <p className={styles.emptyState}>No statements uploaded yet.</p>}
              </div>
            </section>
          )}
        </section>
      </main>

      {isAddOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Add account">
          <form className={styles.modal} onSubmit={handleAddAccount}>
            <label>
              Name
              <input
                type="text"
                value={addForm.name}
                onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Daily"
                autoFocus
              />
            </label>

            <label>
              Last 4 Digits
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={addForm.last4}
                onChange={(event) =>
                  setAddForm((prev) => ({
                    ...prev,
                    last4: event.target.value.replace(/[^0-9]/g, ""),
                  }))
                }
                placeholder="1023"
              />
            </label>

            <label>
              Card Image (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setCardImageFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label>
              Parser File (required)
              <input
                type="file"
                accept=".py,.txt,.js,.ts"
                onChange={(event) => setParserFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            <p className={styles.fieldHint}>
              Upload parser files from shared/parsers/example_expense_parser.py or your own custom parser.
            </p>

            <div className={styles.modalActions}>
              <button type="button" onClick={() => setIsAddOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Adding..." : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isStatementUploadOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload statement">
          <form className={styles.modal} onSubmit={handleStatementUpload}>
            <label>
              Date Picker
              <input
                type="date"
                value={statementDate}
                onChange={(event) => setStatementDate(event.target.value)}
                required
              />
            </label>

            <label>
              File Select
              <input
                type="file"
                accept=".pdf,.csv,.txt,.xlsx,.xls"
                onChange={(event) => setStatementFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setIsStatementUploadOpen(false);
                  setStatementDate("");
                  setStatementFile(null);
                }}
                disabled={isStatementSaving}
              >
                Cancel
              </button>
              <button type="submit" disabled={isStatementSaving}>
                {isStatementSaving ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </div>
      )}

      <Footer />
    </div>
  );
}

export function Expenses() {
  return <ExpensesView mode="read" />;
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read file: ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
