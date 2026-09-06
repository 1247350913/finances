import { useEffect, useMemo, useState, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";
import { Footer } from "../../components/Footer";
import { ASSETS, apiUrl, authClient } from "../../lib";
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
  coin_symbol?: string | null;
  is_debt?: boolean | null;
};

type EntryValueRow = {
  account_id: string;
  year: number;
  value: string;
  conversion_rate?: string | null;
};

type OverviewWidgetKey = "chart" | "captions" | "categories";

type OverviewWidgetInstance = {
  id: string;
  key: OverviewWidgetKey;
};

type TitleAlign = "left" | "center" | "right";
type LineStyle = "solid" | "dashed";
type LegendPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
type AxisMode = "year" | "age";

type ChartWidgetSettings = {
  titleEnabled: boolean;
  titleText: string;
  titleAlign: TitleAlign;
  goalValue: number | null;
  yAxisUpperBound: number | null;
  goalColor: string;
  goalStyle: LineStyle;
  lineColor: string;
  lineStyle: LineStyle;
  yAxisStep: number;
  showYAxisTitle: boolean;
  showYAxisLabels: boolean;
  showXAxisTitle: boolean;
  showXAxisLabels: boolean;
  chartXAxisMode: AxisMode;
  showLegend: boolean;
  legendPosition: LegendPosition;
  showDataPoints: boolean;
  showPointValues: boolean;
  filterStartYear: string;
  filterEndYear: string;
  filterSections: string[];
};

type TableWidgetSettings = {
  tableTitleEnabled: boolean;
  tableTitleText: string;
  tableTitleAlign: TitleAlign;
  tableXAxisMode: AxisMode;
  filterStartYear: string;
  filterEndYear: string;
  filterSections: string[];
};

type SeriesDefinition = {
  name: string;
  values: Array<number | null>;
  color: string;
  style: LineStyle;
};

type AccountTotalsRow = {
  id: string;
  name: string;
  valuesByYear: Map<number, number>;
};

const WIDGET_TYPES: OverviewWidgetKey[] = ["chart", "captions", "categories"];

const WIDGET_LABELS: Record<OverviewWidgetKey, string> = {
  chart: "Net Worth Graph",
  captions: "MD Editor",
  categories: "Category Year Table",
};

const DEFAULT_CAPTION_MD = "Enter your own custom text here";
const TOTAL_SERIES = "Total";
const SERIES_PALETTE = ["#c05621", "#2f855a", "#805ad5", "#d69e2e", "#0f766e", "#c53030"];

const DEFAULT_CHART_WIDGET_SETTINGS: ChartWidgetSettings = {
  titleEnabled: true,
  titleText: "Net Worth Over Time",
  titleAlign: "left",
  goalValue: null,
  yAxisUpperBound: null,
  goalColor: "#cb2e3e",
  goalStyle: "dashed",
  lineColor: "#1f5bcc",
  lineStyle: "solid",
  yAxisStep: 100000,
  showYAxisTitle: true,
  showYAxisLabels: true,
  showXAxisTitle: true,
  showXAxisLabels: true,
  chartXAxisMode: "year",
  showLegend: true,
  legendPosition: "top-right",
  showDataPoints: false,
  showPointValues: false,
  filterStartYear: "",
  filterEndYear: "",
  filterSections: [TOTAL_SERIES],
};

const DEFAULT_TABLE_WIDGET_SETTINGS: TableWidgetSettings = {
  tableTitleEnabled: true,
  tableTitleText: "Net Worth By Category Over Years",
  tableTitleAlign: "left",
  tableXAxisMode: "year",
  filterStartYear: "",
  filterEndYear: "",
  filterSections: [],
};

function generateWidgetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultWidgetInstances(): OverviewWidgetInstance[] {
  return [
    { id: generateWidgetId(), key: "chart" },
    { id: generateWidgetId(), key: "captions" },
    { id: generateWidgetId(), key: "categories" },
  ];
}

function parseBirthday(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const [yyyy, mm, dd] = trimmed.split("-").map((part) => Number(part));
  if (
    parsed.getFullYear() !== yyyy ||
    parsed.getMonth() + 1 !== mm ||
    parsed.getDate() !== dd
  ) {
    return null;
  }

  return parsed;
}

function ageForYear(year: number, birthday: Date) {
  return year - birthday.getFullYear();
}

function formatYearOrAgeLabel(year: number, mode: AxisMode, birthday: Date | null) {
  if (mode === "age" && birthday) {
    return String(ageForYear(year, birthday));
  }
  return String(year);
}

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

function parseNumberInput(raw: string) {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned.length === 0) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumberInput(value: number | null) {
  if (value === null) return "";
  return Math.round(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function buildYearsFromRange(startYear: number | null, endYear: number | null) {
  if (startYear === null || endYear === null || endYear < startYear) return [];
  return Array.from({ length: endYear - startYear + 1 }, (_x, index) => startYear + index);
}

function isWidgetInstanceArray(value: unknown): value is OverviewWidgetInstance[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return typeof record.id === "string" && WIDGET_TYPES.includes(record.key as OverviewWidgetKey);
  });
}

function isLegacyWidgetPreferenceArray(value: unknown): value is Array<{ key: OverviewWidgetKey; enabled: boolean }> {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return WIDGET_TYPES.includes(record.key as OverviewWidgetKey) && typeof record.enabled === "boolean";
  });
}

function coerceChartWidgetSettings(value: unknown): ChartWidgetSettings {
  if (!value || typeof value !== "object") return DEFAULT_CHART_WIDGET_SETTINGS;

  const candidate = value as Record<string, unknown>;
  const goalValue = typeof candidate.goalValue === "number" && Number.isFinite(candidate.goalValue)
    ? candidate.goalValue
    : null;
  const yAxisUpperBound = typeof candidate.yAxisUpperBound === "number" && Number.isFinite(candidate.yAxisUpperBound)
    ? candidate.yAxisUpperBound
    : null;

  return {
    titleEnabled: typeof candidate.titleEnabled === "boolean" ? candidate.titleEnabled : DEFAULT_CHART_WIDGET_SETTINGS.titleEnabled,
    titleText: typeof candidate.titleText === "string" && candidate.titleText.length > 0
      ? candidate.titleText
      : DEFAULT_CHART_WIDGET_SETTINGS.titleText,
    titleAlign: candidate.titleAlign === "center" || candidate.titleAlign === "right" ? candidate.titleAlign : "left",
    goalValue,
    yAxisUpperBound,
    goalColor: typeof candidate.goalColor === "string" && candidate.goalColor.length > 0 ? candidate.goalColor : DEFAULT_CHART_WIDGET_SETTINGS.goalColor,
    goalStyle: candidate.goalStyle === "solid" ? "solid" : "dashed",
    lineColor: typeof candidate.lineColor === "string" && candidate.lineColor.length > 0 ? candidate.lineColor : DEFAULT_CHART_WIDGET_SETTINGS.lineColor,
    lineStyle: candidate.lineStyle === "dashed" ? "dashed" : "solid",
    yAxisStep: typeof candidate.yAxisStep === "number" && candidate.yAxisStep > 0 ? Math.floor(candidate.yAxisStep) : DEFAULT_CHART_WIDGET_SETTINGS.yAxisStep,
    showYAxisTitle: typeof candidate.showYAxisTitle === "boolean" ? candidate.showYAxisTitle : DEFAULT_CHART_WIDGET_SETTINGS.showYAxisTitle,
    showYAxisLabels: typeof candidate.showYAxisLabels === "boolean" ? candidate.showYAxisLabels : DEFAULT_CHART_WIDGET_SETTINGS.showYAxisLabels,
    showXAxisTitle: typeof candidate.showXAxisTitle === "boolean" ? candidate.showXAxisTitle : DEFAULT_CHART_WIDGET_SETTINGS.showXAxisTitle,
    showXAxisLabels: typeof candidate.showXAxisLabels === "boolean" ? candidate.showXAxisLabels : DEFAULT_CHART_WIDGET_SETTINGS.showXAxisLabels,
    chartXAxisMode: candidate.chartXAxisMode === "age" ? "age" : "year",
    showLegend: typeof candidate.showLegend === "boolean" ? candidate.showLegend : DEFAULT_CHART_WIDGET_SETTINGS.showLegend,
    legendPosition:
      candidate.legendPosition === "top-left" ||
      candidate.legendPosition === "top-center" ||
      candidate.legendPosition === "top-right" ||
      candidate.legendPosition === "bottom-left" ||
      candidate.legendPosition === "bottom-center" ||
      candidate.legendPosition === "bottom-right"
        ? candidate.legendPosition
        : DEFAULT_CHART_WIDGET_SETTINGS.legendPosition,
    showDataPoints: typeof candidate.showDataPoints === "boolean" ? candidate.showDataPoints : DEFAULT_CHART_WIDGET_SETTINGS.showDataPoints,
    showPointValues: typeof candidate.showPointValues === "boolean" ? candidate.showPointValues : DEFAULT_CHART_WIDGET_SETTINGS.showPointValues,
    filterStartYear: typeof candidate.filterStartYear === "string" ? candidate.filterStartYear : "",
    filterEndYear: typeof candidate.filterEndYear === "string" ? candidate.filterEndYear : "",
    filterSections: Array.isArray(candidate.filterSections) && candidate.filterSections.every((entry) => typeof entry === "string")
      ? (candidate.filterSections as string[])
      : DEFAULT_CHART_WIDGET_SETTINGS.filterSections,
  };
}

function coerceTableWidgetSettings(value: unknown): TableWidgetSettings {
  if (!value || typeof value !== "object") return DEFAULT_TABLE_WIDGET_SETTINGS;

  const candidate = value as Record<string, unknown>;
  return {
    tableTitleEnabled: typeof candidate.tableTitleEnabled === "boolean" ? candidate.tableTitleEnabled : DEFAULT_TABLE_WIDGET_SETTINGS.tableTitleEnabled,
    tableTitleText: typeof candidate.tableTitleText === "string" && candidate.tableTitleText.length > 0
      ? candidate.tableTitleText
      : DEFAULT_TABLE_WIDGET_SETTINGS.tableTitleText,
    tableTitleAlign: candidate.tableTitleAlign === "center" || candidate.tableTitleAlign === "right" ? candidate.tableTitleAlign : "left",
    tableXAxisMode: candidate.tableXAxisMode === "age" ? "age" : "year",
    filterStartYear: typeof candidate.filterStartYear === "string" ? candidate.filterStartYear : "",
    filterEndYear: typeof candidate.filterEndYear === "string" ? candidate.filterEndYear : "",
    filterSections: Array.isArray(candidate.filterSections) && candidate.filterSections.every((entry) => typeof entry === "string")
      ? (candidate.filterSections as string[])
      : DEFAULT_TABLE_WIDGET_SETTINGS.filterSections,
  };
}

function buildSectionSummary(selected: string[]) {
  if (selected.length === 0) return TOTAL_SERIES;
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function Overview() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [saveJustCompleted, setSaveJustCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [markdownTabById, setMarkdownTabById] = useState<Record<string, "edit" | "preview">>({});
  const [expandedTableSectionsById, setExpandedTableSectionsById] = useState<Record<string, Set<string>>>({});

  const [defaultWidgetInstances] = useState<OverviewWidgetInstance[]>(createDefaultWidgetInstances);
  const defaultChartId = defaultWidgetInstances.find((item) => item.key === "chart")!.id;
  const defaultCaptionId = defaultWidgetInstances.find((item) => item.key === "captions")!.id;
  const defaultTableId = defaultWidgetInstances.find((item) => item.key === "categories")!.id;

  const [savedWidgetInstances, setSavedWidgetInstances] = useState<OverviewWidgetInstance[]>(defaultWidgetInstances);
  const [draftWidgetInstances, setDraftWidgetInstances] = useState<OverviewWidgetInstance[]>(defaultWidgetInstances);

  const [savedCaptionsById, setSavedCaptionsById] = useState<Record<string, string>>(() => ({ [defaultCaptionId]: DEFAULT_CAPTION_MD }));
  const [draftCaptionsById, setDraftCaptionsById] = useState<Record<string, string>>(() => ({ [defaultCaptionId]: DEFAULT_CAPTION_MD }));
  const [savedChartSettingsById, setSavedChartSettingsById] = useState<Record<string, ChartWidgetSettings>>(() => ({ [defaultChartId]: DEFAULT_CHART_WIDGET_SETTINGS }));
  const [draftChartSettingsById, setDraftChartSettingsById] = useState<Record<string, ChartWidgetSettings>>(() => ({ [defaultChartId]: DEFAULT_CHART_WIDGET_SETTINGS }));
  const [savedTableSettingsById, setSavedTableSettingsById] = useState<Record<string, TableWidgetSettings>>(() => ({ [defaultTableId]: DEFAULT_TABLE_WIDGET_SETTINGS }));
  const [draftTableSettingsById, setDraftTableSettingsById] = useState<Record<string, TableWidgetSettings>>(() => ({ [defaultTableId]: DEFAULT_TABLE_WIDGET_SETTINGS }));

  const [years, setYears] = useState<number[]>([]);
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [sectionNames, setSectionNames] = useState<string[]>([]);
  const [netWorthByYear, setNetWorthByYear] = useState<Map<number, number>>(new Map());
  const [groupTotalsByYear, setGroupTotalsByYear] = useState<Map<string, Map<number, number>>>(new Map());
  const [accountRowsByGroup, setAccountRowsByGroup] = useState<Map<string, AccountTotalsRow[]>>(new Map());

  useEffect(() => {
    void loadOverview();
  }, []);

  async function loadOverview() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setStatusMessage(null);

      let groups: EntryGroupRow[] = [];
      let accounts: EntryAccountRow[] = [];
      let values: EntryValueRow[] = [];
      let settingsRow: Record<string, any> | undefined;
      let birthDateValue: unknown = null;

      if (authClient.mode === "custom") {
        const response = await fetch(apiUrl("/api/overview"), {
          method: "GET",
          credentials: "include",
        });

        if (response.status === 401) {
          throw new Error("Please sign in again.");
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error ?? payload?.message ?? "Could not load overview."));
        }

        groups = (payload?.data?.groups ?? []) as EntryGroupRow[];
        accounts = (payload?.data?.accounts ?? []) as EntryAccountRow[];
        values = (payload?.data?.values ?? []) as EntryValueRow[];
        settingsRow = (payload?.data?.settings ?? undefined) as Record<string, any> | undefined;
        birthDateValue = payload?.data?.birth_date ?? null;
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Please sign in again.");

        const userId = userData.user.id;
        birthDateValue = (userData.user.user_metadata as Record<string, unknown> | undefined)?.birth_date;

        const [{ data: groupsData, error: groupsError }, { data: accountsData, error: accountsError }, { data: valuesData, error: valuesError }, { data: settingsData, error: settingsError }] = await Promise.all([
          supabase.from("entry_groups").select("id,name").eq("user_id", userId).order("position", { ascending: true }),
          supabase.from("entry_accounts").select("id,group_id,name,coin_symbol,is_debt").eq("user_id", userId).order("position", { ascending: true }),
          supabase.from("entry_account_values").select("account_id,year,value,conversion_rate").eq("user_id", userId).order("year", { ascending: true }),
          supabase.from("entry_settings").select("*").eq("user_id", userId).limit(1),
        ]);

        if (groupsError) throw groupsError;
        if (accountsError) throw accountsError;
        if (valuesError) throw valuesError;
        if (settingsError) throw settingsError;

        groups = (groupsData ?? []) as EntryGroupRow[];
        accounts = (accountsData ?? []) as EntryAccountRow[];
        values = (valuesData ?? []) as EntryValueRow[];
        settingsRow = (settingsData ?? [])[0] as Record<string, any> | undefined;
      }

      setBirthday(parseBirthday(birthDateValue));
      const startYear = typeof settingsRow?.start_year === "number" ? settingsRow.start_year : null;
      const endYear = typeof settingsRow?.end_year === "number" ? settingsRow.end_year : null;

      const yearsFromSettings = buildYearsFromRange(startYear, endYear);
      const yearsFromValues = [...new Set(values.map((row) => row.year))].sort((a, b) => a - b);
      const nextYears = yearsFromSettings.length > 0 ? yearsFromSettings : yearsFromValues;
      setYears(nextYears);

      const accountToGroup = new Map<string, string>();
      const accountCoinMap = new Map<string, string | null>();
      const accountDebtMap = new Map<string, boolean>();
      for (const account of accounts) {
        accountToGroup.set(account.id, account.group_id);
        accountCoinMap.set(account.id, account.coin_symbol ?? null);
        accountDebtMap.set(account.id, Boolean(account.is_debt));
      }

      const groupNameById = new Map<string, string>();
      for (const group of groups) {
        groupNameById.set(group.id, group.name);
      }

      const accountNameById = new Map<string, string>();
      for (const account of accounts) {
        accountNameById.set(account.id, account.name);
      }

      const nextNetWorthByYear = new Map<number, number>();
      const nextGroupTotalsByYear = new Map<string, Map<number, number>>();
      const nextAccountTotalsByGroup = new Map<string, Map<string, AccountTotalsRow>>();

      for (const valueRow of values) {
        if (!nextYears.includes(valueRow.year)) continue;

        const rawAmount = parseNumericValue(valueRow.value);
        const coinSymbol = accountCoinMap.get(valueRow.account_id);
        const conversionRate = parseNumericValue(valueRow.conversion_rate ?? "");
        const convertedAmount = (coinSymbol && conversionRate > 0)
          ? rawAmount * conversionRate
          : rawAmount;
        const amount = accountDebtMap.get(valueRow.account_id) ? -convertedAmount : convertedAmount;

        nextNetWorthByYear.set(valueRow.year, (nextNetWorthByYear.get(valueRow.year) ?? 0) + amount);

        const groupId = accountToGroup.get(valueRow.account_id);
        if (!groupId) continue;

        const groupName = groupNameById.get(groupId) ?? "Uncategorized";
        const groupYearMap = nextGroupTotalsByYear.get(groupName) ?? new Map<number, number>();
        groupYearMap.set(valueRow.year, (groupYearMap.get(valueRow.year) ?? 0) + amount);
        nextGroupTotalsByYear.set(groupName, groupYearMap);

        const groupAccounts = nextAccountTotalsByGroup.get(groupName) ?? new Map<string, AccountTotalsRow>();
        const accountRow = groupAccounts.get(valueRow.account_id) ?? {
          id: valueRow.account_id,
          name: accountNameById.get(valueRow.account_id) ?? "Unnamed account",
          valuesByYear: new Map<number, number>(),
        };
        accountRow.valuesByYear.set(valueRow.year, (accountRow.valuesByYear.get(valueRow.year) ?? 0) + amount);
        groupAccounts.set(valueRow.account_id, accountRow);
        nextAccountTotalsByGroup.set(groupName, groupAccounts);
      }

      setNetWorthByYear(nextNetWorthByYear);
      setGroupTotalsByYear(nextGroupTotalsByYear);
      setAccountRowsByGroup(new Map(
        [...nextAccountTotalsByGroup.entries()].map(([groupName, accountsMap]) => [
          groupName,
          [...accountsMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
        ])
      ));
      const sortedSectionNames = [...new Set([
        ...groups.map((group) => group.name),
        ...nextGroupTotalsByYear.keys(),
      ])];
      setSectionNames(sortedSectionNames);

      const persistedWidgets = settingsRow?.overview_widgets;
      const rawChartSettingsBlob = settingsRow?.overview_chart_settings;
      const chartBlob = (rawChartSettingsBlob && typeof rawChartSettingsBlob === "object" ? (rawChartSettingsBlob as Record<string, unknown>).chart : undefined) as Record<string, unknown> | undefined;
      const tableBlob = (rawChartSettingsBlob && typeof rawChartSettingsBlob === "object" ? (rawChartSettingsBlob as Record<string, unknown>).table : undefined) as Record<string, unknown> | undefined;
      const isNestedSettingsBlob = Boolean(chartBlob || tableBlob);

      let nextInstances: OverviewWidgetInstance[];
      let nextChartSettingsById: Record<string, ChartWidgetSettings> = {};
      let nextTableSettingsById: Record<string, TableWidgetSettings> = {};
      let nextCaptionsById: Record<string, string> = {};

      if (isWidgetInstanceArray(persistedWidgets) && persistedWidgets.length > 0) {
        nextInstances = persistedWidgets;

        let parsedCaptions: Record<string, unknown> = {};
        if (typeof settingsRow?.overview_caption_md === "string" && settingsRow.overview_caption_md.length > 0) {
          try {
            const parsed = JSON.parse(settingsRow.overview_caption_md);
            if (parsed && typeof parsed === "object") parsedCaptions = parsed as Record<string, unknown>;
          } catch {
            // malformed captions blob, defaults applied below
          }
        }

        for (const instance of nextInstances) {
          if (instance.key === "chart") nextChartSettingsById[instance.id] = coerceChartWidgetSettings(chartBlob?.[instance.id]);
          if (instance.key === "categories") nextTableSettingsById[instance.id] = coerceTableWidgetSettings(tableBlob?.[instance.id]);
          if (instance.key === "captions") {
            const raw = parsedCaptions[instance.id];
            nextCaptionsById[instance.id] = typeof raw === "string" ? raw : DEFAULT_CAPTION_MD;
          }
        }
      } else if (isLegacyWidgetPreferenceArray(persistedWidgets)) {
        nextInstances = persistedWidgets.filter((item) => item.enabled).map((item) => ({ id: generateWidgetId(), key: item.key }));
        if (nextInstances.length === 0) nextInstances = createDefaultWidgetInstances();

        const legacySettings = isNestedSettingsBlob ? undefined : rawChartSettingsBlob;
        const legacyCaption =
          typeof settingsRow?.overview_caption_md === "string" && settingsRow.overview_caption_md.length > 0
            ? settingsRow.overview_caption_md
            : DEFAULT_CAPTION_MD;

        for (const instance of nextInstances) {
          if (instance.key === "chart") nextChartSettingsById[instance.id] = coerceChartWidgetSettings(legacySettings);
          if (instance.key === "categories") nextTableSettingsById[instance.id] = coerceTableWidgetSettings(legacySettings);
          if (instance.key === "captions") nextCaptionsById[instance.id] = legacyCaption;
        }
      } else {
        nextInstances = defaultWidgetInstances;
        nextChartSettingsById = { [defaultChartId]: DEFAULT_CHART_WIDGET_SETTINGS };
        nextTableSettingsById = { [defaultTableId]: DEFAULT_TABLE_WIDGET_SETTINGS };
        nextCaptionsById = { [defaultCaptionId]: DEFAULT_CAPTION_MD };
      }

      setSavedWidgetInstances(nextInstances);
      setDraftWidgetInstances(nextInstances);
      setSavedChartSettingsById(nextChartSettingsById);
      setDraftChartSettingsById(nextChartSettingsById);
      setSavedTableSettingsById(nextTableSettingsById);
      setDraftTableSettingsById(nextTableSettingsById);
      setSavedCaptionsById(nextCaptionsById);
      setDraftCaptionsById(nextCaptionsById);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load overview.");
    } finally {
      setIsLoading(false);
    }
  }

  const activeWidgetInstances = isCustomizeOpen ? draftWidgetInstances : savedWidgetInstances;
  const ageModeAvailable = birthday !== null;

  const hasUnsavedChanges = useMemo(() => {
    const instancesChanged = JSON.stringify(savedWidgetInstances) !== JSON.stringify(draftWidgetInstances);
    const chartChanged = JSON.stringify(savedChartSettingsById) !== JSON.stringify(draftChartSettingsById);
    const tableChanged = JSON.stringify(savedTableSettingsById) !== JSON.stringify(draftTableSettingsById);
    const captionsChanged = JSON.stringify(savedCaptionsById) !== JSON.stringify(draftCaptionsById);
    return instancesChanged || chartChanged || tableChanged || captionsChanged;
  }, [
    savedWidgetInstances,
    draftWidgetInstances,
    savedChartSettingsById,
    draftChartSettingsById,
    savedTableSettingsById,
    draftTableSettingsById,
    savedCaptionsById,
    draftCaptionsById,
  ]);

  function openEdit() {
    setDraftWidgetInstances(savedWidgetInstances);
    setDraftChartSettingsById(savedChartSettingsById);
    setDraftTableSettingsById(savedTableSettingsById);
    setDraftCaptionsById(savedCaptionsById);
    setIsCustomizeOpen(true);
    setStatusMessage(null);
  }

  function closeEdit() {
    if (hasUnsavedChanges) {
      const shouldDiscard = window.confirm("Your changes will be discarded");
      if (!shouldDiscard) return;
    }
    setDraftWidgetInstances(savedWidgetInstances);
    setDraftChartSettingsById(savedChartSettingsById);
    setDraftTableSettingsById(savedTableSettingsById);
    setDraftCaptionsById(savedCaptionsById);
    setIsCustomizeOpen(false);
    setStatusMessage(null);
  }

  async function saveOverviewLayout() {
    try {
      setIsSavingLayout(true);
      setSaveJustCompleted(false);
      setErrorMessage(null);
      setStatusMessage(null);

      const chartSettingsBlob = {
        chart: Object.fromEntries(
          draftWidgetInstances.filter((item) => item.key === "chart").map((item) => [item.id, draftChartSettingsById[item.id] ?? DEFAULT_CHART_WIDGET_SETTINGS])
        ),
        table: Object.fromEntries(
          draftWidgetInstances.filter((item) => item.key === "categories").map((item) => [item.id, draftTableSettingsById[item.id] ?? DEFAULT_TABLE_WIDGET_SETTINGS])
        ),
      };
      const captionsBlob = JSON.stringify(
        Object.fromEntries(
          draftWidgetInstances.filter((item) => item.key === "captions").map((item) => [item.id, draftCaptionsById[item.id] ?? DEFAULT_CAPTION_MD])
        )
      );

      if (authClient.mode === "custom") {
        const response = await fetch(apiUrl("/api/overview/layout"), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overview_widgets: draftWidgetInstances,
            overview_caption_md: captionsBlob,
            overview_chart_settings: chartSettingsBlob,
          }),
        });

        if (response.status === 401) {
          throw new Error("Please sign in again.");
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error ?? payload?.message ?? "Could not save layout."));
        }
      } else {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) throw new Error("Please sign in again.");

        const { error } = await supabase.from("entry_settings").upsert(
          {
            user_id: userData.user.id,
            overview_widgets: draftWidgetInstances,
            overview_caption_md: captionsBlob,
            overview_chart_settings: chartSettingsBlob,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (error) throw error;
      }

      setSavedWidgetInstances(draftWidgetInstances);
      setSavedChartSettingsById(draftChartSettingsById);
      setSavedTableSettingsById(draftTableSettingsById);
      setSavedCaptionsById(draftCaptionsById);
      setSaveJustCompleted(true);
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      setIsCustomizeOpen(false);
      setSaveJustCompleted(false);
    } catch (err: any) {
      console.error(err);
      setSaveJustCompleted(false);
      setErrorMessage(err.message ?? "Could not save layout.");
    } finally {
      setIsSavingLayout(false);
    }
  }

  function addWidgetInstance(key: OverviewWidgetKey) {
    const id = generateWidgetId();
    setDraftWidgetInstances((prev) => [...prev, { id, key }]);
    if (key === "chart") setDraftChartSettingsById((prev) => ({ ...prev, [id]: DEFAULT_CHART_WIDGET_SETTINGS }));
    if (key === "categories") setDraftTableSettingsById((prev) => ({ ...prev, [id]: DEFAULT_TABLE_WIDGET_SETTINGS }));
    if (key === "captions") setDraftCaptionsById((prev) => ({ ...prev, [id]: DEFAULT_CAPTION_MD }));
  }

  function removeWidgetInstance(id: string) {
    setDraftWidgetInstances((prev) => prev.filter((item) => item.id !== id));
  }

  function reorderActiveWidgets(sourceId: string, targetId: string) {
    setDraftWidgetInstances((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === sourceId);
      const toIndex = prev.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function updateChartSettings(id: string, patch: Partial<ChartWidgetSettings>) {
    setDraftChartSettingsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_CHART_WIDGET_SETTINGS), ...patch } }));
  }

  function updateTableSettings(id: string, patch: Partial<TableWidgetSettings>) {
    setDraftTableSettingsById((prev) => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_TABLE_WIDGET_SETTINGS), ...patch } }));
  }

  function updateCaption(id: string, value: string) {
    setDraftCaptionsById((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMultiSelect(value: string, selected: string[], setSelected: (next: string[]) => void) {
    const exists = selected.includes(value);
    if (exists) {
      const next = selected.filter((item) => item !== value);
      setSelected(next.length > 0 ? next : [TOTAL_SERIES]);
      return;
    }

    if (value === TOTAL_SERIES) {
      setSelected([TOTAL_SERIES, ...selected.filter((item) => item !== TOTAL_SERIES)]);
      return;
    }

    setSelected([...selected.filter((item) => item !== TOTAL_SERIES), value]);
  }

  function computeFilteredYears(filterStartYear: string, filterEndYear: string) {
    return years.filter((year) => {
      if (filterStartYear && year < Number(filterStartYear)) return false;
      if (filterEndYear && year > Number(filterEndYear)) return false;
      return true;
    });
  }

  function computeChartSeriesDefinitions(settings: ChartWidgetSettings, filteredYears: number[]): SeriesDefinition[] {
    const selected = settings.filterSections.length > 0 ? settings.filterSections : [TOTAL_SERIES];
    return selected.map((name, index) => {
      const values = filteredYears.map((year) => {
        if (name === TOTAL_SERIES) return netWorthByYear.get(year) ?? null;
        return groupTotalsByYear.get(name)?.get(year) ?? null;
      });
      return {
        name,
        values,
        color: name === TOTAL_SERIES ? settings.lineColor : SERIES_PALETTE[index % SERIES_PALETTE.length],
        style: name === TOTAL_SERIES ? settings.lineStyle : "solid",
      };
    });
  }

  function computeTableRows(settings: TableWidgetSettings, filteredYears: number[]) {
    const selectedSet = new Set(settings.filterSections.length > 0 ? settings.filterSections : sectionNames);
    const orderedNames = [
      ...(selectedSet.has(TOTAL_SERIES) ? [TOTAL_SERIES] : []),
      ...sectionNames.filter((name) => selectedSet.has(name)),
    ];
    return orderedNames.map((name) => ({
      label: name === TOTAL_SERIES ? "Total Net Worth" : name,
      values: filteredYears.map((year) => {
        const rawValue = name === TOTAL_SERIES
          ? netWorthByYear.get(year) ?? 0
          : groupTotalsByYear.get(name)?.get(year) ?? 0;
        return name === TOTAL_SERIES ? rawValue : Math.round(rawValue / 1000) * 1000;
      }),
      accounts: name === TOTAL_SERIES ? [] : (accountRowsByGroup.get(name) ?? []).map((account) => ({
        id: account.id,
        label: account.name,
        values: filteredYears.map((year) => account.valuesByYear.get(year) ?? 0),
      })),
    }));
  }

  function toggleTableSection(instanceId: string, name: string) {
    setExpandedTableSectionsById((prev) => {
      const next = new Set(prev[instanceId] ?? []);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...prev, [instanceId]: next };
    });
  }

  function computeChartGeometry(settings: ChartWidgetSettings, seriesDefinitions: SeriesDefinition[], filteredYearsCount: number) {
    const width = 920;
    const height = 320;
    const left = 78;
    const right = 24;
    const top = 22;
    const bottom = settings.showXAxisTitle ? 70 : settings.showXAxisLabels ? 52 : 26;
    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;

    const sourceValues = seriesDefinitions.flatMap((series) => series.values.filter((value): value is number => value !== null));
    if (settings.goalValue !== null) sourceValues.push(settings.goalValue);
    if (sourceValues.length === 0) sourceValues.push(0);

    const minValueRaw = Math.min(0, ...sourceValues);
    const maxValueRaw = Math.max(0, ...sourceValues);
    const step = Math.max(1, Math.floor(settings.yAxisStep));
    const minValue = Math.floor(minValueRaw / step) * step;
    const configuredUpper = settings.yAxisUpperBound;
    const autoMax = Math.ceil(maxValueRaw / step) * step;
    const configuredMax = configuredUpper === null ? null : Math.max(configuredUpper, minValue + step);
    const maxValue = configuredMax ?? autoMax;
    const spread = Math.max(step, maxValue - minValue);

    const valueToY = (value: number) => top + (1 - (value - minValue) / spread) * usableHeight;
    const indexToX = (index: number) =>
      left + (filteredYearsCount <= 1 ? usableWidth / 2 : (index / (filteredYearsCount - 1)) * usableWidth);

    const yTicks: number[] = [];
    if (configuredMax !== null) {
      for (let tick = minValue; tick < maxValue; tick += step) {
        yTicks.push(tick);
        if (yTicks.length > 23) break;
      }
      if (yTicks.length === 0 || yTicks[yTicks.length - 1] !== maxValue) {
        yTicks.push(maxValue);
      }
    } else {
      for (let tick = minValue; tick <= maxValue; tick += step) {
        yTicks.push(tick);
        if (yTicks.length > 24) break;
      }
    }

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      yTicks,
      valueToY,
      indexToX,
      goalY: settings.goalValue === null ? null : valueToY(settings.goalValue),
      baselineY: height - bottom,
    };
  }

  function getLegendPositionClass(position: LegendPosition) {
    if (position === "top-left") return styles.legendTopLeft;
    if (position === "top-center") return styles.legendTopCenter;
    if (position === "top-right") return styles.legendTopRight;
    if (position === "bottom-left") return styles.legendBottomLeft;
    if (position === "bottom-center") return styles.legendBottomCenter;
    return styles.legendBottomRight;
  }

  function renderSectionSelector(selected: string[], setSelected: (next: string[]) => void, prefix: string) {
    return (
      <details className={styles.multiSelect}>
        <summary>{buildSectionSummary(selected)}</summary>
        <div className={styles.multiSelectPanel}>
          {[TOTAL_SERIES, ...sectionNames].map((name) => {
            const checked = selected.includes(name);
            return (
              <label key={`${prefix}-${name}`} className={styles.multiSelectOption}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMultiSelect(name, selected, setSelected)}
                />
                <span>{name}</span>
              </label>
            );
          })}
        </div>
      </details>
    );
  }

  function trySetChartAxisMode(id: string, mode: AxisMode) {
    if (mode === "age" && isLoading) return;
    if (mode === "age" && !ageModeAvailable) {
      window.alert("Add your birthday in Profile before using Age mode.");
      return;
    }
    updateChartSettings(id, { chartXAxisMode: mode });
  }

  function trySetTableAxisMode(id: string, mode: AxisMode) {
    if (mode === "age" && isLoading) return;
    if (mode === "age" && !ageModeAvailable) {
      window.alert("Add your birthday in Profile before using Age mode.");
      return;
    }
    updateTableSettings(id, { tableXAxisMode: mode });
  }

  function renderChartWidget(instance: OverviewWidgetInstance) {
    const settings = isCustomizeOpen ? (draftChartSettingsById[instance.id] ?? DEFAULT_CHART_WIDGET_SETTINGS) : (savedChartSettingsById[instance.id] ?? DEFAULT_CHART_WIDGET_SETTINGS);
    const filteredYears = computeFilteredYears(settings.filterStartYear, settings.filterEndYear);
    const seriesDefinitions = computeChartSeriesDefinitions(settings, filteredYears);
    const geometry = computeChartGeometry(settings, seriesDefinitions, filteredYears.length);
    const effectiveAxisMode: AxisMode = settings.chartXAxisMode === "age" && ageModeAvailable ? "age" : "year";
    const legendPositionClass = getLegendPositionClass(settings.legendPosition);

    return (
      <section className={styles.widgetCard} key={instance.id}>
        {isCustomizeOpen && (
          <div className={styles.chartSettingsShell}>
            <section className={styles.settingsGroup}>
              <h3>Title</h3>
              <div className={styles.settingsGrid}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.titleEnabled}
                    onChange={(event) => updateChartSettings(instance.id, { titleEnabled: event.target.checked })}
                  />
                  Show Title
                </label>
                <label>
                  Title Text
                  <input
                    type="text"
                    value={settings.titleText}
                    onChange={(event) => updateChartSettings(instance.id, { titleText: event.target.value })}
                  />
                </label>
                <label>
                  Title Align
                  <select
                    value={settings.titleAlign}
                    onChange={(event) => updateChartSettings(instance.id, { titleAlign: event.target.value as TitleAlign })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Legend</h3>
              <div className={styles.settingsGrid}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showLegend}
                    onChange={(event) => updateChartSettings(instance.id, { showLegend: event.target.checked })}
                  />
                  Show Legend
                </label>
                <label>
                  Legend Position
                  <select
                    value={settings.legendPosition}
                    onChange={(event) => updateChartSettings(instance.id, { legendPosition: event.target.value as LegendPosition })}
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Filters</h3>
              <div className={styles.settingsGrid}>
                <label>
                  Time From
                  <select value={settings.filterStartYear} onChange={(event) => updateChartSettings(instance.id, { filterStartYear: event.target.value })}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`chart-start-${instance.id}-${year}`} value={String(year)}>
                        {formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time To
                  <select value={settings.filterEndYear} onChange={(event) => updateChartSettings(instance.id, { filterEndYear: event.target.value })}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`chart-end-${instance.id}-${year}`} value={String(year)}>
                        {formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Section
                  {renderSectionSelector(settings.filterSections, (next) => updateChartSettings(instance.id, { filterSections: next }), `chart-${instance.id}`)}
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Series</h3>
              <div className={styles.settingsGrid}>
                <label>
                  Total Line Color
                  <input
                    type="color"
                    value={settings.lineColor}
                    onChange={(event) => updateChartSettings(instance.id, { lineColor: event.target.value })}
                  />
                </label>
                <label>
                  Total Line Style
                  <select
                    value={settings.lineStyle}
                    onChange={(event) => updateChartSettings(instance.id, { lineStyle: event.target.value as LineStyle })}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showDataPoints}
                    onChange={(event) => updateChartSettings(instance.id, { showDataPoints: event.target.checked })}
                  />
                  Show Data Points
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showPointValues}
                    onChange={(event) => updateChartSettings(instance.id, { showPointValues: event.target.checked })}
                  />
                  Show Point Values
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Goal Line</h3>
              <div className={styles.settingsGrid}>
                <label>
                  Goal Net Worth
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(settings.goalValue)}
                    placeholder="No goal"
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      updateChartSettings(instance.id, { goalValue: parsed !== null && Number.isFinite(parsed) ? parsed : null });
                    }}
                  />
                </label>
                <label>
                  Goal Color
                  <input
                    type="color"
                    value={settings.goalColor}
                    onChange={(event) => updateChartSettings(instance.id, { goalColor: event.target.value })}
                  />
                </label>
                <label>
                  Goal Style
                  <select
                    value={settings.goalStyle}
                    onChange={(event) => updateChartSettings(instance.id, { goalStyle: event.target.value as LineStyle })}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Axes</h3>
              <div className={styles.settingsGrid}>
                <label>
                  Y-Axis Step ($)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(settings.yAxisStep)}
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return;
                      updateChartSettings(instance.id, { yAxisStep: Math.floor(parsed) });
                    }}
                  />
                </label>
                <label>
                  Y-Axis Upper Bound ($)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(settings.yAxisUpperBound)}
                    placeholder="Auto"
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      updateChartSettings(instance.id, { yAxisUpperBound: parsed !== null && Number.isFinite(parsed) ? parsed : null });
                    }}
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showYAxisTitle}
                    onChange={(event) => updateChartSettings(instance.id, { showYAxisTitle: event.target.checked })}
                  />
                  Y-Axis Title
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showYAxisLabels}
                    onChange={(event) => updateChartSettings(instance.id, { showYAxisLabels: event.target.checked })}
                  />
                  Y-Axis Labels
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showXAxisTitle}
                    onChange={(event) => updateChartSettings(instance.id, { showXAxisTitle: event.target.checked })}
                  />
                  X-Axis Title
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showXAxisLabels}
                    onChange={(event) => updateChartSettings(instance.id, { showXAxisLabels: event.target.checked })}
                  />
                  X-Axis Labels
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.chartXAxisMode === "age"}
                    disabled={isLoading}
                    onChange={(event) => trySetChartAxisMode(instance.id, event.target.checked ? "age" : "year")}
                  />
                  Use Age On X-Axis
                </label>
              </div>
            </section>
          </div>
        )}

        <div className={`${styles.chartWrap} ${styles.chartWrapFlat}`}>
          {settings.titleEnabled && (
            <h2 className={`${styles.chartTitle} ${settings.titleAlign === "center" ? styles.alignCenter : settings.titleAlign === "right" ? styles.alignRight : styles.alignLeft}`}>
              {settings.titleText}
            </h2>
          )}

          {settings.showLegend && (
            <div className={`${styles.chartLegendRow} ${legendPositionClass}`}>
              {seriesDefinitions.map((series) => (
                <span key={`legend-inline-${instance.id}-${series.name}`} className={styles.legendItem}>
                  <span
                    className={styles.legendSwatchLine}
                    style={{ borderColor: series.color, borderStyle: series.style === "dashed" ? "dashed" : "solid" }}
                  />
                  {series.name}
                </span>
              ))}
              {settings.goalValue !== null && (
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatchGoal}
                    style={{ borderColor: settings.goalColor, borderStyle: settings.goalStyle === "dashed" ? "dashed" : "solid" }}
                  />
                  Goal
                </span>
              )}
            </div>
          )}

          <svg className={styles.chartSvg} viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Net worth trend line chart">
            {geometry.yTicks.map((tick) => (
              <line
                key={`grid-${instance.id}-${tick}`}
                x1={geometry.left}
                y1={geometry.valueToY(tick)}
                x2={geometry.width - geometry.right}
                y2={geometry.valueToY(tick)}
                stroke="#e2e2e2"
                strokeWidth="1"
              />
            ))}

            <line x1={geometry.left} y1={geometry.baselineY} x2={geometry.width - geometry.right} y2={geometry.baselineY} stroke="#d0d0d0" strokeWidth="1" />
            <line x1={geometry.left} y1={geometry.top} x2={geometry.left} y2={geometry.baselineY} stroke="#d0d0d0" strokeWidth="1" />

            {settings.goalValue !== null && geometry.goalY !== null && (
              <line
                x1={geometry.left}
                y1={geometry.goalY}
                x2={geometry.width - geometry.right}
                y2={geometry.goalY}
                stroke={settings.goalColor}
                strokeWidth="2"
                strokeDasharray={settings.goalStyle === "dashed" ? "8 5" : undefined}
              />
            )}

            {seriesDefinitions.map((series) => {
              type ChartPoint = { x: number; y: number; value: number; index: number };
              const points = series.values.map((value, index) => (
                value === null
                  ? null
                  : { x: geometry.indexToX(index), y: geometry.valueToY(value), value, index }
              ));
              const lineSegments: ChartPoint[][] = [];
              let currentSegment: ChartPoint[] = [];

              points.forEach((point) => {
                if (point === null) {
                  if (currentSegment.length > 0) {
                    lineSegments.push(currentSegment);
                    currentSegment = [];
                  }
                  return;
                }

                currentSegment.push(point);
              });

              if (currentSegment.length > 0) {
                lineSegments.push(currentSegment);
              }

              const visiblePoints = points.filter((point): point is ChartPoint => point !== null);
              return (
                <g key={`series-${instance.id}-${series.name}`}>
                  {lineSegments.map((segment, index) => (
                    <polyline
                      key={`line-${instance.id}-${series.name}-${index}`}
                      points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
                      fill="none"
                      stroke={series.color}
                      strokeWidth="2.5"
                      strokeDasharray={series.style === "dashed" ? "8 5" : undefined}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}

                  {(settings.showDataPoints || settings.showPointValues) && visiblePoints.map((point) => (
                    <g key={`point-${instance.id}-${series.name}-${point.index}`}>
                      {settings.showDataPoints && (
                      <circle cx={point.x} cy={point.y} r="3.5" fill={series.color} />
                      )}
                      {settings.showPointValues && (
                        <text x={point.x} y={point.y - 10} textAnchor="middle" className={styles.pointValueLabel} fill={series.color}>
                          ${formatMoney(point.value)}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}

            {settings.showYAxisLabels && geometry.yTicks.map((tick) => (
              <text
                key={`tick-label-${instance.id}-${tick}`}
                x={geometry.left - 10}
                y={geometry.valueToY(tick) + 4}
                textAnchor="end"
                className={styles.chartLabel}
              >
                ${formatMoney(tick)}
              </text>
            ))}

            {settings.showXAxisLabels && filteredYears.map((year, index) => (
              <text
                key={`x-label-${instance.id}-${year}`}
                x={geometry.indexToX(index)}
                y={geometry.baselineY + 18}
                textAnchor="middle"
                className={styles.chartLabel}
              >
                {formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}
              </text>
            ))}

            {settings.showXAxisTitle && (
              <text x={geometry.width / 2} y={geometry.height - 10} textAnchor="middle" className={styles.chartAxisTitle}>
                {effectiveAxisMode === "age" ? "Age" : "Year"}
              </text>
            )}

            {settings.showYAxisTitle && (
              <text x={18} y={geometry.height / 2} textAnchor="middle" transform={`rotate(-90 18 ${geometry.height / 2})`} className={styles.chartAxisTitle}>
                Amount ($)
              </text>
            )}
          </svg>
        </div>

      </section>
    );
  }

  function renderMarkdownWidget(instance: OverviewWidgetInstance) {
    const captionValue = isCustomizeOpen ? (draftCaptionsById[instance.id] ?? DEFAULT_CAPTION_MD) : (savedCaptionsById[instance.id] ?? DEFAULT_CAPTION_MD);
    const markdownSource = captionValue.length > 0 ? captionValue : DEFAULT_CAPTION_MD;
    const markdownTab = markdownTabById[instance.id] ?? "edit";

    return (
      <section className={styles.widgetCard} key={instance.id}>
        {isCustomizeOpen && <h2 className={styles.mdWidgetTitle}>MD Editor</h2>}
        <div className={styles.captionEditorWrap}>
          {isCustomizeOpen ? (
            <div className={styles.captionTabsWrap}>
              <div className={styles.captionTabs}>
                <button
                  type="button"
                  className={`${styles.captionTab} ${markdownTab === "edit" ? styles.captionTabActive : ""}`}
                  onClick={() => setMarkdownTabById((prev) => ({ ...prev, [instance.id]: "edit" }))}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`${styles.captionTab} ${markdownTab === "preview" ? styles.captionTabActive : ""}`}
                  onClick={() => setMarkdownTabById((prev) => ({ ...prev, [instance.id]: "preview" }))}
                >
                  Preview
                </button>
              </div>

              <div className={styles.captionTabBody}>
                {markdownTab === "edit" ? (
                  <textarea
                    className={styles.captionEditor}
                    value={captionValue}
                    onChange={(event) => updateCaption(instance.id, event.target.value)}
                    placeholder={DEFAULT_CAPTION_MD}
                  />
                ) : (
                  <div className={styles.captionText}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdownSource}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`${styles.captionText} ${styles.captionTextFlat}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdownSource}</ReactMarkdown>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderTableWidget(instance: OverviewWidgetInstance) {
    const settings = isCustomizeOpen ? (draftTableSettingsById[instance.id] ?? DEFAULT_TABLE_WIDGET_SETTINGS) : (savedTableSettingsById[instance.id] ?? DEFAULT_TABLE_WIDGET_SETTINGS);
    const filteredYears = computeFilteredYears(settings.filterStartYear, settings.filterEndYear);
    const tableRows = computeTableRows(settings, filteredYears);
    const effectiveAxisMode: AxisMode = settings.tableXAxisMode === "age" && ageModeAvailable ? "age" : "year";
    const expandedSections = expandedTableSectionsById[instance.id] ?? new Set<string>();

    return (
      <section className={styles.widgetCard} key={instance.id}>
        {settings.tableTitleEnabled && (
          <h2 className={settings.tableTitleAlign === "center" ? styles.alignCenter : settings.tableTitleAlign === "right" ? styles.alignRight : styles.alignLeft}>
            {settings.tableTitleText}
          </h2>
        )}

        {isCustomizeOpen && (
          <div className={styles.chartSettingsShell}>
            <section className={styles.settingsGroup}>
              <h3>Title</h3>
              <div className={styles.settingsGrid}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.tableTitleEnabled}
                    onChange={(event) => updateTableSettings(instance.id, { tableTitleEnabled: event.target.checked })}
                  />
                  Show Title
                </label>
                <label>
                  Title Text
                  <input
                    type="text"
                    value={settings.tableTitleText}
                    onChange={(event) => updateTableSettings(instance.id, { tableTitleText: event.target.value })}
                  />
                </label>
                <label>
                  Title Align
                  <select
                    value={settings.tableTitleAlign}
                    onChange={(event) => updateTableSettings(instance.id, { tableTitleAlign: event.target.value as TitleAlign })}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Filters</h3>
              <div className={styles.filterBar}>
                <label>
                  Time From
                  <select value={settings.filterStartYear} onChange={(event) => updateTableSettings(instance.id, { filterStartYear: event.target.value })}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`table-start-${instance.id}-${year}`} value={String(year)}>
                        {formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time To
                  <select value={settings.filterEndYear} onChange={(event) => updateTableSettings(instance.id, { filterEndYear: event.target.value })}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`table-end-${instance.id}-${year}`} value={String(year)}>
                        {formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Section
                  {renderSectionSelector(settings.filterSections, (next) => updateTableSettings(instance.id, { filterSections: next }), `table-${instance.id}`)}
                </label>
              </div>
            </section>

            <section className={styles.settingsGroup}>
              <h3>Options</h3>
              <div className={styles.settingsGrid}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.tableXAxisMode === "age"}
                    disabled={isLoading}
                    onChange={(event) => trySetTableAxisMode(instance.id, event.target.checked ? "age" : "year")}
                  />
                  Use Age
                </label>
              </div>
            </section>
          </div>
        )}

        <div className={styles.overviewTableWrap}>
          <table className={styles.overviewTable}>
            <thead>
              <tr>
                <th aria-label="Category label column" />
                {filteredYears.map((year) => (
                  <th key={year}>{formatYearOrAgeLabel(year, effectiveAxisMode, birthday)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const isExpandable = row.label !== "Total Net Worth";
                const isExpanded = isExpandable && expandedSections.has(row.label);
                return (
                  <Fragment key={row.label}>
                    <tr>
                      <td>
                        <span className={styles.tableRowLabelWrap}>
                          {isExpandable && (
                            <button
                              type="button"
                              className={`${styles.tableRowChevron} ${isExpanded ? styles.tableRowChevronExpanded : ""}`}
                              onClick={() => toggleTableSection(instance.id, row.label)}
                              aria-label={isExpanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
                              aria-expanded={isExpanded}
                            >
                              &#9656;
                            </button>
                          )}
                          {row.label}
                        </span>
                      </td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${filteredYears[index]}`}>${formatMoney(value)}</td>
                      ))}
                    </tr>
                    {isExpanded && row.accounts.map((account) => (
                      <tr key={`${row.label}-${account.id}`} className={styles.tableAccountRow}>
                        <td>{account.label}</td>
                        {account.values.map((value, index) => (
                          <td key={`${row.label}-${account.id}-${filteredYears[index]}`}>${formatMoney(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderWidget(instance: OverviewWidgetInstance) {
    if (instance.key === "chart") return renderChartWidget(instance);
    if (instance.key === "captions") return renderMarkdownWidget(instance);
    return renderTableWidget(instance);
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
          <Link className={styles.profileLink} to="/profile" aria-label="Profile">
            <img className={styles.profileIcon} src={ASSETS.defaultProfileIcon} alt="" aria-hidden="true" />
          </Link>
        </header>

        <section className={styles.body}>
          <div className={styles.topRow}>
            <div>
              {errorMessage && <p className={styles.error}>{errorMessage}</p>}
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>
            {!isCustomizeOpen && (
              <button type="button" className={styles.customizeButton} onClick={openEdit}>
                Edit
              </button>
            )}
            {isCustomizeOpen && (
              <div className={styles.topActions}>
                <button type="button" className={styles.customizeButton} onClick={() => void saveOverviewLayout()} disabled={isSavingLayout || saveJustCompleted}>
                  {isSavingLayout ? "Saving..." : saveJustCompleted ? "Saved" : "Save"}
                </button>
                <button type="button" className={styles.customizeButton} onClick={closeEdit} disabled={isSavingLayout || saveJustCompleted}>
                  Close
                </button>
              </div>
            )}
          </div>

          {isCustomizeOpen && (
            <section className={styles.customizePanel}>
              <div className={styles.widgetChooserTable}>
                <section className={styles.widgetChooserColumn}>
                  <h3>Active widgets</h3>
                  <div className={styles.widgetChooserRows}>
                    {draftWidgetInstances.map((widget) => (
                      <div
                        key={`active-${widget.id}`}
                        className={`${styles.widgetChooserRow} ${styles.widgetChooserRowActive} ${draggedWidgetId === widget.id ? styles.widgetTileDragging : ""}`}
                        draggable
                        onDragStart={() => setDraggedWidgetId(widget.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedWidgetId) {
                            reorderActiveWidgets(draggedWidgetId, widget.id);
                          }
                          setDraggedWidgetId(null);
                        }}
                        onDragEnd={() => setDraggedWidgetId(null)}
                      >
                        <div className={styles.widgetChooserLabelWrap}>
                          <span className={styles.widgetDragHandle} aria-hidden="true" />
                          <span>{WIDGET_LABELS[widget.key]}</span>
                        </div>
                        <div className={styles.widgetChooserRowActions}>
                          <button type="button" onClick={() => removeWidgetInstance(widget.id)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.widgetChooserColumn}>
                  <h3>Available widgets</h3>
                  <div className={styles.widgetChooserRows}>
                    {WIDGET_TYPES.map((key) => (
                      <div key={`inactive-${key}`} className={styles.widgetChooserRow}>
                        <span>{WIDGET_LABELS[key]}</span>
                        <div className={styles.widgetChooserRowActions}>
                          <button type="button" onClick={() => addWidgetInstance(key)}>Add</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {isLoading && <p className={styles.loadingText}>Loading overview...</p>}
          {!isLoading && years.length === 0 && <p className={styles.emptyText}>No Entry history yet. Add values in Entry to populate your overview.</p>}

          {!isLoading && years.length > 0 && activeWidgetInstances.map((instance) => renderWidget(instance))}
        </section>
      </main>

      <Footer />
    </div>
  );
}
