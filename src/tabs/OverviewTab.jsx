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
  computeByMonth,
  computeByMonthSplit,
  computeKPIsSplit,
  computePriceDist,
  computeReserveSplit,
  computeScatterPoints,
} from "../data.js";
import {
  GRAY_100,
  GRAY_200,
  GRAY_300,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  LIME,
  LIME_DEEP,
  LIME_SOFT,
  fmtFull,
  fmtK,
  fmtN,
} from "../tokens.js";

export function OverviewTab({ setTab, setDrillMetric }) {
  const { filters, setFilters } = useFilters();
  const [showAllMakes, setShowAllMakes] = useState(false);

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
                          style={{ background: INK, color: "white", borderRadius: 4 }}
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
                          style={{ background: INK, color: "white", borderRadius: 4 }}
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
            sub="Sold listings only"
            right={
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
                        background: active ? INK : "transparent",
                        color: active ? "white" : GRAY_700,
                        borderRadius: 3,
                      }}
                    >
                      {cap === null ? "Any" : `≤${cap / 1000}k`}
                    </button>
                  );
                })}
              </div>
            }
          />
          <div className="px-3 pb-3 pt-1" style={{ height: 220 }}>
            {scatterPts.length === 0 ? (
              <div
                className="h-full flex items-center justify-center text-[12px]"
                style={{ color: GRAY_500 }}
              >
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke={GRAY_100} vertical={false} />
                  <XAxis
                    dataKey="mileage"
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) =>
                      `${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`
                    }
                    domain={[0, 250000]}
                  />
                  <YAxis
                    dataKey="price"
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: GRAY_500, fontSize: 10 }}
                    tickFormatter={(v) =>
                      `${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`
                    }
                    domain={[0, 300000]}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div
                          className="text-[11px] px-2.5 py-1.5 shadow-lg"
                          style={{ background: INK, color: "white", borderRadius: 4 }}
                        >
                          <div>{(d.mileage / 1000).toFixed(0)}k mi</div>
                          <div className="font-semibold">{fmtFull(d.price)}</div>
                        </div>
                      );
                    }}
                    cursor={{ strokeDasharray: "2 2" }}
                  />
                  <Scatter data={scatterPts} fill={LIME_DEEP} fillOpacity={0.5} />
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
            )}
          </div>
        </Card>

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
