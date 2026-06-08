
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS } from "../../lib";
import { supabase } from "../../lib/supabaseClient";
import styles from "./Overview.module.css";

type EntryGroupRow = {
  id: string;
  name: string;
};

type EntryAccountRow = {
  id: string;
  group_id: string;
  name: string;
};

type EntryValueRow = {
  account_id: string;
  year: number;
  value: string;
};

type OverviewWidgetKey = "chart" | "captions" | "categories";

type OverviewWidgetPreference = {
  key: OverviewWidgetKey;
  enabled: boolean;
};

const DEFAULT_WIDGETS: OverviewWidgetPreference[] = [
  { key: "chart", enabled: true },
  { key: "captions", enabled: true },
  { key: "categories", enabled: true },
];

const WIDGET_LABELS: Record<OverviewWidgetKey, string> = {
  chart: "Net Worth Graph",
  captions: "Insight Captions",
  categories: "Category Year Table",
};

function parseNumericValue(value: string) {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function buildYearsFromRange(startYear: number | null, endYear: number | null) {
  if (startYear === null || endYear === null || endYear < startYear) return [];
  return Array.from({ length: endYear - startYear + 1 }, (_x, index) => startYear + index);
}

function isValidPreference(value: unknown): value is OverviewWidgetPreference[] {
  if (!Array.isArray(value)) return false;
  const validKeys: OverviewWidgetKey[] = ["chart", "captions", "categories"];
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return validKeys.includes(record.key as OverviewWidgetKey) && typeof record.enabled === "boolean";
  });
}

export function Overview() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [years, setYears] = useState<number[]>([]);
  const [netWorthByYear, setNetWorthByYear] = useState<Map<number, number>>(new Map());
  const [groupTotalsByYear, setGroupTotalsByYear] = useState<Map<string, Map<number, number>>>(new Map());
  const [accountCount, setAccountCount] = useState(0);
  const [widgetPreferences, setWidgetPreferences] = useState<OverviewWidgetPreference[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    void loadOverview();
  }, []);

  async function loadOverview() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const userId = userData.user.id;

      const [{ data: groupsData, error: groupsError }, { data: accountsData, error: accountsError }, { data: valuesData, error: valuesError }, { data: settingsData, error: settingsError }] = await Promise.all([
        supabase.from("entry_groups").select("id,name").eq("user_id", userId).order("position", { ascending: true }),
        supabase.from("entry_accounts").select("id,group_id,name").eq("user_id", userId).order("position", { ascending: true }),
        supabase.from("entry_account_values").select("account_id,year,value").eq("user_id", userId).order("year", { ascending: true }),
        supabase.from("entry_settings").select("*").eq("user_id", userId).limit(1),
      ]);

      if (groupsError) throw groupsError;
      if (accountsError) throw accountsError;
      if (valuesError) throw valuesError;
      if (settingsError) throw settingsError;

      const groups = (groupsData ?? []) as EntryGroupRow[];
      const accounts = (accountsData ?? []) as EntryAccountRow[];
      const values = (valuesData ?? []) as EntryValueRow[];

      setAccountCount(accounts.length);

      const settingsRow = (settingsData ?? [])[0] as Record<string, any> | undefined;
      const startYear = typeof settingsRow?.start_year === "number" ? settingsRow.start_year : null;
      const endYear = typeof settingsRow?.end_year === "number" ? settingsRow.end_year : null;

      const yearsFromSettings = buildYearsFromRange(startYear, endYear);
      const yearsFromValues = [...new Set(values.map((row) => row.year))].sort((a, b) => a - b);
      const nextYears = yearsFromSettings.length > 0 ? yearsFromSettings : yearsFromValues;
      setYears(nextYears);

      const accountToGroup = new Map<string, string>();
      for (const account of accounts) {
        accountToGroup.set(account.id, account.group_id);
      }

      const groupNameById = new Map<string, string>();
      for (const group of groups) {
        groupNameById.set(group.id, group.name);
      }

      const nextNetWorthByYear = new Map<number, number>();
      const nextGroupTotalsByYear = new Map<string, Map<number, number>>();

      for (const year of nextYears) {
        nextNetWorthByYear.set(year, 0);
      }

      for (const valueRow of values) {
        if (!nextYears.includes(valueRow.year)) continue;

        const amount = parseNumericValue(valueRow.value);
        const currentNet = nextNetWorthByYear.get(valueRow.year) ?? 0;
        nextNetWorthByYear.set(valueRow.year, currentNet + amount);

        const groupId = accountToGroup.get(valueRow.account_id);
        if (!groupId) continue;

        const groupName = groupNameById.get(groupId) ?? "Uncategorized";
        const groupYearMap = nextGroupTotalsByYear.get(groupName) ?? new Map<number, number>();
        const currentGroupYearTotal = groupYearMap.get(valueRow.year) ?? 0;
        groupYearMap.set(valueRow.year, currentGroupYearTotal + amount);
        nextGroupTotalsByYear.set(groupName, groupYearMap);
      }

      setNetWorthByYear(nextNetWorthByYear);
      setGroupTotalsByYear(nextGroupTotalsByYear);

      const persistedWidgets = settingsRow?.overview_widgets;
      if (isValidPreference(persistedWidgets)) {
        const ensured = [...persistedWidgets];
        for (const fallback of DEFAULT_WIDGETS) {
          if (!ensured.some((item) => item.key === fallback.key)) {
            ensured.push(fallback);
          }
        }
        setWidgetPreferences(ensured);
      } else {
        setWidgetPreferences(DEFAULT_WIDGETS);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load overview.");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveOverviewLayout() {
    try {
      setIsSavingLayout(true);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { error } = await supabase.from("entry_settings").upsert(
        {
          user_id: userData.user.id,
          overview_widgets: widgetPreferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setStatusMessage("Overview layout saved.");
      setIsCustomizeOpen(false);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not save layout.");
    } finally {
      setIsSavingLayout(false);
    }
  }

  const visibleWidgets = useMemo(() => widgetPreferences.filter((item) => item.enabled), [widgetPreferences]);

  const netWorthSeries = useMemo(
    () => years.map((year) => ({ year, value: netWorthByYear.get(year) ?? 0 })),
    [netWorthByYear, years]
  );

  const chartPoints = useMemo(() => {
    if (netWorthSeries.length === 0) return "";

    const width = 880;
    const height = 230;
    const left = 42;
    const right = 22;
    const top = 16;
    const bottom = 26;
    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;
    const values = netWorthSeries.map((item) => item.value);
    const maxValue = Math.max(1, ...values);
    const minValue = Math.min(0, ...values);
    const spread = Math.max(1, maxValue - minValue);

    return netWorthSeries
      .map((point, index) => {
        const x = left + (netWorthSeries.length === 1 ? usableWidth / 2 : (index / (netWorthSeries.length - 1)) * usableWidth);
        const ratio = (point.value - minValue) / spread;
        const y = top + (1 - ratio) * usableHeight;
        return `${x},${y}`;
      })
      .join(" ");
  }, [netWorthSeries]);

  const latestNetWorth = netWorthSeries[netWorthSeries.length - 1]?.value ?? 0;
  const previousNetWorth = netWorthSeries[netWorthSeries.length - 2]?.value ?? latestNetWorth;
  const netWorthDelta = latestNetWorth - previousNetWorth;

  const topCategory = useMemo(() => {
    let bestName = "None";
    let bestValue = Number.NEGATIVE_INFINITY;

    for (const [name, totalsMap] of groupTotalsByYear.entries()) {
      const sum = [...totalsMap.values()].reduce((acc, value) => acc + value, 0);
      if (sum > bestValue) {
        bestValue = sum;
        bestName = name;
      }
    }

    return { name: bestName, value: Number.isFinite(bestValue) ? bestValue : 0 };
  }, [groupTotalsByYear]);

  function moveWidget(index: number, direction: -1 | 1) {
    setWidgetPreferences((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  return (
    <div className={styles.pageShell}>
      <main className={styles.main}>
        <header className={styles.subnav}>
          <Link className={styles.backLink} to="/home" aria-label="Home">
            Home
          </Link>
          <Link className={styles.subnavLink} to="/expenses">Expenses</Link>
          <Link className={styles.subnavLink} to="/entry">Entry</Link>
          <Link className={styles.profileLink} to="/home" aria-label="Profile">
            <img className={styles.profileIcon} src={ASSETS.defaultProfileIcon} alt="" aria-hidden="true" />
          </Link>
        </header>

        <section className={styles.body}>
          <div className={styles.topRow}>
            <div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>
            <button type="button" className={styles.customizeButton} onClick={() => setIsCustomizeOpen((prev) => !prev)}>
              {isCustomizeOpen ? "Close Customize" : "Customize Overview"}
            </button>
          </div>

          {isCustomizeOpen && (
            <section className={styles.customizePanel}>
              {widgetPreferences.map((widget, index) => (
                <div className={styles.widgetRow} key={widget.key}>
                  <label className={styles.widgetToggle}>
                    <input
                      type="checkbox"
                      checked={widget.enabled}
                      onChange={() => {
                        setWidgetPreferences((prev) =>
                          prev.map((item) =>
                            item.key === widget.key ? { ...item, enabled: !item.enabled } : item
                          )
                        );
                      }}
                    />
                    <span>{WIDGET_LABELS[widget.key]}</span>
                  </label>
                  <div className={styles.widgetActions}>
                    <button type="button" onClick={() => moveWidget(index, -1)} disabled={index === 0}>Up</button>
                    <button type="button" onClick={() => moveWidget(index, 1)} disabled={index === widgetPreferences.length - 1}>Down</button>
                  </div>
                </div>
              ))}
              <button type="button" className={styles.saveLayoutButton} onClick={() => void saveOverviewLayout()} disabled={isSavingLayout}>
                {isSavingLayout ? "Saving..." : "Save Layout"}
              </button>
            </section>
          )}

          {isLoading && <p className={styles.loadingText}>Loading overview...</p>}

          {!isLoading && years.length === 0 && (
            <p className={styles.emptyText}>No Entry history yet. Add values in Entry to populate your overview.</p>
          )}

          {!isLoading && years.length > 0 && visibleWidgets.some((widget) => widget.key === "chart") && (
            <section className={styles.widgetCard}>
              <h2>Net Worth Over Time</h2>
              <div className={styles.chartWrap}>
                <svg className={styles.chartSvg} viewBox="0 0 880 230" role="img" aria-label="Net worth trend line chart">
                  <line x1="42" y1="204" x2="858" y2="204" stroke="#d3d3d3" strokeWidth="1" />
                  <line x1="42" y1="16" x2="42" y2="204" stroke="#d3d3d3" strokeWidth="1" />
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="#1f5bcc"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {netWorthSeries.map((point, index) => {
                    const left = 42;
                    const right = 22;
                    const usableWidth = 880 - left - right;
                    const x = left + (netWorthSeries.length === 1 ? usableWidth / 2 : (index / (netWorthSeries.length - 1)) * usableWidth);
                    return (
                      <text key={point.year} x={x} y={220} textAnchor="middle" className={styles.chartLabel}>
                        {point.year}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </section>
          )}

          {!isLoading && years.length > 0 && visibleWidgets.some((widget) => widget.key === "captions") && (
            <section className={styles.widgetCard}>
              <h2>Overview Captions</h2>
              <div className={styles.captionText}>
                <p>Current estimated net worth from Entry: ${formatMoney(latestNetWorth)}</p>
                <p>
                  Year-over-year change: {netWorthDelta >= 0 ? "+" : "-"}${formatMoney(Math.abs(netWorthDelta))}
                </p>
                <p>Largest category across the period: {topCategory.name} (${formatMoney(topCategory.value)})</p>
                <p>Total tracked accounts: {accountCount}</p>
              </div>
            </section>
          )}

          {!isLoading && years.length > 0 && visibleWidgets.some((widget) => widget.key === "categories") && (
            <section className={styles.widgetCard}>
              <h2>Net Worth By Category Over Years</h2>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      {years.map((year) => (
                        <th key={year}>{year}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...groupTotalsByYear.entries()].map(([groupName, totalsMap]) => (
                      <tr key={groupName}>
                        <td>{groupName}</td>
                        {years.map((year) => (
                          <td key={`${groupName}-${year}`}>${formatMoney(totalsMap.get(year) ?? 0)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
