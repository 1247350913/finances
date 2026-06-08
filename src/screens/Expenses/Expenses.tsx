import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS } from "../../lib";
import { supabase } from "../../lib/supabaseClient";
import exampleParserSource from "./example_expense_parser.py?raw";
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
  account_id: string;
  statement_date: string;
  file_name: string;
  file_data_url: string;
  parsed_result: string | null;
};

type ParsedExpenseItem = {
  description: string;
  amount: number;
};

type ParsedStatementSummary = {
  total: number;
  items: ParsedExpenseItem[];
};

type AddAccountForm = {
  name: string;
  last4: string;
};

type EditAccountForm = {
  id: string;
  name: string;
  last4: string;
  cardImageDataUrl: string | null;
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
  const [allStatements, setAllStatements] = useState<AccountStatement[]>([]);
  const [statements, setStatements] = useState<AccountStatement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatementSaving, setIsStatementSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isStatementUploadOpen, setIsStatementUploadOpen] = useState(false);
  const [manageActiveAccountId, setManageActiveAccountId] = useState<string | null>(null);
  const [managePanel, setManagePanel] = useState<"parser" | "statements" | null>(null);
  const [manageParserTab, setManageParserTab] = useState<"current" | "example">("current");
  const [isManageParserSaving, setIsManageParserSaving] = useState(false);
  const [manageStatements, setManageStatements] = useState<AccountStatement[]>([]);
  const [isManageStatementSaving, setIsManageStatementSaving] = useState(false);
  const [manageStatementDate, setManageStatementDate] = useState("");
  const [manageStatementFile, setManageStatementFile] = useState<File | null>(null);
  const [isManageUploadOpen, setIsManageUploadOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<EditAccountForm | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editCardImageFile, setEditCardImageFile] = useState<File | null>(null);
  const [editParserFile, setEditParserFile] = useState<File | null>(null);
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

  const activeManageAccount = useMemo(
    () => accounts.find((account) => account.id === manageActiveAccountId) ?? null,
    [accounts, manageActiveAccountId]
  );

  const manageStatementsByYearMonth = useMemo(() => {
    const map = new Map<number, Map<number, AccountStatement>>();
    for (const stmt of manageStatements) {
      const d = new Date(`${stmt.statement_date}T00:00:00`);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (!map.has(year)) map.set(year, new Map());
      map.get(year)!.set(month, stmt);
    }
    return map;
  }, [manageStatements]);

  const manageStatementYears = useMemo(() => {
    const years = [...manageStatementsByYearMonth.keys()].sort((a, b) => a - b);
    return years;
  }, [manageStatementsByYearMonth]);

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (mode !== "read") return;
    if (accounts.length === 0) {
      setAllStatements([]);
      return;
    }

    void loadAllStatements(accounts.map((account) => account.id));
  }, [mode, accounts]);

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
        .eq("archived", false)
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
        .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
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

  async function loadAllStatements(accountIds: string[]) {
    try {
      setErrorMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("account_statements")
        .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
        .eq("user_id", userData.user.id)
        .in("account_id", accountIds)
        .order("statement_date", { ascending: true });

      if (error) throw error;
      setAllStatements(data ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load statement summaries.");
    }
  }

  async function handleEditAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAccount) return;

    const name = editAccount.name.trim();
    const last4 = editAccount.last4.trim();

    if (name.length === 0) {
      setErrorMessage("Account name is required.");
      return;
    }
    if (last4.length > 0 && !/^\d{4}$/.test(last4)) {
      setErrorMessage("Last 4 must be exactly 4 digits.");
      return;
    }

    try {
      setIsEditSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const updatePayload: Record<string, any> = {
        name,
        institution: last4.length > 0 ? last4 : null,
      };

      if (editCardImageFile) {
        updatePayload.card_image_data_url = await readFileAsDataUrl(editCardImageFile);
      }
      if (editParserFile) {
        updatePayload.parser_file_name = editParserFile.name;
        updatePayload.parser_source = await readFileAsText(editParserFile);
      }

      const { error } = await supabase
        .from("accounts")
        .update(updatePayload)
        .eq("id", editAccount.id);

      if (error) throw error;

      setEditAccount(null);
      setEditCardImageFile(null);
      setEditParserFile(null);
      setStatusMessage("Account updated.");
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not update account.");
    } finally {
      setIsEditSaving(false);
    }
  }

  async function handleArchiveAccount(accountId: string) {
    try {
      setIsEditSaving(true);
      setErrorMessage(null);

      const { error } = await supabase
        .from("accounts")
        .update({ archived: true })
        .eq("id", accountId);

      if (error) throw error;

      setEditAccount(null);
      setStatusMessage("Account archived.");
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not archive account.");
    } finally {
      setIsEditSaving(false);
    }
  }

  async function handleDeleteAccount(accountId: string) {
    if (!window.confirm("Permanently delete this account and all its data? This cannot be undone.")) return;

    try {
      setIsEditSaving(true);
      setErrorMessage(null);

      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", accountId);

      if (error) throw error;

      setEditAccount(null);
      setStatusMessage("Account deleted.");
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not delete account.");
    } finally {
      setIsEditSaving(false);
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

    const statementDateValue = monthToStatementDate(statementDate);

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
        .eq("statement_date", statementDateValue)
        .limit(1);

      if (existingError) throw existingError;

      if ((existing ?? []).length > 0) {
        const shouldReplace = window.confirm("A statement already exists for that month. Replace it?");
        if (!shouldReplace) {
          setStatusMessage("Upload canceled.");
          return;
        }
      }

      const fileDataUrl = await readFileAsDataUrl(statementFile);

      const statementPayload = {
        user_id: userData.user.id,
        account_id: selectedAccount.id,
        statement_date: statementDateValue,
        file_name: statementFile.name,
        file_data_url: fileDataUrl,
      };

      const { error } = await supabase
        .from("account_statements")
        .upsert(statementPayload, { onConflict: "account_id,statement_date" });

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

  async function handleManageParserFileReplace(file: File) {
    if (!activeManageAccount) return;

    try {
      setIsManageParserSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const parserSource = await readFileAsText(file);

      const { error } = await supabase
        .from("accounts")
        .update({
          parser_file_name: file.name,
          parser_source: parserSource,
        })
        .eq("id", activeManageAccount.id);

      if (error) throw error;

      setStatusMessage("Parser file replaced.");
      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not replace parser file.");
    } finally {
      setIsManageParserSaving(false);
    }
  }

  function toggleManageParser(accountId: string) {
    if (managePanel === "parser" && manageActiveAccountId === accountId) {
      setManagePanel(null);
      setManageActiveAccountId(null);
      return;
    }
    setManageActiveAccountId(accountId);
    setManagePanel("parser");
    setManageParserTab("current");
  }

  function toggleManageStatements(accountId: string) {
    if (managePanel === "statements" && manageActiveAccountId === accountId) {
      setManagePanel(null);
      setManageActiveAccountId(null);
      setManageStatements([]);
      return;
    }
    setManageActiveAccountId(accountId);
    setManagePanel("statements");
    setManageStatements([]);
    void loadManageStatements(accountId);
  }

  async function loadManageStatements(accountId: string) {
    try {
      setErrorMessage(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");
      const { data, error } = await supabase
        .from("account_statements")
        .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
        .eq("user_id", userData.user.id)
        .eq("account_id", accountId)
        .order("statement_date", { ascending: true });
      if (error) throw error;
      setManageStatements(data ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load statements.");
    }
  }

  async function handleManageStatementUpload() {
    if (!activeManageAccount || !manageStatementDate || !manageStatementFile) return;
    const statementDateValue = monthToStatementDate(manageStatementDate);

    try {
      setIsManageStatementSaving(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { data: existing } = await supabase
        .from("account_statements")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("account_id", activeManageAccount.id)
        .eq("statement_date", statementDateValue)
        .limit(1);

      if ((existing ?? []).length > 0) {
        const shouldReplace = window.confirm("A statement already exists for that month. Replace it?");
        if (!shouldReplace) {
          setStatusMessage("Upload canceled.");
          return;
        }
      }

      const fileDataUrl = await readFileAsDataUrl(manageStatementFile);
      const fileText = await readFileAsText(manageStatementFile).catch(() => "");
      const parsedSummary = parseExpensesFromText(fileText);
      const parsed_result = JSON.stringify(parsedSummary);

      const statementPayload = {
        user_id: userData.user.id,
        account_id: activeManageAccount.id,
        statement_date: statementDateValue,
        file_name: manageStatementFile.name,
        file_data_url: fileDataUrl,
        parsed_result,
      };

      const { error } = await supabase
        .from("account_statements")
        .upsert(statementPayload, { onConflict: "account_id,statement_date" });

      if (error) throw error;

      setManageStatementDate("");
      setManageStatementFile(null);
      setIsManageUploadOpen(false);
      setStatusMessage("Statement uploaded and parsed.");
      await loadManageStatements(activeManageAccount.id);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not upload statement.");
    } finally {
      setIsManageStatementSaving(false);
    }
  }

  const readSummary = useMemo(() => {
    const monthsSet = new Set<string>();
    const byAccountMonth = new Map<string, Map<string, ParsedStatementSummary>>();

    for (const statement of allStatements) {
      const monthKey = statement.statement_date.slice(0, 7);
      monthsSet.add(monthKey);

      const parsed = parseStatementExpenseSummary(statement.file_name, statement.file_data_url);
      if (!parsed) continue;

      const accountMap = byAccountMonth.get(statement.account_id) ?? new Map<string, ParsedStatementSummary>();
      const existing = accountMap.get(monthKey);

      if (!existing) {
        accountMap.set(monthKey, parsed);
      } else {
        accountMap.set(monthKey, {
          total: existing.total + parsed.total,
          items: [...existing.items, ...parsed.items],
        });
      }

      byAccountMonth.set(statement.account_id, accountMap);
    }

    const months = [...monthsSet].sort();
    const totalsByMonth = new Map<string, number>();

    for (const month of months) {
      let total = 0;
      for (const account of accounts) {
        total += byAccountMonth.get(account.id)?.get(month)?.total ?? 0;
      }
      totalsByMonth.set(month, total);
    }

    return {
      months,
      byAccountMonth,
      totalsByMonth,
    };
  }, [accounts, allStatements]);

  return (
    <div className={styles.pageShell}>
      <main className={styles.main}>
        <header className={styles.subnav}>
          <Link className={styles.backLink} to="/home" aria-label="Home">
            Home
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
                Manage Expenses
              </Link>
            )}

            {mode !== "read" && (
              <Link className={styles.manageButton} to="/expenses">
                Done
              </Link>
            )}
          </div>

          {mode === "read" && (
            <>
              <div className={styles.readToolbar}>
                <span className={styles.allTimePill}>All Time</span>
              </div>

              {readSummary.months.length === 0 && !isLoading && (
                <p className={styles.emptyState}>No statement months yet. Upload statements to see monthly breakdowns.</p>
              )}

              {readSummary.months.length > 0 && (
                <div className={styles.expenseScroller}>
                  <div className={styles.expenseGrid} style={{ gridTemplateColumns: `160px repeat(${readSummary.months.length}, minmax(230px, 1fr))` }}>
                    <div className={styles.gridHeaderCell}>
                      {readSummary.months[0]?.slice(0, 4) ?? ""}
                    </div>
                    {readSummary.months.map((month) => (
                      <div className={styles.gridHeaderCell} key={month}>{formatMonthLabel(month)}</div>
                    ))}

                    <div className={styles.rowTitle}>total</div>
                    {readSummary.months.map((month) => (
                      <div className={styles.totalCell} key={`total-${month}`}>
                        {formatAmount(readSummary.totalsByMonth.get(month) ?? 0)}
                      </div>
                    ))}

                    {accounts.map((account) => (
                      <Fragment key={`summary-${account.id}`}>
                        <div className={styles.rowTitle}>{account.name}</div>
                        {readSummary.months.map((month) => {
                          const summary = readSummary.byAccountMonth.get(account.id)?.get(month);

                          return (
                            <div className={styles.accountMonthCell} key={`${account.id}-${month}`}>
                              <div className={styles.accountMonthTotal}>{formatAmount(summary?.total ?? 0)}</div>
                              <ul className={styles.accountItemList}>
                                {(summary?.items ?? []).slice(0, 6).map((item, index) => (
                                  <li key={`${account.id}-${month}-${index}`}>
                                    <span>{item.description}</span>
                                    <span>{formatAmount(item.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {mode !== "read" && <div className={styles.cardsGrid}>
            {accounts.map((account) => {
              const query = `?account=${encodeURIComponent(account.id)}`;
              const isActiveParserCard = mode === "manage" && managePanel === "parser" && manageActiveAccountId === account.id;
              const isActiveStatementsCard = mode === "manage" && managePanel === "statements" && manageActiveAccountId === account.id;
              const isInactiveManageCard = mode === "manage" && managePanel !== null && manageActiveAccountId !== account.id;
              const isAddModalFocused = mode === "manage" && isAddOpen;
              const isEditModalFocused = mode === "manage" && Boolean(editAccount);
              const isActiveEditCard = isEditModalFocused && editAccount?.id === account.id;
              const isInactiveByModal = isAddModalFocused || (isEditModalFocused && editAccount?.id !== account.id);
              const isActiveCard = isActiveParserCard || isActiveStatementsCard || isActiveEditCard;
              const isInactiveCard = isInactiveManageCard || isInactiveByModal;

              return (
                <article
                  className={`${styles.accountCard} ${isActiveCard ? styles.activeCard : ""} ${isInactiveCard ? styles.inactiveCard : ""}`}
                  key={account.id}
                  onClick={() => {
                    if (mode === "manage" && managePanel !== "parser") {
                      setEditAccount({ id: account.id, name: account.name, last4: account.institution ?? "", cardImageDataUrl: account.card_image_data_url });
                      setEditCardImageFile(null);
                      setEditParserFile(null);
                    }
                  }}
                  style={mode === "manage" && managePanel !== "parser" ? { cursor: "pointer" } : undefined}
                >
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
                    {mode === "manage" ? (
                      <>
                        <button
                          type="button"
                          className={`${styles.parserModeLink} ${isActiveParserCard ? styles.parserModeLinkActive : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleManageParser(account.id);
                          }}
                        >
                          Parser
                        </button>
                        <button
                          type="button"
                          className={`${styles.parserModeLink} ${isActiveStatementsCard ? styles.parserModeLinkActive : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleManageStatements(account.id);
                          }}
                        >
                          Statements
                        </button>
                      </>
                    ) : (
                      <>
                        <Link to={`/expenses/parser${query}`}>Parser</Link>
                        <Link to={`/expenses/statements${query}`}>Statements</Link>
                      </>
                    )}
                  </div>
                </article>
              );
            })}

            {mode === "manage" && (
              <button
                className={`${styles.addTile} ${isAddOpen ? styles.activeCard : ""} ${managePanel !== null || Boolean(editAccount) ? styles.inactiveCard : ""}`}
                type="button"
                onClick={() => setIsAddOpen(true)}
                disabled={managePanel !== null || Boolean(editAccount)}
              >
                Add Account
              </button>
            )}
          </div>}

          {mode === "manage" && managePanel === "parser" && activeManageAccount && (
            <section className={styles.parserWorkbench}>
              <div className={styles.parserWorkbenchHeader}>
                <div className={styles.parserTabs}>
                  <button
                    type="button"
                    className={`${styles.parserTab} ${manageParserTab === "current" ? styles.parserTabActive : ""}`}
                    onClick={() => setManageParserTab("current")}
                  >
                    {activeManageAccount.parser_file_name ?? "parser.py"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.parserTab} ${manageParserTab === "example" ? styles.parserTabActive : ""}`}
                    onClick={() => setManageParserTab("example")}
                  >
                    example_expense_parser.py
                  </button>
                </div>

                <label className={styles.uploadNewButton}>
                  {isManageParserSaving ? "Uploading..." : "Upload New"}
                  <input
                    type="file"
                    accept=".py,.txt,.js,.ts"
                    disabled={isManageParserSaving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void handleManageParserFileReplace(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <pre className={styles.parserWorkbenchCode}>
                {manageParserTab === "current"
                  ? (activeManageAccount.parser_source ?? NO_PARSER_SOURCE_MESSAGE)
                  : exampleParserSource}
              </pre>
            </section>
          )}

          {mode === "manage" && managePanel === "statements" && activeManageAccount && (
            <section className={styles.statementsWorkbench}>
              <div className={styles.statementsWorkbenchHeader}>
                <span className={styles.statementsWorkbenchTitle}>
                  {activeManageAccount.name}
                  {activeManageAccount.institution ? ` ...${activeManageAccount.institution}` : ""}
                </span>
                <label className={styles.uploadNewButton}>
                  {isManageStatementSaving ? "Uploading..." : "Upload New"}
                  <input
                    type="file"
                    accept=".pdf,.csv,.txt,.xlsx,.xls"
                    disabled={isManageStatementSaving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setManageStatementFile(file);
                      setIsManageUploadOpen(true);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {manageStatementYears.length === 0 && (
                <p className={styles.statementsEmpty}>No statements uploaded yet.</p>
              )}

              {manageStatementYears.map((year) => {
                const monthsMap = manageStatementsByYearMonth.get(year)!;
                const ROW1 = [1, 2, 3, 4, 5, 6];
                const ROW2 = [7, 8, 9, 10, 11, 12];
                const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

                return (
                  <div className={styles.statementsYearBlock} key={year}>
                    <div className={styles.statementsYearLabel}>{year}</div>
                    {[ROW1, ROW2].map((row, rowIdx) => (
                      <div className={styles.statementsMonthRow} key={rowIdx}>
                        {row.map((month) => {
                          const stmt = monthsMap.get(month);
                          return (
                            <div className={styles.statementsMonthCell} key={month}>
                              <span className={styles.statementsMonthLabel}>{MONTH_SHORT[month - 1]}</span>
                              {stmt ? (
                                <button
                                  type="button"
                                  className={styles.statementThumbLink}
                                  title={stmt.file_name}
                                  onClick={() => openDataUrlInTab(stmt.file_data_url, stmt.file_name)}
                                >
                                  {stmt.file_data_url.startsWith("data:image") ? (
                                    <img
                                      className={styles.statementThumb}
                                      src={stmt.file_data_url}
                                      alt={stmt.file_name}
                                    />
                                  ) : (
                                    <div className={styles.statementThumbPdf}>
                                      <span>PDF</span>
                                      <small>{stmt.file_name.replace(/\.[^.]+$/, "")}</small>
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <div className={styles.statementThumbEmpty} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          )}

          {isManageUploadOpen && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload statement">
              <div className={styles.modal}>
                <label>
                  Month
                  <input
                    type="month"
                    value={manageStatementDate}
                    onChange={(event) => setManageStatementDate(event.target.value)}
                  />
                </label>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManageUploadOpen(false);
                      setManageStatementDate("");
                      setManageStatementFile(null);
                    }}
                    disabled={isManageStatementSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleManageStatementUpload()}
                    disabled={isManageStatementSaving || !manageStatementDate}
                  >
                    {isManageStatementSaving ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isLoading && accounts.length === 0 && mode !== "read" && (
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
              <span>Name <span className={styles.required}>*</span></span>
              <input
                type="text"
                value={addForm.name}
                onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Daily"
                autoFocus
                required
              />
            </label>

            <label>
              <span>Last 4 Digits <span className={styles.required}>*</span></span>
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
                required
              />
            </label>

            <label>
              Card Image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setCardImageFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label>
              <span>Parser File <span className={styles.required}>*</span></span>
              <input
                type="file"
                accept=".py,.txt,.js,.ts"
                onChange={(event) => setParserFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            <div className={styles.exampleParserRow}>
              <button
                type="button"
                className={styles.exampleParserOpen}
                onClick={() => openExampleParserInTab(exampleParserSource)}
              >
                example_expense_parser.py
              </button>
              <a
                className={styles.exampleParserDownload}
                href={buildTextDownloadHref(exampleParserSource)}
                download="example_expense_parser.py"
                title="Download example parser"
                aria-label="Download example parser"
              >
                ↓
              </a>
            </div>

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

      {editAccount && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Edit account">
          <form className={styles.modal} onSubmit={handleEditAccount}>
            <label>
              <span>Name <span className={styles.required}>*</span></span>
              <input
                type="text"
                value={editAccount.name}
                onChange={(event) => setEditAccount((prev) => prev ? { ...prev, name: event.target.value } : prev)}
                required
                autoFocus
              />
            </label>

            <label>
              <span>Last 4 Digits <span className={styles.required}>*</span></span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={editAccount.last4}
                onChange={(event) =>
                  setEditAccount((prev) =>
                    prev ? { ...prev, last4: event.target.value.replace(/[^0-9]/g, "") } : prev
                  )
                }
                required
              />
            </label>

            <label>
              Card Image
              {editAccount.cardImageDataUrl && !editCardImageFile && (
                <img
                  className={styles.editCardImagePreview}
                  src={editAccount.cardImageDataUrl}
                  alt="Current card image"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setEditCardImageFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className={styles.modalActions}>
              <div className={styles.modalActionsLeft}>
                <button
                  type="button"
                  className={styles.archiveButton}
                  onClick={() => handleArchiveAccount(editAccount.id)}
                  disabled={isEditSaving}
                >
                  Archive
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => handleDeleteAccount(editAccount.id)}
                  disabled={isEditSaving}
                >
                  Delete
                </button>
              </div>
              <div className={styles.modalActionsRight}>
                <button
                  type="button"
                  onClick={() => {
                    setEditAccount(null);
                    setEditCardImageFile(null);
                    setEditParserFile(null);
                  }}
                  disabled={isEditSaving}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isEditSaving}>
                  {isEditSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isStatementUploadOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Upload statement">
          <form className={styles.modal} onSubmit={handleStatementUpload}>
            <label>
              Month Picker
              <input
                type="month"
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

function buildTextDownloadHref(source: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(source)}`;
}

function openExampleParserInTab(source: string) {
  const blob = new Blob([source], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

function openDataUrlInTab(dataUrl: string, fileName: string) {
  const mime = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  const base64 = dataUrl.split(",")[1] ?? "";
  let binary: Uint8Array;
  try {
    const raw = atob(base64);
    binary = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      binary[i] = raw.charCodeAt(i);
    }
  } catch {
    window.open(dataUrl, "_blank");
    return;
  }
  const blob = new Blob([binary.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function monthToStatementDate(value: string) {
  return `${value}-01`;
}

function formatMonthLabel(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
  });
}

function formatAmount(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseStatementExpenseSummary(fileName: string, fileDataUrl: string): ParsedStatementSummary | null {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".json")) {
    const text = decodeDataUrlText(fileDataUrl);
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      const expenses = Array.isArray(data.expenses) ? data.expenses : [];
      const items: ParsedExpenseItem[] = expenses
        .map((item: any) => ({
          description: String(item?.description ?? ""),
          amount: Number(item?.amount ?? 0),
        }))
        .filter((item: ParsedExpenseItem) => item.description.length > 0 && Number.isFinite(item.amount) && item.amount > 0);

      const totalFromFile = Number(data?.total_expenses_amount ?? 0);
      const total = Number.isFinite(totalFromFile) && totalFromFile > 0
        ? totalFromFile
        : items.reduce((sum, item) => sum + item.amount, 0);

      return {
        total,
        items,
      };
    } catch {
      return null;
    }
  }

  const text = decodeDataUrlText(fileDataUrl);
  if (!text) return null;

  return parseExpensesFromText(text);
}

function decodeDataUrlText(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?),(.*)$/);
  if (!match) return "";

  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  const isBase64 = /;base64/i.test(meta);

  try {
    const raw = isBase64 ? atob(payload) : decodeURIComponent(payload);
    return raw;
  } catch {
    return "";
  }
}

function parseExpensesFromText(text: string): ParsedStatementSummary {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const excluded = ["payment", "autopay", "refund", "credit", "reversal", "returned", "return"];
  const amountRegex = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g;
  const dateRegex = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;
  const items: ParsedExpenseItem[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (excluded.some((word) => lower.includes(word))) continue;

    const matches = line.match(amountRegex);
    if (!matches || matches.length === 0) continue;

    const rawAmount = matches[matches.length - 1].replace(/[$,]/g, "");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const withoutDate = line.replace(dateRegex, "").trim();
    const description = withoutDate.replace(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*$/, "").trim();

    items.push({
      description: description.length > 0 ? description : "Expense",
      amount,
    });
  }

  return {
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}
