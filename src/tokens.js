/* ============================================================
   DESIGN TOKENS & FORMATTERS
   ============================================================ */

// Brand green sampled from the Cars & Bids logo: RGB(70,204,141)
export const LIME = "#46cd8d";
export const LIME_SOFT = "#d8f5e6";
export const LIME_DEEP = "#2ba36a";
export const INK = "#0a0a0a";
export const GRAY_900 = "#1a1a1a";
export const GRAY_700 = "#3a3a3a";
export const GRAY_500 = "#7a7a7a";
export const GRAY_400 = "#a3a3a3";
export const GRAY_300 = "#d1d1d1";
export const GRAY_200 = "#e5e5e5";
export const GRAY_100 = "#f2f2f2";
export const GRAY_50 = "#f8f8f7";
export const BG = "#fafaf9";
export const RED = "#d94444";

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
