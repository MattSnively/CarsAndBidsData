"""
Re-scrape auction outcomes for rows the broken pipeline damaged.

Two populations need it (CarsAndBidsData-b1v):
  - every row ending on/after 2026-03-02, where the incremental pipeline wrote
    a blank auction_status, high_bid and num_comments
  - sold rows with an implausibly low sale_price, from any era, where the old
    unanchored price regex captured the wrong figure

Usage:
    py -3 scripts/backfill_outcomes.py --limit 25          # validation sample
    py -3 scripts/backfill_outcomes.py                     # full run
    py -3 scripts/backfill_outcomes.py --apply             # write results to master

Scraping and applying are separate steps on purpose. The run writes each result
to a checkpoint as it goes and never touches the master CSV, so an interrupted
run costs nothing and a re-run resumes where it stopped. Inspect the checkpoint,
then --apply when the results look right.
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from carsandbids_scraper_7day import CarsAndBidsScraper  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data" / "carsandbids_master.csv"
CHECKPOINT = REPO / "data" / "backfill_checkpoint.jsonl"

# The date the incremental pipeline took over from the hand-seeded history.
WINDOW_START = pd.Timestamp("2026-03-02")

# Below this, a "sale price" on a car is not credible and indicates the old
# regex grabbed an unrelated figure. Chosen well under any real sale.
IMPLAUSIBLE_PRICE = 2000

# Only these move. A partial scrape must not be able to blank out fields that
# were captured correctly, so everything else in the row is left untouched.
BACKFILL_FIELDS = [
    "auction_status", "sold", "sale_price", "high_bid",
    "num_bids", "num_comments", "num_views",
]


def select_targets(df: pd.DataFrame) -> pd.DataFrame:
    end = pd.to_datetime(df["end_date"], errors="coerce")
    price = pd.to_numeric(df["sale_price"], errors="coerce")
    window = end >= WINDOW_START
    implausible = (df["sold"] == True) & (price > 0) & (price < IMPLAUSIBLE_PRICE)  # noqa: E712
    targets = df[(window | implausible) & df["url"].notna()].copy()
    print(f"  regression window : {int(window.sum()):,}")
    print(f"  implausible price : {int(implausible.sum()):,}")
    print(f"  targets           : {len(targets):,}")
    return targets


def load_done() -> set:
    if not CHECKPOINT.exists():
        return set()
    done = set()
    with open(CHECKPOINT, encoding="utf-8") as f:
        for line in f:
            try:
                done.add(json.loads(line)["url"])
            except (json.JSONDecodeError, KeyError):
                continue  # a torn final line from an interrupted run
    return done


async def worker(name: int, queue: asyncio.Queue, out, counters: dict, delay: float):
    """One browser, pulling URLs until the queue drains."""
    scraper = CarsAndBidsScraper(headless=True, delay=delay)
    await scraper.start()
    try:
        while True:
            try:
                url = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                details = await scraper.scrape_detail_page(url)
                record = {"url": url, "scraped_at": datetime.now().isoformat(timespec="seconds")}
                for field in BACKFILL_FIELDS:
                    if field in details:
                        record[field] = details[field]
                # No status means the page did not render a result we recognise.
                # Keep the row so a re-run does not retry it forever, but mark it
                # so --apply skips it rather than blanking good data.
                record["ok"] = bool(details.get("auction_status"))
                counters["ok" if record["ok"] else "no_status"] += 1
            except Exception as e:                      # noqa: BLE001 - log and continue
                record = {"url": url, "ok": False, "error": f"{type(e).__name__}: {e}"[:200]}
                counters["error"] += 1

            out.write(json.dumps(record) + "\n")
            out.flush()
            counters["done"] += 1
            n = counters["done"]
            if n % 25 == 0 or n == counters["total"]:
                pct = n / counters["total"] * 100
                elapsed = (datetime.now() - counters["start"]).total_seconds()
                rate = n / elapsed if elapsed else 0
                eta = (counters["total"] - n) / rate / 60 if rate else 0
                print(f"  {n:,}/{counters['total']:,} ({pct:.1f}%)  "
                      f"ok={counters['ok']:,} no_status={counters['no_status']:,} "
                      f"err={counters['error']:,}  {rate:.2f}/s  ETA {eta:.0f}m", flush=True)
    finally:
        await scraper.stop()


async def run(limit: int | None, workers: int, delay: float) -> None:
    df = pd.read_csv(MASTER, low_memory=False)
    targets = select_targets(df)
    done = load_done()
    todo = [u for u in targets["url"].tolist() if u not in done]
    if done:
        print(f"  already done      : {len(done):,} (resuming)")
    if limit:
        todo = todo[:limit]
    print(f"  to scrape now     : {len(todo):,}\n")
    if not todo:
        print("Nothing to do.")
        return

    queue = asyncio.Queue()
    for u in todo:
        queue.put_nowait(u)

    counters = {"done": 0, "ok": 0, "no_status": 0, "error": 0,
                "total": len(todo), "start": datetime.now()}

    with open(CHECKPOINT, "a", encoding="utf-8") as out:
        await asyncio.gather(*[
            worker(i, queue, out, counters, delay) for i in range(workers)
        ])

    mins = (datetime.now() - counters["start"]).total_seconds() / 60
    print(f"\nDone in {mins:.1f}m — ok={counters['ok']:,} "
          f"no_status={counters['no_status']:,} error={counters['error']:,}")
    print(f"Checkpoint: {CHECKPOINT}")
    print("Review it, then re-run with --apply to write these into the master CSV.")


def apply_checkpoint() -> None:
    """Merge successful checkpoint rows into the master CSV, atomically."""
    if not CHECKPOINT.exists():
        print(f"ERROR: no checkpoint at {CHECKPOINT}", file=sys.stderr)
        sys.exit(1)

    records = []
    with open(CHECKPOINT, encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("ok"):
                records.append(r)
    if not records:
        print("No successful rows in the checkpoint; nothing to apply.")
        return

    # Last write wins, so a re-scraped URL supersedes an earlier attempt.
    by_url = {r["url"]: r for r in records}
    print(f"  applying {len(by_url):,} rows")

    df = pd.read_csv(MASTER, low_memory=False)
    index = {u: i for i, u in enumerate(df["url"]) if isinstance(u, str)}

    changed = {f: 0 for f in BACKFILL_FIELDS}
    missing = 0
    for url, rec in by_url.items():
        i = index.get(url)
        if i is None:
            missing += 1
            continue
        for field in BACKFILL_FIELDS:
            if field not in rec:
                continue
            before, after = df.at[i, field], rec[field]
            same = (pd.isna(before) and after is None) or before == after
            if not same:
                df.at[i, field] = after
                changed[field] += 1

    print(f"  rows not found in master: {missing:,}")
    print("  field changes:")
    for field, n in changed.items():
        print(f"    {field:<16} {n:,}")

    backup = MASTER.with_suffix(".csv.bak")
    pd.read_csv(MASTER, low_memory=False).to_csv(backup, index=False)
    tmp = MASTER.with_suffix(".csv.tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(MASTER)
    print(f"\n  backup written to {backup.name}")
    print(f"  wrote {MASTER}")
    print("  now run: py -3 scripts/build_data.py")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, help="scrape at most N pages (validation sample)")
    p.add_argument("--workers", type=int, default=4, help="parallel browsers (default 4)")
    p.add_argument("--delay", type=float, default=1.5, help="per-page delay seconds (default 1.5)")
    p.add_argument("--apply", action="store_true", help="write checkpoint results into the master CSV")
    args = p.parse_args()

    if args.apply:
        apply_checkpoint()
    else:
        asyncio.run(run(args.limit, args.workers, args.delay))


if __name__ == "__main__":
    main()
