import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  applyScopeFilters,
  computeKPIs,
  computeModelsForMake,
  computePriceDist,
  computeReserveSplit,
  computeScopePoints,
  getListingDetail,
  getMakeCounts,
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

// The tooltip body sits on INK_SURFACE in both themes, so its secondary text needs
// a fixed light gray rather than a token that inverts with the theme.
const TOOLTIP_MUTED = "#a8a8a8";

// The median brand has 2 models and 90% have 18 or fewer, so ten rows shows the
// whole roster for almost every brand; only the handful of large marques collapse.
const TOP_MODELS = 10;

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
 * Key for both encodings on the scatter: fill carries the auction's outcome,
 * color carries mileage. Keeping them on separate channels is what lets an
 * unsold point still say what the car's odometer read.
 *
 * The ramp ships with its band boundaries spelled out — color never carries the
 * meaning on its own — and the outcome marks are drawn in a neutral gray so the
 * key reads as "filled vs. open", not as two more ramp colors.
 */
function ChartLegend({ scale, hasUnknown, hasUnsold }) {
  if (!scale && !hasUnsold) return null;
  return (
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-4 pb-3">
      {hasUnsold && (
        <div className="flex items-center gap-3">
          {[
            { label: "Sold", fill: GRAY_700 },
            { label: "Unsold · high bid", fill: CARD_BG },
          ].map((o) => (
            <span key={o.label} className="flex items-center gap-1">
              <svg width="11" height="11" aria-hidden="true">
                <circle
                  cx="5.5"
                  cy="5.5"
                  r="4"
                  fill={o.fill}
                  stroke={GRAY_700}
                  strokeWidth="1.5"
                />
              </svg>
              <span className="text-[10.5px]" style={{ color: GRAY_700 }}>
                {o.label}
              </span>
            </span>
          ))}
        </div>
      )}
      {scale && (
        <div className="flex items-center gap-3 flex-wrap">
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
      )}
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
        {p.sold ? "Sold" : "Reserve not met ·"} {dayLabelFull(p.day)}
      </div>
      {/* LIME is the money-changed-hands color everywhere else on the site, so a
          high bid that never closed deliberately does not get it. */}
      <div
        className="text-[18px] font-bold mb-2"
        style={{ color: p.sold ? LIME : "white" }}
      >
        {fmtFull(p.price)}
        {!p.sold && (
          <span className="text-[10.5px] font-medium ml-1.5" style={{ color: TOOLTIP_MUTED }}>
            high bid
          </span>
        )}
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
  const [showAllModels, setShowAllModels] = useState(false);
  const requested = useRef(false);

  // The page analyses one brand, optionally narrowed to one of its models. The
  // global filters hold arrays, so focus the first of each — arriving with a
  // selection already made from another tab just works.
  const selectedMake = filters.makes[0] ?? null;
  const model = filters.models[0] ?? null;

  // The sidebar's Model typeahead sets a model without a brand, as does arriving
  // from another tab, which would otherwise show the brand empty state while a
  // model filter sits visibly active in the bar above it. A model owned by one
  // marque resolves its own brand; the 42 names shared across marques cannot, so
  // those fall through to the empty state, which names the candidates.
  const modelMakes = useMemo(() => {
    if (selectedMake || !model) return null;
    return getModels().find((m) => m.model === model)?.makes ?? null;
  }, [selectedMake, model]);

  const make = selectedMake ?? (modelMakes?.size === 1 ? [...modelMakes][0] : null);
  const sharedBy = modelMakes?.size > 1 ? [...modelMakes].sort() : null;
  const scope = useMemo(() => ({ make, model }), [make, model]);

  const makeOptions = useMemo(
    () => [...getMakeCounts().entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count })),
    [],
  );

  // The detail sidecar is comparable in size to the whole dataset, so it is
  // fetched here rather than at startup — only this page needs it.
  useEffect(() => {
    if (!make || requested.current) return;
    requested.current = true;
    loadDetails(import.meta.env.BASE_URL || "/")
      .then(() => setDetailsReady(true))
      .catch((err) => setDetailsError(err));
  }, [make]);

  const points = useMemo(
    () => (make ? computeScopePoints(scope, filters) : []),
    [make, scope, filters],
  );
  // Recharts needs one <Scatter> per visual treatment, so the outcomes are split
  // here rather than branched inside a single series.
  const soldPoints = useMemo(() => points.filter((p) => p.sold), [points]);
  const unsoldPoints = useMemo(() => points.filter((p) => !p.sold), [points]);
  const records = useMemo(
    () => (make ? applyScopeFilters(scope, filters) : []),
    [make, scope, filters],
  );
  // Always the brand's full model roster, never narrowed to the drilled model —
  // the list doubles as the navigation for switching between them.
  const modelRows = useMemo(
    () => (make ? computeModelsForMake(make, filters) : []),
    [make, filters],
  );

  const kpis = useMemo(() => computeKPIs(records), [records]);
  const priceDist = useMemo(() => computePriceDist(records), [records]);
  const reserve = useMemo(() => computeReserveSplit(records), [records]);
  // Cut the ramp against this scope's own mileages, not fixed odometer bands.
  const mileageScale = useMemo(
    () => buildMileageScale(points.map((p) => p.mileage)),
    [points],
  );
  const hasUnknownMileage = points.some((p) => !p.mileage || p.mileage <= 0);

  // Switching brand clears the model: an A5 is not a BMW, so carrying the old
  // model across would scope to a pair that has no listings.
  const setMake = (next) =>
    setFilters((f) => ({
      ...f,
      makes: next.length ? [next[next.length - 1]] : [],
      models: [],
    }));
  const setModel = (next) => setFilters((f) => ({ ...f, models: next ? [next] : [] }));

  const picker = (
    <div style={{ maxWidth: 280 }}>
      <FilterMultiSelect
        mode="list"
        single
        noun="brand"
        options={makeOptions}
        selected={make ? [make] : []}
        onChange={setMake}
        placeholder="Choose a brand…"
        searchPlaceholder="Search brands…"
      />
    </div>
  );

  if (!make) {
    return (
      <div className="px-3 md:px-6 py-10">
        <div className="max-w-md mx-auto text-center">
          <div className="text-[17px] font-semibold mb-1.5" style={{ color: INK }}>
            Analyze a brand
          </div>
          <div className="text-[12.5px] mb-5 leading-relaxed" style={{ color: GRAY_500 }}>
            {sharedBy ? (
              <>
                <span style={{ color: INK, fontWeight: 600 }}>{model}</span> is sold
                under {sharedBy.length} marques — {sharedBy.join(", ")}. Pick the one
                you mean; they are different vehicles and averaging them together
                would not describe any of them.
              </>
            ) : (
              <>
                Every auction plotted by date and price, shaded by mileage, with the
                full listing behind each point — then drill into any one of the
                brand's models.
              </>
            )}
          </div>
          <div className="flex justify-center">{picker}</div>
        </div>
      </div>
    );
  }

  const markColor = (p) =>
    mileageScale ? mileageScale.colorFor(p.mileage) : MILEAGE_UNKNOWN_COLOR;
  const openListing = (pt) => {
    const detail = getListingDetail(pt?.index);
    if (detail?.url) window.open(detail.url, "_blank", "noopener");
  };

  const scopeLabel = model ?? make;

  // Bars are sized against the brand's best-selling model so the drill list
  // reads as a ranking within the brand, not against the whole market.
  const maxModelSold = Math.max(1, ...modelRows.map((m) => m.sold));
  const visibleModels = showAllModels ? modelRows : modelRows.slice(0, TOP_MODELS);

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
            {model ? "Model deep dive" : "Brand deep dive"}
          </div>
          {/* Breadcrumb: the brand stays clickable while drilled in so it is
              always one click back out to the whole marque. */}
          <div className="text-[22px] font-bold tracking-tight flex items-baseline gap-2 flex-wrap" style={{ color: INK }}>
            {model ? (
              <>
                <button
                  onClick={() => setModel(null)}
                  className="hover:underline"
                  style={{ color: GRAY_500 }}
                  title={`Back to all ${make} auctions`}
                >
                  {make}
                </button>
                <span style={{ color: GRAY_300 }}>›</span>
                <span>{model}</span>
              </>
            ) : (
              make
            )}
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
            {points.length !== kpis.totalListed && (
              <>
                {" · "}
                {points.length.toLocaleString()} plotted
                <span title="A listing can only be plotted at a real number: a sale needs a recorded sale price, an unsold auction a recorded high bid. The scraper missed both on some listings.">
                  {" "}
                  ({(kpis.totalListed - points.length).toLocaleString()} with no
                  recorded price or high bid)
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
          title="Sale price and high bids over time"
          sub={
            points.length
              ? "Each point is one auction, sold or not · color is mileage · click to open the listing"
              : "No auctions with a recorded price or high bid match the current filters"
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
                  data={soldPoints}
                  // Recharts sizes symbols by area; 64 gives ~9px marks, enough
                  // for the mileage shade to be readable on a single dot.
                  shape="circle"
                  legendType="none"
                  isAnimationActive={false}
                  onClick={openListing}
                  style={{ cursor: detailsReady ? "pointer" : "default" }}
                >
                  {soldPoints.map((p) => (
                    <Cell
                      key={p.index}
                      fill={markColor(p)}
                      fillOpacity={0.85}
                      // A surface-colored ring keeps overlapping points readable
                      // where sales cluster.
                      stroke={CARD_BG}
                      strokeWidth={1}
                    />
                  ))}
                </Scatter>
                {/* Drawn after the sales so the open marks stay legible where the
                    two clouds overlap. The card-colored fill is deliberate rather
                    than "none": a hollow symbol has no hit area, which would cost
                    these points their tooltip and click-through. */}
                <Scatter
                  data={unsoldPoints}
                  shape="circle"
                  legendType="none"
                  isAnimationActive={false}
                  onClick={openListing}
                  style={{ cursor: detailsReady ? "pointer" : "default" }}
                >
                  {unsoldPoints.map((p) => (
                    <Cell
                      key={p.index}
                      fill={CARD_BG}
                      stroke={markColor(p)}
                      strokeWidth={1.75}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <ChartLegend
              scale={mileageScale}
              hasUnknown={hasUnknownMileage}
              hasUnsold={unsoldPoints.length > 0}
            />
          </>
        ) : (
          <div className="px-5 py-12 text-center text-[12px]" style={{ color: GRAY_500 }}>
            Nothing to plot — try clearing other filters.
          </div>
        )}
      </Card>

      <Card className="mb-3">
        <CardHeader
          title={`Models in ${make}`}
          sub={
            modelRows.length
              ? `${modelRows.length.toLocaleString()} model${modelRows.length === 1 ? "" : "s"} · sorted by cars sold · click one to drill in${model ? " · click again to go back" : ""}`
              : "No models match the current filters"
          }
          right={
            modelRows.length > TOP_MODELS && (
              <button
                onClick={() => setShowAllModels((v) => !v)}
                className="text-[11px] font-medium hover:underline"
                style={{ color: LIME_DEEP }}
              >
                {showAllModels ? `Top ${TOP_MODELS}` : `Show all ${modelRows.length}`}
              </button>
            )
          }
        />
        <div
          className="px-5 pb-5 pt-2"
          style={showAllModels ? { maxHeight: 340, overflowY: "auto" } : {}}
        >
          {visibleModels.map((m) => {
            const selected = m.model === model;
            const dimmed = model !== null && !selected;
            return (
              <button
                key={m.model}
                onClick={() => setModel(selected ? null : m.model)}
                className="flex items-center gap-3 w-full mb-[5px] px-1 py-0.5 rounded transition-colors cursor-pointer"
                style={{ opacity: dimmed ? 0.4 : 1 }}
                title={`${m.sold.toLocaleString()} sold of ${m.listed.toLocaleString()} listed · ${m.str.toFixed(1)}% sell-through`}
              >
                <div
                  className="w-[110px] text-right text-[12px] truncate"
                  style={{ color: selected ? INK : GRAY_700, fontWeight: selected ? 600 : 400 }}
                >
                  {m.model}
                </div>
                <div
                  className="flex-1 h-[14px] relative"
                  style={{ background: GRAY_100, borderRadius: 2 }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(m.sold / maxModelSold) * 100}%`,
                      background: selected ? LIME_DEEP : LIME,
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
          {modelRows.length === 0 && (
            <div className="text-[12px] py-6 text-center" style={{ color: GRAY_500 }}>
              No models match the current filters
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader
            title="Price distribution"
            sub={
              `Where ${scopeLabel} sales land · sold listings only` +
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
            sub={`How ${scopeLabel} listings close under each format`}
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
