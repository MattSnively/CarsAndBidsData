"""
Merge a fresh scraper output into the master CSV.

Usage:
    python scripts/merge_master.py <new.csv> <master.csv>

Behavior:
- Deduplicates by `url`. Rows in <new.csv> whose url already exists in
  <master.csv> are skipped (these are listings the previous scrape window
  also captured — incremental scrapes overlap intentionally).
- Aligns new rows to master's column schema. Scraper-only columns are
  dropped; master columns the scraper doesn't produce are filled with NaN.
  This keeps master's schema stable across scrapes.
- Atomic write: writes to <master>.tmp then renames. If the script is
  killed mid-write, the original master is untouched.
- Reports added / skipped counts. When running in GitHub Actions, also
  emits these as step outputs via $GITHUB_OUTPUT so subsequent steps
  can branch on them (e.g., skip the rebuild step when 0 new rows).
"""

import os
import sys
from pathlib import Path

import pandas as pd


def emit_outputs(*, added: int, skipped: int) -> None:
    """Write step outputs for downstream GitHub Actions steps. No-op locally."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"added={added}\n")
            f.write(f"skipped={skipped}\n")


def main() -> None:
    # Argument validation. Both paths are required and must already exist —
    # we never create a master CSV from a scrape; the master must be seeded
    # by hand with the historical dataset before the first incremental run.
    if len(sys.argv) != 3:
        print("Usage: python scripts/merge_master.py <new.csv> <master.csv>", file=sys.stderr)
        sys.exit(2)

    new_path = Path(sys.argv[1])
    master_path = Path(sys.argv[2])

    if not new_path.exists():
        print(f"ERROR: new-scrape file does not exist: {new_path}", file=sys.stderr)
        sys.exit(2)
    if not master_path.exists():
        print(f"ERROR: master file does not exist: {master_path}", file=sys.stderr)
        sys.exit(2)

    # Load both CSVs.
    new_df = pd.read_csv(new_path)
    master_df = pd.read_csv(master_path)
    print(f"  new scrape:    {len(new_df):,} rows, {len(new_df.columns)} columns")
    print(f"  master before: {len(master_df):,} rows, {len(master_df.columns)} columns")

    # Both CSVs must have a `url` column to dedupe against.
    if "url" not in new_df.columns or "url" not in master_df.columns:
        print("ERROR: both CSVs must have a 'url' column for deduplication.", file=sys.stderr)
        sys.exit(2)

    # Dedup: drop any rows from the new scrape whose url is already in master.
    existing_urls = set(master_df["url"].dropna())
    fresh_mask = ~new_df["url"].isin(existing_urls)
    fresh = new_df[fresh_mask].copy()

    added = len(fresh)
    skipped = len(new_df) - added
    print(f"  dedup:         {added:,} new, {skipped:,} duplicates skipped")

    # If there's nothing new, leave master alone and bail (still emit outputs
    # so the workflow's `if: steps.merge.outputs.added != '0'` gate works).
    if added == 0:
        print("  no new rows — master left unchanged.")
        emit_outputs(added=0, skipped=skipped)
        return

    # Align fresh rows to master's column order/set. reindex(columns=...)
    # drops scraper-only columns and adds NaN for master-only columns.
    fresh_aligned = fresh.reindex(columns=master_df.columns)

    merged = pd.concat([master_df, fresh_aligned], ignore_index=True)
    print(f"  master after:  {len(merged):,} rows")

    # Atomic write: write to <master>.tmp then rename. Path.replace is
    # atomic on the same filesystem and overwrites the destination.
    tmp_path = master_path.with_suffix(master_path.suffix + ".tmp")
    merged.to_csv(tmp_path, index=False)
    tmp_path.replace(master_path)
    print(f"  wrote {master_path}")

    emit_outputs(added=added, skipped=skipped)


if __name__ == "__main__":
    main()
