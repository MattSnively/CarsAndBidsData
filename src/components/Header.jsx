import {
  CARD_BG,
  GRAY_200,
  GRAY_300,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  INK_SURFACE,
  LIME,
  LIME_DEEP,
  LIME_SOFT,
} from "../tokens.js";

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <path d="M7.5 1.5A6 6 0 0 0 2.1 9.8a6 6 0 0 0 5.9 3.7 6 6 0 0 0 4.5-2A4.5 4.5 0 0 1 7.5 1.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2.5" />
      <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.05 3.05l1.06 1.06M10.89 10.89l1.06 1.06M3.05 11.95l1.06-1.06M10.89 4.11l1.06-1.06" />
    </svg>
  );
}

export function Header({ tab, setTab, filteredCount, totalCount, isDark, toggleDark }) {
  const tabs = ["Overview", "Trends", "Listings", "Compare", "Insights"];
  const isFiltered = filteredCount !== totalCount;

  return (
    <div
      className="flex items-center justify-between px-7 py-4 border-b"
      style={{ background: CARD_BG, borderColor: GRAY_200 }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: 99, background: LIME }} />
          <div
            className="text-[15px] font-black tracking-tight"
            style={{ color: INK, letterSpacing: "-0.02em" }}
          >
            CARS<span style={{ color: GRAY_400 }}>&</span>BIDS
          </div>
        </div>
        <div className="h-4 w-px" style={{ background: GRAY_300 }} />
        <div className="text-[13px] font-medium" style={{ color: GRAY_700 }}>
          Sales Intelligence
        </div>
        <div
          className="ml-2 px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            background: isFiltered ? LIME : LIME_SOFT,
            color: isFiltered ? "white" : LIME_DEEP,
            borderRadius: 4,
          }}
        >
          {isFiltered
            ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} auctions · filtered`
            : `${totalCount.toLocaleString()} real auctions · 55 months of data`}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  color: active ? INK : GRAY_500,
                  background: active ? LIME : "transparent",
                  borderRadius: 4,
                }}
              >
                {t}
              </button>
            );
          })}
        </nav>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-8 h-8 transition-colors"
          style={{
            background: INK_SURFACE,
            color: "white",
            borderRadius: 4,
            border: `1px solid ${GRAY_200}`,
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  );
}
