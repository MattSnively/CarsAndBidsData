import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";

import { Card, CardHeader } from "../components/Primitives.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import {
  applyUniverseFilters,
  computeSTRByYear,
  computeSTRHeadlineStats,
  computeReserveFailByMake,
  computeReserveFailByModelYear,
  computeMustangMileageFail,
  findPatternExamples,
} from "../data.js";
import {
  CARD_BG,
  GRAY_100,
  GRAY_200,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME_DEEP,
  RED,
  fmtFull,
  fmtK,
  fmtN,
} from "../tokens.js";


// ── Feather-style SVG icons for the three failure patterns ─────────────────��──
function PriceTagIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3"/>
    </svg>
  );
}

function LayersIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function ShieldIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

// ── Failure pattern definitions: icon, copy, signal, fix, and intervention ─────
// Defined at module level so the array is not recreated on every render.
const PATTERNS = [
  {
    id: "A",
    Icon: PriceTagIcon,
    type: "Budget Reserve",
    badgeColor: LIME_DEEP,
    description:
      "Seller sets a reserve on a sub-$15k car hoping for a price the market won't support. Bids pile in below the reserve and the auction closes unsold.",
    signal: "High bid count, $0 sale",
    signalDetail:
      "Bidders showed up — sometimes 20, 30, even 40 of them — but the reserve was set above what the market would pay. The market delivered a clear verdict. The seller didn't accept it.",
    fix: "Mandatory no-reserve under $10k",
    exampleLabel: "One sold — showing what the market actually paid. Two failed — same model, reserve not met.",
    intervention: {
      number: "01",
      title: "Mandatory No-Reserve Under $10K",
      body: "Cars under $10K generate high bid counts when listed no-reserve. Reserve auctions in this band fail at disproportionate rates. Making no-reserve mandatory here costs sellers nothing — the market bids to fair value.",
    },
  },
  {
    id: "B",
    Icon: LayersIcon,
    type: "Oversaturated Model",
    badgeColor: INK,
    description:
      "Multiple near-identical examples hit the market in the same month. The reserve listing loses to the no-reserve competitor sitting right next to it on the feed.",
    signal: "Average bids, failed while similar cars sold",
    signalDetail:
      "Buyer demand is present but diluted. When three identical 996 Carreras go live the same week, only the most aggressively priced one closes. Reserve listings finish second.",
    fix: "Comp-anchored reserve gate",
    exampleLabel: "The most-listed reserve model in the dataset — what it sold for vs. what it didn't.",
    intervention: {
      number: "02",
      title: "Comp-Anchored Reserve Gate",
      body: "Before a seller sets a reserve, surface the last 5 comps — same make, model, year, similar mileage. If their reserve exceeds the 75th percentile of recent sales, show a clear warning. Informed sellers set better reserves.",
    },
  },
  {
    id: "C",
    Icon: ShieldIcon,
    type: "Ultra-Premium Wall",
    badgeColor: GRAY_500,
    description:
      "Exotics and six-figure rarities regularly miss reserve because the target buyer pool is thin. Low bids and repeat failures are the tell.",
    signal: "Low bids, high list price, repeat failure",
    signalDetail:
      "A $180k Ferrari with 2 bids isn't unloved — it just needs a buyer who can write the check. The reserve protects the seller, but costs the platform every time no one does.",
    fix: "Targeted outreach + reserve incentive",
    exampleLabel: "When a buyer shows up, exotics sell. When they don't, the reserve kills the deal.",
    intervention: {
      number: "03",
      title: "No-Reserve Incentive Program",
      body: "Offer sellers who go no-reserve a fee rebate or enhanced placement. The revenue lost to reserve failures exceeds the cost of the subsidy. Converting even 10% of reserve listings to no-reserve would measurably lift platform STR.",
    },
  },
];

// ── Chart view toggle definitions ──────────────────────────────────────────────
const CHART_VIEWS = [
  { id: "volume",    label: "Volume & Fail Rate" },
  { id: "modelYear", label: "By Model Year" },
  { id: "mileage",   label: "Mustang: Mileage" },
];

// ── Shared dark tooltip wrapper ────────────────────────────────────────────────
function DarkTooltip({ children }) {
  return (
    <div
      className="text-[11px] px-2.5 py-1.5 shadow-lg"
      style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
    >
      {children}
    </div>
  );
}

// ── Headline KPI card with left-edge accent bar ────────────────────────────────
function KpiCard({ label, value, sub, accentColor }) {
  return (
    <Card>
      <div className="flex">
        <div className="w-1 flex-shrink-0 rounded-l" style={{ background: accentColor }} />
        <div className="px-5 py-4 flex-1">
          <div className="text-[11.5px] font-medium mb-2" style={{ color: GRAY_500 }}>
            {label}
          </div>
          <div
            className="text-[30px] font-bold tracking-tight leading-none mb-1"
            style={{ color: INK }}
          >
            {value}
          </div>
          <div className="text-[11px]" style={{ color: GRAY_500 }}>
            {sub}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Main Insights component ────────────────────────────────────────────────────
export function InsightsTab() {
  const { filters } = useFilters();
  const [selectedMake, setSelectedMake] = useState(null);
  const [selectedPattern, setSelectedPattern] = useState("A");
  const [activeChart, setActiveChart] = useState("volume");

  const records         = useMemo(() => applyUniverseFilters(filters), [filters]);
  const headline        = useMemo(() => computeSTRHeadlineStats(records), [records]);
  const byYear          = useMemo(() => computeSTRByYear(records), [records]);
  const byMake          = useMemo(() => computeReserveFailByMake(records), [records]);
  const patternExamples = useMemo(
    () => findPatternExamples(records, selectedPattern),
    [records, selectedPattern],
  );
  // Model-year breakdown and Mustang mileage breakdown for the chart toggle views
  const byModelYear    = useMemo(() => computeReserveFailByModelYear(records), [records]);
  const mustangMileage = useMemo(() => computeMustangMileageFail(records), [records]);

  if (records.length === 0) {
    return (
      <div className="px-6 py-5">
        <Card>
          <div className="px-5 py-12 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: INK }}>
              No data in current filter
            </div>
            <div className="text-[12px]" style={{ color: GRAY_500 }}>
              Adjust filters to see insights.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Narrative callout figures derived from byYear
  const firstYear = byYear[0];
  const lastYear  = byYear[byYear.length - 1];
  const failRateDelta = firstYear && lastYear
    ? (lastYear.reserveFailRate - firstYear.reserveFailRate).toFixed(1)
    : 0;

  // Add reserveSold to each year entry for the stacked bar chart
  const chartData = useMemo(
    () => byYear.map((y) => ({ ...y, reserveSold: y.reserveListed - y.reserveFailed })),
    [byYear],
  );

  // Volume growth % from first to last year (for narrative callout)
  const volumeGrowthPct = firstYear && lastYear && firstYear.reserveListed > 0
    ? Math.round((lastYear.reserveListed / firstYear.reserveListed - 1) * 100)
    : 0;

  // Resolved pattern object for the currently selected failure pattern card
  const selectedPatternData = PATTERNS.find((p) => p.id === selectedPattern) ?? null;

  // Bar scaling for the make chart
  const maxFailed = Math.max(...byMake.map((m) => m.failCount), 1);

  // Toggle accordion: same make → deselect; different make → select new
  const handleMakeClick = (make) =>
    setSelectedMake((prev) => (prev === make ? null : make));

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">

      {/* ══ 1. INTRO BLOCK ═══════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
          style={{ color: LIME_DEEP }}
        >
          Insight Opportunity
        </div>
        <div
          className="text-[22px] font-bold tracking-tight mb-2"
          style={{ color: INK }}
        >
          Sell-through Rate
        </div>
        <div
          className="text-[13.5px] leading-relaxed max-w-3xl"
          style={{ color: GRAY_700 }}
        >
          "No sale" auctions happen, and having a reserve price is a necessary listing
          requirement for some sellers. However, every failed auction is a lost revenue
          opportunity for Cars &amp; Bids. As total GMV has climbed year over year, STR has
          dropped as well. Failed auctions are outpacing the increase in total listings,
          which is a trend C&amp;B may want to address before it gets any worse. Below is a
          look at the problem, some context, and some solutions that might turn the tide.
        </div>
      </div>

      {/* ══ 2. KPI CARDS ═════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Reserve Auctions (slice of all listings)"
          value={`${headline.reservePct.toFixed(0)}%`}
          sub={`${headline.reserveListed.toLocaleString()} of ${headline.totalListings.toLocaleString()} total listings list with a reserve`}
          accentColor={LIME_DEEP}
        />
        <KpiCard
          label={`Reserve Fail Rate — ${lastYear?.year ?? ""}`}
          value={`${lastYear?.reserveFailRate.toFixed(1) ?? "—"}%`}
          sub={`Up ${failRateDelta} pts from ${firstYear?.reserveFailRate.toFixed(1)}% in ${firstYear?.year} — reserve-only metric`}
          accentColor={GRAY_700}
        />
        <KpiCard
          label="Failed Reserve Auctions (all-time)"
          value={fmtN(headline.reserveFailed)}
          // Says what the market actually bid, and how much of that is measured
          // rather than inferred — the figure used to be an estimate throughout.
          sub={`${fmtK(Math.round(headline.lostGMV))} bid but not sold · ${headline.lostGMVCoverage.toFixed(0)}% from recorded high bids`}
          accentColor={RED}
        />
        <KpiCard
          label="Avg Bids — Failed Reserve"
          value={headline.avgFailedReserveBids.toFixed(1)}
          sub={`vs. ${headline.avgSoldReserveBids.toFixed(1)} avg for sold reserve — bidders showed up, seller didn't budge`}
          accentColor={LIME_DEEP}
        />
      </div>

      {/* ══ 3. KEY CHART — 3-view toggle ═════════════════════════════════════ */}
      <Card className="mb-5">
        <CardHeader
          title={
            activeChart === "volume"    ? "Reserve Volume vs. Close Rate: Scale Grew Faster Than Quality" :
            activeChart === "modelYear" ? "Reserve Fail Rate by Car Model Year" :
                                         "Ford Mustang: Reserve Fail Rate by Mileage"
          }
          sub={
            activeChart === "volume"    ? "Reserve auctions only — stacked bars = total listings per year · line = no-sale rate %" :
            activeChart === "modelYear" ? "Reserve fail rate per car model year — red bars ≥ 60% fail rate · min 15 listings" :
                                         "Ford Mustang reserve auctions by mileage bucket — red = above-average fail rate"
          }
          right={
            <div className="flex flex-col items-end gap-2">
              {/* Toggle pills — switch between the three chart views */}
              <div
                className="flex items-center gap-1 p-0.5"
                style={{ background: CARD_BG, border: `1px solid ${GRAY_200}`, borderRadius: 4 }}
              >
                {CHART_VIEWS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveChart(v.id)}
                    className="px-2.5 py-1 text-[10.5px] font-medium transition-colors"
                    style={{
                      background: activeChart === v.id ? INK_SURFACE : "transparent",
                      color:      activeChart === v.id ? "white" : GRAY_700,
                      borderRadius: 3,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {/* Volume-only legend — hidden for other views */}
              {activeChart === "volume" && (
                <div className="flex items-center gap-4 text-[10.5px]" style={{ color: GRAY_500 }}>
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 12, height: 12, background: LIME_DEEP, opacity: 0.85, borderRadius: 2 }} />
                    Sold
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 12, height: 12, background: GRAY_400, opacity: 0.85, borderRadius: 2 }} />
                    Not Sold
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 16, height: 2, background: INK }} />
                    No-Sale Rate %
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* ── View A: Volume & Fail Rate — stacked bar + fail rate line ──────── */}
        {activeChart === "volume" && (
          <>
            <div className="px-3 pb-2 pt-1 h-[200px] md:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={GRAY_100} vertical={false} />
                  <XAxis
                    dataKey="year"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                  />
                  {/* Left Y axis — total reserve listings (sold + not sold) */}
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  />
                  {/* Right Y axis — no-sale rate % */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 50]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const soldPayload   = payload.find((p) => p.dataKey === "reserveSold");
                      const failedPayload = payload.find((p) => p.dataKey === "reserveFailed");
                      const linePayload   = payload.find((p) => p.dataKey === "reserveFailRate");
                      const total = (soldPayload?.value ?? 0) + (failedPayload?.value ?? 0);
                      return (
                        <DarkTooltip>
                          <div className="font-semibold mb-1">{label} — {total.toLocaleString()} listed</div>
                          {soldPayload && (
                            <div className="flex items-center gap-2">
                              <div style={{ width: 8, height: 8, background: LIME_DEEP, borderRadius: 2 }} />
                              <span style={{ opacity: 0.8 }}>Sold:</span>
                              <span className="font-semibold">{soldPayload.value.toLocaleString()}</span>
                            </div>
                          )}
                          {failedPayload && (
                            <div className="flex items-center gap-2">
                              <div style={{ width: 8, height: 8, background: GRAY_400, borderRadius: 2 }} />
                              <span style={{ opacity: 0.8 }}>Not Sold:</span>
                              <span className="font-semibold">{failedPayload.value.toLocaleString()}</span>
                            </div>
                          )}
                          {linePayload && (
                            <div
                              className="flex items-center gap-2 mt-1 pt-1"
                              style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
                            >
                              <div style={{ width: 8, height: 2, background: "white" }} />
                              <span style={{ opacity: 0.8 }}>No-Sale Rate:</span>
                              <span className="font-semibold">{linePayload.value.toFixed(1)}%</span>
                            </div>
                          )}
                        </DarkTooltip>
                      );
                    }}
                    cursor={{ fill: GRAY_100 }}
                  />
                  {/* Sold portion — bottom of stack */}
                  <Bar
                    yAxisId="left"
                    dataKey="reserveSold"
                    stackId="stack"
                    fill={LIME_DEEP}
                    fillOpacity={0.85}
                    name="Sold"
                  />
                  {/* Not-sold portion — top of stack, rounded corners on top */}
                  <Bar
                    yAxisId="left"
                    dataKey="reserveFailed"
                    stackId="stack"
                    fill={GRAY_400}
                    fillOpacity={0.85}
                    radius={[2, 2, 0, 0]}
                    name="Not Sold"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="reserveFailRate"
                    stroke={INK}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: INK, strokeWidth: 0 }}
                    name="No-Sale Rate"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Narrative callout — volume view only */}
            <div
              className="mx-5 mb-5 px-4 py-3 rounded"
              style={{ background: GRAY_100, borderLeft: `3px solid ${LIME_DEEP}` }}
            >
              <div className="text-[11.5px] leading-relaxed" style={{ color: GRAY_700 }}>
                <span className="font-semibold" style={{ color: INK }}>Scale and quality moved in opposite directions.</span>{" "}
                Reserve listings grew{" "}
                <span className="font-semibold" style={{ color: INK }}>{volumeGrowthPct}%</span>{" "}
                from {firstYear?.year} to {lastYear?.year} — but the no-sale rate climbed{" "}
                <span className="font-semibold" style={{ color: LIME_DEEP }}>{failRateDelta} percentage points</span>{" "}
                over the same period. The gray band at the top of each bar is the opportunity: auctions
                where bidders showed up but the deal never closed.
              </div>
            </div>
          </>
        )}

        {/* ── View B: Reserve fail rate by car model year ─────────────────────── */}
        {activeChart === "modelYear" && (
          <div className="px-3 pb-4 pt-1 h-[220px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModelYear} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid stroke={GRAY_100} vertical={false} />
                {/* Angled labels needed — 53 years don't fit horizontally */}
                <XAxis
                  dataKey="modelYear"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 9, textAnchor: "end" }}
                  angle={-45}
                  height={40}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <DarkTooltip>
                        <div className="font-semibold mb-1">{d.modelYear} model year</div>
                        <div style={{ opacity: 0.8 }}>
                          Reserve listed: <span className="font-semibold">{d.listed.toLocaleString()}</span>
                        </div>
                        <div style={{ opacity: 0.8 }}>
                          Failed: <span className="font-semibold">{d.failed.toLocaleString()}</span>
                        </div>
                        <div style={{ opacity: 0.8 }}>
                          Fail rate: <span className="font-semibold">{d.failRate.toFixed(1)}%</span>
                        </div>
                      </DarkTooltip>
                    );
                  }}
                  cursor={{ fill: GRAY_100 }}
                />
                <Bar dataKey="failRate" radius={[2, 2, 0, 0]}>
                  {/* Color each bar: RED if fail rate ≥ 60%, neutral gray otherwise */}
                  {byModelYear.map((entry) => (
                    <Cell
                      key={entry.modelYear}
                      fill={entry.failRate >= 60 ? RED : GRAY_400}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── View C: Ford Mustang reserve fail rate by mileage bucket ─────── */}
        {activeChart === "mileage" && (
          <div className="px-3 pb-4 pt-1 h-[200px] md:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mustangMileage.rows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid stroke={GRAY_100} vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  domain={[0, 100]}
                />
                {/* Dashed reference line showing the overall Mustang average fail rate */}
                <ReferenceLine
                  y={mustangMileage.avgFailRate}
                  stroke={GRAY_700}
                  strokeDasharray="4 2"
                  label={{
                    value: `Avg ${mustangMileage.avgFailRate.toFixed(0)}%`,
                    position: "insideTopRight",
                    fill: GRAY_700,
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <DarkTooltip>
                        <div className="font-semibold mb-1">Mustang · {d.label}</div>
                        <div style={{ opacity: 0.8 }}>
                          Reserve listed: <span className="font-semibold">{d.listed.toLocaleString()}</span>
                        </div>
                        <div style={{ opacity: 0.8 }}>
                          Failed: <span className="font-semibold">{d.failed.toLocaleString()}</span>
                        </div>
                        <div style={{ opacity: 0.8 }}>
                          Fail rate: <span className="font-semibold">{d.failRate.toFixed(1)}%</span>
                        </div>
                        <div
                          className="mt-1 pt-1"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.15)", opacity: 0.8 }}
                        >
                          Avg: <span className="font-semibold">{mustangMileage.avgFailRate.toFixed(1)}%</span>
                        </div>
                      </DarkTooltip>
                    );
                  }}
                  cursor={{ fill: GRAY_100 }}
                />
                <Bar dataKey="failRate" radius={[2, 2, 0, 0]}>
                  {/* RED for above-average buckets, LIME_DEEP for below-average */}
                  {mustangMileage.rows.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={entry.failRate > mustangMileage.avgFailRate ? RED : LIME_DEEP}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ══ 4. RESERVE FAILURE BY MAKE (with inline model drill-down) ════════ */}
      <Card className="mb-5">
        <CardHeader
          title="Reserve Failure by Make"
          sub="Click any make to see its top 3 failing models — ranked by total failed reserve auctions"
        />
        <div className="px-5 pb-5 pt-2">
          {byMake.map((row) => {
            const barPct = (row.failCount / maxFailed) * 100;
            const isExpanded = selectedMake === row.make;
            const maxModelFailed = Math.max(
              ...(row.topModels?.map((m) => m.failCount) ?? [1]),
              1,
            );

            return (
              <div key={row.make}>
                {/* Make row — clickable */}
                <button
                  onClick={() => handleMakeClick(row.make)}
                  className="flex items-center gap-3 w-full mb-[5px] px-2 py-1 rounded transition-colors text-left"
                  style={{
                    background: isExpanded ? GRAY_100 : "transparent",
                  }}
                >
                  {/* Expand indicator */}
                  <div
                    className="text-[10px] flex-shrink-0 w-3"
                    style={{ color: isExpanded ? INK : GRAY_500 }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </div>
                  {/* Make name */}
                  <div
                    className="text-right text-[12px] truncate flex-shrink-0"
                    style={{
                      width: "clamp(70px, 18vw, 110px)",
                      color: isExpanded ? INK : GRAY_700,
                      fontWeight: isExpanded ? 600 : 400,
                    }}
                  >
                    {row.make}
                  </div>
                  {/* Fail count bar */}
                  <div
                    className="flex-1 h-[13px]"
                    style={{ background: GRAY_100, borderRadius: 2 }}
                  >
                    <div
                      style={{
                        width: `${barPct}%`,
                        background: RED,
                        borderRadius: 2,
                        height: "100%",
                        opacity: isExpanded ? 0.9 : 0.6,
                      }}
                    />
                  </div>
                  {/* Stats */}
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right" style={{ width: 56 }}>
                      <div className="text-[11px] font-semibold tabular-nums" style={{ color: INK }}>
                        {row.failCount.toLocaleString()}
                      </div>
                      <div className="text-[9.5px]" style={{ color: GRAY_500 }}>failed</div>
                    </div>
                    <div className="hidden md:block text-right" style={{ width: 48 }}>
                      <div
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: row.failRate >= 50 ? RED : GRAY_700 }}
                      >
                        {row.failRate.toFixed(0)}%
                      </div>
                      <div className="text-[9.5px]" style={{ color: GRAY_500 }}>fail rate</div>
                    </div>
                  </div>
                </button>

                {/* Inline model accordion */}
                {isExpanded && row.topModels?.length > 0 && (
                  <div className="mb-2 ml-6">
                    {row.topModels.map((model) => {
                      const modelBarPct = (model.failCount / maxModelFailed) * 100;
                      return (
                        <div
                          key={model.model}
                          className="flex items-center gap-3 mb-[4px] px-2"
                        >
                          {/* Arrow indent indicator */}
                          <div
                            className="text-[10px] flex-shrink-0"
                            style={{ color: GRAY_500, width: 12 }}
                          >
                            ↳
                          </div>
                          {/* Model name */}
                          <div
                            className="text-right truncate flex-shrink-0 text-[10.5px]"
                            style={{ width: 110, color: GRAY_700 }}
                          >
                            {model.model}
                          </div>
                          {/* Model fail bar */}
                          <div
                            className="flex-1 h-[10px]"
                            style={{ background: GRAY_100, borderRadius: 2 }}
                          >
                            <div
                              style={{
                                width: `${modelBarPct}%`,
                                background: RED,
                                borderRadius: 2,
                                height: "100%",
                                opacity: 0.45,
                              }}
                            />
                          </div>
                          {/* Model stats */}
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-right" style={{ width: 56 }}>
                              <div
                                className="text-[10.5px] font-semibold tabular-nums"
                                style={{ color: INK }}
                              >
                                {model.failCount.toLocaleString()}
                              </div>
                              <div className="text-[9px]" style={{ color: GRAY_500 }}>failed</div>
                            </div>
                            <div className="text-right" style={{ width: 48 }}>
                              <div
                                className="text-[10.5px] font-semibold tabular-nums"
                                style={{ color: model.failRate >= 50 ? RED : GRAY_700 }}
                              >
                                {model.failRate.toFixed(0)}%
                              </div>
                              <div className="text-[9px]" style={{ color: GRAY_500 }}>fail rate</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ══ 5. INTERACTIVE PATTERN EXPLORER ══════════════════════════════════ */}
      <div className="mb-3">
        <div className="text-[13px] font-semibold mb-1" style={{ color: INK }}>
          Why reserves fail — and what to do about it
        </div>
        <div className="text-[11.5px] mb-4" style={{ color: GRAY_500 }}>
          Select a failure pattern to see the signal, the fix, and real examples from the data.
        </div>
      </div>

      {/* Pattern selector cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {PATTERNS.map((p) => {
          const isSelected = selectedPattern === p.id;
          return (
            <Card
              key={p.id}
              className="cursor-pointer transition-colors"
              style={{ borderColor: isSelected ? LIME_DEEP : GRAY_200, borderWidth: isSelected ? 2 : 1 }}
              onClick={() => setSelectedPattern(p.id)}
            >
              <div className="px-5 py-4">
                {/* Icon badge */}
                <div
                  className="mb-3 flex items-center justify-center w-9 h-9 rounded-lg"
                  style={{
                    background: isSelected ? p.badgeColor : GRAY_100,
                    color: isSelected ? "white" : GRAY_500,
                  }}
                >
                  <p.Icon size={18} />
                </div>
                <div
                  className="text-[13px] font-bold mb-1.5"
                  style={{ color: isSelected ? INK : GRAY_700 }}
                >
                  {p.type}
                </div>
                <div className="text-[11px] leading-relaxed" style={{ color: GRAY_500 }}>
                  {p.description}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detail panel — updates when a pattern card is selected */}
      {selectedPatternData && (
        <Card className="mb-3">
          <div className="px-5 pt-5 pb-5">

            {/* Signal + Intervention — 2 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-5">

              {/* Left: The Signal */}
              <div>
                <div
                  className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2"
                  style={{ color: GRAY_500 }}
                >
                  The Signal
                </div>
                <div className="text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>
                  {selectedPatternData.signal}
                </div>
                <div className="text-[11.5px] leading-relaxed mb-3" style={{ color: GRAY_700 }}>
                  {selectedPatternData.signalDetail}
                </div>
                <div
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-1 rounded"
                  style={{ background: GRAY_100, color: LIME_DEEP }}
                >
                  Fix: {selectedPatternData.fix}
                </div>
              </div>

              {/* Right: What Needs to Change */}
              <div>
                <div
                  className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2"
                  style={{ color: GRAY_500 }}
                >
                  What Needs to Change
                </div>
                <div className="flex items-start gap-3">
                  <div
                    className="text-[28px] font-black tracking-tighter leading-none flex-shrink-0 mt-0.5"
                    style={{ color: GRAY_200 }}
                  >
                    {selectedPatternData.intervention.number}
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold mb-1.5" style={{ color: INK }}>
                      {selectedPatternData.intervention.title}
                    </div>
                    <div className="text-[11.5px] leading-relaxed" style={{ color: GRAY_700 }}>
                      {selectedPatternData.intervention.body}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t mb-4" style={{ borderColor: GRAY_200 }} />

            {/* Real auction examples from the dataset */}
            <div className="mb-3">
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: GRAY_500 }}
              >
                Real Auctions from the Data
              </div>
              {selectedPatternData.exampleLabel && (
                <div className="text-[11px] mt-0.5" style={{ color: GRAY_500 }}>
                  {selectedPatternData.exampleLabel}
                </div>
              )}
            </div>
            {patternExamples.failed.length === 0 && !patternExamples.sold ? (
              <div className="text-[11px]" style={{ color: GRAY_500 }}>
                No examples match this pattern with current filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Sold benchmark card — anchors pricing expectations */}
                {patternExamples.sold && (
                  <div
                    className="rounded px-4 py-3"
                    style={{ background: GRAY_100, border: `1.5px solid ${LIME_DEEP}` }}
                  >
                    <div
                      className="text-[9.5px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: LIME_DEEP }}
                    >
                      Pricing Benchmark
                    </div>
                    <div className="text-[12px] font-semibold mb-0.5" style={{ color: INK }}>
                      {patternExamples.sold.year} {patternExamples.sold.make}
                    </div>
                    <div className="text-[11px] mb-2" style={{ color: GRAY_700 }}>
                      {patternExamples.sold.model}
                    </div>
                    <div className="text-[10.5px] mb-1.5" style={{ color: GRAY_500 }}>
                      {patternExamples.sold.mileage > 0
                        ? `${patternExamples.sold.mileage.toLocaleString()} mi · `
                        : ""}
                      {patternExamples.sold.bids} bids
                    </div>
                    <div className="text-[11px] font-semibold" style={{ color: LIME_DEEP }}>
                      Sold {fmtFull(patternExamples.sold.price)}
                    </div>
                  </div>
                )}
                {/* Failed examples — reserve not met */}
                {patternExamples.failed.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded px-4 py-3"
                    style={{ background: GRAY_100, border: `1px solid ${GRAY_200}` }}
                  >
                    <div
                      className="text-[9.5px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: RED }}
                    >
                      Reserve Not Met
                    </div>
                    <div className="text-[12px] font-semibold mb-0.5" style={{ color: INK }}>
                      {ex.year} {ex.make}
                    </div>
                    <div className="text-[11px] mb-2" style={{ color: GRAY_700 }}>
                      {ex.model}
                    </div>
                    <div className="text-[10.5px]" style={{ color: GRAY_500 }}>
                      {ex.mileage > 0 ? `${ex.mileage.toLocaleString()} mi · ` : ""}
                      {ex.bids} bid{ex.bids !== 1 ? "s" : ""}
                      {ex.views > 0 ? ` · ${ex.views.toLocaleString()} views` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </Card>
      )}

    </div>
  );
}
