import { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { Card, CardHeader } from "../components/Primitives.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import { applyUniverseFilters, computeByMake } from "../data.js";
import {
  GRAY_100,
  GRAY_200,
  GRAY_300,
  GRAY_400,
  GRAY_500,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  fmtK,
} from "../tokens.js";

export function CompareTab() {
  const { filters, setFilters } = useFilters();

  // Compare ignores the makes filter (otherwise you can't compare anything),
  // but respects everything else.
  const recordsForCompare = useMemo(
    () => applyUniverseFilters({ ...filters, makes: [] }),
    [filters],
  );

  // With the full 31K dataset we have 169 unique makes. Most are single-listing
  // exotics, so floor at 30 listings to keep the bubble chart legible.
  const allMakeStats = useMemo(() => {
    const arr = computeByMake(recordsForCompare, null);
    return arr.filter((m) => m.listings >= 30);
  }, [recordsForCompare]);

  const makeNames = allMakeStats.map((m) => m.make);

  // Floor to nearest 5% below the actual minimum STR to eliminate dead whitespace
  const xAxisMin = useMemo(() => {
    if (allMakeStats.length === 0) return 0;
    const minStr = Math.min(...allMakeStats.map((m) => m.str));
    return Math.floor(minStr / 5) * 5;
  }, [allMakeStats]);
  const [mA, setMA] = useState("Porsche");
  const [mB, setMB] = useState("BMW");

  // If a selected make becomes invalid (filtered out), pick something reasonable
  useEffect(() => {
    if (makeNames.length === 0) return;
    if (!makeNames.includes(mA)) setMA(makeNames[0]);
    if (!makeNames.includes(mB)) setMB(makeNames[1] || makeNames[0]);
  }, [makeNames, mA, mB]);

  const a = allMakeStats.find((m) => m.make === mA);
  const b = allMakeStats.find((m) => m.make === mB);

  if (allMakeStats.length < 2) {
    return (
      <div className="px-6 py-5">
        <Card>
          <div className="px-5 py-12 text-center">
            <div className="text-[14px] font-semibold mb-1" style={{ color: INK }}>
              Not enough data to compare
            </div>
            <div className="text-[12px]" style={{ color: GRAY_500 }}>
              Current filters leave too few makes to compare. Try clearing some filters.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const rows =
    a && b
      ? [
          {
            label: "Total listings",
            a: a.listings,
            b: b.listings,
            fmt: (v) => v.toLocaleString(),
          },
          {
            label: "Units sold",
            a: a.sold,
            b: b.sold,
            fmt: (v) => v.toLocaleString(),
          },
          {
            label: "Sell-through rate",
            a: a.str,
            b: b.str,
            fmt: (v) => `${v.toFixed(1)}%`,
          },
          {
            label: "Total GMV",
            a: a.gmv,
            b: b.gmv,
            fmt: fmtK,
          },
          {
            label: "Avg. sale price",
            a: a.avgPrice,
            b: b.avgPrice,
            fmt: (v) => fmtK(Math.round(v)),
          },
          {
            label: "Avg. bids / listing",
            a: a.avgBids,
            b: b.avgBids,
            fmt: (v) => v.toFixed(1),
          },
        ]
      : [];

  const MakeSelector = ({ value, setValue, color }) => (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="appearance-none w-full text-[24px] font-bold tracking-tight pr-8 pl-1 py-1 bg-transparent cursor-pointer outline-none border-b-2"
        style={{ color: INK, borderColor: color }}
      >
        {makeNames.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        width="12"
        height="12"
        viewBox="0 0 12 12"
      >
        <path
          d="M3 4.5l3 3 3-3"
          stroke={INK}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">
      <div className="mb-4">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
          style={{ color: GRAY_500 }}
        >
          Head-to-head
        </div>
        <div className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
          Compare make performance
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <Card>
          <div className="px-5 py-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-1"
              style={{ color: LIME_DEEP }}
            >
              Make A
            </div>
            <MakeSelector value={mA} setValue={setMA} color={LIME} />
            {a && (
              <div className="text-[11px] mt-2" style={{ color: GRAY_500 }}>
                {a.listings.toLocaleString()} listings · {fmtK(a.gmv)} GMV ·{" "}
                {a.str.toFixed(1)}% STR
              </div>
            )}
          </div>
        </Card>
        <Card>
          <div className="px-5 py-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-1"
              style={{ color: GRAY_500 }}
            >
              Make B
            </div>
            <MakeSelector value={mB} setValue={setMB} color={INK} />
            {b && (
              <div className="text-[11px] mt-2" style={{ color: GRAY_500 }}>
                {b.listings.toLocaleString()} listings · {fmtK(b.gmv)} GMV ·{" "}
                {b.str.toFixed(1)}% STR
              </div>
            )}
          </div>
        </Card>
      </div>

      {a && b && (
        <Card className="mb-3">
          <CardHeader
            title="Side-by-side comparison"
            sub="Bars scale relative to the larger value in each row"
          />
          <div className="px-5 pb-5 pt-2">
            <div
              className="grid mb-3 pb-2 border-b"
              style={{ gridTemplateColumns: "1fr 1fr", borderColor: GRAY_100 }}
            >
              <div className="flex items-center justify-end gap-2 pr-3">
                <div style={{ width: 8, height: 8, background: LIME, borderRadius: 2 }} />
                <div className="text-[12px] font-semibold" style={{ color: INK }}>
                  {mA}
                </div>
              </div>
              <div className="flex items-center gap-2 pl-3">
                <div style={{ width: 8, height: 8, background: INK, borderRadius: 2 }} />
                <div className="text-[12px] font-semibold" style={{ color: INK }}>
                  {mB}
                </div>
              </div>
            </div>
            {rows.map((r, i) => {
              const max = Math.max(r.a, r.b);
              const pctA = max > 0 ? (r.a / max) * 100 : 0;
              const pctB = max > 0 ? (r.b / max) * 100 : 0;
              const aLarger = r.a >= r.b;
              const diff =
                Math.min(r.a, r.b) > 0
                  ? (Math.abs(r.a - r.b) / Math.min(r.a, r.b)) * 100
                  : 0;
              return (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-center mb-2">
                    <div className="text-[11.5px] font-medium" style={{ color: GRAY_500 }}>
                      {r.label}
                      <span className="ml-2 text-[10.5px]" style={{ color: GRAY_400 }}>
                        · {aLarger ? mA : mB} +
                        <span className="font-semibold" style={{ color: INK }}>
                          {diff.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                  </div>
                  <div
                    className="grid items-center"
                    style={{ gridTemplateColumns: "1fr 1px 1fr" }}
                  >
                    <div className="flex items-center justify-end gap-3 pr-3">
                      <div
                        className="text-[13px] font-bold tabular-nums"
                        style={{ color: INK }}
                      >
                        {r.fmt(r.a)}
                      </div>
                      <div className="relative" style={{ width: "100%", height: 12 }}>
                        <div
                          className="absolute right-0 top-0 h-full"
                          style={{
                            width: `${pctA}%`,
                            background: LIME,
                            borderRadius: "2px 0 0 2px",
                          }}
                        />
                      </div>
                    </div>
                    <div className="h-5" style={{ background: GRAY_300 }} />
                    <div className="flex items-center gap-3 pl-3">
                      <div className="relative" style={{ width: "100%", height: 12 }}>
                        <div
                          className="absolute left-0 top-0 h-full"
                          style={{
                            width: `${pctB}%`,
                            background: INK,
                            borderRadius: "0 2px 2px 0",
                          }}
                        />
                      </div>
                      <div
                        className="text-[13px] font-bold tabular-nums"
                        style={{ color: INK }}
                      >
                        {r.fmt(r.b)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Market position"
          sub="All makes plotted by sell-through × avg. price · click any bubble to filter · bubble size = volume"
        />
        <div className="px-3 pb-4 pt-2 h-[260px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 15, right: 15, left: 25, bottom: 25 }}>
              <CartesianGrid stroke={GRAY_100} />
              <XAxis
                type="number"
                dataKey="str"
                name="Sell-through"
                domain={[xAxisMin, 100]}
                tick={{ fill: GRAY_500, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: "Sell-through rate →",
                  position: "bottom",
                  offset: 0,
                  fill: GRAY_500,
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="avgPrice"
                name="Avg. price"
                tick={{ fill: GRAY_500, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtK}
                label={{
                  value: "Avg. price ↑",
                  angle: -90,
                  position: "left",
                  offset: 10,
                  fill: GRAY_500,
                  fontSize: 11,
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div
                      className="text-[11px] px-3 py-2 shadow-lg"
                      style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
                    >
                      <div className="font-bold mb-1">{d.make}</div>
                      <div>
                        STR: <span className="font-semibold">{d.str.toFixed(1)}%</span>
                      </div>
                      <div>
                        Avg price:{" "}
                        <span className="font-semibold">
                          {fmtK(Math.round(d.avgPrice))}
                        </span>
                      </div>
                      <div>
                        Listings:{" "}
                        <span className="font-semibold">
                          {d.listings.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: GRAY_400 }}>
                        Click to filter
                      </div>
                    </div>
                  );
                }}
                cursor={{ strokeDasharray: "2 2" }}
              />
              <Scatter
                data={allMakeStats}
                onClick={(d) => {
                  if (d?.make) {
                    setFilters((f) => ({
                      ...f,
                      makes: f.makes.includes(d.make)
                        ? f.makes.filter((m) => m !== d.make)
                        : [...f.makes, d.make],
                    }));
                  }
                }}
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  const isA = payload.make === mA;
                  const isB = payload.make === mB;
                  const isFiltered = filters.makes.includes(payload.make);
                  // Scale bubble by sqrt(listings); divisor scales for full 31K dataset
                  const r = Math.max(4, Math.sqrt(payload.listings) / 1.5);
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={
                        isFiltered
                          ? LIME_DEEP
                          : isA
                            ? LIME
                            : isB
                              ? INK
                              : GRAY_300
                      }
                      fillOpacity={isFiltered ? 0.95 : isA || isB ? 0.85 : 0.4}
                      stroke={
                        isFiltered
                          ? LIME_DEEP
                          : isA
                            ? LIME_DEEP
                            : isB
                              ? INK
                              : "none"
                      }
                      strokeWidth={isFiltered || isA || isB ? 2 : 0}
                      style={{ cursor: "pointer" }}
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div
          className="px-5 pb-4 flex items-center gap-5 text-[11px] flex-wrap"
          style={{ color: GRAY_500 }}
        >
          <div className="flex items-center gap-1.5">
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: LIME,
                border: `2px solid ${LIME_DEEP}`,
              }}
            />
            {mA}
          </div>
          <div className="flex items-center gap-1.5">
            <div
              style={{ width: 10, height: 10, borderRadius: 99, background: INK }}
            />
            {mB}
          </div>
          {filters.makes.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                  background: LIME_DEEP,
                }}
              />
              Filtered ({filters.makes.length})
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background: GRAY_300,
              }}
            />
            Other makes
          </div>
        </div>
      </Card>
    </div>
  );
}
