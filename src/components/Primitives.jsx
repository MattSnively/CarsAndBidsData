import { GRAY_100, GRAY_200, GRAY_500, GRAY_700, INK, LIME, LIME_DEEP, LIME_SOFT } from "../tokens.js";

export function Card({ children, className = "", style = {}, ...rest }) {
  return (
    <div
      className={`bg-white border ${className}`}
      style={{ borderColor: GRAY_200, borderRadius: 6, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between px-5 pt-4 pb-1">
      <div>
        <div
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: INK }}
        >
          {title}
        </div>
        {sub && (
          <div className="text-[11.5px] mt-0.5" style={{ color: GRAY_500 }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: GRAY_100, fg: GRAY_700, bd: GRAY_200 },
    good: { bg: LIME_SOFT, fg: LIME_DEEP, bd: LIME },
    warn: { bg: "#fef3e7", fg: "#8a5a10", bd: "#f0d28a" },
    bad: { bg: "#fdecec", fg: "#8f2929", bd: "#f2c2c2" },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        borderRadius: 3,
      }}
    >
      {children}
    </span>
  );
}
