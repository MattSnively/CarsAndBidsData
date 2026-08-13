"""
Build the dashboard data files from data/carsandbids_master.csv.

Outputs:
  public/data/auctions.json — the packed dataset every tab loads at startup
  public/data/details.json  — per-listing detail sidecar, loaded lazily by the
                              Model page only (see DETAIL SIDECAR below)

Format: { makes: [...], bodies: [...], colors: [...], records: [[...], ...], meta: {...} }

Each record is a 15-element array:
  [year, makeIdx, model, sale_price, mileage, num_bids, num_views,
   sold(0|1), no_reserve(0|1), bodyIdx, transmission("M"|"A"|""),
   monthOffset, dayOffset, colorIdx, num_comments]

monthOffset: months since 2021-08 (the dataset start). Month 0 = Aug 2021.
dayOffset:   days since 2021-08-01 (the dataset start). Day 0 = Aug 1, 2021.
colorIdx:    index into the colors lookup array (grouped by major color family).
num_comments: integer comment count for auction engagement analysis.

DETAIL SIDECAR
Fields the tooltip on the Model page needs that are too bulky to justify adding
to auctions.json, which every visitor downloads on every tab (~600 KB gzipped;
these fields would roughly double it). Split out so only the Model page pays.

Format: { url_prefix, ext_colors: [...], drivetrains: [...], engines: [...],
          locations: [...], rows: [[urlPath, colorIx, driveIx, engineIx, locIx], ...] }

rows[i] describes records[i]. That correspondence is the whole contract, so both
lists are built as pairs and sorted together below — never sorted independently.
A -1 index means the field was missing for that listing.

Run: py -3 scripts/build_data.py [path_to_csv]
Defaults to ./data/carsandbids_master.csv (relative to the repo root).
Note: pandas is importable via the `py -3` launcher, not necessarily `python`.
"""

import json
import os
import sys
from datetime import date as date_type
from pathlib import Path

import pandas as pd

EPOCH_YEAR = 2021
EPOCH_MONTH = 8  # August
EPOCH_DATE = date_type(2021, 8, 1)

# Color grouping: map exterior_color strings to one of 8 major color families.
# Each tuple is (group_label, [substring_keywords]).  Order matters — first match wins.
COLOR_GROUPS = [
    ("White",        ["white", "pearl", "ivory", "cream", "polar", "alpine", "chalk", "quartz", "glacier"]),
    ("Black",        ["black", "noir", "midnight", "obsidian", "onyx", "carbon", "jet", "shadow"]),
    ("Silver",       ["silver", "titanium", "aluminum", "argent", "satin", "platinum", "palladium"]),
    ("Gray",         ["gray", "grey", "charcoal", "graphite", "slate", "granite", "cement", "ash", "storm"]),
    ("Red",          ["red", "crimson", "scarlet", "burgundy", "maroon", "ruby", "wine", "rosso", "rouge"]),
    ("Blue",         ["blue", "navy", "aqua", "teal", "cobalt", "sapphire", "azure", "marine", "ocean", "portimao"]),
    ("Green",        ["green", "olive", "emerald", "forest", "sage", "verde", "british racing"]),
    ("Yellow/Orange",["yellow", "gold", "lemon", "sunburst", "orange", "bronze", "amber", "dakar", "sakhir"]),
]
COLOR_OTHER = "Other"

# Every auction URL in the dataset shares this prefix, so the sidecar stores only
# the path after it and the client re-attaches it.
URL_PREFIX = "https://carsandbids.com/auctions/"

# Sidecar fields that are dictionary-encoded. Each has few enough distinct values
# relative to 33k rows that an index costs far less than the repeated string
# (exterior_color 4.7k distinct, drivetrain 3, engine 735, location 8.3k).
DETAIL_DICT_FIELDS = ["exterior_color", "drivetrain", "engine", "location"]


def group_color(color_str) -> str:
    """Map an exterior_color value to one of 8 standard color group labels."""
    if pd.isna(color_str) or not str(color_str).strip():
        return COLOR_OTHER
    c = str(color_str).lower()
    for group_label, keywords in COLOR_GROUPS:
        if any(kw in c for kw in keywords):
            return group_label
    return COLOR_OTHER


def month_offset(dt) -> int:
    """Months since epoch (Aug 2021)."""
    return (dt.year - EPOCH_YEAR) * 12 + (dt.month - EPOCH_MONTH)


def day_offset(dt) -> int:
    """Days since epoch (Aug 1, 2021). Used for daily/weekly granularity in the Trends tab."""
    return (dt.date() - EPOCH_DATE).days


def normalize_transmission(value) -> str:
    """Reduce transmission to single-char code: M (manual), A (automatic), '' (unknown)."""
    if pd.isna(value):
        return ""
    s = str(value)
    if "Manual" in s:
        return "M"
    return "A"


def safe_int(value, default: int = 0) -> int:
    if pd.isna(value):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_model(value) -> str:
    """
    Model name with the scraper's UI leakage removed.

    The listing scraper captures the model cell's full inner text, which on some
    cards includes the "Save" button label on a second line. That left 1,766 of
    33,021 rows (5.3%) as "3 Series\\nSave" rather than "3 Series", splitting
    every popular model into two entries and quietly excluding those listings
    whenever someone filters on the clean name.

    Taking the first line fixes it at the source; makes, bodies and colors were
    checked and are unaffected.
    """
    s = safe_str(value, max_len=None)
    return s.split("\n", 1)[0].strip()[:32]


def safe_str(value, default: str = "", max_len: int | None = None) -> str:
    if pd.isna(value):
        return default
    s = str(value)
    if max_len is not None:
        s = s[:max_len]
    return s


def build(csv_path: Path, output_path: Path) -> None:
    # Read the master CSV. CSV is the canonical on-disk format for the
    # source data; the dashboard only consumes the packed JSON written below.
    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path)
    df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce")
    before = len(df)
    df = df.dropna(subset=["end_date"]).copy()
    print(f"  {len(df):,} records (dropped {before - len(df)} with missing end_date)")

    # Build lookup tables
    makes = sorted(set(str(m) for m in df["make"].dropna()))
    bodies = sorted(set(str(b) for b in df["body_style"].dropna()))
    # Colors are built from the fixed list of group labels (plus Other) so the
    # index is stable regardless of which colors appear in the current dataset.
    colors = [g[0] for g in COLOR_GROUPS] + [COLOR_OTHER]
    make_ix = {m: i for i, m in enumerate(makes)}
    body_ix = {b: i for i, b in enumerate(bodies)}
    color_ix = {c: i for i, c in enumerate(colors)}
    print(f"  {len(makes)} unique makes, {len(bodies)} unique body styles, {len(colors)} color groups")

    # Build the sidecar's dictionaries up front so the row loop can just index
    # into them. Sorted for determinism — the index must not shift between runs.
    detail_values = {}
    detail_index = {}
    for field in DETAIL_DICT_FIELDS:
        values = sorted({str(v) for v in df[field].dropna() if str(v).strip()})
        detail_values[field] = values
        detail_index[field] = {v: i for i, v in enumerate(values)}
    print(
        "  sidecar dictionaries: "
        + ", ".join(f"{f} {len(detail_values[f])}" for f in DETAIL_DICT_FIELDS)
    )

    def detail_ix(row, field):
        """Dictionary index for a detail field, or -1 when the value is missing."""
        value = safe_str(row.get(field))
        return detail_index[field].get(value, -1) if value.strip() else -1

    # Pack records, carrying each row's sidecar detail alongside it. The two are
    # kept as pairs through the sort below because rows[i] in details.json must
    # describe records[i] — sorting them independently would silently mislabel
    # every tooltip.
    paired = []
    for _, r in df.iterrows():
        url = safe_str(r.get("url"))
        detail = [
            # Keep any URL that doesn't match the expected prefix intact; the
            # client re-attaches the prefix only to relative paths.
            url[len(URL_PREFIX):] if url.startswith(URL_PREFIX) else url,
            *(detail_ix(r, field) for field in DETAIL_DICT_FIELDS),
        ]
        record = [
            safe_int(r.get("year")),
            make_ix.get(safe_str(r.get("make")), 0),
            normalize_model(r.get("model")),
            safe_int(r.get("sale_price")),
            safe_int(r.get("mileage")),
            safe_int(r.get("num_bids")),
            safe_int(r.get("num_views")),
            1 if bool(r.get("sold", False)) else 0,
            1 if bool(r.get("is_no_reserve", False)) else 0,
            body_ix.get(safe_str(r.get("body_style")), 0),
            normalize_transmission(r.get("transmission")),
            month_offset(r["end_date"]),
            day_offset(r["end_date"]),  # field 12 — days since epoch, for daily/weekly chart granularity
            color_ix.get(group_color(r.get("exterior_color")), color_ix[COLOR_OTHER]),  # field 13 — color group
            safe_int(r.get("num_comments")),   # field 14 — comment count (engagement signal)
        ]
        paired.append((record, detail))

    # Sort by date for stable ordering. Sorting the pairs on the record's month
    # offset keeps each detail welded to its record; Python's sort is stable, so
    # the resulting record order is identical to sorting records alone.
    paired.sort(key=lambda pair: pair[0][11])
    records = [record for record, _ in paired]
    details = [detail for _, detail in paired]

    # Compute meta
    sold_count = sum(1 for r in records if r[7] == 1)
    gmv = sum(r[3] for r in records if r[7] == 1)
    months_total = max(r[11] for r in records) + 1

    meta = {
        "total_listings": len(records),
        "total_sold": sold_count,
        "total_gmv": gmv,
        "months_total": months_total,
        "epoch": f"{EPOCH_YEAR}-{EPOCH_MONTH:02d}",
        "schema_version": 3,
        "field_index": {
            "year": 0,
            "make_ix": 1,
            "model": 2,
            "price": 3,
            "mileage": 4,
            "bids": 5,
            "views": 6,
            "sold": 7,
            "no_reserve": 8,
            "body_ix": 9,
            "transmission": 10,
            "month_offset": 11,
            "day_offset": 12,
            "color_ix": 13,
            "comments": 14,
        },
    }

    output = {
        "makes": makes,
        "bodies": bodies,
        "colors": colors,
        "records": records,
        "meta": meta,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    detail_output = {
        "schema_version": 1,
        "url_prefix": URL_PREFIX,
        "ext_colors": detail_values["exterior_color"],
        "drivetrains": detail_values["drivetrain"],
        "engines": detail_values["engine"],
        "locations": detail_values["location"],
        # rows[i] describes records[i] in auctions.json
        "rows": details,
    }
    detail_path = output_path.parent / "details.json"
    with open(detail_path, "w") as f:
        json.dump(detail_output, f, separators=(",", ":"))

    size_kb = output_path.stat().st_size / 1024
    detail_kb = detail_path.stat().st_size / 1024
    missing_url = sum(1 for d in details if not d[0])
    print(
        f"\nWrote {output_path} ({size_kb:.0f} KB)\n"
        f"  Records:   {len(records):,}\n"
        f"  Sold:      {sold_count:,}  ({sold_count / len(records) * 100:.1f}% STR)\n"
        f"  GMV:       ${gmv / 1e6:.1f}M\n"
        f"  Span:      {months_total} months from {meta['epoch']}\n"
        f"\nWrote {detail_path} ({detail_kb:.0f} KB)\n"
        f"  Detail rows: {len(details):,}  (missing url: {missing_url:,})\n"
    )


def main():
    # Optional first argument: explicit path to a master CSV. If omitted,
    # we look in the conventional locations (CWD or the repo's data/ folder).
    args = sys.argv[1:]
    if args:
        csv_path = Path(args[0])
    else:
        repo_root = Path(__file__).resolve().parent.parent
        candidates = [
            Path.cwd() / "carsandbids_master.csv",
            Path.cwd() / "data" / "carsandbids_master.csv",
            repo_root / "data" / "carsandbids_master.csv",
        ]
        csv_path = next((p for p in candidates if p.exists()), None)
        if csv_path is None:
            print("ERROR: carsandbids_master.csv not found.", file=sys.stderr)
            print("Pass the path as the first argument: python scripts/build_data.py <path>", file=sys.stderr)
            sys.exit(1)

    if not csv_path.exists():
        print(f"ERROR: {csv_path} does not exist.", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(__file__).resolve().parent.parent
    output_path = repo_root / "public" / "data" / "auctions.json"
    build(csv_path, output_path)


if __name__ == "__main__":
    main()
