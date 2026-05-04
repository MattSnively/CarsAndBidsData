import { useEffect, useMemo, useState } from "react";
import { Card, Pill } from "../components/Primitives.jsx";
import { useFilters } from "../components/FilterContext.jsx";
import { applyAllFilters, FIELD, getMakes } from "../data.js";
import {
  CARD_BG,
  GRAY_100,
  GRAY_200,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  LIME_DEEP,
  LIME_SOFT,
  fmtFull,
  fmtK,
} from "../tokens.js";

export function ListingsTab() {
  const { filters, setFilters } = useFilters();
  const records = useMemo(() => applyAllFilters(filters), [filters]);

  const [sortBy, setSortBy] = useState("p");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const makes = getMakes();

  const rows = useMemo(() => {
    let r = records.filter((rec) => rec[FIELD.s] === 1);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((rec) => {
        const mk = makes[rec[FIELD.mk]].toLowerCase();
        const md = rec[FIELD.md].toLowerCase();
        return mk.includes(s) || md.includes(s) || String(rec[FIELD.yr]).includes(s);
      });
    }
    r.sort((a, b) => {
      const av = a[FIELD[sortBy]];
      const bv = b[FIELD[sortBy]];
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return r;
  }, [records, sortBy, sortDir, search, makes]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  // Reset pagination when filters or search change
  useEffect(() => {
    setPage(0);
  }, [search, records]);

  const SortHeader = ({ label, field, align = "left" }) => {
    const active = sortBy === field;
    return (
      <th
        className="px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider cursor-pointer select-none"
        style={{ color: active ? INK : GRAY_500, textAlign: align }}
        onClick={() => {
          if (active) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortBy(field);
            setSortDir("desc");
          }
        }}
      >
        <div
          className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}
        >
          {label}
          {active && (
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              style={{
                transform: sortDir === "asc" ? "rotate(180deg)" : "rotate(0)",
              }}
            >
              <path d="M4 6L1 2H7L4 6Z" fill={INK} />
            </svg>
          )}
        </div>
      </th>
    );
  };

  const visGMV = rows.reduce((s, r) => s + r[FIELD.p], 0);
  const avgBidsVis = rows.length
    ? rows.reduce((s, r) => s + r[FIELD.b], 0) / rows.length
    : 0;
  const topMake = useMemo(() => {
    const counts = {};
    for (const r of rows) {
      const mk = makes[r[FIELD.mk]];
      counts[mk] = (counts[mk] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  }, [rows, makes]);

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 gap-3">
        <div>
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1"
            style={{ color: GRAY_500 }}
          >
            Sold listings
          </div>
          <div className="text-[22px] font-bold tracking-tight" style={{ color: INK }}>
            {rows.length.toLocaleString()} sold listings · click a row to filter by make
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search make, model, year..."
              className="pl-8 pr-3 py-1.5 text-[12px] w-full md:w-[240px] outline-none"
              style={{ border: `1px solid ${GRAY_200}`, borderRadius: 4, color: INK }}
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
            >
              <circle cx="5" cy="5" r="3.5" stroke={GRAY_400} strokeWidth="1.3" />
              <path
                d="M8 8l2.5 2.5"
                stroke={GRAY_400}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Card>
          <div className="px-4 py-3">
            <div className="text-[11px]" style={{ color: GRAY_500 }}>
              Listings shown
            </div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: INK }}>
              {rows.length.toLocaleString()}
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-[11px]" style={{ color: GRAY_500 }}>
              Combined sale value
            </div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: INK }}>
              {fmtK(visGMV)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-[11px]" style={{ color: GRAY_500 }}>
              Avg bids
            </div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: INK }}>
              {avgBidsVis.toFixed(0)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="px-4 py-3">
            <div className="text-[11px]" style={{ color: GRAY_500 }}>
              Top make
            </div>
            <div className="text-[22px] font-bold mt-0.5" style={{ color: INK }}>
              {topMake}
            </div>
          </div>
        </Card>
      </div>

      <div className="overflow-x-auto">
      <Card>
        <table className="w-full border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="border-b" style={{ borderColor: GRAY_200 }}>
              <SortHeader label="Year" field="yr" />
              <SortHeader label="Make" field="mk" />
              <SortHeader label="Model" field="md" />
              <SortHeader label="Sale Price" field="p" align="right" />
              <SortHeader label="Mileage" field="mi" align="right" />
              <SortHeader label="Bids" field="b" align="right" />
              <SortHeader label="Views" field="v" align="right" />
              <th
                className="px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: GRAY_500 }}
              >
                Auction
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r, i) => {
              const mk = makes[r[FIELD.mk]];
              const isFiltered = filters.makes.includes(mk);
              return (
                <tr
                  key={i}
                  className="border-b transition-colors hover:bg-[#fcfcf9] cursor-pointer"
                  style={{
                    borderColor: GRAY_100,
                    background: isFiltered ? LIME_SOFT : "transparent",
                  }}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      makes: f.makes.includes(mk)
                        ? f.makes.filter((m) => m !== mk)
                        : [...f.makes, mk],
                    }))
                  }
                >
                  <td
                    className="px-3 py-2.5 text-[12.5px] tabular-nums"
                    style={{ color: GRAY_500 }}
                  >
                    {r[FIELD.yr]}
                  </td>
                  <td
                    className="px-3 py-2.5 text-[12.5px] font-medium"
                    style={{ color: INK }}
                  >
                    {mk}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px]" style={{ color: GRAY_700 }}>
                    {r[FIELD.md]}
                  </td>
                  <td
                    className="px-3 py-2.5 text-[13px] font-bold tabular-nums text-right"
                    style={{ color: INK }}
                  >
                    {fmtFull(r[FIELD.p])}
                  </td>
                  <td
                    className="px-3 py-2.5 text-[12px] tabular-nums text-right"
                    style={{ color: GRAY_500 }}
                  >
                    {r[FIELD.mi] > 0 ? r[FIELD.mi].toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums text-right">
                    <span
                      className="px-1.5 py-0.5 font-semibold"
                      style={{
                        background: r[FIELD.b] >= 50 ? LIME_SOFT : GRAY_100,
                        color: r[FIELD.b] >= 50 ? LIME_DEEP : GRAY_700,
                        borderRadius: 3,
                      }}
                    >
                      {r[FIELD.b]}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-[12px] tabular-nums text-right"
                    style={{ color: GRAY_500 }}
                  >
                    {r[FIELD.v] > 0 ? r[FIELD.v].toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {r[FIELD.nr] === 1 ? (
                      <Pill tone="good">No Reserve</Pill>
                    ) : (
                      <Pill tone="neutral">Reserve</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
            {pagedRows.length === 0 && (
              <tr>
                <td
                  colSpan="8"
                  className="px-3 py-10 text-center text-[12px]"
                  style={{ color: GRAY_500 }}
                >
                  No sold listings match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      </div>

      {totalPages > 1 && (
        <div
          className="flex items-center justify-between mt-3 text-[11.5px]"
          style={{ color: GRAY_500 }}
        >
          <div>
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, rows.length)} of{" "}
            {rows.length.toLocaleString()}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 disabled:opacity-30"
              style={{
                background: CARD_BG,
                border: `1px solid ${GRAY_200}`,
                color: INK,
                borderRadius: 4,
              }}
            >
              ← Prev
            </button>
            <div className="px-3 py-1 font-medium" style={{ color: INK }}>
              {page + 1} / {totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 disabled:opacity-30"
              style={{
                background: CARD_BG,
                border: `1px solid ${GRAY_200}`,
                color: INK,
                borderRadius: 4,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
