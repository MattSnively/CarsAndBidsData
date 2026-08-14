import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { Card, CardHeader, Pill } from "../components/Primitives.jsx";
import { FilterMultiSelect } from "../components/FilterMultiSelect.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import {
  applyModelFilters,
  computeByMonthSplit,
  computeKPIs,
  computeModelSales,
  computePriceDist,
  computeReserveSplit,
  getListingDetail,
  getModels,
  loadDetails,
} from "../data.js";
import {
  CARD_BG,
  GRAY_100,
  GRAY_200,
  GRAY_300,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  MILEAGE_UNKNOWN_COLOR,
  buildMileageScale,
  dayLabelFull,
  dayLabelYear,
  fmtFull,
  fmtK,
} from "../tokens.js";

// Below this many sales a monthly trend line reads as signal when it is noise,
// so the trend card is replaced with a plain statement of the sales instead.
const MIN_SALES_FOR_TREND = 8;

// The tooltip body sits on INK_SURFACE in both themes, so its secondary text needs
// a fixed light gray rather than a token that inverts with the theme.
const TOOLTIP_MUTED = "#a8a8a8";

function Stat({ label, value, sub }) {
  return (
    <Card>
      <div className="px-4 py-3">
        <div className="text-[11px]" style={{ color: GRAY_500 }}>
          {label}
        </div>
        <div className="text-[22px] font-bold mt-0.5" style={{ color: INK }}>
          {value}
        </div>
        {sub && (
          <div className="text-[10.5px] mt-0.5" style={{ color: GRAY_500 }}>
            {sub}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Legend for the mileage ramp. The ramp encodes magnitude, so it ships with the
 * band boundaries spelled out — color never carries the meaning on its own.
 */
function MileageLegend({ scale, hasUnknown }) {
  if (!scale) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 pb-3">
      <span className="text-[10.5px]" style={{ color: GRAY_500 }}>
        Mileage
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {scale.bands.map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: b.color,
                display: "inline-block",
              }}
            />
            <span className="text-[10.5px] tabular-nums" style={{ color: GRAY_700 }}>
              {b.label}
            </span>
          </span>
        ))}
        {hasUnknown && (
          <span className="flex items-center gap-1">
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: MILEAGE_UNKNOWN_COLOR,
                display: "inline-block",
              }}
            />
            <span className="text-[10.5px]" style={{ color: GRAY_700 }}>
              not recorded
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function SaleTooltip({ active, payload, detailsReady }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const detail = detailsReady ? getListingDetail(p.index) : null;

  const Row = ({ label, value }) =>
    value == null || value === "" ? null : (
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10.5px]" style={{ color: TOOLTIP_MUTED }}>
          {label}
        </span>
        <span className="text-[11px] font-medium" style={{ color: "white" }}>
          {value}
        </span>
      </div>
    );

  return (
    <div
      className="px-3 py-2.5"
      style={{
        background: INK_SURFACE,
        borderRadius: 5,
        boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
        minWidth: 210,
      }}
    >
      <div className="text-[12.5px] font-semibold mb-0.5" style={{ color: "white" }}>
        {p.year} {p.make} {p.model}
      </div>
      <div className="text-[10.5px] mb-2" style={{ color: TOOLTIP_MUTED }}>
        Sold {dayLabelFull(p.day)}
      </div>
      <div className="text-[18px] font-bold mb-2" style={{ color: LIME }}>
        {fmtFull(p.price)}
      </div>
      <div className="flex flex-col gap-0.5">
        <Row
          label="Mileage"
          value={p.mileage > 0 ? `${p.mileage.toLocaleString()} mi` : "Not recorded"}
        />
        <Row label="Color" value={detail?.exteriorColor ?? p.colorGroup} />
        <Row label="Bids" value={p.bids?.toLocaleString()} />
        <Row label="Views" value={p.views > 0 ? p.views.toLocaleString() : null} />
        <Row label="Comments" value={p.comments > 0 ? p.comments.toLocaleString() : null} />
        <Row label="Body" value={p.bodyStyle} />
        <Row
          label="Transmission"
          value={p.transmission === "M" ? "Manual" : p.transmission === "A" ? "Automatic" : null}
        />
        <Row label="Drivetrain" value={detail?.drivetrain} />
        <Row label="Engine" value={detail?.engine} />
        <Row label="Location" value={detail?.location} />
        <Row label="Reserve" value={p.noReserve ? "No Reserve" : "Reserve"} />
      </div>
      {detail?.url && (
        <div
          className="mt-2 pt-2 text-[10.5px]"
          style={{ borderTop: `1px solid rgba(255,255,255,0.16)`, color: LIME }}
        >
          Click point to open auction ↗
        </div>
      )}
    </div>
  );
}

export function ModelTab() {
  const { filters, setFilters } = useFilters();
  const [detailsReady, setDetailsReady] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const requested = useRef(false);

  // The page analyses one model; the global filter holds an array. Focus the
  // first selected one so arriving with a model already chosen just works.
  const model = filters.models[0] ?? null;

  const modelOptions = useMemo(() => {
    const all = getModels();
    const scoped = filters.makes.length
      ? all.filter((m) => filters.makes.some((mk) => m.makes.has(mk)))
      : all;
    return scoped.map((m) => ({ value: m.model, count: m.count }));
  }, [filters.makes]);

  // The detail sidecar is comparable in size to the whole dataset, so it is
  // fetched here rather than at startup — only this page needs it.
  useEffect(() => {
    if (!model || requested.current) return;
    requested.current = true;
    loadDetails(import.meta.env.BASE_URL || "/")
      .then(() => setDetailsReady(true))
      .catch((err) => setDetailsError(err));
  }, [model]);

  const points = useMemo(
    () => (model ? computeModelSales(model, filters) : []),
    [model, filters],
  );
  const records = useMemo(
    () => (model ? applyModelFilters(model, filters) : []),
    [model, filters],
  );

  const kpis = useMemo(() => computeKPIs(records), [records]);
  const priceDist = useMemo(() => computePriceDist(records), [records]);
  const reserve = useMemo(() => computeReserveSplit(records), [records]);
  const byMonth = useMemo(() => computeByMonthSplit(records, records), [records]);
  // Cut the ramp against this model's own mileages, not fixed odometer bands.
  const mileageScale = useMemo(
    () => buildMileageScale(points.map((p) => p.mileage)),
    [points],
  );
  const hasUnknownMileage = points.some((p) => !p.mileage || p.mileage <= 0);

  const setModel = (next) =>
    setFilters((f) => ({ ...f, models: next.length ? [next[next.length - 1]] : [] }));

  const picker = (
    <div style={{ maxWidth: 280 }}>
      <FilterMultiSelect
        mode="typeahead"
        noun="model"
        options={modelOptions}
        selected={filters.models}
        onChange={setModel}
        placeholder="Search a model…"
      />
    </div>
  );

  if (!model) {
    return (
      <div className="px-3 md:px-6 py-10">
        <div className="max-w-md mx-auto text-center">
          <div className="text-[17px] font-semibold mb-1.5" style={{ color: INK }}>
            Analyze a single model
          </div>
          <div className="text-[12.5px] mb-5 leading-relaxed" style={{ color: GRAY_500 }}>
            Every sold auction plotted by date and price, shaded by mileage, with the
            full listing behind each point.
          </div>
          <div className="flex justify-center">{picker}</div>
        </div>
      </div>
    );
  }

  const priceValues = points.map((p) => p.price);
  const yMax = priceValues.length ? Math.max(...priceValues) : 0;
  const days = points.map((p) => p.day);
  const xMin = days.length ? Math.min(...days) : 0;
  const xMax = days.length ? Math.max(...days) : 1;
  // Pad the domain so points never sit on the axis line itself.
  const xPad = Math.max(7, Math.round((xMax - xMin) * 0.03));

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 gap-3">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
            style={{ color: GRAY_500 }}
          >
            Model deep dive
          </div>
          <div className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
            {model}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: GRAY_500 }}>
            {kpis.totalSold.toLocaleString()} sold of{" "}
            {kpis.totalListed.toLocaleString()} listed
            {kpis.canceled > 0 && (
              <span title="Canceled auctions never went to market, so they are left out of the sell-through rate">
                {" · "}
                {kpis.canceled.toLocaleString()} canceled
              </span>
            )}
            {points.length !== kpis.totalSold && (
              <>
                {" · "}
                {points.length.toLocaleString()} plotted
                <span title="Sold listings with no recorded sale price are excluded">
                  {" "}
                  ({(kpis.totalSold - points.length).toLocaleString()} without a price)
                </span>
              </>
            )}
          </div>
        </div>
        {picker}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
        <Stat label="Listed" value={kpis.totalListed.toLocaleString()} />
        <Stat label="Sold" value={kpis.totalSold.toLocaleString()} />
        <Stat label="Sell-through" value={`${kpis.str.toFixed(1)}%`} />
        <Stat label="Total GMV" value={fmtK(kpis.totalGMV)} />
        <Stat label="Avg sale price" value={fmtK(kpis.avgPrice)} />
        <Stat label="Avg bids" value={kpis.avgBids.toFixed(0)} />
      </div>

      <Card className="mb-3">
        <CardHeader
          title="Sale price over time"
          sub={
            points.length
              ? "Each point is one sold auction · color is mileage · click to open the listing"
              : "No sold auctions with a recorded price match the current filters"
          }
          right={
            detailsError ? (
              <Pill tone="warn">Listing details unavailable</Pill>
            ) : !detailsReady ? (
              <span className="text-[10.5px]" style={{ color: GRAY_500 }}>
                Loading listing details…
              </span>
            ) : null
          }
        />
        {points.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 10, right: 18, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={GRAY_200} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="day"
                  domain={[xMin - xPad, xMax + xPad]}
                  tickFormatter={dayLabelYear}
                  axisLine={{ stroke: GRAY_300 }}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                  minTickGap={28}
                />
                <YAxis
                  type="number"
                  dataKey="price"
                  domain={[0, Math.ceil(yMax * 1.05)]}
                  tickFormatter={fmtK}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                  width={52}
                />
                {/* Recharts sizes scatter symbols by area via ZAxis; ~70 puts the
                    marks near 9px across, enough to read the mileage shade. */}
                <ZAxis type="number" range={[70, 70]} />
                <Tooltip
                  content={<SaleTooltip detailsReady={detailsReady} />}
                  cursor={{ strokeDasharray: "2 2", stroke: GRAY_300 }}
                />
                <Scatter
                  data={points}
                  // Recharts sizes symbols by area; 64 gives ~9px marks, enough
                  // for the mileage shade to be readable on a single dot.
                  shape="circle"
                  legendType="none"
                  isAnimationActive={false}
                  onClick={(pt) => {
                    const detail = getListingDetail(pt?.index);
                    if (detail?.url) window.open(detail.url, "_blank", "noopener");
                  }}
                  style={{ cursor: detailsReady ? "pointer" : "default" }}
                >
                  {points.map((p) => (
                    <Cell
                      key={p.index}
                      fill={
                        mileageScale
                          ? mileageScale.colorFor(p.mileage)
                          : MILEAGE_UNKNOWN_COLOR
                      }
                      fillOpacity={0.85}
                      // A surface-colored ring keeps overlapping points readable
                      // where sales cluster.
                      stroke={CARD_BG}
                      strokeWidth={1}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <MileageLegend scale={mileageScale} hasUnknown={hasUnknownMileage} />
          </>
        ) : (
          <div className="px-5 py-12 text-center text-[12px]" style={{ color: GRAY_500 }}>
            Nothing to plot — try clearing other filters.
          </div>
        )}
      </Card>

      <Card className="mb-3">
        <CardHeader
          title="Sell-Through Rate vs. Total GMV"
          sub={
            kpis.totalSold >= MIN_SALES_FOR_TREND
              ? `Monthly, for ${model}`
              : "Too few sales to read as a trend"
          }
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
        <div className="px-3 pb-3 pt-1" style={{ height: 260 }}>
          {/* A handful of sales drawn as a monthly line invents a trend that isn't
              there, so below the threshold the numbers are stated plainly instead. */}
          {kpis.totalSold < MIN_SALES_FOR_TREND ? (
            <div
              className="h-full flex flex-col items-center justify-center text-center px-6"
              style={{ color: GRAY_500 }}
            >
              <div className="text-[12.5px] mb-1" style={{ color: INK }}>
                {kpis.totalSold === 0
                  ? "No sales for this model"
                  : `${kpis.totalSold} sale${kpis.totalSold === 1 ? "" : "s"} across ${byMonth.length} month${byMonth.length === 1 ? "" : "s"}`}
              </div>
              <div className="text-[11.5px]">
                A monthly trend needs at least {MIN_SALES_FOR_TREND} sales to mean
                anything. The scatter above shows each one.
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={byMonth} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="modelstrfill" x1="0" y1="0" x2="0" y2="1">
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
                  minTickGap={20}
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
                  tickFormatter={fmtK}
                />
                <Tooltip
                  contentStyle={{
                    background: INK_SURFACE,
                    border: "none",
                    borderRadius: 5,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "white", fontWeight: 600 }}
                  formatter={(v, name) =>
                    name === "str" ? [`${v.toFixed(1)}%`, "STR"] : [fmtFull(v), "GMV"]
                  }
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="str"
                  stroke={LIME}
                  strokeWidth={2}
                  fill="url(#modelstrfill)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="gmv"
                  stroke={INK}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader
            title="Price distribution"
            sub={
              `Where ${model} sales land · sold listings only` +
              // Name the gap rather than let these sales vanish from the chart
              // without explanation — they used to land in <$5k instead.
              (kpis.priceUnknown > 0
                ? ` · ${kpis.priceUnknown} sale${kpis.priceUnknown === 1 ? "" : "s"} with no recorded price excluded`
                : "")
            }
          />
          {kpis.totalSold > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priceDist} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRAY_200} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: GRAY_300 }}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 9.5 }}
                  // Left to auto rather than interval={0}: forcing every band's
                  // label collides them into an unreadable run at 390px.
                  minTickGap={4}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: GRAY_500, fontSize: 10 }}
                  width={34}
                />
                <Tooltip
                  cursor={{ fill: GRAY_100 }}
                  contentStyle={{
                    background: INK_SURFACE,
                    border: "none",
                    borderRadius: 5,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "white", fontWeight: 600 }}
                  itemStyle={{ color: LIME }}
                  formatter={(v) => [`${v.toLocaleString()} sold`, ""]}
                />
                <Bar dataKey="count" fill={LIME_DEEP} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="px-5 py-10 text-center text-[12px]" style={{ color: GRAY_500 }}>
              No sold listings
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Reserve vs No Reserve"
            sub={`How ${model} listings close under each format`}
          />
          <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-3">
            {[
              { key: "noReserve", label: "No Reserve", d: reserve.noReserve },
              { key: "reserve", label: "With Reserve", d: reserve.reserve },
            ].map(({ key, label, d }) => (
              <div
                key={key}
                className="px-3 py-3"
                style={{
                  background: GRAY_100,
                  borderRadius: 5,
                  border: `1px solid ${GRAY_200}`,
                }}
              >
                <div className="text-[11px] mb-1" style={{ color: GRAY_500 }}>
                  {label}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-[22px] font-bold" style={{ color: INK }}>
                    {d.listed > 0 ? `${d.str.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: GRAY_500 }}>
                    STR
                  </div>
                </div>
                <div
                  className="mt-2 h-1"
                  style={{ background: GRAY_300, borderRadius: 99, overflow: "hidden" }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, d.str)}%`,
                      height: "100%",
                      background: LIME,
                    }}
                  />
                </div>
                <div className="text-[10.5px] mt-1.5" style={{ color: GRAY_500 }}>
                  {d.sold.toLocaleString()} sold · {d.listed.toLocaleString()} listed
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
