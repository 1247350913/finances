import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
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

type TitleAlign = "left" | "center" | "right";
type LineStyle = "solid" | "dashed";
type LegendPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

type ChartSettings = {
  titleEnabled: boolean;
  titleText: string;
  titleAlign: TitleAlign;
  tableTitleEnabled: boolean;
  tableTitleText: string;
  tableTitleAlign: TitleAlign;
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
  showLegend: boolean;
  legendPosition: LegendPosition;
  showDataPoints: boolean;
  showPointValues: boolean;
};

type SeriesDefinition = {
  name: string;
  values: number[];
  color: string;
  style: LineStyle;
};

const DEFAULT_WIDGETS: OverviewWidgetPreference[] = [
  { key: "chart", enabled: true },
  { key: "captions", enabled: true },
  { key: "categories", enabled: true },
];

const WIDGET_LABELS: Record<OverviewWidgetKey, string> = {
  chart: "Net Worth Graph",
  captions: "MD Editor",
  categories: "Category Year Table",
};

const DEFAULT_CAPTION_MD = "Enter your own custom text here";
const TOTAL_SERIES = "Total";
const SERIES_PALETTE = ["#c05621", "#2f855a", "#805ad5", "#d69e2e", "#0f766e", "#c53030"];

const DEFAULT_CHART_SETTINGS: ChartSettings = {
  titleEnabled: true,
  titleText: "Net Worth Over Time",
  titleAlign: "left",
  tableTitleEnabled: true,
  tableTitleText: "Net Worth By Category Over Years",
  tableTitleAlign: "left",
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
  showLegend: true,
  legendPosition: "top-right",
  showDataPoints: false,
  showPointValues: false,
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

function isValidPreference(value: unknown): value is OverviewWidgetPreference[] {
  if (!Array.isArray(value)) return false;
  const validKeys: OverviewWidgetKey[] = ["chart", "captions", "categories"];
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return validKeys.includes(record.key as OverviewWidgetKey) && typeof record.enabled === "boolean";
  });
}

function coerceChartSettings(value: unknown): ChartSettings {
  if (!value || typeof value !== "object") return DEFAULT_CHART_SETTINGS;

  const candidate = value as Record<string, unknown>;
  const goalValue = typeof candidate.goalValue === "number" && Number.isFinite(candidate.goalValue)
    ? candidate.goalValue
    : null;
  const yAxisUpperBound = typeof candidate.yAxisUpperBound === "number" && Number.isFinite(candidate.yAxisUpperBound)
    ? candidate.yAxisUpperBound
    : null;

  return {
    titleEnabled: typeof candidate.titleEnabled === "boolean" ? candidate.titleEnabled : DEFAULT_CHART_SETTINGS.titleEnabled,
    titleText: typeof candidate.titleText === "string" && candidate.titleText.length > 0
      ? candidate.titleText
      : DEFAULT_CHART_SETTINGS.titleText,
    titleAlign: candidate.titleAlign === "center" || candidate.titleAlign === "right" ? candidate.titleAlign : "left",
    tableTitleEnabled: typeof candidate.tableTitleEnabled === "boolean" ? candidate.tableTitleEnabled : DEFAULT_CHART_SETTINGS.tableTitleEnabled,
    tableTitleText: typeof candidate.tableTitleText === "string" && candidate.tableTitleText.length > 0
      ? candidate.tableTitleText
      : DEFAULT_CHART_SETTINGS.tableTitleText,
    tableTitleAlign: candidate.tableTitleAlign === "center" || candidate.tableTitleAlign === "right" ? candidate.tableTitleAlign : "left",
    goalValue,
    yAxisUpperBound,
    goalColor: typeof candidate.goalColor === "string" && candidate.goalColor.length > 0 ? candidate.goalColor : DEFAULT_CHART_SETTINGS.goalColor,
    goalStyle: candidate.goalStyle === "solid" ? "solid" : "dashed",
    lineColor: typeof candidate.lineColor === "string" && candidate.lineColor.length > 0 ? candidate.lineColor : DEFAULT_CHART_SETTINGS.lineColor,
    lineStyle: candidate.lineStyle === "dashed" ? "dashed" : "solid",
    yAxisStep: typeof candidate.yAxisStep === "number" && candidate.yAxisStep > 0 ? Math.floor(candidate.yAxisStep) : DEFAULT_CHART_SETTINGS.yAxisStep,
    showYAxisTitle: typeof candidate.showYAxisTitle === "boolean" ? candidate.showYAxisTitle : DEFAULT_CHART_SETTINGS.showYAxisTitle,
    showYAxisLabels: typeof candidate.showYAxisLabels === "boolean" ? candidate.showYAxisLabels : DEFAULT_CHART_SETTINGS.showYAxisLabels,
    showXAxisTitle: typeof candidate.showXAxisTitle === "boolean" ? candidate.showXAxisTitle : DEFAULT_CHART_SETTINGS.showXAxisTitle,
    showXAxisLabels: typeof candidate.showXAxisLabels === "boolean" ? candidate.showXAxisLabels : DEFAULT_CHART_SETTINGS.showXAxisLabels,
    showLegend: typeof candidate.showLegend === "boolean" ? candidate.showLegend : DEFAULT_CHART_SETTINGS.showLegend,
    legendPosition:
      candidate.legendPosition === "top-left" ||
      candidate.legendPosition === "top-center" ||
      candidate.legendPosition === "top-right" ||
      candidate.legendPosition === "bottom-left" ||
      candidate.legendPosition === "bottom-center" ||
      candidate.legendPosition === "bottom-right"
        ? candidate.legendPosition
        : DEFAULT_CHART_SETTINGS.legendPosition,
    showDataPoints: typeof candidate.showDataPoints === "boolean" ? candidate.showDataPoints : DEFAULT_CHART_SETTINGS.showDataPoints,
    showPointValues: typeof candidate.showPointValues === "boolean" ? candidate.showPointValues : DEFAULT_CHART_SETTINGS.showPointValues,
  };
}

function normalizeWidgetPreferences(preferences: OverviewWidgetPreference[]) {
  const active = preferences.filter((item) => item.enabled);
  const inactive = preferences.filter((item) => !item.enabled);
  return [...active, ...inactive];
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
  const [draggedWidgetKey, setDraggedWidgetKey] = useState<OverviewWidgetKey | null>(null);
  const [markdownTab, setMarkdownTab] = useState<"edit" | "preview">("edit");

  const [savedWidgetPreferences, setSavedWidgetPreferences] = useState<OverviewWidgetPreference[]>(DEFAULT_WIDGETS);
  const [draftWidgetPreferences, setDraftWidgetPreferences] = useState<OverviewWidgetPreference[]>(DEFAULT_WIDGETS);
  const [savedCaptionMd, setSavedCaptionMd] = useState(DEFAULT_CAPTION_MD);
  const [draftCaptionMd, setDraftCaptionMd] = useState(DEFAULT_CAPTION_MD);
  const [savedChartSettings, setSavedChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [draftChartSettings, setDraftChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);

  const [years, setYears] = useState<number[]>([]);
  const [sectionNames, setSectionNames] = useState<string[]>([]);
  const [netWorthByYear, setNetWorthByYear] = useState<Map<number, number>>(new Map());
  const [groupTotalsByYear, setGroupTotalsByYear] = useState<Map<string, Map<number, number>>>(new Map());

  const [chartFilterStartYear, setChartFilterStartYear] = useState<string>("");
  const [chartFilterEndYear, setChartFilterEndYear] = useState<string>("");
  const [chartFilterSections, setChartFilterSections] = useState<string[]>([TOTAL_SERIES]);
  const [tableFilterStartYear, setTableFilterStartYear] = useState<string>("");
  const [tableFilterEndYear, setTableFilterEndYear] = useState<string>("");
  const [tableFilterSections, setTableFilterSections] = useState<string[]>([TOTAL_SERIES]);

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
        nextNetWorthByYear.set(valueRow.year, (nextNetWorthByYear.get(valueRow.year) ?? 0) + amount);

        const groupId = accountToGroup.get(valueRow.account_id);
        if (!groupId) continue;

        const groupName = groupNameById.get(groupId) ?? "Uncategorized";
        const groupYearMap = nextGroupTotalsByYear.get(groupName) ?? new Map<number, number>();
        groupYearMap.set(valueRow.year, (groupYearMap.get(valueRow.year) ?? 0) + amount);
        nextGroupTotalsByYear.set(groupName, groupYearMap);
      }

      setNetWorthByYear(nextNetWorthByYear);
      setGroupTotalsByYear(nextGroupTotalsByYear);
      const sortedSectionNames = [...new Set([
        ...groups.map((group) => group.name),
        ...nextGroupTotalsByYear.keys(),
      ])].sort((a, b) => a.localeCompare(b));
      setSectionNames(sortedSectionNames);
      setTableFilterSections(sortedSectionNames);

      const persistedWidgets = settingsRow?.overview_widgets;
      const nextWidgetPreferences = isValidPreference(persistedWidgets)
        ? normalizeWidgetPreferences([...persistedWidgets])
        : DEFAULT_WIDGETS;
      for (const fallback of DEFAULT_WIDGETS) {
        if (!nextWidgetPreferences.some((item) => item.key === fallback.key)) {
          nextWidgetPreferences.push(fallback);
        }
      }

      const nextCaption =
        typeof settingsRow?.overview_caption_md === "string" && settingsRow.overview_caption_md.length > 0
          ? settingsRow.overview_caption_md
          : DEFAULT_CAPTION_MD;
      const nextChartSettings = coerceChartSettings(settingsRow?.overview_chart_settings);

      setSavedWidgetPreferences(nextWidgetPreferences);
      setDraftWidgetPreferences(nextWidgetPreferences);
      setSavedCaptionMd(nextCaption);
      setDraftCaptionMd(nextCaption);
      setSavedChartSettings(nextChartSettings);
      setDraftChartSettings(nextChartSettings);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message ?? "Could not load overview.");
    } finally {
      setIsLoading(false);
    }
  }

  const activeWidgetPreferences = isCustomizeOpen ? draftWidgetPreferences : savedWidgetPreferences;
  const activeCaptionMd = isCustomizeOpen ? draftCaptionMd : savedCaptionMd;
  const activeChartSettings = isCustomizeOpen ? draftChartSettings : savedChartSettings;

  const hasUnsavedChanges = useMemo(() => {
    const widgetsChanged = JSON.stringify(savedWidgetPreferences) !== JSON.stringify(draftWidgetPreferences);
    const captionChanged = savedCaptionMd !== draftCaptionMd;
    const chartChanged = JSON.stringify(savedChartSettings) !== JSON.stringify(draftChartSettings);
    return widgetsChanged || captionChanged || chartChanged;
  }, [draftCaptionMd, draftChartSettings, draftWidgetPreferences, savedCaptionMd, savedChartSettings, savedWidgetPreferences]);

  function openEdit() {
    setDraftWidgetPreferences(normalizeWidgetPreferences(savedWidgetPreferences));
    setDraftCaptionMd(savedCaptionMd);
    setDraftChartSettings(savedChartSettings);
    setMarkdownTab("edit");
    setIsCustomizeOpen(true);
    setStatusMessage(null);
  }

  function closeEdit() {
    if (hasUnsavedChanges) {
      const shouldDiscard = window.confirm("Your changes will be discarded");
      if (!shouldDiscard) return;
    }
    setDraftWidgetPreferences(normalizeWidgetPreferences(savedWidgetPreferences));
    setDraftCaptionMd(savedCaptionMd);
    setDraftChartSettings(savedChartSettings);
    setIsCustomizeOpen(false);
    setStatusMessage(null);
  }

  async function saveOverviewLayout() {
    try {
      setIsSavingLayout(true);
      setSaveJustCompleted(false);
      setErrorMessage(null);
      setStatusMessage(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in again.");

      const { error } = await supabase.from("entry_settings").upsert(
        {
          user_id: userData.user.id,
          overview_widgets: normalizeWidgetPreferences(draftWidgetPreferences),
          overview_caption_md: draftCaptionMd,
          overview_chart_settings: draftChartSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setSavedWidgetPreferences(normalizeWidgetPreferences(draftWidgetPreferences));
      setSavedCaptionMd(draftCaptionMd);
      setSavedChartSettings(draftChartSettings);
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

  function reorderActiveWidgets(sourceKey: OverviewWidgetKey, targetKey: OverviewWidgetKey) {
    setDraftWidgetPreferences((prev) => {
      const activeKeys = prev.filter((item) => item.enabled).map((item) => item.key);
      const fromIndex = activeKeys.findIndex((key) => key === sourceKey);
      const toIndex = activeKeys.findIndex((key) => key === targetKey);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;

      const nextActiveKeys = [...activeKeys];
      const [moved] = nextActiveKeys.splice(fromIndex, 1);
      nextActiveKeys.splice(toIndex, 0, moved);

      const activeMap = new Map(prev.filter((item) => item.enabled).map((item) => [item.key, item]));
      const inactiveItems = prev.filter((item) => !item.enabled);
      const reorderedActive = nextActiveKeys
        .map((key) => activeMap.get(key))
        .filter((item): item is OverviewWidgetPreference => Boolean(item));
      return [...reorderedActive, ...inactiveItems];
    });
  }

  function setWidgetEnabled(key: OverviewWidgetKey, enabled: boolean) {
    setDraftWidgetPreferences((prev) => {
      const next = prev.map((item) => (item.key === key ? { ...item, enabled } : item));
      return normalizeWidgetPreferences(next);
    });
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

  const chartFilteredYears = useMemo(
    () => years.filter((year) => {
      if (chartFilterStartYear && year < Number(chartFilterStartYear)) return false;
      if (chartFilterEndYear && year > Number(chartFilterEndYear)) return false;
      return true;
    }),
    [chartFilterEndYear, chartFilterStartYear, years]
  );

  const chartSeriesDefinitions = useMemo<SeriesDefinition[]>(() => {
    const selected = chartFilterSections.length > 0 ? chartFilterSections : [TOTAL_SERIES];
    return selected.map((name, index) => {
      const values = chartFilteredYears.map((year) => {
        if (name === TOTAL_SERIES) return netWorthByYear.get(year) ?? 0;
        return groupTotalsByYear.get(name)?.get(year) ?? 0;
      });
      return {
        name,
        values,
        color: name === TOTAL_SERIES ? activeChartSettings.lineColor : SERIES_PALETTE[index % SERIES_PALETTE.length],
        style: name === TOTAL_SERIES ? activeChartSettings.lineStyle : "solid",
      };
    });
  }, [activeChartSettings.lineColor, activeChartSettings.lineStyle, chartFilterSections, chartFilteredYears, groupTotalsByYear, netWorthByYear]);

  const tableFilteredYears = useMemo(
    () => years.filter((year) => {
      if (tableFilterStartYear && year < Number(tableFilterStartYear)) return false;
      if (tableFilterEndYear && year > Number(tableFilterEndYear)) return false;
      return true;
    }),
    [tableFilterEndYear, tableFilterStartYear, years]
  );

  const tableRows = useMemo(() => {
    const selected = tableFilterSections.length > 0 ? tableFilterSections : sectionNames;
    return selected.map((name) => ({
      label: name === TOTAL_SERIES ? "Total Net Worth" : name,
      values: tableFilteredYears.map((year) => {
        if (name === TOTAL_SERIES) return netWorthByYear.get(year) ?? 0;
        return groupTotalsByYear.get(name)?.get(year) ?? 0;
      }),
    }));
  }, [groupTotalsByYear, netWorthByYear, sectionNames, tableFilterSections, tableFilteredYears]);

  const chartGeometry = useMemo(() => {
    const width = 920;
    const height = 320;
    const left = 78;
    const right = 24;
    const top = 22;
    const bottom = activeChartSettings.showXAxisTitle ? 70 : activeChartSettings.showXAxisLabels ? 52 : 26;
    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;

    const sourceValues = chartSeriesDefinitions.flatMap((series) => series.values);
    if (activeChartSettings.goalValue !== null) sourceValues.push(activeChartSettings.goalValue);
    if (sourceValues.length === 0) sourceValues.push(0);

    const minValueRaw = Math.min(0, ...sourceValues);
    const maxValueRaw = Math.max(0, ...sourceValues);
    const step = Math.max(1, Math.floor(activeChartSettings.yAxisStep));
    const minValue = Math.floor(minValueRaw / step) * step;
    const configuredUpper = activeChartSettings.yAxisUpperBound;
    const autoMax = Math.ceil(maxValueRaw / step) * step;
    const configuredMax = configuredUpper === null ? null : Math.max(configuredUpper, minValue + step);
    const maxValue = configuredMax ?? autoMax;
    const spread = Math.max(step, maxValue - minValue);

    const valueToY = (value: number) => top + (1 - (value - minValue) / spread) * usableHeight;
    const indexToX = (index: number) =>
      left + (chartFilteredYears.length <= 1 ? usableWidth / 2 : (index / (chartFilteredYears.length - 1)) * usableWidth);

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
      goalY: activeChartSettings.goalValue === null ? null : valueToY(activeChartSettings.goalValue),
      baselineY: height - bottom,
    };
  }, [activeChartSettings.goalValue, activeChartSettings.showXAxisLabels, activeChartSettings.showXAxisTitle, activeChartSettings.yAxisStep, activeChartSettings.yAxisUpperBound, chartFilteredYears.length, chartSeriesDefinitions]);

  const legendPositionClass =
    activeChartSettings.legendPosition === "top-left"
      ? styles.legendTopLeft
      : activeChartSettings.legendPosition === "top-center"
        ? styles.legendTopCenter
        : activeChartSettings.legendPosition === "top-right"
          ? styles.legendTopRight
          : activeChartSettings.legendPosition === "bottom-left"
            ? styles.legendBottomLeft
            : activeChartSettings.legendPosition === "bottom-center"
              ? styles.legendBottomCenter
              : styles.legendBottomRight;

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

  function renderChartWidget() {
    return (
      <section className={styles.widgetCard} key="chart-widget">
        {isCustomizeOpen && (
          <div className={styles.chartSettingsShell}>
            <section className={styles.settingsGroup}>
              <h3>Title</h3>
              <div className={styles.settingsGrid}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.titleEnabled}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, titleEnabled: event.target.checked }))}
                  />
                  Show Title
                </label>
                <label>
                  Title Text
                  <input
                    type="text"
                    value={draftChartSettings.titleText}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, titleText: event.target.value }))}
                  />
                </label>
                <label>
                  Title Align
                  <select
                    value={draftChartSettings.titleAlign}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, titleAlign: event.target.value as TitleAlign }))}
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
                    checked={draftChartSettings.showLegend}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showLegend: event.target.checked }))}
                  />
                  Show Legend
                </label>
                <label>
                  Legend Position
                  <select
                    value={draftChartSettings.legendPosition}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, legendPosition: event.target.value as LegendPosition }))}
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
                  <select value={chartFilterStartYear} onChange={(event) => setChartFilterStartYear(event.target.value)}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`chart-start-${year}`} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Time To
                  <select value={chartFilterEndYear} onChange={(event) => setChartFilterEndYear(event.target.value)}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`chart-end-${year}`} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Section
                  {renderSectionSelector(chartFilterSections, setChartFilterSections, "chart")}
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
                    value={draftChartSettings.lineColor}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, lineColor: event.target.value }))}
                  />
                </label>
                <label>
                  Total Line Style
                  <select
                    value={draftChartSettings.lineStyle}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, lineStyle: event.target.value as LineStyle }))}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showDataPoints}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showDataPoints: event.target.checked }))}
                  />
                  Show Data Points
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showPointValues}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showPointValues: event.target.checked }))}
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
                    value={formatNumberInput(draftChartSettings.goalValue)}
                    placeholder="No goal"
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      setDraftChartSettings((prev) => ({ ...prev, goalValue: parsed !== null && Number.isFinite(parsed) ? parsed : null }));
                    }}
                  />
                </label>
                <label>
                  Goal Color
                  <input
                    type="color"
                    value={draftChartSettings.goalColor}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, goalColor: event.target.value }))}
                  />
                </label>
                <label>
                  Goal Style
                  <select
                    value={draftChartSettings.goalStyle}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, goalStyle: event.target.value as LineStyle }))}
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
                    value={formatNumberInput(draftChartSettings.yAxisStep)}
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      if (!Number.isFinite(parsed) || parsed <= 0) return;
                      setDraftChartSettings((prev) => ({ ...prev, yAxisStep: Math.floor(parsed) }));
                    }}
                  />
                </label>
                <label>
                  Y-Axis Upper Bound ($)
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberInput(draftChartSettings.yAxisUpperBound)}
                    placeholder="Auto"
                    onChange={(event) => {
                      const parsed = parseNumberInput(event.target.value);
                      setDraftChartSettings((prev) => ({
                        ...prev,
                        yAxisUpperBound: parsed !== null && Number.isFinite(parsed) ? parsed : null,
                      }));
                    }}
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showYAxisTitle}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showYAxisTitle: event.target.checked }))}
                  />
                  Y-Axis Title
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showYAxisLabels}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showYAxisLabels: event.target.checked }))}
                  />
                  Y-Axis Labels
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showXAxisTitle}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showXAxisTitle: event.target.checked }))}
                  />
                  X-Axis Title
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={draftChartSettings.showXAxisLabels}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, showXAxisLabels: event.target.checked }))}
                  />
                  X-Axis Labels
                </label>
              </div>
            </section>
          </div>
        )}

        <div className={`${styles.chartWrap} ${styles.chartWrapFlat}`}>
          {activeChartSettings.titleEnabled && (
            <h2 className={`${styles.chartTitle} ${activeChartSettings.titleAlign === "center" ? styles.alignCenter : activeChartSettings.titleAlign === "right" ? styles.alignRight : styles.alignLeft}`}>
              {activeChartSettings.titleText}
            </h2>
          )}

          {activeChartSettings.showLegend && (
            <div className={`${styles.chartLegendRow} ${legendPositionClass}`}>
              {chartSeriesDefinitions.map((series) => (
                <span key={`legend-inline-${series.name}`} className={styles.legendItem}>
                  <span
                    className={styles.legendSwatchLine}
                    style={{ borderColor: series.color, borderStyle: series.style === "dashed" ? "dashed" : "solid" }}
                  />
                  {series.name}
                </span>
              ))}
              {activeChartSettings.goalValue !== null && (
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatchGoal}
                    style={{ borderColor: activeChartSettings.goalColor, borderStyle: activeChartSettings.goalStyle === "dashed" ? "dashed" : "solid" }}
                  />
                  Goal
                </span>
              )}
            </div>
          )}

          <svg className={styles.chartSvg} viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} role="img" aria-label="Net worth trend line chart">
            {chartGeometry.yTicks.map((tick) => (
              <line
                key={`grid-${tick}`}
                x1={chartGeometry.left}
                y1={chartGeometry.valueToY(tick)}
                x2={chartGeometry.width - chartGeometry.right}
                y2={chartGeometry.valueToY(tick)}
                stroke="#e2e2e2"
                strokeWidth="1"
              />
            ))}

            <line x1={chartGeometry.left} y1={chartGeometry.baselineY} x2={chartGeometry.width - chartGeometry.right} y2={chartGeometry.baselineY} stroke="#d0d0d0" strokeWidth="1" />
            <line x1={chartGeometry.left} y1={chartGeometry.top} x2={chartGeometry.left} y2={chartGeometry.baselineY} stroke="#d0d0d0" strokeWidth="1" />

            {activeChartSettings.goalValue !== null && chartGeometry.goalY !== null && (
              <line
                x1={chartGeometry.left}
                y1={chartGeometry.goalY}
                x2={chartGeometry.width - chartGeometry.right}
                y2={chartGeometry.goalY}
                stroke={activeChartSettings.goalColor}
                strokeWidth="2"
                strokeDasharray={activeChartSettings.goalStyle === "dashed" ? "8 5" : undefined}
              />
            )}

            {chartSeriesDefinitions.map((series) => {
              const points = series.values.map((value, index) => ({ x: chartGeometry.indexToX(index), y: chartGeometry.valueToY(value), value }));
              return (
                <g key={`series-${series.name}`}>
                  <polyline
                    points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={series.color}
                    strokeWidth="2.5"
                    strokeDasharray={series.style === "dashed" ? "8 5" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {activeChartSettings.showDataPoints && points.map((point, index) => (
                    <g key={`point-${series.name}-${index}`}>
                      <circle cx={point.x} cy={point.y} r="3.5" fill={series.color} />
                      {activeChartSettings.showPointValues && (
                        <text x={point.x} y={point.y - 10} textAnchor="middle" className={styles.pointValueLabel} fill={series.color}>
                          ${formatMoney(point.value)}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}

            {activeChartSettings.showYAxisLabels && chartGeometry.yTicks.map((tick) => (
              <text
                key={`tick-label-${tick}`}
                x={chartGeometry.left - 10}
                y={chartGeometry.valueToY(tick) + 4}
                textAnchor="end"
                className={styles.chartLabel}
              >
                ${formatMoney(tick)}
              </text>
            ))}

            {activeChartSettings.showXAxisLabels && chartFilteredYears.map((year, index) => (
              <text
                key={`x-label-${year}`}
                x={chartGeometry.indexToX(index)}
                y={chartGeometry.baselineY + 18}
                textAnchor="middle"
                className={styles.chartLabel}
              >
                {year}
              </text>
            ))}

            {activeChartSettings.showXAxisTitle && (
              <text x={chartGeometry.width / 2} y={chartGeometry.height - 10} textAnchor="middle" className={styles.chartAxisTitle}>
                Year
              </text>
            )}

            {activeChartSettings.showYAxisTitle && (
              <text x={18} y={chartGeometry.height / 2} textAnchor="middle" transform={`rotate(-90 18 ${chartGeometry.height / 2})`} className={styles.chartAxisTitle}>
                Amount ($)
              </text>
            )}
          </svg>
        </div>

      </section>
    );
  }

  function renderMarkdownWidget() {
    const markdownSource = activeCaptionMd.length > 0 ? activeCaptionMd : DEFAULT_CAPTION_MD;

    return (
      <section className={styles.widgetCard} key="md-widget">
        {isCustomizeOpen && <h2 className={styles.mdWidgetTitle}>MD Editor</h2>}
        <div className={styles.captionEditorWrap}>
          {isCustomizeOpen ? (
            <div className={styles.captionTabsWrap}>
              <div className={styles.captionTabs}>
                <button
                  type="button"
                  className={`${styles.captionTab} ${markdownTab === "edit" ? styles.captionTabActive : ""}`}
                  onClick={() => setMarkdownTab("edit")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`${styles.captionTab} ${markdownTab === "preview" ? styles.captionTabActive : ""}`}
                  onClick={() => setMarkdownTab("preview")}
                >
                  Preview
                </button>
              </div>

              <div className={styles.captionTabBody}>
                {markdownTab === "edit" ? (
                  <textarea
                    className={styles.captionEditor}
                    value={draftCaptionMd}
                    onChange={(event) => setDraftCaptionMd(event.target.value)}
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

  function renderTableWidget() {
    return (
      <section className={styles.widgetCard} key="table-widget">
        {activeChartSettings.tableTitleEnabled && (
          <h2 className={activeChartSettings.tableTitleAlign === "center" ? styles.alignCenter : activeChartSettings.tableTitleAlign === "right" ? styles.alignRight : styles.alignLeft}>
            {activeChartSettings.tableTitleText}
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
                    checked={draftChartSettings.tableTitleEnabled}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, tableTitleEnabled: event.target.checked }))}
                  />
                  Show Title
                </label>
                <label>
                  Title Text
                  <input
                    type="text"
                    value={draftChartSettings.tableTitleText}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, tableTitleText: event.target.value }))}
                  />
                </label>
                <label>
                  Title Align
                  <select
                    value={draftChartSettings.tableTitleAlign}
                    onChange={(event) => setDraftChartSettings((prev) => ({ ...prev, tableTitleAlign: event.target.value as TitleAlign }))}
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
                  <select value={tableFilterStartYear} onChange={(event) => setTableFilterStartYear(event.target.value)}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`table-start-${year}`} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Time To
                  <select value={tableFilterEndYear} onChange={(event) => setTableFilterEndYear(event.target.value)}>
                    <option value="">All</option>
                    {years.map((year) => (
                      <option key={`table-end-${year}`} value={String(year)}>{year}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Section
                  {renderSectionSelector(tableFilterSections, setTableFilterSections, "table")}
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
                {tableFilteredYears.map((year) => (
                  <th key={year}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.values.map((value, index) => (
                    <td key={`${row.label}-${tableFilteredYears[index]}`}>${formatMoney(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderWidget(key: OverviewWidgetKey) {
    if (key === "chart") return renderChartWidget();
    if (key === "captions") return renderMarkdownWidget();
    return renderTableWidget();
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
                    {draftWidgetPreferences.filter((widget) => widget.enabled).map((widget) => (
                      <div
                        key={`active-${widget.key}`}
                        className={`${styles.widgetChooserRow} ${styles.widgetChooserRowActive} ${draggedWidgetKey === widget.key ? styles.widgetTileDragging : ""}`}
                        draggable
                        onDragStart={() => setDraggedWidgetKey(widget.key)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedWidgetKey) {
                            reorderActiveWidgets(draggedWidgetKey, widget.key);
                          }
                          setDraggedWidgetKey(null);
                        }}
                        onDragEnd={() => setDraggedWidgetKey(null)}
                      >
                        <div className={styles.widgetChooserLabelWrap}>
                          <span className={styles.widgetDragHandle} aria-hidden="true" />
                          <span>{WIDGET_LABELS[widget.key]}</span>
                        </div>
                        <div className={styles.widgetChooserRowActions}>
                          <button type="button" onClick={() => setWidgetEnabled(widget.key, false)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.widgetChooserColumn}>
                  <h3>Available widgets</h3>
                  <div className={styles.widgetChooserRows}>
                    {draftWidgetPreferences.filter((widget) => !widget.enabled).map((widget) => (
                      <div key={`inactive-${widget.key}`} className={styles.widgetChooserRow}>
                        <span>{WIDGET_LABELS[widget.key]}</span>
                        <div className={styles.widgetChooserRowActions}>
                          <button type="button" onClick={() => setWidgetEnabled(widget.key, true)}>Add</button>
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

          {!isLoading && years.length > 0 && activeWidgetPreferences.filter((item) => item.enabled).map((item) => renderWidget(item.key))}
        </section>
      </main>

      <Footer />
    </div>
  );
}
