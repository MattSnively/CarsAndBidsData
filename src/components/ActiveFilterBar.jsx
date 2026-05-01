import { GRAY_200, GRAY_500, GRAY_700, LIME, LIME_DEEP, LIME_SOFT, PRICE_BANDS, monthLabel } from "../tokens.js";

export function ActiveFilterBar({ filters, setFilters, reset }) {
  const chips = [];

  filters.makes.forEach((m) =>
    chips.push({
      label: m,
      key: `mk-${m}`,
      remove: () =>
        setFilters((f) => ({ ...f, makes: f.makes.filter((x) => x !== m) })),
    }),
  );

  filters.priceBands.forEach((b) => {
    const band = PRICE_BANDS.find((p) => p.id === b);
    if (!band) return;
    chips.push({
      label: band.label,
      key: `pb-${b}`,
      remove: () =>
        setFilters((f) => ({
          ...f,
          priceBands: f.priceBands.filter((x) => x !== b),
        })),
    });
  });

  if (filters.reserve) {
    chips.push({
      label: filters.reserve === "noReserve" ? "No Reserve" : "Reserve",
      key: "rsv",
      remove: () => setFilters((f) => ({ ...f, reserve: null })),
    });
  }

  filters.bodies.forEach((b) =>
    chips.push({
      label: b,
      key: `bs-${b}`,
      remove: () =>
        setFilters((f) => ({ ...f, bodies: f.bodies.filter((x) => x !== b) })),
    }),
  );

  if (filters.transmission) {
    chips.push({
      label: filters.transmission === "M" ? "Manual" : "Automatic",
      key: "tx",
      remove: () => setFilters((f) => ({ ...f, transmission: null })),
    });
  }

  if (filters.monthRange) {
    const [s, e] = filters.monthRange;
    chips.push({
      label: s === e ? monthLabel(s) : `${monthLabel(s)} – ${monthLabel(e)}`,
      key: "mo",
      remove: () => setFilters((f) => ({ ...f, monthRange: null })),
    });
  }

  if (filters.mileageMax !== null) {
    chips.push({
      label: `Mileage ≤ ${(filters.mileageMax / 1000).toFixed(0)}k`,
      key: "mi",
      remove: () => setFilters((f) => ({ ...f, mileageMax: null })),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-6 py-2.5 border-b flex-wrap"
      style={{ background: "white", borderColor: GRAY_200 }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: GRAY_500 }}
      >
        Filtering by
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((c) => (
          <div
            key={c.key}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-[11.5px] font-medium"
            style={{
              background: LIME_SOFT,
              color: LIME_DEEP,
              border: `1px solid ${LIME}`,
              borderRadius: 99,
            }}
          >
            {c.label}
            <button
              onClick={c.remove}
              className="flex items-center justify-center w-4 h-4 transition-colors hover:bg-white"
              style={{ borderRadius: 99 }}
              aria-label={`Remove ${c.label}`}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path
                  d="M2 2l5 5M7 2l-5 5"
                  stroke={LIME_DEEP}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={reset}
        className="ml-auto text-[11.5px] font-medium hover:underline"
        style={{ color: GRAY_700 }}
      >
        Clear all
      </button>
    </div>
  );
}
