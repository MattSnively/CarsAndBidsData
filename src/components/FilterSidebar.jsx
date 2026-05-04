import { useFilters } from "./FilterContext.jsx";
import { getBodies } from "../data.js";
import {
  BG,
  CARD_BG,
  GRAY_200,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  PRICE_BANDS,
} from "../tokens.js";

function Section({ label, children }) {
  return (
    <div className="mb-5">
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-1.5"
        style={{ color: GRAY_500 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, children, full = false }) {
  return (
    <button
      onClick={onClick}
      className={`${full ? "flex-1" : ""} px-2 py-1.5 text-[11.5px] font-medium transition-colors`}
      style={{
        background: active ? INK_SURFACE : CARD_BG,
        color: active ? "white" : GRAY_700,
        border: `1px solid ${active ? INK_SURFACE : GRAY_200}`,
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-[10.5px] font-medium transition-colors"
      style={{
        background: active ? LIME : CARD_BG,
        color: active ? INK : GRAY_700,
        border: `1px solid ${active ? LIME_DEEP : GRAY_200}`,
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function FilterSidebar() {
  const { filters, setFilters, reset } = useFilters();
  const bodies = getBodies();

  return (
    <aside
      className="px-5 py-5 border-r"
      style={{
        background: BG,
        borderColor: GRAY_200,
        flex: "0 0 220px",
        width: 220,
        maxWidth: 220,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="text-[11px] font-bold tracking-[0.1em]" style={{ color: INK }}>
          FILTERS
        </div>
        <button
          onClick={reset}
          className="text-[11px] font-medium hover:underline"
          style={{ color: LIME_DEEP }}
        >
          Reset all
        </button>
      </div>

      <Section label="Reserve">
        <div className="flex gap-1">
          <ToggleButton
            full
            active={filters.reserve === "reserve"}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                reserve: f.reserve === "reserve" ? null : "reserve",
              }))
            }
          >
            Reserve
          </ToggleButton>
          <ToggleButton
            full
            active={filters.reserve === "noReserve"}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                reserve: f.reserve === "noReserve" ? null : "noReserve",
              }))
            }
          >
            No Reserve
          </ToggleButton>
        </div>
      </Section>

      <Section label="Transmission">
        <div className="flex gap-1">
          <ToggleButton
            full
            active={filters.transmission === "M"}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                transmission: f.transmission === "M" ? null : "M",
              }))
            }
          >
            Manual
          </ToggleButton>
          <ToggleButton
            full
            active={filters.transmission === "A"}
            onClick={() =>
              setFilters((f) => ({
                ...f,
                transmission: f.transmission === "A" ? null : "A",
              }))
            }
          >
            Automatic
          </ToggleButton>
        </div>
      </Section>

      <Section label="Body Style">
        <div className="flex flex-wrap gap-1" style={{ minWidth: 0 }}>
          {bodies.map((b) => {
            const active = filters.bodies.includes(b);
            return (
              <Chip
                key={b}
                active={active}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    bodies: active
                      ? f.bodies.filter((x) => x !== b)
                      : [...f.bodies, b],
                  }))
                }
              >
                {b}
              </Chip>
            );
          })}
        </div>
      </Section>

      <Section label="Price Band">
        <div className="flex flex-wrap gap-1" style={{ minWidth: 0 }}>
          {PRICE_BANDS.map((p) => {
            const active = filters.priceBands.includes(p.id);
            return (
              <Chip
                key={p.id}
                active={active}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    priceBands: active
                      ? f.priceBands.filter((x) => x !== p.id)
                      : [...f.priceBands, p.id],
                  }))
                }
              >
                {p.label}
              </Chip>
            );
          })}
        </div>
      </Section>

      <div
        className="mt-5 p-3"
        style={{ background: CARD_BG, border: `1px solid ${GRAY_200}`, borderRadius: 4 }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <div style={{ width: 6, height: 6, borderRadius: 99, background: LIME }} />
          <div className="text-[10.5px] font-semibold" style={{ color: INK }}>
            Cross-filter
          </div>
        </div>
        <div className="text-[10.5px] leading-snug" style={{ color: GRAY_500 }}>
          Click any chart element to filter the dashboard. All visuals update together.
        </div>
      </div>
    </aside>
  );
}
