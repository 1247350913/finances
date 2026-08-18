import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS, apiUrl, authClient } from "../../lib";
import { supabase } from "../../lib/supabaseClient";
import styles from "./Entry.module.css";

type EntryAccount = {
  id: string;
  name: string;
  coinSymbol: string | null;
  values: Partial<Record<number, string>>;
};

type EntryGroup = {
  id: string;
  name: string;
  accounts: EntryAccount[];
};

type YearRangeValidation =
  | { valid: false; error: string }
  | { valid: true; startYear: number | null; endYear: number | null };

type DragItem =
  | { type: "group"; groupId: string }
  | { type: "account"; groupId: string; accountId: string };

function makeId() {
  return crypto.randomUUID();
}

function buildYearRange(startYear: number | null, endYear: number | null) {
  if (startYear === null || endYear === null) return [];
  if (endYear < startYear) return [];

  const yearCount = endYear - startYear + 1;

  return Array.from({ length: yearCount }, (_value, index) => startYear + index);
}

function parseYearField(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: true, value: null as number | null };
  }

  if (!/^\d{1,4}$/.test(trimmed)) {
    return { valid: false, value: null as number | null };
  }

  return { valid: true, value: Number(trimmed) };
}

const VALUE_VALIDATION_MESSAGE = "Values must be numbers with an optional single decimal point.";
const COIN_SYMBOLS = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "DOGE",
  "TRX",
  "TON",
  "AVAX",
  "DOT",
  "MATIC",
  "LINK",
  "LTC",
  "BCH",
  "XLM",
  "ATOM",
  "UNI",
  "APT",
  "ARB",
  "OP",
  "NEAR",
  "ETC",
  "ICP",
  "FIL",
  "HBAR",
  "VET",
  "ALGO",
  "AAVE",
  "MKR",
  "INJ",
  "SUI",
  "SEI",
  "PEPE",
  "SHIB",
  "FTM",
  "GRT",
  "RUNE",
  "SNX",
  "CRV",
  "COMP",
  "DYDX",
  "ZEC",
  "DASH",
  "KAS",
  "TAO",
] as const;

function stripDisplaySeparators(value: string) {
  return value.replace(/,/g, "").trim();
}

function isValidNumericInput(value: string) {
  return /^\d*(?:\.\d*)?$/.test(value);
}

function normalizeNumericValue(value: string) {
  const sanitized = stripDisplaySeparators(value);

  if (!isValidNumericInput(sanitized)) {
    return "";
  }

  if (sanitized.length === 0) return "";

  const [integerRaw, fractionalRaw = ""] = sanitized.split(".");
  const integerClean = integerRaw.replace(/^0+(?=\d)/, "");
  const integerPart = integerClean.length === 0 ? "0" : integerClean;
  const fractionalPart = fractionalRaw.replace(/0+$/, "");

  if (fractionalPart.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${fractionalPart}`;
}

function formatNumericValue(value: string) {
  const sanitized = stripDisplaySeparators(value);

  if (!isValidNumericInput(sanitized)) {
    return "";
  }

  if (sanitized.length === 0) return "";

  const [integerRaw = "", fractionalRaw] = sanitized.split(".");
  const integerPart = integerRaw.length === 0 ? "0" : integerRaw;
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (fractionalRaw === undefined) {
    return formattedInteger;
  }

  return `${formattedInteger}.${fractionalRaw}`;
}

function createAccount(name = ""): EntryAccount {
  return {
    id: makeId(),
    name,
    coinSymbol: null,
    values: {},
  };
}

export function Entry() {
  const [groups, setGroups] = useState<EntryGroup[]>([]);
  const [draftGroups, setDraftGroups] = useState<EntryGroup[]>([]);
  const [yearStart, setYearStart] = useState<number | null>(null);
  const [yearEnd, setYearEnd] = useState<number | null>(null);
  const [draftYearStart, setDraftYearStart] = useState("");
  const [draftYearEnd, setDraftYearEnd] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DragItem | null>(null);
  const [coinPickerAccountId, setCoinPickerAccountId] = useState<string | null>(null);
  const [coinSearchQuery, setCoinSearchQuery] = useState("");

  const displayGroups = useMemo(() => (isEditing ? draftGroups : groups), [draftGroups, groups, isEditing]);
  const persistedYears = useMemo(() => buildYearRange(yearStart, yearEnd), [yearStart, yearEnd]);
  const draftYears = useMemo(() => {
    const parsedStart = parseYearField(draftYearStart);
    const parsedEnd = parseYearField(draftYearEnd);

    if (!parsedStart.valid || !parsedEnd.valid) {
      return [];
    }

    return buildYearRange(parsedStart.value, parsedEnd.value);
  }, [draftYearStart, draftYearEnd]);
  const displayYears = isEditing ? draftYears : persistedYears;
  const filteredCoinSymbols = useMemo(() => {
    const query = coinSearchQuery.trim().toUpperCase();

    if (query.length === 0) return [...COIN_SYMBOLS];

    return COIN_SYMBOLS.filter((symbol) => symbol.includes(query));
  }, [coinSearchQuery]);

  useEffect(() => {
    void loadEntryData();
  }, []);

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

  function cloneGroups(source: EntryGroup[]) {
    return source.map((group) => ({
      ...group,
      accounts: group.accounts.map((account) => ({
        ...account,
        coinSymbol: account.coinSymbol,
        values: { ...account.values },
      })),
    }));
  }

  function moveGroup(groupId: string, targetGroupId: string) {
    setDraftGroups((prev) => {
      const fromIndex = prev.findIndex((group) => group.id === groupId);
      const toIndex = prev.findIndex((group) => group.id === targetGroupId);

      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;

      const next = [...prev];
      const [movedGroup] = next.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      next.splice(adjustedIndex, 0, movedGroup);
      return next;
    });
  }

  function moveAccount(groupId: string, accountId: string, targetGroupId: string, targetAccountId?: string) {
    setDraftGroups((prev) => {
      const next = prev.map((group) => ({
        ...group,
        accounts: [...group.accounts],
      }));

      const sourceGroupIndex = next.findIndex((group) => group.id === groupId);
      const targetGroupIndex = next.findIndex((group) => group.id === targetGroupId);

      if (sourceGroupIndex === -1 || targetGroupIndex === -1) return prev;

      const sourceGroup = next[sourceGroupIndex];
      const sourceAccountIndex = sourceGroup.accounts.findIndex((account) => account.id === accountId);

      if (sourceAccountIndex === -1) return prev;

      const [movedAccount] = sourceGroup.accounts.splice(sourceAccountIndex, 1);
      const targetGroup = next[targetGroupIndex];

      if (targetAccountId) {
        const targetAccountIndex = targetGroup.accounts.findIndex((account) => account.id === targetAccountId);
        if (targetAccountIndex === -1) {
          targetGroup.accounts.push(movedAccount);
        } else {
          const adjustedIndex = groupId === targetGroupId && sourceAccountIndex < targetAccountIndex ? targetAccountIndex - 1 : targetAccountIndex;
          targetGroup.accounts.splice(adjustedIndex, 0, movedAccount);
        }
      } else {
        targetGroup.accounts.push(movedAccount);
      }

      return next;
    });
  }

  function handleDragStart(item: DragItem) {
    setDragItem(item);
    setDropTarget(item);
  }

  function handleDragEnd() {
    setDragItem(null);
    setDropTarget(null);
  }

  function handleGroupDrop(targetGroupId: string) {
    if (!dragItem) return;

    if (dragItem.type === "group") {
      moveGroup(dragItem.groupId, targetGroupId);
    }

    if (dragItem.type === "account") {
      moveAccount(dragItem.groupId, dragItem.accountId, targetGroupId);
    }

    setDragItem(null);
    setDropTarget(null);
  }

  function handleAccountDrop(targetGroupId: string, targetAccountId: string) {
    if (!dragItem) return;

    if (dragItem.type === "group") {
      moveGroup(dragItem.groupId, targetGroupId);
    }

    if (dragItem.type === "account") {
      moveAccount(dragItem.groupId, dragItem.accountId, targetGroupId, targetAccountId);
    }

    setDragItem(null);
    setDropTarget(null);
  }

  async function loadEntryData() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      let groupsData: any[] = [];
      let accountsData: any[] = [];
      let valuesData: any[] = [];
      let settingsData: any[] = [];

      if (authClient.mode === "custom") {
        const response = await fetch(apiUrl("/api/entry"), {
          method: "GET",
          credentials: "include",
        });

        if (response.status === 401) {
          throw new Error("Please sign in again.");
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error ?? payload?.message ?? "Could not load entry data."));
        }

        groupsData = Array.isArray(payload?.data?.groups) ? payload.data.groups : [];
        accountsData = Array.isArray(payload?.data?.accounts) ? payload.data.accounts : [];
        valuesData = Array.isArray(payload?.data?.values) ? payload.data.values : [];
        settingsData = payload?.data?.settings ? [payload.data.settings] : [];
      } else {
        const userId = await getCurrentUserId();

        const [{ data: groupsRows, error: groupsError }, { data: accountsRows, error: accountsError }, { data: valuesRows, error: valuesError }, { data: settingsRows, error: settingsError }] = await Promise.all([
          supabase.from("entry_groups").select("id,name,position").eq("user_id", userId).order("position", { ascending: true }),
          supabase.from("entry_accounts").select("id,group_id,name,coin_symbol,position").eq("user_id", userId).order("position", { ascending: true }),
          supabase.from("entry_account_values").select("account_id,year,value").eq("user_id", userId).order("year", { ascending: true }),
          supabase.from("entry_settings").select("start_year,end_year").eq("user_id", userId).limit(1),
        ]);

        if (groupsError) throw groupsError;
        if (accountsError) throw accountsError;
        if (valuesError) throw valuesError;
        if (settingsError) throw settingsError;

        groupsData = groupsRows ?? [];
        accountsData = accountsRows ?? [];
        valuesData = valuesRows ?? [];
        settingsData = settingsRows ?? [];
      }

      const valuesByAccount = new Map<string, Partial<Record<number, string>>>();

      for (const valueRow of valuesData ?? []) {
        const existing = valuesByAccount.get(valueRow.account_id) ?? {};
        existing[valueRow.year] = normalizeNumericValue(valueRow.value);
        valuesByAccount.set(valueRow.account_id, existing);
      }

      const accountsByGroup = new Map<string, EntryAccount[]>();

      for (const accountRow of accountsData ?? []) {
        const account: EntryAccount = {
          id: accountRow.id,
          name: accountRow.name,
          coinSymbol: accountRow.coin_symbol ?? null,
          values: valuesByAccount.get(accountRow.id) ?? {},
        };

        const existing = accountsByGroup.get(accountRow.group_id) ?? [];
        existing.push(account);
        accountsByGroup.set(accountRow.group_id, existing);
      }

      const nextGroups: EntryGroup[] = (groupsData ?? []).map((groupRow) => ({
        id: groupRow.id,
        name: groupRow.name,
        accounts: accountsByGroup.get(groupRow.id) ?? [],
      }));

      const settingsRow = settingsData[0];
      const nextYearStart = settingsRow?.start_year ?? null;
      const nextYearEnd = settingsRow?.end_year ?? null;

      setGroups(nextGroups);
      setDraftGroups(cloneGroups(nextGroups));
      setYearStart(nextYearStart);
      setYearEnd(nextYearEnd);
      setDraftYearStart(nextYearStart === null ? "" : String(nextYearStart));
      setDraftYearEnd(nextYearEnd === null ? "" : String(nextYearEnd));
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load entry data.");
    } finally {
      setIsLoading(false);
    }
  }

  function beginEdit() {
    setDraftGroups(cloneGroups(groups));
    setDraftYearStart(yearStart === null ? "" : String(yearStart));
    setDraftYearEnd(yearEnd === null ? "" : String(yearEnd));
    setStatusMessage(null);
    setErrorMessage(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftGroups(cloneGroups(groups));
    setDraftYearStart(yearStart === null ? "" : String(yearStart));
    setDraftYearEnd(yearEnd === null ? "" : String(yearEnd));
    setErrorMessage(null);
    setStatusMessage("Changes were discarded.");
    setIsEditing(false);
    setDragItem(null);
    setDropTarget(null);
    setCoinPickerAccountId(null);
    setCoinSearchQuery("");
  }

  function addGroup() {
    setDraftGroups((prev) => [...prev, { id: makeId(), name: "New Section", accounts: [] }]);
  }

  function removeGroup(groupId: string) {
    setDraftGroups((prev) => prev.filter((group) => group.id !== groupId));
  }

  function updateGroupName(groupId: string, nextName: string) {
    setDraftGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, name: nextName } : group)));
  }

  function addAccount(groupId: string) {
    setDraftGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              accounts: [...group.accounts, createAccount(`Account ${group.accounts.length + 1}`)],
            }
          : group
      )
    );
  }

  function removeAccount(groupId: string, accountId: string) {
    setDraftGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, accounts: group.accounts.filter((account) => account.id !== accountId) }
          : group
      )
    );
  }

  function updateAccountName(groupId: string, accountId: string, nextName: string) {
    setDraftGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          accounts: group.accounts.map((account) =>
            account.id === accountId ? { ...account, name: nextName } : account
          ),
        };
      })
    );
  }

  function updateAccountCoinSymbol(groupId: string, accountId: string, nextSymbol: string | null) {
    setDraftGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          accounts: group.accounts.map((account) =>
            account.id === accountId ? { ...account, coinSymbol: nextSymbol } : account
          ),
        };
      })
    );
  }

  function updateAccountValue(groupId: string, accountId: string, year: number, nextValue: string) {
    const sanitized = stripDisplaySeparators(nextValue);

    if (!isValidNumericInput(sanitized)) {
      setErrorMessage(VALUE_VALIDATION_MESSAGE);
      return;
    }

    setErrorMessage((prev) => (prev === VALUE_VALIDATION_MESSAGE ? null : prev));

    setDraftGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          accounts: group.accounts.map((account) => {
            if (account.id !== accountId) return account;

            return {
              ...account,
              values: {
                ...account.values,
                [year]: sanitized,
              },
            };
          }),
        };
      })
    );
  }

  function finalizeAccountValue(groupId: string, accountId: string, year: number) {
    setDraftGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        return {
          ...group,
          accounts: group.accounts.map((account) => {
            if (account.id !== accountId) return account;

            const nextValue = normalizeNumericValue(account.values[year] ?? "");

            return {
              ...account,
              values: {
                ...account.values,
                [year]: nextValue,
              },
            };
          }),
        };
      })
    );
  }

  function validateDraftYearRange(): YearRangeValidation {
    const parsedStart = parseYearField(draftYearStart);
    const parsedEnd = parseYearField(draftYearEnd);

    if (!parsedStart.valid || !parsedEnd.valid) {
      return { valid: false, error: "Start and End year must be numeric (up to 4 digits)." };
    }

    if (parsedStart.value === null && parsedEnd.value === null) {
      return { valid: true, startYear: null, endYear: null };
    }

    if (parsedStart.value === null || parsedEnd.value === null) {
      return { valid: false, error: "Provide both Start year and End year, or leave both blank." };
    }

    if (parsedStart.value > parsedEnd.value) {
      return { valid: false, error: "Start year cannot be greater than End year." };
    }

    if (parsedStart.value < 1900) {
      return { valid: false, error: "Start year must be 1900 or later." };
    }

    if (parsedEnd.value > 2500) {
      return { valid: false, error: "End year must be 2500 or earlier." };
    }

    if (parsedEnd.value - parsedStart.value > 80) {
      return { valid: false, error: "Year range is too large. Keep it within 80 years." };
    }

    return { valid: true, startYear: parsedStart.value, endYear: parsedEnd.value };
  }

  async function saveChanges() {
    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const validatedRange = validateDraftYearRange();

      if (!validatedRange.valid) {
        setErrorMessage(validatedRange.error);
        return;
      }

      setIsSaving(true);
        const userId = await getCurrentUserId();
        const activeYears = buildYearRange(validatedRange.startYear, validatedRange.endYear);

      const cleanedGroups = draftGroups.map((group, groupIndex) => ({
        id: group.id,
        user_id: userId,
        name: group.name.trim().length > 0 ? group.name.trim() : `Section ${groupIndex + 1}`,
        position: groupIndex,
        accounts: group.accounts.map((account, accountIndex) => ({
          id: account.id,
          user_id: userId,
          group_id: group.id,
          name: account.name.trim().length > 0 ? account.name.trim() : `Account ${accountIndex + 1}`,
          coin_symbol: account.coinSymbol,
          position: accountIndex,
          values: account.values,
        })),
      }));

      const accountRows = cleanedGroups.flatMap((group) => group.accounts.map((account) => ({
        id: account.id,
        user_id: account.user_id,
        group_id: account.group_id,
        name: account.name,
        coin_symbol: account.coin_symbol,
        position: account.position,
      })));

      const valueRows = cleanedGroups.flatMap((group) =>
        group.accounts.flatMap((account) =>
          activeYears.flatMap((year) => {
            const rawValue = account.values[year] ?? "";
              const value = normalizeNumericValue(rawValue);

            if (value.length === 0) return [];

            return [{
              user_id: userId,
              account_id: account.id,
              year,
              value,
            }];
          })
        )
      );

      if (authClient.mode === "custom") {
        const response = await fetch(apiUrl("/api/entry"), {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groups: cleanedGroups,
            startYear: validatedRange.startYear,
            endYear: validatedRange.endYear,
          }),
        });

        if (response.status === 401) {
          throw new Error("Please sign in again.");
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error ?? payload?.message ?? "Could not save entry data."));
        }
      } else {
        const { error: deleteValuesError } = await supabase.from("entry_account_values").delete().eq("user_id", userId);
        if (deleteValuesError) throw deleteValuesError;

        const { error: deleteAccountsError } = await supabase.from("entry_accounts").delete().eq("user_id", userId);
        if (deleteAccountsError) throw deleteAccountsError;

        const { error: deleteGroupsError } = await supabase.from("entry_groups").delete().eq("user_id", userId);
        if (deleteGroupsError) throw deleteGroupsError;

        if (cleanedGroups.length > 0) {
          const { error: insertGroupsError } = await supabase.from("entry_groups").insert(
            cleanedGroups.map((group) => ({
              id: group.id,
              user_id: group.user_id,
              name: group.name,
              position: group.position,
            }))
          );

          if (insertGroupsError) throw insertGroupsError;
        }

        if (accountRows.length > 0) {
          const { error: insertAccountsError } = await supabase.from("entry_accounts").insert(accountRows);
          if (insertAccountsError) throw insertAccountsError;
        }

        if (valueRows.length > 0) {
          const { error: insertValuesError } = await supabase.from("entry_account_values").insert(valueRows);
          if (insertValuesError) throw insertValuesError;
        }

        if (validatedRange.startYear === null && validatedRange.endYear === null) {
          const { error: deleteSettingsError } = await supabase.from("entry_settings").delete().eq("user_id", userId);
          if (deleteSettingsError) throw deleteSettingsError;
        } else {
          const { error: upsertSettingsError } = await supabase.from("entry_settings").upsert({
            user_id: userId,
            start_year: validatedRange.startYear,
            end_year: validatedRange.endYear,
            updated_at: new Date().toISOString(),
          });

          if (upsertSettingsError) throw upsertSettingsError;
        }
      }

      const persistedGroups: EntryGroup[] = cleanedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        accounts: group.accounts.map((account) => ({
          id: account.id,
          name: account.name,
          coinSymbol: account.coin_symbol,
          values: { ...account.values },
        })),
      }));

      setGroups(persistedGroups);
      setDraftGroups(cloneGroups(persistedGroups));
  setYearStart(validatedRange.startYear);
  setYearEnd(validatedRange.endYear);
  setDraftYearStart(validatedRange.startYear === null ? "" : String(validatedRange.startYear));
  setDraftYearEnd(validatedRange.endYear === null ? "" : String(validatedRange.endYear));
      setStatusMessage("Saved.");
      setIsEditing(false);
      setDragItem(null);
      setDropTarget(null);
      setCoinPickerAccountId(null);
      setCoinSearchQuery("");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not save entry changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.entryShell}>
      <header className={styles.subnav}>
        <Link className={styles.backLink} to="/home" aria-label="Home">
		  Home
        </Link>
        <Link className={styles.subnavLink} to="/overview">Overview</Link>
        <Link className={styles.subnavLink} to="/expenses">Expenses</Link>
        <Link className={styles.profileLink} to="/profile" aria-label="Profile">
          <img className={styles.profileIcon} src={ASSETS.defaultProfileIcon} alt="" aria-hidden="true" />
        </Link>
      </header>

      <main className={styles.content}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarStatus}>
            {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}
            {statusMessage && <p className={styles.statusMessage}>{statusMessage}</p>}
          </div>

          <div className={styles.toolbarActions}>
            {!isEditing ? (
              <button type="button" onClick={beginEdit} disabled={isLoading}>Edit</button>
            ) : (
              <>
                <div className={styles.yearRangeEditor}>
                  <label>
                    Start
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draftYearStart}
                      onChange={(event) => setDraftYearStart(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="YYYY"
                    />
                  </label>
                  <label>
                    End
                    <input
                      type="text"
                      inputMode="numeric"
                      value={draftYearEnd}
                      onChange={(event) => setDraftYearEnd(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="YYYY"
                    />
                  </label>
                </div>
                <button type="button" onClick={addGroup} disabled={isSaving}>Add Section</button>
                <button type="button" onClick={cancelEdit} disabled={isSaving}>Cancel</button>
                <button type="button" onClick={() => void saveChanges()} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`${styles.tableWrap} ${displayGroups.length > 0 ? styles.tableWrapScrollable : ""}`}>
          <table className={styles.entryTable}>
            <thead>
              <tr>
                <th className={styles.accountHeader} aria-hidden="true"></th>
                {displayYears.map((year) => (
                  <th key={year}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className={styles.emptyState} colSpan={displayYears.length + 1}>Loading...</td>
                </tr>
              )}

              {!isLoading && displayGroups.length === 0 && (
                <tr>
                  <td className={styles.emptyState} colSpan={displayYears.length + 1}>
                    No sections yet. Enter Edit mode and click Add Section.
                  </td>
                </tr>
              )}

              {!isLoading && displayGroups.length > 0 && displayYears.length === 0 && (
                <tr>
                  <td className={styles.emptyState} colSpan={1}>
                    No years configured yet. Enter Edit mode and set Start and End year.
                  </td>
                </tr>
              )}

              {displayGroups.map((group) => (
                <Fragment key={group.id}>
                  {isEditing ? (
                    <tr
                      className={`${styles.groupRow} ${dropTarget?.type === "group" && dropTarget.groupId === group.id ? styles.dropTarget : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!dragItem) return;
                        setDropTarget({ type: "group", groupId: group.id });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleGroupDrop(group.id);
                      }}
                    >
                      <td colSpan={displayYears.length + 1}>
                        <div className={styles.groupEditor}>
                          <div className={styles.groupEditorLeft}>
                            <button
                              type="button"
                              className={styles.dragHandle}
                              draggable
                              onDragStart={() => handleDragStart({ type: "group", groupId: group.id })}
                              onDragEnd={handleDragEnd}
                              aria-label={`Drag section ${group.name}`}
                            >
                              ⋮⋮
                            </button>
                            <input
                              value={group.name}
                              onChange={(event) => updateGroupName(group.id, event.target.value)}
                              aria-label="Section name"
                            />
                          </div>

                          <div className={styles.groupActions}>
                            <button type="button" onClick={() => addAccount(group.id)}>Add Account</button>
                            <button type="button" onClick={() => removeGroup(group.id)}>Remove Section</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr className={styles.groupRow}>
                      <td className={styles.groupTitleCell}>{group.name}</td>
                      {displayYears.map((year) => (
                        <td key={`${group.id}-${year}`} className={styles.groupDashCell}>-</td>
                      ))}
                    </tr>
                  )}

                  {group.accounts.map((account) => (
                    <tr
                      key={account.id}
                      className={dropTarget?.type === "account" && dropTarget.groupId === group.id && dropTarget.accountId === account.id ? styles.dropTarget : ""}
                      onDragOver={(event) => {
                        if (!isEditing) return;
                        event.preventDefault();
                        if (!dragItem) return;
                        setDropTarget({ type: "account", groupId: group.id, accountId: account.id });
                      }}
                      onDrop={(event) => {
                        if (!isEditing) return;
                        event.preventDefault();
                        handleAccountDrop(group.id, account.id);
                      }}
                    >
                      <td>
                        <div className={`${styles.accountCell} ${isEditing ? styles.accountCellEditing : ""}`}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className={styles.dragHandle}
                                draggable
                                onDragStart={() => handleDragStart({ type: "account", groupId: group.id, accountId: account.id })}
                                onDragEnd={handleDragEnd}
                                aria-label={`Drag account ${account.name || "untitled account"}`}
                              >
                                ⋮⋮
                              </button>
                              <div className={styles.accountNameEditor}>
                                <input
                                  value={account.name}
                                  onChange={(event) => updateAccountName(group.id, account.id, event.target.value)}
                                  aria-label="Account name"
                                  placeholder="Account name"
                                />
                              </div>
                              <div className={styles.accountActions}>
                                <button
                                  type="button"
                                  className={`${styles.coinToggleButton} ${account.coinSymbol ? styles.coinToggleActive : ""}`}
                                  aria-label={`Select coin symbol for ${account.name || "account"}`}
                                  onClick={() => {
                                    if (coinPickerAccountId === account.id) {
                                      setCoinPickerAccountId(null);
                                      setCoinSearchQuery("");
                                    } else {
                                      setCoinPickerAccountId(account.id);
                                      setCoinSearchQuery(account.coinSymbol ?? "");
                                    }
                                  }}
                                >
                                  {account.coinSymbol ?? (
                                    <img className={styles.coinFallbackIcon} src={ASSETS.cryptoCoin} alt="" aria-hidden="true" />
                                  )}
                                </button>
                                <button type="button" onClick={() => removeAccount(group.id, account.id)} aria-label="Remove account">
                                  x
                                </button>

                                {coinPickerAccountId === account.id && (
                                  <div className={styles.coinPicker}>
                                    <input
                                      className={styles.coinSearchInput}
                                      value={coinSearchQuery}
                                      onChange={(event) => setCoinSearchQuery(event.target.value.toUpperCase())}
                                      placeholder="Search symbol"
                                      aria-label="Search coin symbol"
                                    />
                                    <div className={styles.coinList}>
                                      <button
                                        type="button"
                                        className={styles.coinOptionClear}
                                        onClick={() => {
                                          updateAccountCoinSymbol(group.id, account.id, null);
                                          setCoinPickerAccountId(null);
                                          setCoinSearchQuery("");
                                        }}
                                      >
                                        Clear selection
                                      </button>
                                      {filteredCoinSymbols.map((symbol) => (
                                        <button
                                          type="button"
                                          key={symbol}
                                          className={styles.coinOption}
                                          onClick={() => {
                                            updateAccountCoinSymbol(group.id, account.id, symbol);
                                            setCoinPickerAccountId(null);
                                            setCoinSearchQuery("");
                                          }}
                                        >
                                          {symbol}
                                        </button>
                                      ))}
                                      {filteredCoinSymbols.length === 0 && <p className={styles.coinNoResults}>No symbols found.</p>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className={styles.accountName}>{account.name}</p>
                          )}
                        </div>
                      </td>

                      {displayYears.map((year) => (
                        <td key={`${account.id}-${year}`}>
                          {isEditing ? (
                            <input
                              className={styles.valueInput}
                              value={formatNumericValue(account.values[year] ?? "")}
                              onChange={(event) => updateAccountValue(group.id, account.id, year, event.target.value)}
                              onBlur={() => finalizeAccountValue(group.id, account.id, year)}
                              placeholder="-"
                              inputMode="decimal"
                              pattern="[0-9,\.]*"
                              aria-label={`${account.name || "Account"} value for ${year}`}
                            />
                          ) : (
                            <span className={styles.readOnlyValue}>{formatNumericValue(account.values[year] || "") || "-"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <Footer />
    </div>
  );
}
