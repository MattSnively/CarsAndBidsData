"""
Build the dashboard data file from data/carsandbids_master.csv.

Output: public/data/auctions.json
Format: { makes: [...], bodies: [...], records: [[...], ...], meta: {...} }

Each record is a 12-element array:
  [year, makeIdx, model, sale_price, mileage, num_bids, num_views,
   sold(0|1), no_reserve(0|1), bodyIdx, transmission("M"|"A"|""), monthOffset]

monthOffset: months since 2021-08 (the dataset start). Month 0 = Aug 2021.

Run: python scripts/build_data.py [path_to_csv]
Defaults to ./data/carsandbids_master.csv (relative to the repo root).
"""

import json
import os
import sys
from pathlib import Path

import pandas as pd

EPOCH_YEAR = 2021
EPOCH_MONTH = 8  # August


def month_offset(dt) -> int:
    """Months since epoch (Aug 2021)."""
    return (dt.year - EPOCH_YEAR) * 12 + (dt.month - EPOCH_MONTH)


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
    make_ix = {m: i for i, m in enumerate(makes)}
    body_ix = {b: i for i, b in enumerate(bodies)}
    print(f"  {len(makes)} unique makes, {len(bodies)} unique body styles")

    # Pack records
    records = []
    for _, r in df.iterrows():
        record = [
            safe_int(r.get("year")),
            make_ix.get(safe_str(r.get("make")), 0),
            safe_str(r.get("model"), max_len=32),
            safe_int(r.get("sale_price")),
            safe_int(r.get("mileage")),
            safe_int(r.get("num_bids")),
            safe_int(r.get("num_views")),
            1 if bool(r.get("sold", False)) else 0,
            1 if bool(r.get("is_no_reserve", False)) else 0,
            body_ix.get(safe_str(r.get("body_style")), 0),
            normalize_transmission(r.get("transmission")),
            month_offset(r["end_date"]),
        ]
        records.append(record)

    # Sort by date for stable ordering
    records.sort(key=lambda x: x[11])

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
        "schema_version": 1,
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
        },
    }

    output = {
        "makes": makes,
        "bodies": bodies,
        "records": records,
        "meta": meta,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = output_path.stat().st_size / 1024
    print(
        f"\nWrote {output_path} ({size_kb:.0f} KB)\n"
        f"  Records:   {len(records):,}\n"
        f"  Sold:      {sold_count:,}  ({sold_count / len(records) * 100:.1f}% STR)\n"
        f"  GMV:       ${gmv / 1e6:.1f}M\n"
        f"  Span:      {months_total} months from {meta['epoch']}\n"
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
