import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS, apiUrl, authClient } from "../../lib";
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

type ParsedExpenseGroup = {
  description: string;
  amount: number;
  transactions: ParsedExpenseItem[];
};

type ParsedStatementSummary = {
  total: number;
  groups: ParsedExpenseGroup[];
};

type AmountDisplayMode = "decimal" | "rounded";

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
const PREVIEW_GROUP_LIMIT = 8;

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
  const [isReadSummaryLoading, setIsReadSummaryLoading] = useState(false);
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
  const [isParserTestOpen, setIsParserTestOpen] = useState(false);
  const [parserTestFile, setParserTestFile] = useState<File | null>(null);
  const [isParserTestRunning, setIsParserTestRunning] = useState(false);
  const [parserTestResult, setParserTestResult] = useState<ParsedStatementSummary | null>(null);
  const [parserTestError, setParserTestError] = useState<string | null>(null);
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
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [isAccountsFilterOpen, setIsAccountsFilterOpen] = useState(false);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [isVendorFilterOpen, setIsVendorFilterOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [amountDisplayMode, setAmountDisplayMode] = useState<AmountDisplayMode>("decimal");
  const [readMonthDetailMonthKey, setReadMonthDetailMonthKey] = useState<string | null>(null);
  const [expandedReadGroupKeys, setExpandedReadGroupKeys] = useState<string[]>([]);
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
    if (mode !== "read") {
      setIsReadSummaryLoading(false);
      return;
    }

    if (accounts.length === 0) {
      setAllStatements([]);
      setIsReadSummaryLoading(isLoading);
      return;
    }

    void loadAllStatements(accounts.map((account) => account.id));
  }, [mode, accounts, isLoading]);

  useEffect(() => {
    if (mode !== "statements") return;
    if (!selectedAccount) {
      setStatements([]);
      return;
    }

    void loadStatements(selectedAccount.id);
  }, [mode, selectedAccount]);

  useEffect(() => {
    setIsParserTestOpen(false);
    setParserTestFile(null);
    setParserTestResult(null);
    setParserTestError(null);
  }, [manageActiveAccountId, managePanel]);

  useEffect(() => {
    setExpandedReadGroupKeys([]);
  }, [readMonthDetailMonthKey]);

  async function fetchCustom<T = any>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(apiUrl(path), {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 401) {
      throw new Error("Please sign in again.");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error ?? payload?.message ?? "Request failed."));
    }

    return payload as T;
  }

  async function getCurrentUserId() {
    if (authClient.mode === "custom") {
      const session = await authClient.getSession();
      if (!session) throw new Error("Please sign in again.");
      return session.userId;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Please sign in again.");
    return userData.user.id;
  }

  async function loadAccounts() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ data?: ExpenseAccount[] }>("/api/expenses/accounts", {
          method: "GET",
        });
        setAccounts(payload.data ?? []);
      } else {
        const userId = await getCurrentUserId();

        const { data, error } = await supabase
          .from("accounts")
          .select("id,name,institution,card_image_data_url,parser_file_name,parser_source")
          .eq("user_id", userId)
          .eq("account_type", "expense")
          .eq("archived", false)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setAccounts(data ?? []);
      }
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

      const cardImageDataUrl = cardImageFile ? await readFileAsDataUrl(cardImageFile) : null;
      const parserSource = await readFileAsText(parserFile);

      if (authClient.mode === "custom") {
        await fetchCustom("/api/expenses/accounts", {
          method: "POST",
          body: JSON.stringify({
            name,
            institution: last4.length > 0 ? last4 : null,
            card_image_data_url: cardImageDataUrl,
            parser_file_name: parserFile.name,
            parser_source: parserSource,
          }),
        });
      } else {
        const userId = await getCurrentUserId();

        const { error } = await supabase.from("accounts").insert({
          user_id: userId,
          name,
          institution: last4.length > 0 ? last4 : null,
          account_type: "expense",
          card_image_data_url: cardImageDataUrl,
          parser_file_name: parserFile.name,
          parser_source: parserSource,
        });

        if (error) throw error;
      }

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

      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ data?: AccountStatement[] }>(
          `/api/expenses/statements?accountId=${encodeURIComponent(accountId)}`,
          { method: "GET" }
        );
        setStatements(payload.data ?? []);
      } else {
        const userId = await getCurrentUserId();

        const { data, error } = await supabase
          .from("account_statements")
          .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .order("statement_date", { ascending: true });

        if (error) throw error;
        setStatements(data ?? []);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load statements.");
    }
  }

  async function loadAllStatements(accountIds: string[]) {
    try {
      setIsReadSummaryLoading(true);
      setErrorMessage(null);

      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ data?: AccountStatement[] }>(
          `/api/expenses/statements?accountIds=${encodeURIComponent(accountIds.join(","))}`,
          { method: "GET" }
        );
        setAllStatements(payload.data ?? []);
      } else {
        const userId = await getCurrentUserId();

        const { data, error } = await supabase
          .from("account_statements")
          .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
          .eq("user_id", userId)
          .in("account_id", accountIds)
          .order("statement_date", { ascending: true });

        if (error) throw error;
        setAllStatements(data ?? []);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load statement summaries.");
    } finally {
      setIsReadSummaryLoading(false);
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

      if (authClient.mode === "custom") {
        await fetchCustom(`/api/expenses/accounts/${encodeURIComponent(editAccount.id)}`, {
          method: "PATCH",
          body: JSON.stringify(updatePayload),
        });
      } else {
        const { error } = await supabase
          .from("accounts")
          .update(updatePayload)
          .eq("id", editAccount.id);

        if (error) throw error;
      }

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

      if (authClient.mode === "custom") {
        await fetchCustom(`/api/expenses/accounts/${encodeURIComponent(accountId)}/archive`, {
          method: "PATCH",
        });
      } else {
        const { error } = await supabase
          .from("accounts")
          .update({ archived: true })
          .eq("id", accountId);

        if (error) throw error;
      }

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

      if (authClient.mode === "custom") {
        await fetchCustom(`/api/expenses/accounts/${encodeURIComponent(accountId)}`, {
          method: "DELETE",
        });
      } else {
        const { error } = await supabase
          .from("accounts")
          .delete()
          .eq("id", accountId);

        if (error) throw error;
      }

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

      let existingCount = 0;
      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ exists?: boolean }>(
          `/api/expenses/statements/existing?accountId=${encodeURIComponent(selectedAccount.id)}&statementDate=${encodeURIComponent(statementDateValue)}`,
          { method: "GET" }
        );
        existingCount = payload.exists ? 1 : 0;
      } else {
        const userId = await getCurrentUserId();
        const { data: existing, error: existingError } = await supabase
          .from("account_statements")
          .select("id")
          .eq("user_id", userId)
          .eq("account_id", selectedAccount.id)
          .eq("statement_date", statementDateValue)
          .limit(1);

        if (existingError) throw existingError;
        existingCount = (existing ?? []).length;
      }

      if (existingCount > 0) {
        const shouldReplace = window.confirm("A statement already exists for that month. Replace it?");
        if (!shouldReplace) {
          setStatusMessage("Upload canceled.");
          return;
        }
      }

      const fileDataUrl = await readFileAsDataUrl(statementFile);
      const parsedSummary = await parseStatementFile(statementFile, fileDataUrl, selectedAccount.parser_source ?? undefined);
      const parsed_result = JSON.stringify(parsedSummary);

      const statementPayload = {
        account_id: selectedAccount.id,
        statement_date: statementDateValue,
        file_name: statementFile.name,
        file_data_url: fileDataUrl,
        parsed_result,
      };

      if (authClient.mode === "custom") {
        await fetchCustom("/api/expenses/statements", {
          method: "PUT",
          body: JSON.stringify(statementPayload),
        });
      } else {
        const userId = await getCurrentUserId();
        const { error } = await supabase
          .from("account_statements")
          .upsert({ ...statementPayload, user_id: userId }, { onConflict: "account_id,statement_date" });

        if (error) throw error;
      }

      setStatementDate("");
      setStatementFile(null);
      setIsStatementUploadOpen(false);
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

      if (authClient.mode === "custom") {
        await fetchCustom(`/api/expenses/accounts/${encodeURIComponent(activeManageAccount.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            parser_file_name: file.name,
            parser_source: parserSource,
          }),
        });
      } else {
        const { error } = await supabase
          .from("accounts")
          .update({
            parser_file_name: file.name,
            parser_source: parserSource,
          })
          .eq("id", activeManageAccount.id);

        if (error) throw error;
      }

      const reparseResult = await reparseExistingStatementsForAccount(activeManageAccount.id, parserSource);
      if (reparseResult.failedCount > 0) {
        setErrorMessage(
          `Parser was replaced, but ${reparseResult.failedCount} statement(s) could not be re-parsed.`
        );
      }

      await loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not replace parser file.");
    } finally {
      setIsManageParserSaving(false);
    }
  }

  async function reparseExistingStatementsForAccount(accountId: string, parserSource: string) {
    let statements: Array<{ id: string; file_name: string; file_data_url: string }> = [];
    if (authClient.mode === "custom") {
      const payload = await fetchCustom<{ data?: Array<{ id: string; file_name: string; file_data_url: string }> }>(
        `/api/expenses/statements?accountId=${encodeURIComponent(accountId)}`,
        { method: "GET" }
      );
      statements = payload.data ?? [];
    } else {
      const userId = await getCurrentUserId();
      const { data: statementsData, error: statementsError } = await supabase
        .from("account_statements")
        .select("id,file_name,file_data_url")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("statement_date", { ascending: true });

      if (statementsError) throw statementsError;
      statements = statementsData ?? [];
    }

    let failedCount = 0;

    for (const statement of statements) {
      try {
        const parsedSummary = await runCustomParserTest(
          parserSource,
          statement.file_name,
          statement.file_data_url
        );

        if (authClient.mode === "custom") {
          await fetchCustom(`/api/expenses/statements/${encodeURIComponent(statement.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ parsed_result: JSON.stringify(parsedSummary) }),
          });
        } else {
          const userId = await getCurrentUserId();
          const { error: updateError } = await supabase
            .from("account_statements")
            .update({ parsed_result: JSON.stringify(parsedSummary) })
            .eq("id", statement.id)
            .eq("user_id", userId);

          if (updateError) throw updateError;
        }
      } catch (error) {
        console.error("Failed to re-parse statement", statement.id, error);
        failedCount += 1;
      }
    }

    return { failedCount };
  }

  async function handleRunManageParserTest() {
    if (!activeManageAccount) return;
    if (!activeManageAccount.parser_source) {
      setParserTestError("Upload a parser file first.");
      return;
    }
    if (!parserTestFile) {
      setParserTestError("Choose a statement file first.");
      return;
    }

    try {
      setIsParserTestRunning(true);
      setParserTestError(null);
      setStatusMessage(null);

      const fileDataUrl = await readFileAsDataUrl(parserTestFile);
      const parsedSummary = await runCustomParserTest(
        activeManageAccount.parser_source,
        parserTestFile.name,
        fileDataUrl
      );

      setParserTestResult(parsedSummary);
    } catch (err: any) {
      console.error(err);
      setParserTestResult(null);
      setParserTestError(err.message ?? "Could not run parser test.");
    } finally {
      setIsParserTestRunning(false);
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
      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ data?: AccountStatement[] }>(
          `/api/expenses/statements?accountId=${encodeURIComponent(accountId)}`,
          { method: "GET" }
        );
        setManageStatements(payload.data ?? []);
      } else {
        const userId = await getCurrentUserId();
        const { data, error } = await supabase
          .from("account_statements")
          .select("id,account_id,statement_date,file_name,file_data_url,parsed_result")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .order("statement_date", { ascending: true });
        if (error) throw error;
        setManageStatements(data ?? []);
      }
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

      let existingCount = 0;
      if (authClient.mode === "custom") {
        const payload = await fetchCustom<{ exists?: boolean }>(
          `/api/expenses/statements/existing?accountId=${encodeURIComponent(activeManageAccount.id)}&statementDate=${encodeURIComponent(statementDateValue)}`,
          { method: "GET" }
        );
        existingCount = payload.exists ? 1 : 0;
      } else {
        const userId = await getCurrentUserId();
        const { data: existing } = await supabase
          .from("account_statements")
          .select("id")
          .eq("user_id", userId)
          .eq("account_id", activeManageAccount.id)
          .eq("statement_date", statementDateValue)
          .limit(1);
        existingCount = (existing ?? []).length;
      }

      if (existingCount > 0) {
        const shouldReplace = window.confirm("A statement already exists for that month. Replace it?");
        if (!shouldReplace) {
          setStatusMessage("Upload canceled.");
          return;
        }
      }

      const fileDataUrl = await readFileAsDataUrl(manageStatementFile);
      const parsedSummary = await parseStatementFile(manageStatementFile, fileDataUrl, activeManageAccount.parser_source ?? undefined);
      const parsed_result = JSON.stringify(parsedSummary);

      const statementPayload = {
        account_id: activeManageAccount.id,
        statement_date: statementDateValue,
        file_name: manageStatementFile.name,
        file_data_url: fileDataUrl,
        parsed_result,
      };

      if (authClient.mode === "custom") {
        await fetchCustom("/api/expenses/statements", {
          method: "PUT",
          body: JSON.stringify(statementPayload),
        });
      } else {
        const userId = await getCurrentUserId();
        const { error } = await supabase
          .from("account_statements")
          .upsert({ ...statementPayload, user_id: userId }, { onConflict: "account_id,statement_date" });

        if (error) throw error;
      }

      setManageStatementDate("");
      setManageStatementFile(null);
      setIsManageUploadOpen(false);
      await loadManageStatements(activeManageAccount.id);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not upload statement.");
    } finally {
      setIsManageStatementSaving(false);
    }
  }

  const readSummary = useMemo(() => {
    const baseMonthsSet = new Set<string>();
    const baseByAccountMonth = new Map<string, Map<string, ParsedStatementSummary>>();

    for (const statement of allStatements) {
      const monthKey = statement.statement_date.slice(0, 7);
      baseMonthsSet.add(monthKey);

      const parsed = parseStatementExpenseSummary(statement);
      if (!parsed) continue;

      const accountMap = baseByAccountMonth.get(statement.account_id) ?? new Map<string, ParsedStatementSummary>();
      const existing = accountMap.get(monthKey);

      if (!existing) {
        accountMap.set(monthKey, parsed);
      } else {
        const mergedGroups = mergeGroupedExpenses(existing.groups, parsed.groups);
        accountMap.set(monthKey, {
          total: mergedGroups.reduce((sum, item) => sum + item.amount, 0),
          groups: mergedGroups,
        });
      }

      baseByAccountMonth.set(statement.account_id, accountMap);
    }

    const vendorNamesSet = new Set<string>();
    for (const accountMap of baseByAccountMonth.values()) {
      for (const summary of accountMap.values()) {
        for (const group of summary.groups) {
          vendorNamesSet.add(group.description);
        }
      }
    }

    const visibleAccounts = selectedAccountIds.length > 0
      ? accounts.filter((account) => selectedAccountIds.includes(account.id))
      : accounts;

    const vendorFilterSet = new Set(selectedVendors);
    const filteredByAccountMonth = new Map<string, Map<string, ParsedStatementSummary>>();
    const filteredMonthsSet = new Set<string>();

    for (const account of visibleAccounts) {
      const accountMap = baseByAccountMonth.get(account.id);
      if (!accountMap) continue;

      const nextAccountMap = new Map<string, ParsedStatementSummary>();
      for (const [monthKey, summary] of accountMap.entries()) {
        const groups = summary.groups.filter((group) => {
          if (vendorFilterSet.size === 0) return true;
          return vendorFilterSet.has(group.description);
        });
        if (groups.length === 0) continue;

        nextAccountMap.set(monthKey, {
          total: groups.reduce((sum, group) => sum + group.amount, 0),
          groups,
        });
        filteredMonthsSet.add(monthKey);
      }

      if (nextAccountMap.size > 0) {
        filteredByAccountMonth.set(account.id, nextAccountMap);
      }
    }

    const months = [...filteredMonthsSet].sort().filter((month) => {
      if (startMonth && month < startMonth) return false;
      if (endMonth && month > endMonth) return false;
      return true;
    });

    const totalsByMonth = new Map<string, number>();

    for (const month of months) {
      let total = 0;
      for (const account of visibleAccounts) {
        total += filteredByAccountMonth.get(account.id)?.get(month)?.total ?? 0;
      }
      totalsByMonth.set(month, total);
    }

    const yearsSet = new Set<number>();
    for (const month of months) {
      yearsSet.add(parseInt(month.slice(0, 4), 10));
    }
    const years = [...yearsSet].sort();

    return {
      visibleAccounts,
      months,
      years,
      byAccountMonth: filteredByAccountMonth,
      totalsByMonth,
      vendorNames: [...vendorNamesSet].sort((a, b) => a.localeCompare(b)),
    };
  }, [accounts, allStatements, endMonth, selectedAccountIds, selectedVendors, startMonth]);

  const visibleVendorOptions = useMemo(() => {
    const query = vendorSearch.trim().toLowerCase();
    if (!query) return readSummary.vendorNames;
    return readSummary.vendorNames.filter((name) => name.toLowerCase().includes(query));
  }, [readSummary.vendorNames, vendorSearch]);

  return (
    <div className={styles.pageShell}>
      <main className={styles.main}>
        <header className={styles.subnav}>
          <Link className={styles.backLink} to="/home" aria-label="Home">
            Home
          </Link>
          <Link className={styles.subnavLink} to="/overview">Overview</Link>
          <Link className={styles.subnavLink} to="/entry">Entry</Link>
          <Link className={styles.profileLink} to="/profile" aria-label="Profile">
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
              <div className={styles.readFiltersBar}>
                <div className={styles.filterItem}>
                  <button
                    type="button"
                    className={styles.filterButton}
                    onClick={() => {
                      setIsAccountsFilterOpen((prev) => !prev);
                      setIsDateFilterOpen(false);
                      setIsVendorFilterOpen(false);
                    }}
                  >
                    Accounts{selectedAccountIds.length > 0 ? ` (${selectedAccountIds.length})` : ""}
                  </button>
                  {isAccountsFilterOpen && (
                    <div className={styles.filterPanel}>
                      {accounts.map((account) => {
                        const checked = selectedAccountIds.includes(account.id);
                        return (
                          <label key={account.id} className={styles.filterCheckboxRow}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedAccountIds((prev) =>
                                  checked ? prev.filter((id) => id !== account.id) : [...prev, account.id]
                                );
                              }}
                            />
                            <span>{account.name}</span>
                          </label>
                        );
                      })}
                      <button
                        type="button"
                        className={styles.filterClearButton}
                        onClick={() => setSelectedAccountIds([])}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.filterItem}>
                  <button
                    type="button"
                    className={styles.filterButton}
                    onClick={() => {
                      setIsDateFilterOpen((prev) => !prev);
                      setIsAccountsFilterOpen(false);
                      setIsVendorFilterOpen(false);
                    }}
                  >
                    Date Range{startMonth || endMonth ? " (active)" : ""}
                  </button>
                  {isDateFilterOpen && (
                    <div className={styles.filterPanel}>
                      <label className={styles.readToolbarControl}>
                        <span>From</span>
                        <input
                          type="month"
                          value={startMonth}
                          onChange={(event) => setStartMonth(event.target.value)}
                        />
                      </label>
                      <label className={styles.readToolbarControl}>
                        <span>To</span>
                        <input
                          type="month"
                          value={endMonth}
                          onChange={(event) => setEndMonth(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.filterClearButton}
                        onClick={() => {
                          setStartMonth("");
                          setEndMonth("");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.filterItem}>
                  <button
                    type="button"
                    className={styles.filterButton}
                    onClick={() => {
                      setIsVendorFilterOpen((prev) => !prev);
                      setIsAccountsFilterOpen(false);
                      setIsDateFilterOpen(false);
                    }}
                  >
                    Vendor{selectedVendors.length > 0 ? ` (${selectedVendors.length})` : ""}
                  </button>
                  {isVendorFilterOpen && (
                    <div className={styles.filterPanel}>
                      <input
                        className={styles.vendorSearchInput}
                        type="text"
                        placeholder="Search vendor"
                        value={vendorSearch}
                        onChange={(event) => setVendorSearch(event.target.value)}
                      />
                      <div className={styles.vendorOptionsList}>
                        {visibleVendorOptions.map((vendor) => {
                          const checked = selectedVendors.includes(vendor);
                          return (
                            <label key={vendor} className={styles.filterCheckboxRow}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedVendors((prev) =>
                                    checked ? prev.filter((v) => v !== vendor) : [...prev, vendor]
                                  );
                                }}
                              />
                              <span>{vendor}</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className={styles.filterClearButton}
                        onClick={() => {
                          setSelectedVendors([]);
                          setVendorSearch("");
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.filterItem}>
                  <div className={styles.amountModeToggle}>
                    <button
                      type="button"
                      className={`${styles.amountModeButton} ${amountDisplayMode === "decimal" ? styles.amountModeButtonActive : ""}`}
                      onClick={() => setAmountDisplayMode("decimal")}
                    >
                      Decimal
                    </button>
                    <button
                      type="button"
                      className={`${styles.amountModeButton} ${amountDisplayMode === "rounded" ? styles.amountModeButtonActive : ""}`}
                      onClick={() => setAmountDisplayMode("rounded")}
                    >
                      Rounded
                    </button>
                  </div>
                </div>
              </div>

              {(isLoading || isReadSummaryLoading) && (
                <p className={styles.emptyState}>Loading statement months...</p>
              )}

              {readSummary.years.length === 0 && !isLoading && !isReadSummaryLoading && (
                <p className={styles.emptyState}>No statement months yet. Upload statements to see monthly breakdowns.</p>
              )}

              {readSummary.years.map((year) => {
                const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                const annualTotal = MONTHS.reduce((sum, monthNum) => {
                  const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
                  return sum + (readSummary.totalsByMonth.get(monthKey) ?? 0);
                }, 0);

                return (
                  <div className={styles.readYearBlock} key={year}>
                    <div className={styles.readYearHeader}>
                      <div className={styles.readYearLabel}>{year}</div>
                      <div className={`${styles.readMonthTotal} ${styles.readYearTotal}`}>{formatMonthOrAnnualTotal(annualTotal, amountDisplayMode)}</div>
                    </div>
                    <div className={styles.readMonthGrid}>
                      {MONTHS.map((monthNum) => {
                        const monthKey = `${year}-${String(monthNum).padStart(2, "0")}`;
                        const hasData = readSummary.months.includes(monthKey);

                        return (
                          <div
                            className={`${styles.readMonthCell} ${!hasData ? styles.readMonthCellEmpty : ""} ${hasData ? styles.readMonthCellClickable : ""}`}
                            key={monthNum}
                            onClick={() => {
                              if (!hasData) return;
                              setReadMonthDetailMonthKey(monthKey);
                            }}
                            role={hasData ? "button" : undefined}
                            tabIndex={hasData ? 0 : -1}
                            onKeyDown={(event) => {
                              if (!hasData) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setReadMonthDetailMonthKey(monthKey);
                              }
                            }}
                          >
                            <div className={styles.readMonthHeader}>
                              <div className={styles.readMonthLabel}>{MONTH_SHORT[monthNum - 1]}</div>
                              <div className={styles.readMonthTotal}>
                                {hasData ? formatMonthOrAnnualTotal(readSummary.totalsByMonth.get(monthKey) ?? 0, amountDisplayMode) : "-"}
                              </div>
                            </div>

                            {hasData && readSummary.visibleAccounts.map((account) => {
                              const summary = readSummary.byAccountMonth.get(account.id)?.get(monthKey);
                              if (!summary) return null;
                              return (
                                <div className={styles.readAccountBlock} key={account.id}>
                                  <div className={styles.readAccountHeader}>
                                    <div className={styles.readAccountName}>{account.name}</div>
                                    <div className={styles.readAccountTotal}>{formatAccountSubtotal(summary.total, amountDisplayMode)}</div>
                                  </div>
                                  <ul className={styles.accountItemList}>
                                    {summary.groups.slice(0, PREVIEW_GROUP_LIMIT).map((group, index) => (
                                      <li key={`${account.id}-${monthKey}-${index}`}>
                                        <div className={styles.groupSummaryRow}>
                                          <span className={styles.groupDescription}>{group.description}</span>
                                          <span className={styles.groupAmount}>{formatAmount(group.amount)}</span>
                                        </div>
                                      </li>
                                    ))}
                                    {summary.groups.length > PREVIEW_GROUP_LIMIT && (
                                      <li className={styles.readMonthMoreRow}>...</li>
                                    )}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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

                <div className={styles.parserWorkbenchActions}>
                  <button
                    type="button"
                    className={styles.parserTestLaunchButton}
                    onClick={() => setIsParserTestOpen(true)}
                  >
                    Test Parser
                  </button>

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

          {isParserTestOpen && activeManageAccount && (
            <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Test parser">
              <div className={`${styles.modal} ${styles.parserTestModal}`}>
                <div className={styles.parserTestModalHeader}>
                  <div>
                    <h3 className={styles.parserTestModalTitle}>Test Parser</h3>
                    <p className={styles.parserTestModalSubtitle}>
                      Choose a statement file, run the parser, and inspect the cleaned results.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.parserTestModalClose}
                    onClick={() => {
                      setIsParserTestOpen(false);
                      setParserTestFile(null);
                      setParserTestResult(null);
                      setParserTestError(null);
                    }}
                  >
                    Close
                  </button>
                </div>

                <div className={styles.parserTestModalControls}>
                  <label className={styles.parserTestFilePicker}>
                    Choose Statement
                    <input
                      type="file"
                      accept=".pdf,.csv,.txt,.json"
                      disabled={isParserTestRunning}
                      onChange={(event) => {
                        setParserTestFile(event.target.files?.[0] ?? null);
                        setParserTestResult(null);
                        setParserTestError(null);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className={styles.parserTestRunButton}
                    disabled={isParserTestRunning || !parserTestFile || !activeManageAccount.parser_source}
                    onClick={() => void handleRunManageParserTest()}
                  >
                    {isParserTestRunning ? "Running..." : "Run Test"}
                  </button>
                </div>

                <p className={styles.parserTestFileLabel}>
                  {parserTestFile ? `Selected: ${parserTestFile.name}` : "No statement selected"}
                </p>

                {parserTestError && <p className={styles.error}>{parserTestError}</p>}

                {parserTestResult && (
                  <div className={styles.parserTestResultWrap}>
                    <div className={styles.parserTestResultMeta}>
                      <span>Total transactions sum</span>
                      <strong>{formatAmount(parserTestResult.total)}</strong>
                    </div>

                    <table className={styles.parserTestTable}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parserTestResult.groups.map((group, index) => {
                          const isExpandable = group.transactions.length > 1;

                          return (
                            <tr key={`${group.description}-${index}`}>
                              <td>
                                {isExpandable ? (
                                  <details className={styles.parserTestDetails}>
                                    <summary>{group.description}</summary>
                                    <ul className={styles.parserTestDetailList}>
                                      {group.transactions.map((transaction, transactionIndex) => (
                                        <li key={`${group.description}-${transactionIndex}`}>
                                          <span>{transaction.description}</span>
                                          <span>{formatAmount(transaction.amount)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : (
                                  group.description
                                )}
                              </td>
                              <td>{formatAmount(group.amount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
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
            <p className={styles.emptyState}></p>
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

      {readMonthDetailMonthKey && (
        <div className={`${styles.modalOverlay} ${styles.readMonthDetailOverlay}`} role="dialog" aria-modal="true" aria-label="Month details">
          <div className={`${styles.modal} ${styles.readMonthDetailModal}`}>
            <div className={styles.readMonthDetailHeader}>
              <div className={styles.readMonthDetailHeaderMain}>
                <h3 className={styles.readMonthDetailTitle}>{formatMonthLabel(readMonthDetailMonthKey)}</h3>
                <div className={styles.readMonthDetailTotal}>{formatMonthOrAnnualTotal(readSummary.totalsByMonth.get(readMonthDetailMonthKey) ?? 0, amountDisplayMode)}</div>
              </div>
              <button
                type="button"
                className={styles.readMonthDetailCloseButton}
                onClick={() => setReadMonthDetailMonthKey(null)}
                aria-label="Close month details"
              >
                ×
              </button>
            </div>

            <div className={styles.readMonthDetailBody}>
              {readSummary.visibleAccounts.map((account) => {
                const summary = readSummary.byAccountMonth.get(account.id)?.get(readMonthDetailMonthKey);
                if (!summary) return null;

                return (
                  <div className={styles.readAccountBlock} key={`${readMonthDetailMonthKey}-${account.id}`}>
                    <div className={styles.readAccountHeader}>
                      <div className={styles.readAccountName}>{account.name}</div>
                      <div className={styles.readAccountTotal}>{formatAccountSubtotal(summary.total, amountDisplayMode)}</div>
                    </div>
                    <ul className={`${styles.accountItemList} ${styles.readMonthDetailList}`}>
                      {summary.groups.map((group, index) => (
                        <li key={`${account.id}-${readMonthDetailMonthKey}-modal-${index}`}>
                          {(() => {
                            const groupKey = `${account.id}-${readMonthDetailMonthKey}-${group.description}`;
                            const isExpandable = group.transactions.length > 1;
                            const isExpanded = expandedReadGroupKeys.includes(groupKey);

                            return (
                              <>
                                {isExpandable ? (
                                  <button
                                    type="button"
                                    className={styles.readDetailGroupToggleRow}
                                    onClick={() => {
                                      setExpandedReadGroupKeys((prev) =>
                                        prev.includes(groupKey)
                                          ? prev.filter((key) => key !== groupKey)
                                          : [...prev, groupKey]
                                      );
                                    }}
                                  >
                                    <span className={styles.readDetailGroupCaret}>{isExpanded ? "v" : ">"}</span>
                                    <span className={styles.groupDescription}>{group.description}</span>
                                    <span className={styles.groupAmount}>{formatAmount(group.amount)}</span>
                                  </button>
                                ) : (
                                  <div className={styles.readDetailGroupRow}>
                                    <span className={styles.readDetailGroupCaretPlaceholder} aria-hidden="true" />
                                    <span className={styles.groupDescription}>{group.description}</span>
                                    <span className={styles.groupAmount}>{formatAmount(group.amount)}</span>
                                  </div>
                                )}

                                {isExpandable && isExpanded && (
                                  <ul className={styles.groupTransactionsListIndented}>
                                    {group.transactions.map((tx, txIndex) => (
                                      <li className={styles.readDetailGroupChildRow} key={`${account.id}-${readMonthDetailMonthKey}-modal-${index}-${txIndex}`}>
                                        <span className={styles.readDetailGroupCaretPlaceholder} aria-hidden="true" />
                                        <span className={styles.groupDescription}>{tx.description}</span>
                                        <span className={styles.groupAmount}>{formatAmount(tx.amount)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
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

function formatAmountWhole(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function roundToNearest(value: number, step: number) {
  return Math.round(value / step) * step;
}

function formatAccountSubtotal(value: number, mode: AmountDisplayMode) {
  if (mode === "rounded") return formatAmountWhole(roundToNearest(value, 10));
  return formatAmount(value);
}

function formatMonthOrAnnualTotal(value: number, mode: AmountDisplayMode) {
  if (mode === "rounded") return formatAmountWhole(roundToNearest(value, 100));
  return formatAmount(value);
}

async function parseStatementFile(file: File, fileDataUrl: string, parserSource?: string): Promise<ParsedStatementSummary> {
  if (parserSource) {
    const parsed = await runCustomParserTest(parserSource, file.name, fileDataUrl);
    return parsed;
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    const parsedFromApi = await parseCapitalOneStatement(file.name, fileDataUrl);
    if (parsedFromApi) return parsedFromApi;
  }

  const text = await readFileAsText(file).catch(() => "");
  return parseExpensesFromText(text);
}

async function runCustomParserTest(
  parserSource: string,
  fileName: string,
  fileDataUrl: string
): Promise<ParsedStatementSummary> {
  const endpoint = apiUrl("/api/parse/custom-parser-test");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parserSource, fileName, fileDataUrl }),
    });
  } catch (error: any) {
    throw new Error(
      `Could not reach parser API (${endpoint}). Check backend URL, TLS (https), and CORS allowed origins. ${error?.message ?? ""}`.trim()
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message ?? `Could not run parser test (HTTP ${response.status}).`);
  }

  const normalized = normalizeParserTestSummary(data?.parsed);
  if (!normalized) {
    throw new Error(
      "Parser output format is unsupported. Return groups[] or expenses[] with description and amount."
    );
  }

  return normalized;
}

async function parseCapitalOneStatement(fileName: string, fileDataUrl: string): Promise<ParsedStatementSummary | null> {
  const endpoint = apiUrl("/api/parse/capital-one");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, fileDataUrl }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return coerceParsedSummary(data?.parsed);
  } catch (error) {
    console.error(`Could not reach parser API (${endpoint})`, error);
    return null;
  }
}

function parseStatementExpenseSummary(statement: AccountStatement): ParsedStatementSummary | null {
  if (statement.parsed_result) {
    try {
      const parsed = JSON.parse(statement.parsed_result);
      const normalized = normalizeParserTestSummary(parsed);
      if (normalized) return normalized;
    } catch {
      // Ignore malformed stored parser output and fallback below.
    }
  }

  const lowerName = statement.file_name.toLowerCase();

  // PDFs cannot be decoded as readable text — skip the fallback entirely.
  // Statements uploaded without a parser source stored valid parsed_result;
  // PDFs with no valid parsed_result should show nothing rather than binary garbage.
  if (lowerName.endsWith(".pdf")) return null;

  if (lowerName.endsWith(".json")) {
    const text = decodeDataUrlText(statement.file_data_url);
    if (!text) return null;

    try {
      const data = JSON.parse(text);
      return normalizeParserTestSummary(data);
    } catch {
      return null;
    }
  }

  const text = decodeDataUrlText(statement.file_data_url);
  if (!text) return null;

  return normalizeParserTestSummary(parseExpensesFromText(text));
}

function normalizeParserTestSummary(value: any): ParsedStatementSummary | null {
  const base = coerceParsedSummary(value);
  if (!base) return null;

  const aggregated = new Map<string, ParsedExpenseGroup>();

  for (const group of base.groups) {
    const sourceTransactions = group.transactions.length > 0 ? group.transactions : [{ description: group.description, amount: group.amount }];

    for (const transaction of sourceTransactions) {
      const cleanedDescription = cleanParserTestDescription(transaction.description || group.description);
      if (!cleanedDescription) continue;
      if (isCardPaymentDescription(cleanedDescription)) continue;

      const groupName = canonicalizeVendorName(cleanedDescription);

      const existing = aggregated.get(groupName) ?? {
        description: groupName,
        amount: 0,
        transactions: [],
      };

      existing.amount += transaction.amount;
      existing.transactions.push({ description: cleanedDescription, amount: transaction.amount });
      aggregated.set(groupName, existing);
    }
  }

  const groups = [...aggregated.values()]
    .filter((group) => Math.abs(group.amount) > 0.00001)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  if (groups.length === 0) return null;

  return {
    total: groups.reduce((sum, item) => sum + item.amount, 0),
    groups,
  };
}

function cleanParserTestDescription(value: string) {
  let text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  const junkPhrases = [
    "transactions +",
    "new balance =",
    "total transactions",
    "total transactions for this period",
    "total transaction",
    "balance",
    "statement",
    "payment due",
    "autopay",
    "rewards",
    "name",
    "late fee",
    "due date",
    "interest charge",
    "fees for this period",
    "interest for this period",
    "year-to-date",
    "fees charged",
    "interest charged",
  ];

  if (junkPhrases.some((phrase) => lower.includes(phrase))) return "";

  text = text.replace(/^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s*)+/i, "").trim();
  text = text.replace(/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*/g, "").trim();
  text = text.replace(/^\$?\d+(?:\.\d{2})?\s*/g, "").trim();

  while (true) {
    const trimmed = text.replace(/(?:\s?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?[A-Z]{2})$/, "").trim();
    if (trimmed === text) break;
    text = trimmed;
  }

  text = text.replace(/\s+(?:#\d+|\d{4,})$/g, "").trim();
  text = text.replace(/\s+CREDIT$/i, "").trim();
  text = text.replace(/\s*[:\-–—]+\s*$/, "").trim();

  return text;
}

function isCardPaymentDescription(value: string) {
  const lower = value.toLowerCase();
  return [
    "payment",
    "pymt",
    " pmt",
    "online pmt",
    "online pymt",
    "capital one online",
    "automatic payment",
    "autopay",
    "thank you",
    "save on interest payment",
    "minimum payment",
  ].some((token) => lower.includes(token));
}

function canonicalizeVendorName(value: string) {
  const lower = value.toLowerCase();

  if (lower.includes("amazon")) return "AMAZON";
  if (lower.includes("ebay")) return "EBAY";
  if (lower.includes("wayfair")) return "WAYFAIR";
  if (lower.includes("walmart") || lower.includes("wal-mart") || lower.includes("wm supercenter") || lower.includes("wm ")) return "WALMART";

  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9\s.&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return value.toUpperCase();

  return tokens.slice(0, 3).join(" ");
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

  const excluded = ["payment", "autopay", "save on interest payment", "minimum payment"];
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
    if (!Number.isFinite(amount) || amount === 0) continue;

    const withoutDate = line.replace(dateRegex, "").trim();
    const description = withoutDate.replace(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\s*$/, "").trim();

    items.push({
      description: description.length > 0 ? description : "Expense",
      amount,
    });
  }

  const groups = mergeGroupedExpenses([], items.map((item: ParsedExpenseItem) => ({
    description: item.description,
    amount: item.amount,
    transactions: [item],
  })));

  return {
    total: groups.reduce((sum, item) => sum + item.amount, 0),
    groups,
  };
}

function coerceParsedSummary(value: any): ParsedStatementSummary | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value.groups)) {
    const groups = value.groups
      .map((group: any) => {
        const description = String(group?.description ?? "").trim();
        const rawAmount = Number(group?.amount ?? 0);
        const transactionsRaw = Array.isArray(group?.transactions) ? group.transactions : [];
        const transactions: ParsedExpenseItem[] = transactionsRaw
          .map((tx: any) => ({
            description: String(tx?.description ?? description).trim() || description,
            amount: Number(tx?.amount ?? 0),
          }))
          .filter((tx: ParsedExpenseItem) => tx.description.length > 0 && Number.isFinite(tx.amount) && tx.amount !== 0);

        const amount = transactions.length > 0
          ? transactions.reduce((sum, tx) => sum + tx.amount, 0)
          : rawAmount;

        if (!description || !Number.isFinite(amount) || amount === 0) return null;

        return {
          description,
          amount,
          transactions: transactions.length > 0 ? transactions : [{ description, amount }],
        };
      })
      .filter((group: ParsedExpenseGroup | null): group is ParsedExpenseGroup => Boolean(group));

    const merged = mergeGroupedExpenses([], groups);
    return {
      total: merged.reduce((sum, item) => sum + item.amount, 0),
      groups: merged,
    };
  }

  const legacyItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.expenses)
      ? value.expenses
      : [];

  const items = legacyItems
    .map((item: any) => ({
      description: String(item?.description ?? "").trim(),
      amount: Number(item?.amount ?? 0),
    }))
    .filter((item: ParsedExpenseItem) => item.description.length > 0 && Number.isFinite(item.amount) && item.amount !== 0);

  if (items.length === 0) return null;

  const groups = mergeGroupedExpenses([], items.map((item: ParsedExpenseItem) => ({
    description: item.description,
    amount: item.amount,
    transactions: [item],
  })));

  return {
    total: groups.reduce((sum, item) => sum + item.amount, 0),
    groups,
  };
}

function mergeGroupedExpenses(base: ParsedExpenseGroup[], additions: ParsedExpenseGroup[]) {
  const map = new Map<string, ParsedExpenseGroup>();

  for (const group of base) {
    map.set(group.description, {
      description: group.description,
      amount: group.amount,
      transactions: [...group.transactions],
    });
  }

  for (const group of additions) {
    const existing = map.get(group.description) ?? {
      description: group.description,
      amount: 0,
      transactions: [],
    };
    existing.amount += group.amount;
    existing.transactions.push(...group.transactions);
    map.set(group.description, existing);
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
