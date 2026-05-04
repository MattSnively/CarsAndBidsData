/* ============================================================
   DESIGN TOKENS & FORMATTERS
   ============================================================ */

// All color tokens reference CSS custom properties defined in index.css.
// Light-mode values are on :root; dark-mode overrides are on [data-theme="dark"].
// This means zero per-component changes are needed for theme switching.

// Brand green — unchanged between modes
export const LIME = "var(--lime)";
export const LIME_SOFT = "var(--lime-soft)";
export const LIME_DEEP = "var(--lime-deep)";

// INK is the primary text/foreground color (inverts: dark in light, light in dark).
// INK_SURFACE is for elements that need a dark background in BOTH modes
// (tooltips, active toggle buttons) so white text stays readable.
export const INK = "var(--ink)";
export const INK_SURFACE = "var(--ink-surface)";

// CARD_BG is used wherever "white" was previously hardcoded as a background.
export const CARD_BG = "var(--card-bg)";

export const GRAY_900 = "var(--gray-900)";
export const GRAY_700 = "var(--gray-700)";
export const GRAY_500 = "var(--gray-500)";
export const GRAY_400 = "var(--gray-400)";
export const GRAY_300 = "var(--gray-300)";
export const GRAY_200 = "var(--gray-200)";
export const GRAY_100 = "var(--gray-100)";
export const GRAY_50 = "var(--gray-50)";
export const BG = "var(--bg)";
export const RED = "var(--red)";

// Color palette for multi-make scatter plot series (8 distinct, legible on both themes)
export const MAKE_COLORS = [
  "#46cd8d", "#e05757", "#4a9eff", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

// Price bands — the canonical bucketing used everywhere
export const PRICE_BANDS = [
  { id: "<5k", label: "<$5k", min: 0, max: 5000 },
  { id: "5-10k", label: "$5–10k", min: 5000, max: 10000 },
  { id: "10-20k", label: "$10–20k", min: 10000, max: 20000 },
  { id: "20-35k", label: "$20–35k", min: 20000, max: 35000 },
  { id: "35-50k", label: "$35–50k", min: 35000, max: 50000 },
  { id: "50-75k", label: "$50–75k", min: 50000, max: 75000 },
  { id: "75-100k", label: "$75–100k", min: 75000, max: 100000 },
  { id: "100k+", label: "$100k+", min: 100000, max: 1e9 },
];

// Initial filter state — empty = no filters active
export const initialFilters = {
  makes: [],
  priceBands: [],
  reserve: null, // null | "reserve" | "noReserve"
  bodies: [],
  transmission: null, // null | "M" | "A"
  monthRange: null, // [startOffset, endOffset] | null
  mileageMax: null, // number | null
};

export const isFilterActive = (f) =>
  f.makes.length > 0 ||
  f.priceBands.length > 0 ||
  f.reserve !== null ||
  f.bodies.length > 0 ||
  f.transmission !== null ||
  f.monthRange !== null ||
  f.mileageMax !== null;

// ─── FORMATTERS ────────────────────────────────────────────────
export const fmtK = (n) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}k`
      : `$${n}`;

export const fmtN = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : `${n}`;

export const fmtFull = (n) => `$${n.toLocaleString()}`;

// ─── MONTH HELPERS ─────────────────────────────────────────────
// Epoch is Aug 2021 (month offset 0).
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const monthLabel = (offset) => {
  const total = offset + 7; // 7 = Aug zero-based
  const year = 2021 + Math.floor(total / 12);
  const month = total % 12;
  return `${MONTH_NAMES[month]}'${String(year).slice(2)}`;
};

// Epoch anchor for day/week offset labels (Aug 1, 2021 = day 0)
const EPOCH_MS = Date.UTC(2021, 7, 1); // month is 0-indexed

/** Day offset → "Jan 15" */
export const dayLabel = (offset) => {
  const d = new Date(EPOCH_MS + offset * 86_400_000);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** Week offset (floor(dayOffset/7)) → "Jan 13" (first day of that week) */
export const weekLabel = (offset) => {
  const d = new Date(EPOCH_MS + offset * 7 * 86_400_000);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
