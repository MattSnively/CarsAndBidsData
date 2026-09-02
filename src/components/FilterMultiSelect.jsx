import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CARD_BG,
  GRAY_100,
  GRAY_200,
  GRAY_400,
  GRAY_500,
  GRAY_700,
  INK,
  LIME,
  LIME_DEEP,
  LIME_SOFT,
} from "../tokens.js";

const MAX_VISIBLE_OPTIONS = 50;

/** A selected value, shown below the control with a remove affordance. */
function SelectedChip({ label, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10.5px] font-medium"
      style={{
        background: LIME_SOFT,
        color: LIME_DEEP,
        border: `1px solid ${LIME}`,
        borderRadius: 99,
        maxWidth: "100%",
      }}
    >
      <span className="truncate">{label}</span>
      <button
        onClick={onRemove}
        className="flex items-center justify-center w-3.5 h-3.5 shrink-0"
        style={{ borderRadius: 99 }}
        aria-label={`Remove ${label}`}
      >
        <svg width="8" height="8" viewBox="0 0 9 9" fill="none">
          <path
            d="M2 2l5 5M7 2l-5 5"
            stroke={LIME_DEEP}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

/**
 * Multi-select filter control with two presentations over the same selection model:
 *
 *   mode="list"      — a button opens a popover holding a search box and the full
 *                      option list. Suits a bounded set the user can browse (makes).
 *   mode="typeahead" — the input itself is the control; options only appear once
 *                      `minChars` have been typed. Suits a set too large to browse
 *                      (~1,650 models), where the user already knows what they want.
 *
 * Selection is by exact option value in both modes, so the two read identically
 * downstream: an array of strings OR'd together by the data layer.
 *
 * `single` narrows either presentation to one choice: picking replaces rather
 * than accumulates, the trigger names the choice instead of counting it, and the
 * marks are radios rather than checkboxes. It still reports an array so callers
 * and the data layer need no special case. Use it where the consumer only reads
 * selected[0] — a control offering checkboxes it will not honour is a lie about
 * what the page does.
 */
export function FilterMultiSelect({
  mode,
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  noun,
  minChars = 2,
  single = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const listboxId = useId();

  const isTypeahead = mode === "typeahead";

  // Typeahead stays silent until the query is long enough to be worth ranking;
  // list mode shows everything and treats the query as a narrowing search.
  // Only typeahead caps its rows — its option set is an order of magnitude larger
  // and is meant to be searched, whereas the list is meant to be browsed in full.
  const { visible, truncated } = useMemo(() => {
    if (isTypeahead && query.trim().length < minChars) {
      return { visible: [], truncated: 0 };
    }
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter((o) => o.value.toLowerCase().includes(q))
      : options;
    if (!isTypeahead) return { visible: matches, truncated: 0 };
    return {
      visible: matches.slice(0, MAX_VISIBLE_OPTIONS),
      truncated: Math.max(0, matches.length - MAX_VISIBLE_OPTIONS),
    };
  }, [options, query, isTypeahead, minChars]);

  const hasQuery = query.trim().length >= (isTypeahead ? minChars : 1);
  const showPopover = open && (isTypeahead ? hasQuery : true);

  useEffect(() => setHighlight(0), [query]);

  // Close on outside click or Escape, like a native dropdown. Both listen on the
  // document rather than the wrapper because clicking an option leaves focus on
  // <body>, so a React-level key handler would never see the Escape.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => {
      setOpen(false);
      if (isTypeahead) setQuery("");
    };
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isTypeahead]);

  // List mode opens onto an empty search box, so focus it to save a click.
  useEffect(() => {
    if (open && !isTypeahead) searchRef.current?.focus();
  }, [open, isTypeahead]);

  const toggle = (value) => {
    if (single) {
      // One choice replaces the last, and the popover closes because there is
      // nothing further to pick. This also makes the control honest on pages
      // that only ever read selected[0].
      onChange([value]);
      setQuery("");
      setOpen(false);
      return;
    }
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
    // Typeahead selections are one-and-done: clearing the query readies the next
    // search. List mode keeps its query so the user can tick several neighbours.
    if (isTypeahead) {
      setQuery("");
      setOpen(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!visible.length) return;
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return (next + visible.length) % visible.length;
      });
      return;
    }
    if (e.key === "Enter" && showPopover && visible[highlight]) {
      e.preventDefault();
      toggle(visible[highlight].value);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : single
        ? selected[0]
        : `${selected.length} ${noun}${selected.length === 1 ? "" : "s"} selected`;

  return (
    // Key handling lives on the wrapper so Escape and arrow keys work no matter
    // which element inside has focus — after clicking an option, focus sits in the
    // list rather than on the trigger.
    <div ref={wrapRef} onKeyDown={onKeyDown} style={{ position: "relative" }}>
      {isTypeahead ? (
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showPopover}
          aria-controls={listboxId}
          aria-autocomplete="list"
          className="w-full px-2 py-1.5 text-[11.5px] outline-none"
          style={{
            background: CARD_BG,
            border: `1px solid ${GRAY_200}`,
            borderRadius: 4,
            color: INK,
            boxSizing: "border-box",
          }}
        />
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[11.5px] font-medium"
          style={{
            background: CARD_BG,
            border: `1px solid ${GRAY_200}`,
            borderRadius: 4,
            color: selected.length ? INK : GRAY_700,
            boxSizing: "border-box",
          }}
        >
          <span className="truncate">{summary}</span>
          <svg
            width="8"
            height="5"
            viewBox="0 0 8 5"
            fill="none"
            style={{ transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }}
          >
            <path
              d="M1 1l3 3 3-3"
              stroke={GRAY_500}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {showPopover && (
        <div
          className="absolute left-0 mt-1 overflow-hidden"
          style={{
            width: 240,
            maxWidth: "min(240px, calc(100vw - 32px))",
            background: CARD_BG,
            border: `1px solid ${GRAY_200}`,
            borderRadius: 4,
            boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
            zIndex: 50,
          }}
        >
          {!isTypeahead && (
            <div className="p-1.5 border-b" style={{ borderColor: GRAY_200 }}>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full px-2 py-1 text-[11.5px] outline-none"
                style={{
                  background: CARD_BG,
                  border: `1px solid ${GRAY_200}`,
                  borderRadius: 3,
                  color: INK,
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable={!single}
            style={{ maxHeight: 240, overflowY: "auto" }}
          >
            {visible.map((o, i) => {
              const active = selected.includes(o.value);
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => toggle(o.value)}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11.5px] cursor-pointer"
                  style={{ background: i === highlight ? GRAY_100 : "transparent" }}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 12,
                        height: 12,
                        // Round reads as "one of these", square as "any of these".
                        borderRadius: single ? 99 : 2,
                        background: active ? LIME : CARD_BG,
                        border: `1px solid ${active ? LIME_DEEP : GRAY_400}`,
                      }}
                    >
                      {active &&
                        (single ? (
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: 99,
                              background: INK,
                            }}
                          />
                        ) : (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path
                              d="M1.5 4l1.8 1.8L6.5 2.5"
                              stroke={INK}
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ))}
                    </span>
                    <span className="truncate" style={{ color: INK }}>
                      {o.value}
                    </span>
                  </span>
                  <span
                    className="tabular-nums shrink-0 text-[10.5px]"
                    style={{ color: GRAY_500 }}
                  >
                    {o.count.toLocaleString()}
                  </span>
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="px-2 py-3 text-[11px]" style={{ color: GRAY_500 }}>
                No {noun}s match “{query.trim()}”
              </div>
            )}
          </div>

          {truncated > 0 && (
            <div
              className="px-2 py-1.5 text-[10px] border-t"
              style={{ color: GRAY_500, borderColor: GRAY_200 }}
            >
              {truncated.toLocaleString()} more — keep typing to narrow
            </div>
          )}
        </div>
      )}

      {selected.length > 0 && !single && (
        <div className="flex flex-wrap gap-1 mt-1.5" style={{ minWidth: 0 }}>
          {selected.map((v) => (
            <SelectedChip
              key={v}
              label={v}
              onRemove={() => onChange(selected.filter((x) => x !== v))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
