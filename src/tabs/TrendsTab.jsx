import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { Card, CardHeader } from "../components/Primitives.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import {
  applyAllFilters,
  applyUniverseFilters,
  computeByMonth,
  computeByWeek,
  computeByDay,
} from "../data.js";
import {
  CARD_BG,
  GRAY_100,
  GRAY_200,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  RED,
  fmtK,
  fmtN,
} from "../tokens.js";

/**
 * Choose chart granularity based on how many months the monthRange filter spans.
 *   1 month  → daily   (~20 weekday-auction data points)
 *   2-3 months → weekly  (~8-13 data points)
 *   4+ months  → monthly (default behavior)
 */
function pickGranularity(monthRange) {
  if (!monthRange) return "month";
  const span = monthRange[1] - monthRange[0] + 1;
  if (span <= 1) return "day";
  if (span <= 3) return "week";
  return "month";
}

function computeSeries(records, granularity) {
  if (granularity === "day") return computeByDay(records);
  if (granularity === "week") return computeByWeek(records);
  return computeByMonth(records);
}

export function TrendsTab({ drillMetric, setDrillMetric }) {
  const { filters, setFilters } = useFilters();

  // Granularity: day / week / month — derived from current monthRange span
  const granularity = pickGranularity(filters.monthRange);

  // STR-bearing series uses universe; price-band-aware metrics use full filter
  const universeRecords = useMemo(() => applyUniverseFilters(filters), [filters]);
  const allFilteredRecords = useMemo(() => applyAllFilters(filters), [filters]);

  const monthlyUniverse = useMemo(
    () => computeSeries(universeRecords, granularity),
    [universeRecords, granularity],
  );
  const monthlyAll = useMemo(
    () => computeSeries(allFilteredRecords, granularity),
    [allFilteredRecords, granularity],
  );

  const metrics = [
    {
      key: "gmv",
      label: "GMV",
      format: fmtK,
      domain: ["auto", "auto"],
      source: "all",
    },
    {
      key: "str",
      label: "Sell-Through %",
      format: (v) => `${v.toFixed(1)}%`,
      domain: [0, 100],
      source: "universe",
    },
    {
      key: "listings",
      label: "Volume Listed",
      format: fmtN,
      domain: ["auto", "auto"],
      source: "universe",
    },
    {
      key: "avgPrice",
      label: "Avg. Sale Price",
      format: (v) => fmtK(Math.round(v)),
      domain: ["auto", "auto"],
      source: "all",
    },
    {
      key: "avgBids",
      label: "Avg. Bids",
      format: (v) => v.toFixed(1),
      domain: ["auto", "auto"],
      source: "universe",
    },
  ];

  const active = metrics.find((m) => m.key === drillMetric) || metrics[0];
  const series = active.source === "all" ? monthlyAll : monthlyUniverse;

  if (series.length === 0) {
    return (
      <div className="px-6 py-5">
        <Card>
          <div className="px-5 py-12 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: INK }}>
              No data in current filter
            </div>
            <div className="text-[12px]" style={{ color: GRAY_500 }}>
              Adjust filters to see trends.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const latest = series[series.length - 1];
  // Year-over-year only makes sense in monthly granularity (13 months back).
  // In daily/weekly mode, show a comparison to the first period in the window instead.
  const compIdx = granularity === "month" && series.length >= 13 ? series.length - 13 : 0;
  const yearAgo = series[compIdx];
  const delta =
    yearAgo[active.key] !== 0
      ? ((latest[active.key] - yearAgo[active.key]) / yearAgo[active.key]) * 100
      : 0;
  const yoyLabel =
    granularity === "month" ? "Year-over-year" :
    granularity === "week"  ? "vs. first week" :
                              "vs. first day";

  const values = series.map((m) => m[active.key]).filter((v) => !isNaN(v));
  const peak = Math.max(...values);
  const trough = Math.min(...values);
  const peakMonth = series.find((m) => m[active.key] === peak);
  const troughMonth = series.find((m) => m[active.key] === trough);

  return (
    <div className="px-6 py-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
            style={{ color: GRAY_500 }}
          >
            {granularity === "month" ? "Monthly" : granularity === "week" ? "Weekly" : "Daily"} trends · {series.length}{" "}
            {granularity === "month" ? "months" : granularity === "week" ? "weeks" : "days"}
          </div>
          <div className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
            Where the platform is moving
          </div>
        </div>
        <div
          className="flex items-center gap-1 p-0.5"
          style={{ background: CARD_BG, border: `1px solid ${GRAY_200}`, borderRadius: 4 }}
        >
          {metrics.map((m) => {
            const isActive = m.key === active.key;
            return (
              <button
                key={m.key}
                onClick={() => setDrillMetric(m.key)}
                className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: isActive ? INK_SURFACE : "transparent",
                  color: isActive ? "white" : GRAY_700,
                  borderRadius: 3,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-3">
        <Card>
          <div className="px-5 py-4">
            <div className="text-[11px] mb-2" style={{ color: GRAY_500 }}>
              Latest ({latest.month})
            </div>
            <div className="text-[24px] font-bold tracking-tight" style={{ color: INK }}>
              {active.format(latest[active.key])}
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-5 py-4">
            <div className="text-[11px] mb-2" style={{ color: GRAY_500 }}>
              {yoyLabel}
            </div>
            <div
              className="text-[24px] font-bold tracking-tight flex items-center gap-2"
              style={{ color: delta >= 0 ? LIME_DEEP : RED }}
            >
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}%
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                style={{ transform: delta >= 0 ? "rotate(0)" : "rotate(180deg)" }}
              >
                <path d="M7 2L12 8H2L7 2Z" fill={delta >= 0 ? LIME_DEEP : RED} />
              </svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-5 py-4">
            <div className="text-[11px] mb-2" style={{ color: GRAY_500 }}>
              Peak
            </div>
            <div className="text-[20px] font-bold tracking-tight" style={{ color: INK }}>
              {active.format(peak)}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: GRAY_500 }}>
              {peakMonth?.month}
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-5 py-4">
            <div className="text-[11px] mb-2" style={{ color: GRAY_500 }}>
              Low
            </div>
            <div className="text-[20px] font-bold tracking-tight" style={{ color: INK }}>
              {active.format(trough)}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: GRAY_500 }}>
              {troughMonth?.month}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader
          title={active.label}
          sub={granularity === "month" ? "Click a month to scope the dashboard to that window" : "Zoomed view — clear time scope to return to monthly"}
          right={
            filters.monthRange && (
              <button
                onClick={() => setFilters((f) => ({ ...f, monthRange: null }))}
                className="text-[11px] font-medium hover:underline"
                style={{ color: LIME_DEEP }}
              >
                Clear time scope
              </button>
            )
          }
        />
        <div className="px-3 pb-4 pt-2" style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 10, right: 15, left: 5, bottom: 5 }}
              onClick={(e) => {
                // In monthly view only — clicking a bar scopes the dashboard to that month.
                // In daily/weekly view there's nowhere useful to further narrow.
                if (granularity === "month" && e?.activePayload?.[0]) {
                  const m = e.activePayload[0].payload;
                  setFilters((f) => ({ ...f, monthRange: [m.mo, m.mo] }));
                }
              }}
              style={{ cursor: granularity === "month" ? "pointer" : "default" }}
            >
              <defs>
                <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LIME} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={LIME} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRAY_100} vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: GRAY_500, fontSize: 10 }}
                interval={Math.max(1, Math.floor(series.length / 12))}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: GRAY_500, fontSize: 10 }}
                domain={active.domain}
                tickFormatter={(v) => active.format(v)}
              />
              <Tooltip
                content={({ active: a, payload, label }) => {
                  if (!a || !payload?.length) return null;
                  return (
                    <div
                      className="text-[11.5px] px-2.5 py-1.5 shadow-lg"
                      style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
                    >
                      <div className="font-semibold mb-0.5">{label}</div>
                      <div className="font-semibold">
                        {active.format(payload[0].value)}
                      </div>
                    </div>
                  );
                }}
                cursor={{ stroke: LIME_DEEP, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey={active.key}
                stroke={LIME_DEEP}
                strokeWidth={2}
                fill="url(#trendfill)"
                name={active.label}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-3">
        {metrics
          .filter((m) => m.key !== active.key)
          .map((m) => {
            const sparkData = m.source === "all" ? monthlyAll : monthlyUniverse;
            const sparkLatest = sparkData.length
              ? sparkData[sparkData.length - 1][m.key]
              : 0;
            return (
              <Card
                key={m.key}
                className="cursor-pointer"
                onClick={() => setDrillMetric(m.key)}
              >
                <CardHeader title={m.label} />
                <div className="px-3 pb-2" style={{ height: 80 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={sparkData}
                      margin={{ top: 5, right: 5, left: 5, bottom: 0 }}
                    >
                      <XAxis dataKey="month" hide />
                      <YAxis hide domain={m.domain} />
                      <Line
                        type="monotone"
                        dataKey={m.key}
                        stroke={INK}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="px-4 pb-3 flex items-baseline justify-between">
                  <div className="text-[11px]" style={{ color: GRAY_500 }}>
                    Latest
                  </div>
                  <div
                    className="text-[14px] font-semibold tabular-nums"
                    style={{ color: INK }}
                  >
                    {m.format(sparkLatest)}
                  </div>
                </div>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
