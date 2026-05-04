import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";

import { Card, CardHeader } from "../components/Primitives.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import {
  applyAllFilters,
  applyUniverseFilters,
  computeByMake,
  computeByMonthSplit,
  computeKPIsSplit,
  computePriceDist,
  computeReserveSplit,
  computeScatterPoints,
  groupScatterByMake,
} from "../data.js";
import {
  GRAY_100,
  GRAY_200,
  GRAY_300,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  LIME_SOFT,
  MAKE_COLORS,
  fmtFull,
  fmtK,
  fmtN,
} from "../tokens.js";

/**
 * Shared scatter chart used both in the compact card and the full-screen modal.
 * When onPointClick is provided the chart is click-interactive (modal mode).
 */
function ScatterPanel({ scatterPts, filters, height, selectedPoint, onPointClick }) {
  const multiMake = filters.makes.length >= 2;
  const byMake = multiMake ? groupScatterByMake(scatterPts) : null;

  // Derive axis ceilings directly from the filtered data. Recharts' dataMax callback
  // on ScatterChart does not reliably recalculate when data changes after a filter
  // update, leaving axes anchored to the all-data maximum and wasting whitespace.
  const yDomainMax = useMemo(() => {
    if (!scatterPts.length) return 100000;
    const maxPrice = Math.max(...scatterPts.map((p) => p.price));
    return Math.ceil((maxPrice * 1.1) / 10000) * 10000;
  }, [scatterPts]);

  const xDomainMax = useMemo(() => {
    if (filters.mileageMax) return filters.mileageMax * 1.05;
    if (!scatterPts.length) return 100000;
    const maxMileage = Math.max(...scatterPts.map((p) => p.mileage));
    return Math.ceil((maxMileage * 1.1) / 5000) * 5000;
  }, [scatterPts, filters.mileageMax]);

  const scatterTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const txLabel = d.transmission === "M" ? "Manual" : d.transmission === "A" ? "Auto" : "—";
    return (
      <div
        className="text-[11px] px-2.5 py-1.5 shadow-lg"
        style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
      >
        <div className="font-semibold mb-0.5">
          {d.year} {d.make}
        </div>
        <div style={{ opacity: 0.8 }}>{d.model}</div>
        <div className="mt-1">
          {(d.mileage / 1000).toFixed(0)}k mi · {fmtFull(d.price)} · {d.bids} bids
        </div>
        <div className="mt-0.5" style={{ opacity: 0.75 }}>
          {d.colorGroup} · {txLabel}{d.noReserve ? " · No Reserve" : ""}
        </div>
        {onPointClick && <div className="mt-0.5 text-[10px]" style={{ opacity: 0.5 }}>Click to inspect</div>}
      </div>
    );
  };

  if (scatterPts.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[12px]"
        style={{ height, color: GRAY_500 }}
      >
        No data
      </div>
    );
  }

  return (
    <div style={{ height }} className="px-3 pb-3 pt-1">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
          onClick={
            onPointClick
              ? (e) => { if (e?.activePayload?.[0]) onPointClick(e.activePayload[0].payload); }
              : undefined
          }
          style={{ cursor: onPointClick ? "pointer" : "default" }}
        >
          <CartesianGrid stroke={GRAY_100} vertical={false} />
          <XAxis
            dataKey="mileage"
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: GRAY_500, fontSize: 10 }}
            tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
            domain={[0, xDomainMax]}
          />
          <YAxis
            dataKey="price"
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: GRAY_500, fontSize: 10 }}
            tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`}
            domain={[0, yDomainMax]}
          />
          <Tooltip content={scatterTooltip} cursor={{ strokeDasharray: "2 2" }} />
          {multiMake
            ? filters.makes.map((make, i) => (
                <Scatter
                  key={make}
                  name={make}
                  data={byMake.get(make) || []}
                  fill={MAKE_COLORS[i % MAKE_COLORS.length]}
                  fillOpacity={0.6}
                />
              ))
            : <Scatter
                data={scatterPts}
                fill={LIME_DEEP}
                fillOpacity={0.5}
              />
          }
          {filters.mileageMax !== null && (
            <ReferenceLine
              x={filters.mileageMax}
              stroke={INK}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{
                value: `≤${(filters.mileageMax / 1000).toFixed(0)}k mi`,
                fill: INK,
                fontSize: 10,
                position: "top",
              }}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverviewTab({ setTab, setDrillMetric }) {
  const { filters, setFilters } = useFilters();
  const [showAllMakes, setShowAllMakes] = useState(false);
  const [scatterExpanded, setScatterExpanded] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  /* ── Filter sets ─────────────────────────────────────────────
     universe    = all filters EXCEPT price band (used for STR-bearing data)
     all         = all filters including price band (used for sold-only views)
     no-make     = all filters (incl. price band) minus makes, so the by-make
                   chart shows all makes with the user's selection highlighted
                   AND reacts to price-band selection.
     no-reserve  = all filters (incl. price band) minus reserve, so both
                   reserve tiles stay visible AND react to price-band selection.
  ──────────────────────────────────────────────────────────── */
  const universeRecords = useMemo(
    () => applyUniverseFilters(filters),
    [filters],
  );
  const soldFilteredRecords = useMemo(
    () => applyAllFilters(filters),
    [filters],
  );
  // Use applyAllFilters (not applyUniverseFilters) so these datasets respond
  // to priceBands selection. When priceBands is empty, applyAllFilters is
  // identical to applyUniverseFilters (passesPriceBand returns true for all).
  const noMakeUniverse = useMemo(
    () => applyAllFilters({ ...filters, makes: [] }),
    [filters],
  );
  const noReserveUniverse = useMemo(
    () => applyAllFilters({ ...filters, reserve: null }),
    [filters],
  );

  // KPIs: STR uses universe; GMV/avgPrice use price-band-filtered set
  const kpis = useMemo(
    () => computeKPIsSplit(universeRecords, soldFilteredRecords),
    [universeRecords, soldFilteredRecords],
  );

  // topN toggles between 10 (default) and 0 (all) based on showAllMakes.
  // computeByMake treats topN=0 as falsy and returns the full sorted array.
  const byMake = useMemo(
    () => computeByMake(noMakeUniverse, showAllMakes ? 0 : 10),
    [noMakeUniverse, showAllMakes],
  );
  // computeByMonthSplit keeps STR from the universe (unaffected by price bands)
  // while GMV reflects the price-band-filtered sold set.
  const byMonth = useMemo(
    () => computeByMonthSplit(universeRecords, soldFilteredRecords).slice(-12),
    [universeRecords, soldFilteredRecords],
  );
  // Price dist always shows the full distribution (universe), highlighting selected bands
  const priceDist = useMemo(() => computePriceDist(universeRecords), [universeRecords]);
  const reserveSplit = useMemo(
    () => computeReserveSplit(noReserveUniverse),
    [noReserveUniverse],
  );
  // Scatter respects all filters (it's a sold-only view)
  const scatterPts = useMemo(
    () => computeScatterPoints(soldFilteredRecords, 500),
    [soldFilteredRecords],
  );

  const toggleMake = (make) =>
    setFilters((f) => ({
      ...f,
      makes: f.makes.includes(make)
        ? f.makes.filter((m) => m !== make)
        : [...f.makes, make],
    }));

  const togglePriceBand = (bandId) =>
    setFilters((f) => ({
      ...f,
      priceBands: f.priceBands.includes(bandId)
        ? f.priceBands.filter((b) => b !== bandId)
        : [...f.priceBands, bandId],
    }));

  const setReserveType = (type) =>
    setFilters((f) => ({ ...f, reserve: f.reserve === type ? null : type }));

  const kpiCards = [
    {
      key: "volume",
      label: "Total Sales Volume",
      value: fmtN(kpis.totalSold),
      sub: `of ${(kpis.totalListed / 1000).toFixed(1)}k listed`,
      drillTo: "Listings",
    },
    {
      key: "gmv",
      label: "Total GMV",
      value: fmtK(kpis.totalGMV),
      sub: "gross merchandise value",
      drillTo: "Trends",
      drillMetric: "gmv",
    },
    {
      key: "str",
      label: "Sell-Through Rate",
      value: `${kpis.str.toFixed(1)}%`,
      sub: "listings resulting in sale",
      drillTo: "Trends",
      drillMetric: "str",
    },
    {
      key: "price",
      label: "Avg. Sale Price",
      value: fmtK(Math.round(kpis.avgPrice)),
      sub: "across all sold listings",
      drillTo: "Trends",
      drillMetric: "avgPrice",
    },
    {
      key: "bids",
      label: "Avg. Bids / Listing",
      value: kpis.avgBids.toFixed(1),
      sub: "across all auctions",
      drillTo: "Trends",
      drillMetric: "avgBids",
    },
  ];

  const handleKpiClick = (kpi) => {
    if (kpi.drillMetric) setDrillMetric(kpi.drillMetric);
    setTab(kpi.drillTo);
  };

  const maxMakeSold = Math.max(1, ...byMake.map((m) => m.sold));
  const hasFilteredData = universeRecords.length > 0;

  return (
    <div className="px-6 py-5">
      <div className="text-[12px] mb-3" style={{ color: GRAY_500 }}>
        Click any chart element to filter · click a KPI to explore its detail view
      </div>

      <div className="grid grid-cols-5 gap-3 mb-4">
        {kpiCards.map((k) => (
          <Card
            key={k.key}
            onClick={() => handleKpiClick(k)}
            className="cursor-pointer transition-all hover:shadow-md"
          >
            <div className="px-5 py-4">
              <div className="text-[11.5px] font-medium mb-3" style={{ color: GRAY_500 }}>
                {k.label}
              </div>
              <div
                className="text-[28px] font-bold tracking-tight leading-none mb-1.5"
                style={{ color: INK }}
              >
                {k.value}
              </div>
              <div className="text-[11px]" style={{ color: GRAY_500 }}>
                {k.sub}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!hasFilteredData && (
        <Card className="mb-4">
          <div className="px-5 py-8 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: INK }}>
              No auctions match the current filters
            </div>
            <div className="text-[12px]" style={{ color: GRAY_500 }}>
              Remove some filters above to see data again.
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Card>
          <CardHeader
            title="Volume by Make"
            sub={`Click any make to filter · ${showAllMakes ? "all makes" : "top 10 by cars sold"}`}
            right={
              <button
                onClick={() => setShowAllMakes((v) => !v)}
                className="text-[11px] font-medium hover:underline"
                style={{ color: LIME_DEEP }}
              >
                {showAllMakes ? "Top 10" : "Show all"}
              </button>
            }
          />
          <div
            className="px-5 pb-5 pt-2"
            style={showAllMakes ? { maxHeight: 380, overflowY: "auto" } : {}}
          >
            {byMake.length === 0 && (
              <div className="text-[12px] py-6 text-center" style={{ color: GRAY_500 }}>
                No data
              </div>
            )}
            {byMake.map((m) => {
              const pct = (m.sold / maxMakeSold) * 100;
              const isSelected = filters.makes.includes(m.make);
              const hasOtherSelections =
                filters.makes.length > 0 && !isSelected;
              return (
                <button
                  key={m.make}
                  onClick={() => toggleMake(m.make)}
                  className="flex items-center gap-3 w-full mb-[5px] px-1 py-0.5 rounded transition-colors hover:bg-[#fafaf9] cursor-pointer"
                  style={{ opacity: hasOtherSelections ? 0.4 : 1 }}
                >
                  <div
                    className="w-[100px] text-right text-[12px] truncate"
                    style={{
                      color: isSelected ? INK : GRAY_700,
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {m.make.length > 13 ? m.make.slice(0, 12) + "…" : m.make}
                  </div>
                  <div
                    className="flex-1 h-[14px] relative"
                    style={{ background: GRAY_100, borderRadius: 2 }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: isSelected ? LIME_DEEP : LIME,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <div
                    className="w-[44px] text-[12px] font-medium tabular-nums text-left"
                    style={{ color: INK }}
                  >
                    {m.sold.toLocaleString()}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Sell-Through Rate vs. Total GMV"
            sub="Last 12 months · click a month to scope to that window"
            right={
              <div className="flex items-center gap-3 text-[11px]" style={{ color: GRAY_500 }}>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 18, height: 2, background: LIME }} />
                  STR
                </div>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 18, borderTop: `1.5px dashed ${INK}` }} />
                  GMV
                </div>
              </div>
            }
          />
          <div className="px-3 pb-3 pt-1" style={{ height: 280 }}>
            {byMonth.length === 0 ? (
              <div
                className="h-full flex items-center justify-center text-[12px]"
                style={{ color: GRAY_500 }}
              >
                No data in range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={byMonth}
                  margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
                  onClick={(e) => {
                    if (e?.activePayload?.[0]) {
                      const m = e.activePayload[0].payload;
                      setFilters((f) => ({ ...f, monthRange: [m.mo, m.mo] }));
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="strfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LIME} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={LIME} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRAY_100} vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div
                          className="text-[11.5px] px-2.5 py-1.5 shadow-lg"
                          style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
                        >
                          <div className="font-semibold mb-0.5">{label}</div>
                          {payload.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  background: p.color,
                                  borderRadius: 2,
                                }}
                              />
                              <div style={{ color: GRAY_300 }}>{p.name}:</div>
                              <div className="font-semibold">
                                {p.dataKey === "str"
                                  ? `${p.value.toFixed(1)}%`
                                  : fmtK(p.value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                    cursor={{ fill: LIME_SOFT, fillOpacity: 0.4 }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="str"
                    stroke={LIME_DEEP}
                    strokeWidth={2}
                    fill="url(#strfill)"
                    name="STR"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="gmv"
                    stroke={INK}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    name="GMV"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Card>
          <CardHeader
            title="Price Distribution"
            sub="Click a band to filter · sold listings only"
          />
          <div className="px-3 pb-3 pt-1" style={{ height: 220 }}>
            {priceDist.every((p) => p.count === 0) ? (
              <div
                className="h-full flex items-center justify-center text-[12px]"
                style={{ color: GRAY_500 }}
              >
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={priceDist}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  onClick={(e) => {
                    if (e?.activePayload?.[0])
                      togglePriceBand(e.activePayload[0].payload.id);
                  }}
                >
                  <CartesianGrid stroke={GRAY_100} vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 9.5 }}
                    interval={0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) =>
                      `${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`
                    }
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div
                          className="text-[11.5px] px-2.5 py-1.5 shadow-lg"
                          style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
                        >
                          <div className="font-semibold mb-0.5">{label}</div>
                          <div className="flex items-center gap-2">
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                background: LIME,
                                borderRadius: 2,
                              }}
                            />
                            <div style={{ color: GRAY_300 }}>Sold:</div>
                            <div className="font-semibold">
                              {payload[0].value.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    }}
                    cursor={{ fill: LIME_SOFT, fillOpacity: 0.4 }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]} cursor="pointer">
                    {priceDist.map((p, i) => {
                      const isSelected = filters.priceBands.includes(p.id);
                      const hasOther =
                        filters.priceBands.length > 0 && !isSelected;
                      return (
                        <Cell
                          key={i}
                          fill={isSelected ? LIME_DEEP : LIME}
                          fillOpacity={hasOther ? 0.3 : 1}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Mileage vs. Sale Price"
            sub={
              filters.makes.length >= 2
                ? "Color per make · click expand for full view with point details"
                : "Click expand icon for full view with point details"
            }
            right={
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1 p-0.5"
                  style={{ background: GRAY_100, borderRadius: 4 }}
                >
                  {[null, 25000, 50000, 100000].map((cap) => {
                    const active = filters.mileageMax === cap;
                    return (
                      <button
                        key={cap === null ? "any" : cap}
                        onClick={() => setFilters((f) => ({ ...f, mileageMax: cap }))}
                        className="px-2 py-0.5 text-[10.5px] font-medium transition-colors"
                        style={{
                          background: active ? INK_SURFACE : "transparent",
                          color: active ? "white" : GRAY_700,
                          borderRadius: 3,
                        }}
                      >
                        {cap === null ? "Any" : `≤${cap / 1000}k`}
                      </button>
                    );
                  })}
                </div>
                {/* Expand icon */}
                <button
                  onClick={() => { setScatterExpanded(true); setSelectedPoint(null); }}
                  title="Expand to full screen"
                  className="flex items-center justify-center w-6 h-6 transition-opacity hover:opacity-70"
                  style={{ color: GRAY_500 }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M1 5V1h4M8 1h4v4M12 8v4H8M5 12H1V8" />
                  </svg>
                </button>
              </div>
            }
          />
          <ScatterPanel
            scatterPts={scatterPts}
            filters={filters}
            height={220}
            selectedPoint={null}
            onPointClick={null}
          />
          {/* Multi-make legend */}
          {filters.makes.length >= 2 && (
            <div className="px-4 pb-3 flex flex-wrap gap-3">
              {filters.makes.map((mk, i) => (
                <div key={mk} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: GRAY_500 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: MAKE_COLORS[i % MAKE_COLORS.length] }} />
                  {mk}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Full-screen scatter modal ─────────────────────────── */}
        {scatterExpanded && (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(0,0,0,0.65)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setScatterExpanded(false); }}
          >
            <div
              style={{
                background: "var(--card-bg)",
                borderRadius: 8,
                width: "88vw", maxWidth: 1200,
                height: "88vh",
                display: "flex", flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
              }}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div>
                  <div className="text-[16px] font-semibold tracking-tight" style={{ color: INK }}>
                    Mileage vs. Sale Price
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: GRAY_500 }}>
                    Click any point to inspect · hover to preview
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center gap-1 p-0.5"
                    style={{ background: GRAY_100, borderRadius: 4 }}
                  >
                    {[null, 25000, 50000, 100000].map((cap) => {
                      const active = filters.mileageMax === cap;
                      return (
                        <button
                          key={cap === null ? "any" : cap}
                          onClick={() => setFilters((f) => ({ ...f, mileageMax: cap }))}
                          className="px-2.5 py-1 text-[11px] font-medium transition-colors"
                          style={{
                            background: active ? INK_SURFACE : "transparent",
                            color: active ? "white" : GRAY_700,
                            borderRadius: 3,
                          }}
                        >
                          {cap === null ? "Any" : `≤${cap / 1000}k`}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setScatterExpanded(false)}
                    className="text-[18px] leading-none flex items-center justify-center w-8 h-8 transition-opacity hover:opacity-60"
                    style={{ color: GRAY_500 }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 gap-0">
                {/* Chart area */}
                <div className="flex-1 min-w-0 px-3 pb-4">
                  <ScatterPanel
                    scatterPts={scatterPts}
                    filters={filters}
                    height="100%"
                    selectedPoint={selectedPoint}
                    onPointClick={setSelectedPoint}
                  />
                </div>

                {/* Selected point info panel */}
                <div
                  className="flex-shrink-0 border-l px-5 py-4"
                  style={{ width: 240, borderColor: GRAY_200 }}
                >
                  {selectedPoint ? (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3" style={{ color: GRAY_500 }}>
                        Selected Listing
                      </div>
                      <div className="text-[15px] font-bold tracking-tight mb-0.5" style={{ color: INK }}>
                        {selectedPoint.year} {selectedPoint.make}
                      </div>
                      <div className="text-[13px] mb-4" style={{ color: GRAY_700 }}>
                        {selectedPoint.model}
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: "Sale Price", value: fmtFull(selectedPoint.price) },
                          { label: "Mileage", value: `${(selectedPoint.mileage / 1000).toFixed(1)}k mi` },
                          { label: "Bids", value: selectedPoint.bids },
                          { label: "Color", value: selectedPoint.colorGroup },
                          {
                            label: "Transmission",
                            value: selectedPoint.transmission === "M"
                              ? "Manual"
                              : selectedPoint.transmission === "A"
                              ? "Automatic"
                              : "—",
                          },
                          {
                            label: "Reserve",
                            value: selectedPoint.noReserve ? "No Reserve" : "With Reserve",
                          },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between text-[12px]">
                            <span style={{ color: GRAY_500 }}>{label}</span>
                            <span className="font-semibold" style={{ color: INK }}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setSelectedPoint(null)}
                        className="mt-4 text-[11px] hover:underline"
                        style={{ color: LIME_DEEP }}
                      >
                        Clear selection
                      </button>
                    </div>
                  ) : (
                    <div className="text-[12px] leading-relaxed" style={{ color: GRAY_500 }}>
                      Click any point on the chart to inspect that listing's details here.
                    </div>
                  )}
                  {/* Make legend in expanded view */}
                  {filters.makes.length >= 2 && (
                    <div className="mt-6">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: GRAY_500 }}>
                        Makes
                      </div>
                      {filters.makes.map((mk, i) => (
                        <div key={mk} className="flex items-center gap-2 text-[12px] mb-1.5" style={{ color: GRAY_700 }}>
                          <div style={{ width: 9, height: 9, borderRadius: 99, background: MAKE_COLORS[i % MAKE_COLORS.length], flexShrink: 0 }} />
                          {mk}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader title="Reserve vs. No Reserve" sub="Click either side to filter" />
          <div className="px-5 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setReserveType("noReserve")}
                className="text-left p-3 transition-colors"
                style={{
                  background: filters.reserve === "noReserve" ? LIME_SOFT : "transparent",
                  border: `1px solid ${filters.reserve === "noReserve" ? LIME : GRAY_200}`,
                  borderRadius: 4,
                }}
              >
                <div className="text-[11px] mb-1" style={{ color: GRAY_500 }}>
                  No Reserve
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div
                    className="text-[24px] font-bold tracking-tight"
                    style={{ color: INK }}
                  >
                    {reserveSplit.noReserve.str.toFixed(1)}%
                  </div>
                  <div className="text-[10px]" style={{ color: GRAY_500 }}>
                    STR
                  </div>
                </div>
                <div
                  className="h-1 mt-2"
                  style={{ background: GRAY_100, borderRadius: 2 }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${reserveSplit.noReserve.str}%`,
                      background: LIME,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div className="flex gap-3 mt-2 text-[10px]">
                  <div>
                    <span className="font-semibold" style={{ color: INK }}>
                      {(reserveSplit.noReserve.sold / 1000).toFixed(1)}k
                    </span>{" "}
                    <span style={{ color: GRAY_500 }}>sold</span>
                  </div>
                  <div>
                    <span className="font-semibold" style={{ color: INK }}>
                      {(reserveSplit.noReserve.listed / 1000).toFixed(1)}k
                    </span>{" "}
                    <span style={{ color: GRAY_500 }}>listed</span>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setReserveType("reserve")}
                className="text-left p-3 transition-colors"
                style={{
                  background: filters.reserve === "reserve" ? LIME_SOFT : "transparent",
                  border: `1px solid ${filters.reserve === "reserve" ? LIME : GRAY_200}`,
                  borderRadius: 4,
                }}
              >
                <div className="text-[11px] mb-1" style={{ color: GRAY_500 }}>
                  With Reserve
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div
                    className="text-[24px] font-bold tracking-tight"
                    style={{ color: INK }}
                  >
                    {reserveSplit.reserve.str.toFixed(1)}%
                  </div>
                  <div className="text-[10px]" style={{ color: GRAY_500 }}>
                    STR
                  </div>
                </div>
                <div
                  className="h-1 mt-2"
                  style={{ background: GRAY_100, borderRadius: 2 }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${reserveSplit.reserve.str}%`,
                      background: GRAY_400,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div className="flex gap-3 mt-2 text-[10px]">
                  <div>
                    <span className="font-semibold" style={{ color: INK }}>
                      {(reserveSplit.reserve.sold / 1000).toFixed(1)}k
                    </span>{" "}
                    <span style={{ color: GRAY_500 }}>sold</span>
                  </div>
                  <div>
                    <span className="font-semibold" style={{ color: INK }}>
                      {(reserveSplit.reserve.listed / 1000).toFixed(1)}k
                    </span>{" "}
                    <span style={{ color: GRAY_500 }}>listed</span>
                  </div>
                </div>
              </button>
            </div>
            <div className="text-[10px] text-center" style={{ color: GRAY_500 }}>
              {filters.reserve ? (
                <>
                  Showing{" "}
                  <span className="font-semibold" style={{ color: INK }}>
                    {filters.reserve === "noReserve" ? "No Reserve" : "Reserve"}
                  </span>{" "}
                  auctions only
                </>
              ) : (
                "Click either tile to filter the dashboard"
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
