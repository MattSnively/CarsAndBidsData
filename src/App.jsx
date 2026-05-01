import { useEffect, useMemo, useState } from "react";

import { ActiveFilterBar } from "./components/ActiveFilterBar.jsx";
import { FilterProvider, useFilters } from "./components/FilterContext.jsx";
import { FilterSidebar } from "./components/FilterSidebar.jsx";
import { Header } from "./components/Header.jsx";
import { applyUniverseFilters, getMeta, loadData } from "./data.js";
import { CompareTab } from "./tabs/CompareTab.jsx";
import { ListingsTab } from "./tabs/ListingsTab.jsx";
import { OverviewTab } from "./tabs/OverviewTab.jsx";
import { TrendsTab } from "./tabs/TrendsTab.jsx";
import { BG, GRAY_500, INK, LIME } from "./tokens.js";

function Shell() {
  const { filters, setFilters, reset } = useFilters();
  const [tab, setTab] = useState("Overview");
  const [drillMetric, setDrillMetric] = useState("gmv");

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
      />
      <ActiveFilterBar filters={filters} setFilters={setFilters} reset={reset} />
      <div className="flex">
        <FilterSidebar />
        <main className="flex-1 min-w-0">
          {tab === "Overview" && (
            <OverviewTab setTab={setTab} setDrillMetric={setDrillMetric} />
          )}
          {tab === "Trends" && (
            <TrendsTab drillMetric={drillMetric} setDrillMetric={setDrillMetric} />
          )}
          {tab === "Listings" && <ListingsTab />}
          {tab === "Compare" && <CompareTab />}
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
    return <LoadingState status="Loading 31,253 auctions…" />;
  }
  if (state.status === "error") {
    return <ErrorState error={state.error} />;
  }
  return (
    <FilterProvider>
      <Shell />
    </FilterProvider>
  );
}
