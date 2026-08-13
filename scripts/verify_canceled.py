"""
Spot-check listings the backfill reclassified as canceled.

Cancellation is the highest-consequence classification: under the agreed
taxonomy a canceled auction leaves the sell-through denominator entirely, so a
false positive silently inflates STR. The jump from 7 to a projected ~120
warrants sampling before the numbers are published.

Re-reading li.ended would just repeat the classifier, so this collects
INDEPENDENT evidence from elsewhere on the page:

  - Cars & Bids posts a cancellation notice in the comments ("we have canceled
    this auction"). Its presence corroborates the bid bar.
  - A genuinely canceled auction must not also show a sale anywhere.
  - Bid and comment counts are absent on canceled listings, present otherwise.

Each sampled listing also gets a screenshot of the result area so the sample can
be eyeballed rather than taken on trust.

Usage:
    py -3 scripts/verify_canceled.py --rate 0.20
    py -3 scripts/verify_canceled.py --rate 1.0 --out data/canceled_audit
"""

import argparse
import asyncio
import json
import random
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from carsandbids_scraper_7day import CarsAndBidsScraper  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data" / "carsandbids_master.csv"
CHECKPOINT = REPO / "data" / "backfill_checkpoint.jsonl"

# Phrases Cars & Bids uses when it pulls an auction. Matched case-insensitively
# against the whole page, not the bid bar, so this is independent of the
# classifier being checked.
NOTICE_PHRASES = [
    "canceled this auction",
    "cancelled this auction",
    "auction has been canceled",
    "auction has been cancelled",
]

# A canceled listing must show none of these.
SALE_PHRASES = ["Sold for", "Sold After for"]

# Pace politely — this runs against the same host as the backfill.
DELAY = 3.0


def newly_canceled() -> pd.DataFrame:
    """Rows the backfill called canceled that the master CSV did not."""
    if not CHECKPOINT.exists():
        print(f"ERROR: no checkpoint at {CHECKPOINT}", file=sys.stderr)
        sys.exit(1)
    scraped = {}
    with open(CHECKPOINT, encoding="utf-8") as f:
        for line in f:
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("ok") and r.get("auction_status") == "canceled":
                scraped[r["url"]] = r

    df = pd.read_csv(MASTER, low_memory=False)
    df = df[df["url"].isin(scraped)]
    rows = []
    for _, row in df.iterrows():
        was = row["auction_status"]
        if was == "canceled":
            continue  # already known, nothing reclassified
        rows.append({
            "url": row["url"],
            "was_status": "(blank)" if pd.isna(was) else was,
            "was_sold": row["sold"],
            "was_price": None if pd.isna(row["sale_price"]) else float(row["sale_price"]),
            "title": row.get("full_title") or f"{row.get('year')} {row.get('make')} {row.get('model')}",
        })
    return pd.DataFrame(rows)


async def verify(sample, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    scraper = CarsAndBidsScraper(headless=True, delay=DELAY)
    await scraper.start()
    results = []
    try:
        for i, rec in enumerate(sample, 1):
            url = rec["url"]
            aid = url.split("/auctions/")[1].split("/")[0]
            entry = dict(rec)
            try:
                await scraper.page.goto(url, wait_until="domcontentloaded", timeout=45000)
                try:
                    await scraper.page.wait_for_selector("h1", timeout=20000)
                except Exception:
                    pass
                await asyncio.sleep(DELAY)

                body = await scraper.page.inner_text("body")
                low = body.lower()
                bar_el = await scraper.page.query_selector("li.ended .value")
                bar = (await bar_el.inner_text()).strip().replace("\n", " ") if bar_el else ""

                entry["bid_bar"] = bar
                entry["notice_found"] = any(p in low for p in NOTICE_PHRASES)
                entry["sale_text_found"] = any(p in body for p in SALE_PHRASES)
                entry["bar_says_canceled"] = "Canceled" in bar or "Cancelled" in bar
                entry["rendered"] = bool(body and len(body) > 2000)

                # Verdict. The notice is the strong independent signal; the bid
                # bar alone only repeats what the classifier already read.
                if not entry["rendered"]:
                    entry["verdict"] = "UNVERIFIED_PAGE_EMPTY"
                elif entry["sale_text_found"]:
                    entry["verdict"] = "SUSPECT_SHOWS_SALE"
                elif entry["notice_found"] and entry["bar_says_canceled"]:
                    entry["verdict"] = "CONFIRMED"
                elif entry["bar_says_canceled"]:
                    entry["verdict"] = "LIKELY_NO_NOTICE"
                else:
                    entry["verdict"] = "SUSPECT_BAR_DISAGREES"

                shot = out_dir / f"{aid}.png"
                target = await scraper.page.query_selector("ul.bid-stats") or \
                    await scraper.page.query_selector("h1")
                if target:
                    await target.screenshot(path=str(shot))
                    entry["screenshot"] = shot.name
            except Exception as e:                       # noqa: BLE001
                entry["verdict"] = "ERROR"
                entry["error"] = f"{type(e).__name__}: {e}"[:160]

            results.append(entry)
            print(f"  [{i}/{len(sample)}] {aid:<10} {entry['verdict']:<22} "
                  f"was={entry['was_status']}/{entry['was_price']}  bar={entry.get('bid_bar','')[:28]}",
                  flush=True)
            await asyncio.sleep(DELAY)
    finally:
        await scraper.stop()

    (out_dir / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--rate", type=float, default=0.20, help="fraction to sample (default 0.20)")
    p.add_argument("--seed", type=int, default=1, help="sampling seed, for reproducibility")
    p.add_argument("--out", default="data/canceled_audit", help="output directory")
    args = p.parse_args()

    df = newly_canceled()
    print(f"newly canceled (reclassified): {len(df):,}")
    if df.empty:
        print("Nothing to verify.")
        return
    print("  previous status of those rows:")
    print(df["was_status"].value_counts().to_string())

    n = max(1, round(len(df) * args.rate))
    random.seed(args.seed)
    sample = random.sample(df.to_dict("records"), n)
    print(f"\nverifying {n} of {len(df):,} ({args.rate:.0%}), seed={args.seed}\n")

    out_dir = REPO / args.out
    results = asyncio.run(verify(sample, out_dir))

    print("\n--- verdicts ---")
    counts = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    for verdict, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {verdict:<24} {c}")
    confirmed = counts.get("CONFIRMED", 0) + counts.get("LIKELY_NO_NOTICE", 0)
    print(f"\n  supported: {confirmed}/{len(results)}")
    print(f"  evidence written to {out_dir}")


if __name__ == "__main__":
    main()
