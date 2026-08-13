/* ============================================================
   DATA LAYER
   - Loads packed JSON
   - Applies filters (with proper universe vs. sold-side semantics)
   - Computes aggregates for every chart
   ============================================================ */

import { PRICE_BANDS, monthLabel, dayLabel, weekLabel } from "./tokens.js";

// Field indices in the packed record array
export const FIELD = {
  yr: 0,
  mk: 1,
  md: 2,
  p: 3,
  mi: 4,
  b: 5,
  v: 6,
  s: 7,
  nr: 8,
  bs: 9,
  tx: 10,
  mo: 11,
  dy: 12, // days since epoch (Aug 1, 2021) — used for daily/weekly chart granularity
  cl: 13, // color group index into DATA.colors
  cm: 14, // num_comments (engagement signal)
};

// Module-level data, populated by loadData()
let DATA = {
  makes: [],
  bodies: [],
  colors: [],
  records: [],
  meta: null,
};

// Lazily-built lookups for the brand/model filter controls. Model is stored as a
// raw string per record (not dictionary-encoded like make/body), so the list of
// distinct models has to be derived from a full pass over the records. Built once
// on first use and cleared by loadData().
let MODEL_INDEX = null;
let MAKE_COUNTS = null;

export async function loadData(baseUrl = "/") {
  // Vite's import.meta.env.BASE_URL always ends with a slash, so we can safely
  // concatenate. For GitHub Pages project pages this is "/<repo-name>/";
  // for user pages or custom domains it's "/".
  const url = `${baseUrl}data/auctions.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load auctions.json: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  DATA = json;
  MODEL_INDEX = null;
  MAKE_COUNTS = null;
  return DATA;
}

export const getData = () => DATA;
export const getMakes = () => DATA.makes;
export const getBodies = () => DATA.bodies;
export const getColors = () => DATA.colors;
export const getMeta = () => DATA.meta;

/**
 * Distinct models with their listing count and the makes they appear under,
 * sorted by count descending so typeahead suggestions lead with the models
 * that have the most data behind them.
 *
 * `makes` is a Set because 37 of ~1,650 model names appear under more than one
 * make ("Continental", "Suburban", "M2"), and the model typeahead scopes its
 * suggestions to the selected brands.
 */
export function getModels() {
  if (MODEL_INDEX) return MODEL_INDEX;
  const map = new Map();
  for (const r of DATA.records) {
    const model = r[FIELD.md];
    if (!model) continue;
    let entry = map.get(model);
    if (!entry) {
      entry = { model, count: 0, makes: new Set() };
      map.set(model, entry);
    }
    entry.count++;
    entry.makes.add(DATA.makes[r[FIELD.mk]]);
  }
  MODEL_INDEX = [...map.values()].sort((a, b) => b.count - a.count);
  return MODEL_INDEX;
}

/** Listing count per make, for the brand filter's option list. */
export function getMakeCounts() {
  if (MAKE_COUNTS) return MAKE_COUNTS;
  const counts = new Map(DATA.makes.map((m) => [m, 0]));
  for (const r of DATA.records) {
    const make = DATA.makes[r[FIELD.mk]];
    counts.set(make, (counts.get(make) ?? 0) + 1);
  }
  MAKE_COUNTS = counts;
  return MAKE_COUNTS;
}

/* ============================================================
   FILTER APPLICATION
   ============================================================
   Two filter categories:
     - UNIVERSE filters (makes, models, bodies, reserve, transmission,
       monthRange, mileageMax) change which listings exist. They affect both the
       numerator (sold) and denominator (listed) of STR.
     - SOLD-SIDE filters (priceBands) only narrow the sold subset. A
       price band can't be applied to an unsold listing because there's
       no sale price.

   Charts pick which filter mode they need:
     - applyUniverseFilters() — for STR, by-make, by-body, listings count
     - applyAllFilters()      — for GMV, avg price, sold-only views
   ============================================================ */

function passesUniverse(rec, filters) {
  if (filters.makes.length) {
    const ix = rec[FIELD.mk];
    const allowed = filters.makes.some(
      (name) => DATA.makes.indexOf(name) === ix,
    );
    if (!allowed) return false;
  }
  if (filters.bodies.length) {
    const ix = rec[FIELD.bs];
    const allowed = filters.bodies.some(
      (name) => DATA.bodies.indexOf(name) === ix,
    );
    if (!allowed) return false;
  }
  // Model is an exact string match — the typeahead resolves to specific model
  // values, so "996 911" narrows to that generation and not every 911.
  if (filters.models.length && !filters.models.includes(rec[FIELD.md])) {
    return false;
  }
  if (filters.reserve === "reserve" && rec[FIELD.nr] === 1) return false;
  if (filters.reserve === "noReserve" && rec[FIELD.nr] === 0) return false;
  if (filters.transmission && rec[FIELD.tx] !== filters.transmission) return false;
  if (filters.mileageMax !== null && rec[FIELD.mi] > filters.mileageMax) return false;
  if (filters.monthRange) {
    const [s, e] = filters.monthRange;
    if (rec[FIELD.mo] < s || rec[FIELD.mo] > e) return false;
  }
  return true;
}

function passesPriceBand(rec, filters) {
  if (!filters.priceBands.length) return true;
  // Price band only meaningful for sold listings — unsold = doesn't pass
  if (rec[FIELD.s] !== 1) return false;
  const p = rec[FIELD.p];
  return filters.priceBands.some((bid) => {
    const b = PRICE_BANDS.find((pb) => pb.id === bid);
    return b && p >= b.min && p < b.max;
  });
}

/** Records that pass the universe filters (used for STR-bearing charts). */
export function applyUniverseFilters(filters) {
  return DATA.records.filter((r) => passesUniverse(r, filters));
}

/** Records that pass ALL filters including price band (used for sold-only views). */
export function applyAllFilters(filters) {
  return DATA.records.filter(
    (r) => passesUniverse(r, filters) && passesPriceBand(r, filters),
  );
}

/* ============================================================
   AGGREGATIONS
   Each takes a pre-filtered record array and computes one chart's data.
   ============================================================ */

export function computeKPIs(records) {
  const total = records.length;
  if (total === 0) {
    return { totalListed: 0, totalSold: 0, totalGMV: 0, str: 0, avgPrice: 0, avgBids: 0 };
  }
  let sold = 0;
  let gmv = 0;
  let bids = 0;
  for (const r of records) {
    bids += r[FIELD.b];
    if (r[FIELD.s] === 1) {
      sold++;
      gmv += r[FIELD.p];
    }
  }
  return {
    totalListed: total,
    totalSold: sold,
    totalGMV: gmv,
    str: (sold / total) * 100,
    avgPrice: sold > 0 ? gmv / sold : 0,
    avgBids: bids / total,
  };
}

/**
 * KPI variant for when price band filters are active. STR computes on universe-only,
 * but GMV / avg price are constrained to the price-band selection (so they're meaningful).
 */
export function computeKPIsSplit(universeRecords, soldRecords) {
  const total = universeRecords.length;
  let universeSold = 0;
  let universeBids = 0;
  for (const r of universeRecords) {
    universeBids += r[FIELD.b];
    if (r[FIELD.s] === 1) universeSold++;
  }
  let bandedSold = 0;
  let bandedGMV = 0;
  for (const r of soldRecords) {
    if (r[FIELD.s] === 1) {
      bandedSold++;
      bandedGMV += r[FIELD.p];
    }
  }
  return {
    totalListed: total,
    totalSold: bandedSold, // sold listings that match the price band filter
    totalGMV: bandedGMV,
    str: total > 0 ? (universeSold / total) * 100 : 0, // STR ignores price band
    avgPrice: bandedSold > 0 ? bandedGMV / bandedSold : 0,
    avgBids: total > 0 ? universeBids / total : 0,
  };
}

export function computeByMake(records, topN = 10) {
  const map = new Map();
  for (const r of records) {
    const mk = DATA.makes[r[FIELD.mk]];
    let m = map.get(mk);
    if (!m) {
      m = { make: mk, listings: 0, sold: 0, gmv: 0, bids: 0 };
      map.set(mk, m);
    }
    m.listings++;
    m.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) {
      m.sold++;
      m.gmv += r[FIELD.p];
    }
  }
  const arr = [...map.values()].map((m) => ({
    ...m,
    str: m.listings > 0 ? (m.sold / m.listings) * 100 : 0,
    avgPrice: m.sold > 0 ? m.gmv / m.sold : 0,
    avgBids: m.listings > 0 ? m.bids / m.listings : 0,
  }));
  arr.sort((a, b) => b.sold - a.sold);
  return topN ? arr.slice(0, topN) : arr;
}

export function computeByMonth(records) {
  const map = new Map();
  for (const r of records) {
    const mo = r[FIELD.mo];
    let m = map.get(mo);
    if (!m) {
      m = { mo, listings: 0, sold: 0, gmv: 0, bids: 0 };
      map.set(mo, m);
    }
    m.listings++;
    m.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) {
      m.sold++;
      m.gmv += r[FIELD.p];
    }
  }
  const arr = [...map.values()].sort((a, b) => a.mo - b.mo);
  return arr.map((m) => ({
    ...m,
    month: monthLabel(m.mo),
    str: m.listings > 0 ? (m.sold / m.listings) * 100 : 0,
    avgPrice: m.sold > 0 ? m.gmv / m.sold : 0,
    avgBids: m.listings > 0 ? m.bids / m.listings : 0,
  }));
}

/**
 * Weekly aggregation — groups by floor(dayOffset / 7). Used when monthRange
 * spans 2-3 months. Produces ~8-13 data points for a readable chart.
 */
export function computeByWeek(records) {
  const map = new Map();
  for (const r of records) {
    const wo = Math.floor(r[FIELD.dy] / 7); // week offset from epoch
    let w = map.get(wo);
    if (!w) {
      w = { wo, listings: 0, sold: 0, gmv: 0, bids: 0 };
      map.set(wo, w);
    }
    w.listings++;
    w.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) {
      w.sold++;
      w.gmv += r[FIELD.p];
    }
  }
  return [...map.values()]
    .sort((a, b) => a.wo - b.wo)
    .map((w) => ({
      ...w,
      // Use "month" as the label key so TrendsTab XAxis / tooltips work unchanged
      month: weekLabel(w.wo),
      str: w.listings > 0 ? (w.sold / w.listings) * 100 : 0,
      avgPrice: w.sold > 0 ? w.gmv / w.sold : 0,
      avgBids: w.listings > 0 ? w.bids / w.listings : 0,
    }));
}

/**
 * Daily aggregation — groups by dayOffset. Used when monthRange spans exactly
 * 1 month. Produces ~20 data points (weekday-only auction schedule).
 */
export function computeByDay(records) {
  const map = new Map();
  for (const r of records) {
    const dy = r[FIELD.dy];
    let d = map.get(dy);
    if (!d) {
      d = { dy, listings: 0, sold: 0, gmv: 0, bids: 0 };
      map.set(dy, d);
    }
    d.listings++;
    d.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) {
      d.sold++;
      d.gmv += r[FIELD.p];
    }
  }
  return [...map.values()]
    .sort((a, b) => a.dy - b.dy)
    .map((d) => ({
      ...d,
      month: dayLabel(d.dy),
      str: d.listings > 0 ? (d.sold / d.listings) * 100 : 0,
      avgPrice: d.sold > 0 ? d.gmv / d.sold : 0,
      avgBids: d.listings > 0 ? d.bids / d.listings : 0,
    }));
}

/**
 * Monthly aggregation that keeps STR and listing counts from the universe
 * (so STR is never distorted by a price-band filter) while computing GMV
 * and avgPrice from the sold-side filtered set (so those metrics respond
 * to price-band selection). This mirrors the split used in computeKPIsSplit.
 *
 * Used by the STR vs GMV chart on the Overview tab.
 */
export function computeByMonthSplit(universeRecords, soldRecords) {
  // Build the universe map: listings, sold count, bids for STR calculation
  const uMap = new Map();
  for (const r of universeRecords) {
    const mo = r[FIELD.mo];
    let m = uMap.get(mo);
    if (!m) {
      m = { mo, listings: 0, sold: 0, bids: 0 };
      uMap.set(mo, m);
    }
    m.listings++;
    m.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) m.sold++;
  }
  // Build the sold-side map: GMV from only the price-band-filtered sold records
  const sMap = new Map();
  for (const r of soldRecords) {
    if (r[FIELD.s] !== 1) continue;
    const mo = r[FIELD.mo];
    let m = sMap.get(mo);
    if (!m) {
      m = { gmv: 0, soldCount: 0 };
      sMap.set(mo, m);
    }
    m.gmv += r[FIELD.p];
    m.soldCount++;
  }
  // Merge: STR comes from the universe, GMV/avgPrice from the sold-side
  return [...uMap.values()]
    .sort((a, b) => a.mo - b.mo)
    .map((u) => {
      const s = sMap.get(u.mo) ?? { gmv: 0, soldCount: 0 };
      return {
        mo: u.mo,
        month: monthLabel(u.mo),
        listings: u.listings,
        sold: u.sold,
        str: u.listings > 0 ? (u.sold / u.listings) * 100 : 0,
        gmv: s.gmv,
        avgPrice: s.soldCount > 0 ? s.gmv / s.soldCount : 0,
        avgBids: u.listings > 0 ? u.bids / u.listings : 0,
      };
    });
}

export function computePriceDist(records) {
  // Price distribution shows sold listings only — that's its inherent definition
  const counts = PRICE_BANDS.map((b) => ({ ...b, count: 0 }));
  for (const r of records) {
    if (r[FIELD.s] !== 1) continue;
    const p = r[FIELD.p];
    for (const b of counts) {
      if (p >= b.min && p < b.max) {
        b.count++;
        break;
      }
    }
  }
  return counts;
}

export function computeReserveSplit(records) {
  let nrListed = 0,
    nrSold = 0,
    rListed = 0,
    rSold = 0;
  for (const r of records) {
    if (r[FIELD.nr] === 1) {
      nrListed++;
      if (r[FIELD.s] === 1) nrSold++;
    } else {
      rListed++;
      if (r[FIELD.s] === 1) rSold++;
    }
  }
  return {
    noReserve: {
      listed: nrListed,
      sold: nrSold,
      str: nrListed > 0 ? (nrSold / nrListed) * 100 : 0,
    },
    reserve: {
      listed: rListed,
      sold: rSold,
      str: rListed > 0 ? (rSold / rListed) * 100 : 0,
    },
  };
}

/**
 * Scatter sample for the mileage-vs-price plot. Includes make/year/model/color
 * so the tooltip can display vehicle info and multi-make coloring can work.
 * Always shows sold listings with sane bounds; subsamples to `max` points
 * for performance.
 */
export function computeScatterPoints(records, max = 600) {
  const sold = [];
  for (const r of records) {
    if (
      r[FIELD.s] === 1 &&
      r[FIELD.mi] > 0 &&
      r[FIELD.mi] < 250000 &&
      r[FIELD.p] > 0 &&
      r[FIELD.p] < 300000
    ) {
      sold.push({
        mileage: r[FIELD.mi],
        price: r[FIELD.p],
        make: DATA.makes[r[FIELD.mk]],
        model: r[FIELD.md],
        year: r[FIELD.yr],
        bids: r[FIELD.b],
        colorGroup: DATA.colors?.[r[FIELD.cl]] ?? "—",
        transmission: r[FIELD.tx] || "—",
        noReserve: r[FIELD.nr] === 1,
      });
    }
  }
  if (sold.length <= max) return sold;
  const step = sold.length / max;
  const out = [];
  for (let i = 0; i < max; i++) {
    out.push(sold[Math.floor(i * step)]);
  }
  return out;
}

/**
 * Groups scatter points by make so each make can be rendered as a distinct
 * Recharts <Scatter> series with its own color. Used when multiple makes are
 * selected via the filter.
 */
export function groupScatterByMake(points) {
  const map = new Map();
  for (const pt of points) {
    let arr = map.get(pt.make);
    if (!arr) { arr = []; map.set(pt.make, arr); }
    arr.push(pt);
  }
  return map;
}

/* ============================================================
   INSIGHTS TAB COMPUTATIONS
   ============================================================ */

/**
 * For each dimension (transmission, reserve type, mileage band, age band,
 * mileage/age ratio, color group) compute average bids and views so the
 * Insights tab can show what attributes correlate with high demand.
 */
export function computeInsightFactors(records) {
  const CURRENT_YEAR = new Date().getFullYear();

  const total = records.length;
  if (total === 0) return null;

  let totalBids = 0;
  let totalViews = 0;
  for (const r of records) { totalBids += r[FIELD.b]; totalViews += r[FIELD.v]; }
  const overall = { avgBids: totalBids / total, avgViews: totalViews / total };

  // ── helpers ──────────────────────────────────────────────────
  const blank = () => ({ bids: 0, views: 0, count: 0 });
  const finalize = (g) => ({
    ...g,
    avgBids: g.count > 0 ? g.bids / g.count : 0,
    avgViews: g.count > 0 ? g.views / g.count : 0,
  });

  const txMap = { M: blank(), A: blank(), "": blank() };
  const nrMap = { nr: blank(), r: blank() };

  const miBands = [
    { label: "0–25k mi",   min: 0,      max: 25000,   ...blank() },
    { label: "25–50k mi",  min: 25000,  max: 50000,   ...blank() },
    { label: "50–100k mi", min: 50000,  max: 100000,  ...blank() },
    { label: "100k+ mi",   min: 100000, max: Infinity, ...blank() },
  ];

  const ageBands = [
    { label: "0–5 yrs",  min: 0,  max: 5,        ...blank() },
    { label: "5–15 yrs", min: 5,  max: 15,       ...blank() },
    { label: "15+ yrs",  min: 15, max: Infinity, ...blank() },
  ];

  const miPerYrBands = [
    { label: "<8k mi/yr",   min: 0,     max: 8000,    ...blank() },
    { label: "8–12k mi/yr", min: 8000,  max: 12000,   ...blank() },
    { label: "12–18k mi/yr",min: 12000, max: 18000,   ...blank() },
    { label: "18k+ mi/yr",  min: 18000, max: Infinity, ...blank() },
  ];

  // Color groups from DATA.colors; initialise one bucket per group
  const colorMap = new Map(DATA.colors.map((c) => [c, blank()]));

  for (const r of records) {
    const bids = r[FIELD.b];
    const views = r[FIELD.v];
    const tx = r[FIELD.tx] || "";
    const mi = r[FIELD.mi];
    const age = Math.max(1, CURRENT_YEAR - r[FIELD.yr]);

    // Transmission
    const txBucket = txMap[tx] ?? txMap[""];
    txBucket.bids += bids; txBucket.views += views; txBucket.count++;

    // Reserve
    const nrBucket = r[FIELD.nr] === 1 ? nrMap.nr : nrMap.r;
    nrBucket.bids += bids; nrBucket.views += views; nrBucket.count++;

    // Mileage band
    for (const band of miBands) {
      if (mi >= band.min && mi < band.max) {
        band.bids += bids; band.views += views; band.count++; break;
      }
    }

    // Age band
    for (const band of ageBands) {
      if (age >= band.min && age < band.max) {
        band.bids += bids; band.views += views; band.count++; break;
      }
    }

    // Miles per year ratio (only meaningful when age > 0 and mileage reported)
    if (mi > 0) {
      const miPerYr = mi / age;
      for (const band of miPerYrBands) {
        if (miPerYr >= band.min && miPerYr < band.max) {
          band.bids += bids; band.views += views; band.count++; break;
        }
      }
    }

    // Color
    const colorLabel = DATA.colors[r[FIELD.cl]] ?? "Other";
    const cb = colorMap.get(colorLabel);
    if (cb) { cb.bids += bids; cb.views += views; cb.count++; }
  }

  return {
    overall,
    transmission: {
      manual:    finalize(txMap.M),
      automatic: finalize(txMap.A),
    },
    reserve: {
      noReserve: finalize(nrMap.nr),
      reserve:   finalize(nrMap.r),
    },
    mileageBands:    miBands.map(finalize),
    ageBands:        ageBands.map(finalize),
    milesPerYrBands: miPerYrBands.map(finalize),
    colorGroups: DATA.colors.map((c) => ({
      label: c,
      ...finalize(colorMap.get(c) ?? blank()),
    })),
  };
}

/**
 * Identify makes whose sold listings most often command a price premium over
 * that make's own median sale price.  "Breakout" = sold >threshold% above median.
 *
 * Returns top makes by breakout_rate, with supporting metrics.
 */
export function computeBreakoutsByMake(records, threshold = 0.25, topN = 15) {
  // Step 1: compute median sale price per make from ALL sold records
  const makeGroups = new Map();
  for (const r of records) {
    if (r[FIELD.s] !== 1) continue;
    const mk = DATA.makes[r[FIELD.mk]];
    let g = makeGroups.get(mk);
    if (!g) { g = { prices: [], bids: 0, count: 0 }; makeGroups.set(mk, g); }
    g.prices.push(r[FIELD.p]);
    g.bids += r[FIELD.b];
    g.count++;
  }

  // Median helper
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  // Build make summary with medians
  const makeStats = new Map();
  for (const [mk, g] of makeGroups) {
    if (g.count < 5) continue; // skip makes with very few sales
    makeStats.set(mk, { median: median(g.prices), count: g.count, avgBids: g.bids / g.count });
  }

  // Step 2: count breakout listings per make
  const breakouts = new Map();
  for (const r of records) {
    if (r[FIELD.s] !== 1) continue;
    const mk = DATA.makes[r[FIELD.mk]];
    const stats = makeStats.get(mk);
    if (!stats) continue;
    const premium = (r[FIELD.p] - stats.median) / stats.median;
    let b = breakouts.get(mk);
    if (!b) { b = { breakoutCount: 0, premiumSum: 0, maxPremium: 0, breakoutBids: 0 }; breakouts.set(mk, b); }
    if (premium > threshold) {
      b.breakoutCount++;
      b.premiumSum += premium;
      b.maxPremium = Math.max(b.maxPremium, premium);
    }
  }

  // Step 3: assemble final rows
  const rows = [];
  for (const [mk, stats] of makeStats) {
    const b = breakouts.get(mk) ?? { breakoutCount: 0, premiumSum: 0, maxPremium: 0 };
    const breakoutRate = b.breakoutCount / stats.count;
    rows.push({
      make:         mk,
      breakoutRate,
      breakoutCount: b.breakoutCount,
      avgBreakoutPct: b.breakoutCount > 0 ? (b.premiumSum / b.breakoutCount) * 100 : 0,
      maxPremiumPct:  b.maxPremium * 100,
      totalSold:    stats.count,
      medianPrice:  stats.median,
      avgBids:      stats.avgBids,
    });
  }

  rows.sort((a, b) => b.breakoutRate - a.breakoutRate);
  return topN ? rows.slice(0, topN) : rows;
}

/* ============================================================
   STR STRATEGY ANALYSIS
   Used exclusively by the Insights tab.
   ============================================================ */

/**
 * Groups records by calendar year and computes STR for reserve vs. no-reserve,
 * plus the count of failed reserve auctions per year.
 * Year = 2021 + floor((mo + 7) / 12), matching the same formula as monthLabel().
 */
export function computeSTRByYear(records) {
  const map = new Map();
  for (const r of records) {
    const year = 2021 + Math.floor((r[FIELD.mo] + 7) / 12);
    let entry = map.get(year);
    if (!entry) {
      entry = { year, rListed: 0, rSold: 0, nrListed: 0, nrSold: 0 };
      map.set(year, entry);
    }
    if (r[FIELD.nr] === 1) {
      entry.nrListed++;
      if (r[FIELD.s] === 1) entry.nrSold++;
    } else {
      entry.rListed++;
      if (r[FIELD.s] === 1) entry.rSold++;
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, e]) => ({
      year: String(year),
      reserveStr:      e.rListed  > 0 ? (e.rSold  / e.rListed)  * 100 : 0,
      noReserveStr:    e.nrListed > 0 ? (e.nrSold / e.nrListed) * 100 : 0,
      reserveListed:   e.rListed,
      reserveFailed:   e.rListed - e.rSold,
      // reserveFailRate is the "no-sale rate" for reserve auctions — the primary trend metric
      reserveFailRate: e.rListed > 0 ? ((e.rListed - e.rSold) / e.rListed) * 100 : 0,
      noReserveListed: e.nrListed,
    }));
}

/**
 * All-time headline stats for the reserve problem analysis.
 * estimatedLostGMV is a rough estimate: failed reserve count × avg sale price
 * across all sold listings (high_bid for unsold listings is not in the dataset).
 */
export function computeSTRHeadlineStats(records) {
  let rListed = 0, rSold = 0, nrListed = 0, nrSold = 0;
  let totalSold = 0, totalGMV = 0;
  // Track bid counts to show failed reserve auctions were not "unwanted"
  let rFailedBids = 0, rSoldBids = 0;
  for (const r of records) {
    if (r[FIELD.nr] === 1) {
      nrListed++;
      if (r[FIELD.s] === 1) nrSold++;
    } else {
      rListed++;
      if (r[FIELD.s] === 1) {
        rSold++;
        rSoldBids += r[FIELD.b];
      } else {
        rFailedBids += r[FIELD.b];
      }
    }
    if (r[FIELD.s] === 1) { totalSold++; totalGMV += r[FIELD.p]; }
  }
  const avgSalePrice = totalSold > 0 ? totalGMV / totalSold : 0;
  const rFailed = rListed - rSold;
  const totalListings = rListed + nrListed;
  return {
    reserveStr:         rListed  > 0 ? (rSold  / rListed)  * 100 : 0,
    noReserveStr:       nrListed > 0 ? (nrSold / nrListed) * 100 : 0,
    reserveListed:      rListed,
    reserveFailed:      rFailed,
    reserveFailPct:     rListed > 0 ? (rFailed / rListed) * 100 : 0,
    estimatedLostGMV:   rFailed * avgSalePrice,
    avgSalePrice,
    totalListings,
    // reservePct is the "slice of the pie" KPI: what fraction of all listings use a reserve
    reservePct:         totalListings > 0 ? (rListed / totalListings) * 100 : 0,
    // avg bids per auction — counters the "unwanted cars" narrative for failed reserve
    avgFailedReserveBids: rFailed > 0 ? rFailedBids / rFailed : 0,
    avgSoldReserveBids:   rSold   > 0 ? rSoldBids   / rSold   : 0,
  };
}

/**
 * Top makes ranked by total failed reserve auctions (listed with reserve, not sold).
 * failRate is the percentage of that make's reserve listings that didn't close.
 */
export function computeReserveFailByMake(records, topN = 15) {
  const map = new Map();
  for (const r of records) {
    if (r[FIELD.nr] === 1) continue; // reserve listings only
    const mk = DATA.makes[r[FIELD.mk]];
    let entry = map.get(mk);
    if (!entry) {
      entry = { make: mk, listed: 0, sold: 0, gmv: 0, models: new Map() };
      map.set(mk, entry);
    }
    entry.listed++;
    if (r[FIELD.s] === 1) { entry.sold++; entry.gmv += r[FIELD.p]; }

    // Track model-level breakdown so we can show the top 3 failing models per make
    const model = r[FIELD.md] || "Unknown";
    let me = entry.models.get(model);
    if (!me) { me = { listed: 0, sold: 0 }; entry.models.set(model, me); }
    me.listed++;
    if (r[FIELD.s] === 1) me.sold++;
  }

  return [...map.values()]
    .filter((m) => m.listed >= 10)
    .map((m) => {
      const topModels = [...m.models.entries()]
        .map(([model, me]) => ({
          model,
          failCount: me.listed - me.sold,
          listed:    me.listed,
          failRate:  me.listed > 0 ? ((me.listed - me.sold) / me.listed) * 100 : 0,
        }))
        .sort((a, b) => b.failCount - a.failCount)
        .slice(0, 3);
      return {
        make:         m.make,
        failCount:    m.listed - m.sold,
        listed:       m.listed,
        failRate:     m.listed > 0 ? ((m.listed - m.sold) / m.listed) * 100 : 0,
        avgSalePrice: m.sold > 0 ? m.gmv / m.sold : 0,
        topModels,
      };
    })
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, topN);
}

/**
 * Bubble chart data for the Market Demand Quadrant.
 * Each entry represents one make: avg bids (X), avg sale price (Y),
 * listing count (Z / bubble size).  Filtered to the topN most-listed makes.
 */
export function computeBubbleData(records, topN = 40) {
  const map = new Map();
  for (const r of records) {
    const mk = DATA.makes[r[FIELD.mk]];
    let m = map.get(mk);
    if (!m) { m = { make: mk, bids: 0, gmv: 0, sold: 0, listings: 0 }; map.set(mk, m); }
    m.listings++;
    m.bids += r[FIELD.b];
    if (r[FIELD.s] === 1) { m.sold++; m.gmv += r[FIELD.p]; }
  }

  return [...map.values()]
    .filter((m) => m.listings >= 10)
    .sort((a, b) => b.listings - a.listings)
    .slice(0, topN)
    .map((m) => ({
      make:     m.make,
      avgBids:  m.bids / m.listings,
      avgPrice: m.sold > 0 ? m.gmv / m.sold : 0,
      listings: m.listings,
      str:      (m.sold / m.listings) * 100,
    }));
}

// ── Lookup sets used by findPatternExamples ────────────────────────────────────
// Pattern A: enthusiast-friendly everyday brands (excludes Ford/Chevy/Dodge to keep
// Mustang/Camaro distinct from Pattern B's "most oversaturated model" story)
const PATTERN_A_MAKES = new Set([
  "Honda", "Toyota", "Mazda", "Subaru", "Volkswagen", "Mitsubishi",
  "Hyundai", "Kia", "Nissan", "Acura", "Infiniti", "Isuzu",
]);

// Pattern C: exotic/ultra-premium brands where the buyer pool is inherently thin
const EXOTIC_MAKES = new Set([
  "Ferrari", "Lamborghini", "McLaren", "Bugatti", "Pagani", "Koenigsegg",
  "Aston Martin", "Bentley", "Rolls-Royce", "Maserati", "Lotus",
]);

/**
 * Maps a raw record to a display-ready auction card object.
 * Module-private helper — not exported.
 */
function toAuctionCard(r) {
  return {
    year:    r[FIELD.yr],
    make:    DATA.makes[r[FIELD.mk]],
    model:   r[FIELD.md],
    mileage: r[FIELD.mi],
    bids:    r[FIELD.b],
    views:   r[FIELD.v],
    price:   r[FIELD.p],
    sold:    r[FIELD.s] === 1,
  };
}

/**
 * Returns { sold, failed } auction examples that illustrate a given failure pattern.
 *
 *   sold   — one comparable sold auction to anchor pricing expectations (null if unavailable)
 *   failed — up to 2 failed reserve examples that clearly match the pattern
 *
 *   "A" — Budget Reserve: finds the PATTERN_A_MAKES model with the most reserve failures
 *          that also has a real sold example (same make+model). Shows market vs. reserve gap.
 *   "B" — Oversaturated Model: finds the make+model with the most total reserve failures
 *          across ALL makes — surfaces whatever is truly flooding the market.
 *   "C" — Ultra-Premium Wall: EXOTIC_MAKES only. Sold benchmark shows what the market pays
 *          when a buyer shows up; failed examples show how often they don't.
 */
export function findPatternExamples(records, patternId) {
  switch (patternId) {

    case "A": {
      // Failed reserve auctions from budget/enthusiast makes with some bidding activity
      const failedBudget = records.filter(
        (r) => r[FIELD.s] === 0 && r[FIELD.nr] === 0
          && PATTERN_A_MAKES.has(DATA.makes[r[FIELD.mk]])
          && r[FIELD.b] >= 5,
      );

      // Count failures by make+model
      const failCounts = new Map();
      for (const r of failedBudget) {
        const k = `${DATA.makes[r[FIELD.mk]]}|${r[FIELD.md]}`;
        failCounts.set(k, (failCounts.get(k) ?? 0) + 1);
      }

      // Index the highest-bid sold example per make+model (needs a real sale price)
      const soldByModel = new Map();
      for (const r of records) {
        if (r[FIELD.s] !== 1 || !PATTERN_A_MAKES.has(DATA.makes[r[FIELD.mk]]) || r[FIELD.p] === 0) continue;
        const k = `${DATA.makes[r[FIELD.mk]]}|${r[FIELD.md]}`;
        if (!soldByModel.has(k) || r[FIELD.b] > soldByModel.get(k)[FIELD.b]) soldByModel.set(k, r);
      }

      // Most-failed model that also has a sold reference price
      const topEntry = [...failCounts.entries()]
        .filter(([k]) => soldByModel.has(k))
        .sort((a, b) => b[1] - a[1])[0];

      if (!topEntry) return { sold: null, failed: [] };
      const [topKey] = topEntry;
      const [topMake, topModel] = topKey.split("|");

      const failed = failedBudget
        .filter((r) => DATA.makes[r[FIELD.mk]] === topMake && r[FIELD.md] === topModel)
        .sort((a, b) => b[FIELD.b] - a[FIELD.b])
        .slice(0, 2);

      return {
        sold:   toAuctionCard(soldByModel.get(topKey)),
        failed: failed.map(toAuctionCard),
      };
    }

    case "B": {
      // The make+model with the most total failed reserve listings across all brands
      const failedReserve = records.filter((r) => r[FIELD.s] === 0 && r[FIELD.nr] === 0);

      const failCounts = new Map();
      for (const r of failedReserve) {
        const k = `${DATA.makes[r[FIELD.mk]]}|${r[FIELD.md]}`;
        failCounts.set(k, (failCounts.get(k) ?? 0) + 1);
      }

      // Index the highest-bid sold example per make+model
      const soldByModel = new Map();
      for (const r of records) {
        if (r[FIELD.s] !== 1 || r[FIELD.p] === 0) continue;
        const k = `${DATA.makes[r[FIELD.mk]]}|${r[FIELD.md]}`;
        if (!soldByModel.has(k) || r[FIELD.b] > soldByModel.get(k)[FIELD.b]) soldByModel.set(k, r);
      }

      // Most-failed model with a sold reference
      const topEntry = [...failCounts.entries()]
        .filter(([k]) => soldByModel.has(k))
        .sort((a, b) => b[1] - a[1])[0];

      if (!topEntry) return { sold: null, failed: [] };
      const [topKey] = topEntry;
      const [topMake, topModel] = topKey.split("|");

      const failed = failedReserve
        .filter((r) => DATA.makes[r[FIELD.mk]] === topMake && r[FIELD.md] === topModel)
        .sort((a, b) => b[FIELD.b] - a[FIELD.b])
        .slice(0, 2);

      return {
        sold:   toAuctionCard(soldByModel.get(topKey)),
        failed: failed.map(toAuctionCard),
      };
    }

    case "C": {
      // Exotic makes only — the buyer pool is thin by nature
      const failedExotic = records.filter(
        (r) => r[FIELD.s] === 0 && r[FIELD.nr] === 0
          && EXOTIC_MAKES.has(DATA.makes[r[FIELD.mk]]),
      );

      // Sold benchmark: the exotic with the most bidding activity (proves buyers exist)
      const soldExotic = records
        .filter((r) => r[FIELD.s] === 1 && EXOTIC_MAKES.has(DATA.makes[r[FIELD.mk]]) && r[FIELD.p] > 0)
        .sort((a, b) => b[FIELD.b] - a[FIELD.b])[0] ?? null;

      // Failed: fewest bids = clearest signal of a thin buyer pool
      const failed = [...failedExotic]
        .sort((a, b) => a[FIELD.b] - b[FIELD.b])
        .slice(0, 2);

      return {
        sold:   soldExotic ? toAuctionCard(soldExotic) : null,
        failed: failed.map(toAuctionCard),
      };
    }

    default:
      return { sold: null, failed: [] };
  }
}

/**
 * Reserve fail rate broken down by car model year.
 *
 * Only considers reserve listings (nr === 0). Years with fewer than minListings
 * total reserve listings are excluded to avoid noise from rare vintages.
 *
 * Returns an array sorted ascending by modelYear, each entry:
 *   { modelYear, listed, failed, failRate }
 */
export function computeReserveFailByModelYear(records, minListings = 15) {
  // Accumulate listed and sold counts per model year
  const byYear = new Map(); // Map<year: number, { listed: number, sold: number }>
  for (const r of records) {
    if (r[FIELD.nr] !== 0) continue; // reserve listings only
    const yr = r[FIELD.yr];
    if (!yr || yr <= 0) continue;
    let bucket = byYear.get(yr);
    if (!bucket) { bucket = { listed: 0, sold: 0 }; byYear.set(yr, bucket); }
    bucket.listed++;
    if (r[FIELD.s] === 1) bucket.sold++;
  }

  // Convert to result array, filter low-count years, sort by year
  return [...byYear.entries()]
    .filter(([, b]) => b.listed >= minListings)
    .map(([yr, b]) => {
      const failed = b.listed - b.sold;
      return {
        modelYear: yr,
        listed: b.listed,
        failed,
        failRate: (failed / b.listed) * 100,
      };
    })
    .sort((a, b) => a.modelYear - b.modelYear);
}

/**
 * Ford Mustang reserve fail rate broken down by mileage bucket.
 *
 * Filters to records where make === "Ford" and model contains "Mustang"
 * (case-insensitive) and reserve is set (nr === 0).
 *
 * Returns:
 *   {
 *     rows: [{ label, listed, failed, failRate }],  // one entry per bucket
 *     avgFailRate: number  // overall fail rate across all buckets
 *   }
 */
export function computeMustangMileageFail(records) {
  const BUCKETS = [
    { label: "<10k",    min: 0,      max: 10000    },
    { label: "10–25k",  min: 10000,  max: 25000    },
    { label: "25–50k",  min: 25000,  max: 50000    },
    { label: "50–75k",  min: 50000,  max: 75000    },
    { label: "75–100k", min: 75000,  max: 100000   },
    { label: "100k+",   min: 100000, max: Infinity },
  ];

  // Initialize accumulator for each bucket
  const acc = BUCKETS.map((b) => ({ ...b, listed: 0, sold: 0 }));

  for (const r of records) {
    if (r[FIELD.nr] !== 0) continue; // reserve only
    const make = DATA.makes[r[FIELD.mk]];
    if (make !== "Ford") continue;
    const model = r[FIELD.md] ?? "";
    if (!model.toLowerCase().includes("mustang")) continue;

    const mi = r[FIELD.mi];
    for (const bucket of acc) {
      if (mi >= bucket.min && mi < bucket.max) {
        bucket.listed++;
        if (r[FIELD.s] === 1) bucket.sold++;
        break;
      }
    }
  }

  // Build result rows (include all buckets even if empty, for a consistent x-axis)
  let totalListed = 0;
  let totalFailed = 0;
  const rows = acc.map((b) => {
    const failed = b.listed - b.sold;
    totalListed += b.listed;
    totalFailed += failed;
    return {
      label: b.label,
      listed: b.listed,
      failed,
      failRate: b.listed > 0 ? (failed / b.listed) * 100 : 0,
    };
  });

  const avgFailRate = totalListed > 0 ? (totalFailed / totalListed) * 100 : 0;
  return { rows, avgFailRate };
}
