import { useEffect, useMemo, useState } from "react";

import { ActiveFilterBar } from "./components/ActiveFilterBar.jsx";
import { FilterProvider, useFilters } from "./components/FilterContext.jsx";
import { FilterSidebar } from "./components/FilterSidebar.jsx";
import { Header } from "./components/Header.jsx";
import { applyUniverseFilters, getMeta, loadData } from "./data.js";
import { CompareTab } from "./tabs/CompareTab.jsx";
import { InsightsTab } from "./tabs/InsightsTab.jsx";
import { ListingsTab } from "./tabs/ListingsTab.jsx";
import { ModelTab } from "./tabs/ModelTab.jsx";
import { OverviewTab } from "./tabs/OverviewTab.jsx";
import { TrendsTab } from "./tabs/TrendsTab.jsx";
import { BG, GRAY_200, GRAY_500, INK, INK_SURFACE, LIME } from "./tokens.js";

function Shell({ isDark, toggleDark }) {
  const { filters, setFilters, reset } = useFilters();
  const [tab, setTab] = useState("Overview");
  const [drillMetric, setDrillMetric] = useState("gmv");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredCount = useMemo(
    () => applyUniverseFilters(filters).length,
    [filters],
  );
  const meta = getMeta();
  const totalCount = meta?.total_listings ?? 0;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: BG,
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <Header
        tab={tab}
        setTab={setTab}
        filteredCount={filteredCount}
        totalCount={totalCount}
        isDark={isDark}
        toggleDark={toggleDark}
      />
      <ActiveFilterBar filters={filters} setFilters={setFilters} reset={reset} />
      <div className="flex">
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <FilterSidebar />
        </div>

        {/* Mobile filter drawer */}
        {drawerOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 flex"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}
          >
            <div
              className="relative overflow-y-auto"
              style={{ background: "var(--bg)", width: 280, height: "100%" }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-[18px]"
                style={{ color: GRAY_500 }}
                aria-label="Close filters"
              >
                ✕
              </button>
              <FilterSidebar />
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          {/* Mobile-only filter trigger bar */}
          <div
            className="md:hidden sticky top-0 z-30 flex items-center justify-between px-3 py-2 border-b"
            style={{ background: "var(--card-bg)", borderColor: GRAY_200 }}
          >
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium"
              style={{ background: INK_SURFACE, color: "white", borderRadius: 4 }}
            >
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="0" y1="1" x2="12" y2="1" /><line x1="2" y1="5" x2="10" y2="5" /><line x1="4" y1="9" x2="8" y2="9" />
              </svg>
              Filters
            </button>
            <div className="text-[11px]" style={{ color: GRAY_500 }}>
              {filteredCount !== totalCount
                ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
                : `${totalCount.toLocaleString()} auctions`}
            </div>
          </div>

          {tab === "Overview" && (
            <OverviewTab setTab={setTab} setDrillMetric={setDrillMetric} />
          )}
          {tab === "Trends" && (
            <TrendsTab drillMetric={drillMetric} setDrillMetric={setDrillMetric} />
          )}
          {tab === "Listings" && <ListingsTab />}
          {tab === "Brand & Model" && <ModelTab />}
          {tab === "Compare" && <CompareTab />}
          {tab === "Insights" && <InsightsTab />}
        </main>
      </div>
    </div>
  );
}

function LoadingState({ status }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: BG }}
    >
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div
            style={{ width: 10, height: 10, borderRadius: 99, background: LIME }}
            className="animate-pulse"
          />
          <div
            className="text-[14px] font-bold tracking-tight"
            style={{ color: INK, letterSpacing: "-0.02em" }}
          >
            CARS<span style={{ color: "#a3a3a3" }}>&</span>BIDS
          </div>
        </div>
        <div className="text-[13px]" style={{ color: GRAY_500 }}>
          {status}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: BG }}
    >
      <div className="text-center max-w-md">
        <div className="text-[14px] font-semibold mb-2" style={{ color: INK }}>
          Couldn't load auction data
        </div>
        <div className="text-[12px]" style={{ color: GRAY_500 }}>
          {String(error)}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState({ status: "loading", error: null });
  const [isDark, setIsDark] = useState(false);

  const toggleDark = () => setIsDark((v) => !v);

  useEffect(() => {
    let cancelled = false;
    loadData(import.meta.env.BASE_URL || "/")
      .then(() => {
        if (!cancelled) setState({ status: "ready", error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", error: err });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingState status="Loading auctions…" />;
  }
  if (state.status === "error") {
    return <ErrorState error={state.error} />;
  }
  return (
    <div data-theme={isDark ? "dark" : undefined}>
      <FilterProvider>
        <Shell isDark={isDark} toggleDark={toggleDark} />
      </FilterProvider>
    </div>
  );
}
