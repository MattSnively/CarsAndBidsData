"""
Move misrouted high bids out of sale_price.

The old scraper wrote an unsold auction's "Bid to $X" figure into sale_price
(CarsAndBidsData-dfu). The backfill fixed every such row inside its target
window, but the rest are historical no_sale rows whose prices look plausible,
so nothing flagged them: 1,323 rows where a listing that never sold still
carries a sale price.

Two populations, handled differently:

  high_bid empty (1,306)   Unambiguous. The value in sale_price IS the high
                           bid, so it moves across and sale_price is cleared.

  high_bid present (17)    Both fields populated and they disagree 15 times.
                           Most of the existing high_bid values are junk — $1
                           and $10 bids on cars — but a few are plausible, so
                           these are re-scraped for ground truth rather than
                           resolved with a threshold nobody can defend.

Usage:
    py -3 scripts/migrate_high_bid.py --dry-run
    py -3 scripts/migrate_high_bid.py
"""

import argparse
import asyncio
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from carsandbids_scraper_7day import CarsAndBidsScraper  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data" / "carsandbids_master.csv"

SALE_STATUSES = {"sold", "sold_after"}
DELAY = 3.0


def load():
    df = pd.read_csv(MASTER, low_memory=False)
    sp = pd.to_numeric(df["sale_price"], errors="coerce")
    hb = pd.to_numeric(df["high_bid"], errors="coerce")
    not_sale = ~df["auction_status"].fillna("").isin(SALE_STATUSES)
    return df, sp, hb, not_sale


async def rescrape(urls):
    """Ground truth for the rows where both money fields are populated."""
    out = {}
    scraper = CarsAndBidsScraper(headless=True, delay=DELAY)
    await scraper.start()
    try:
        for i, url in enumerate(urls, 1):
            details = await scraper.scrape_detail_page(url)
            out[url] = details
            print(f"  [{i}/{len(urls)}] {url.split('/auctions/')[1][:28]:<30} "
                  f"status={details.get('auction_status')} "
                  f"sale={details.get('sale_price')} high_bid={details.get('high_bid')}",
                  flush=True)
            await asyncio.sleep(DELAY)
    finally:
        await scraper.stop()
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="report without writing")
    args = p.parse_args()

    df, sp, hb, not_sale = load()
    misrouted = not_sale & sp.notna()
    safe = misrouted & hb.isna()
    ambiguous = misrouted & hb.notna()
    print(f"misrouted rows : {int(misrouted.sum()):,}")
    print(f"  unambiguous  : {int(safe.sum()):,}")
    print(f"  need a scrape: {int(ambiguous.sum()):,}")

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    # 1. The unambiguous majority: the value is the high bid, so move it.
    df.loc[safe, "high_bid"] = sp[safe]
    df.loc[safe, "sale_price"] = pd.NA
    print(f"\nmoved {int(safe.sum()):,} values into high_bid")

    # 2. The contested handful: take whatever the page says now.
    urls = df.loc[ambiguous, "url"].dropna().tolist()
    if urls:
        print(f"\nre-scraping {len(urls)} ambiguous rows for ground truth:")
        scraped = asyncio.run(rescrape(urls))
        index = {u: i for i, u in enumerate(df["url"]) if isinstance(u, str)}
        resolved = unresolved = 0
        for url, details in scraped.items():
            i = index.get(url)
            if i is None or not details.get("auction_status"):
                unresolved += 1
                continue
            for field in ("auction_status", "sold", "sale_price", "high_bid"):
                if field in details:
                    df.at[i, field] = details[field] if details[field] is not None else pd.NA
            resolved += 1
        print(f"  resolved {resolved}, unresolved {unresolved}")

    # Re-check the invariant on the result.
    sp2 = pd.to_numeric(df["sale_price"], errors="coerce")
    not_sale2 = ~df["auction_status"].fillna("").isin(SALE_STATUSES)
    remaining = int((not_sale2 & sp2.notna()).sum())
    print(f"\nnon-sale rows still carrying a sale_price: {remaining}")

    backup = MASTER.with_suffix(".csv.premigrate")
    pd.read_csv(MASTER, low_memory=False).to_csv(backup, index=False)
    tmp = MASTER.with_suffix(".csv.tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(MASTER)
    print(f"backup: {backup.name}")
    print(f"wrote {MASTER}")
    print("now run: py -3 scripts/build_data.py")


if __name__ == "__main__":
    main()
