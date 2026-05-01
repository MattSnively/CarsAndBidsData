/* ============================================================
   DATA LAYER
   - Loads packed JSON
   - Applies filters (with proper universe vs. sold-side semantics)
   - Computes aggregates for every chart
   ============================================================ */

import { PRICE_BANDS, monthLabel } from "./tokens.js";

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
};

// Module-level data, populated by loadData()
let DATA = {
  makes: [],
  bodies: [],
  records: [],
  meta: null,
};

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
  return DATA;
}

export const getData = () => DATA;
export const getMakes = () => DATA.makes;
export const getBodies = () => DATA.bodies;
export const getMeta = () => DATA.meta;

/* ============================================================
   FILTER APPLICATION
   ============================================================
   Two filter categories:
     - UNIVERSE filters (makes, bodies, reserve, transmission, monthRange,
       mileageMax) change which listings exist. They affect both the
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
 * Scatter sample for the mileage-vs-price plot. Always shows sold listings
 * with sane bounds; subsamples to `max` points for performance.
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
      sold.push(r);
    }
  }
  if (sold.length <= max) {
    return sold.map((r) => ({ mileage: r[FIELD.mi], price: r[FIELD.p] }));
  }
  const step = sold.length / max;
  const out = [];
  for (let i = 0; i < max; i++) {
    const r = sold[Math.floor(i * step)];
    out.push({ mileage: r[FIELD.mi], price: r[FIELD.p] });
  }
  return out;
}
