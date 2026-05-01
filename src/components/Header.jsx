import { GRAY_200, GRAY_300, GRAY_400, GRAY_500, GRAY_700, INK, LIME, LIME_DEEP, LIME_SOFT } from "../tokens.js";

export function Header({ tab, setTab, filteredCount, totalCount, asOf }) {
  const tabs = ["Overview", "Trends", "Listings", "Compare"];
  const isFiltered = filteredCount !== totalCount;

  return (
    <div
      className="flex items-center justify-between px-7 py-4 border-b bg-white"
      style={{ borderColor: GRAY_200 }}
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

      <div className="flex items-center gap-5">
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
        {asOf && (
          <div className="text-[12px]" style={{ color: GRAY_500 }}>
            {asOf}
          </div>
        )}
      </div>
    </div>
  );
}
