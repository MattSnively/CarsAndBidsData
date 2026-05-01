#!/usr/bin/env python3
"""
Cars & Bids Auction Scraper - 7-Day / Incremental Version

Scrapes recent auction data from carsandbids.com with date filtering.
Ideal for weekly scheduled scrapes to capture only new auctions.

Usage:
    python carsandbids_scraper_7day.py --days 7 --output weekly_update
    python carsandbids_scraper_7day.py --days 14 --output biweekly_update

    --days N      Only scrape auctions ended within the last N days (required)
    --output FILE Output filename without extension (default: carsandbids_7day)
"""

import argparse
import asyncio
import csv
import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    from playwright.async_api import async_playwright, Page, Browser
    import pandas as pd
except ImportError as e:
    print(f"Missing required package: {e}")
    print("Please install dependencies: pip install -r requirements.txt")
    print("Then install Playwright browsers: playwright install chromium")
    sys.exit(1)


# Body style codes for carsandbids.com
BODY_STYLES = {
    "sedan": 4,
    "suv": 5,
    "wagon": 7,
}

# Base URL for past auctions
BASE_URL = "https://carsandbids.com/past-auctions/"


def parse_price(price_text: str) -> Optional[int]:
    """Extract numeric price from text like '$41,250' or 'Bid to $18,500'."""
    if not price_text:
        return None
    match = re.search(r'\$[\d,]+', price_text)
    if match:
        return int(match.group().replace('$', '').replace(',', ''))
    return None


def parse_mileage(mileage_text: str) -> Optional[int]:
    """Extract numeric mileage from text like '78,700' or '~46,700 Miles'."""
    if not mileage_text:
        return None
    # Remove ~ and other characters, extract digits
    cleaned = re.sub(r'[^\d,]', '', mileage_text)
    if cleaned:
        return int(cleaned.replace(',', ''))
    return None


def parse_date(date_text: str) -> Optional[str]:
    """Parse date from text like 'Ended 1/13/26' or 'Ended 1\\13\\26'."""
    if not date_text:
        return None
    # Try to extract date pattern (handles both forward and back slashes)
    match = re.search(r'(\d{1,2})[/\\](\d{1,2})[/\\](\d{2,4})', date_text)
    if match:
        month, day, year = match.groups()
        if len(year) == 2:
            year = '20' + year
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    return date_text


def is_date_within_range(date_str: str, cutoff_date: datetime) -> bool:
    """Check if a date string (YYYY-MM-DD) is on or after the cutoff date."""
    if not date_str:
        return True  # If no date, include it to be safe
    try:
        listing_date = datetime.strptime(date_str, "%Y-%m-%d")
        return listing_date >= cutoff_date
    except ValueError:
        return True  # If parsing fails, include it to be safe


class CarsAndBidsScraper:
    """Scraper for carsandbids.com past auctions with date filtering."""

    def __init__(self, headless: bool = True, delay: float = 1.5):
        """
        Initialize scraper.

        Args:
            headless: Run browser in headless mode
            delay: Delay between requests in seconds
        """
        self.headless = headless
        self.delay = delay
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.listings = []

    async def start(self):
        """Start the browser."""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ]
        )
        context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        self.page = await context.new_page()

    async def stop(self):
        """Stop the browser."""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def navigate_to_results(self, start_year: int = None, body_styles: list = None):
        """Navigate to filtered past auctions page."""
        if body_styles is None:
            body_styles = ["sedan", "suv", "wagon"]

        # Build URL with filters
        style_codes = ",".join(str(BODY_STYLES[s]) for s in body_styles if s in BODY_STYLES)
        url = f"{BASE_URL}?body_style={style_codes}"
        if start_year is not None:
            url += f"&start_year={start_year}"

        print(f"Navigating to: {url}")
        await self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
        # Wait for listings to load
        try:
            await self.page.wait_for_selector('a[href*="/auctions/"]', timeout=30000)
        except Exception:
            print("Warning: Could not find listing elements, page may not have loaded properly")
        await asyncio.sleep(self.delay + 2)  # Extra time for dynamic content

    async def get_total_pages(self) -> int:
        """Get total number of result pages."""
        try:
            # Look for pagination buttons - note this may not show all pages
            # The pagination only displays a subset, so this is a minimum estimate
            pagination = await self.page.query_selector_all('ul > li > button')
            max_page = 1
            for btn in pagination:
                text = await btn.inner_text()
                if text.isdigit():
                    max_page = max(max_page, int(text))

            # Return a large number if no max_pages specified - we'll follow Next button
            # This is a workaround since pagination only shows subset of pages
            return max_page if max_page > 1 else 1
        except Exception as e:
            print(f"Could not determine total pages: {e}")
            return 1

    async def scrape_listing_page(self, cutoff_date: datetime = None) -> tuple:
        """
        Scrape all listings from current page.

        Returns:
            tuple: (listings, should_continue) where should_continue is False
                   if we've hit listings older than the cutoff date
        """
        listings = []
        should_continue = True

        # Wait for listing content to be present
        try:
            await self.page.wait_for_selector('a[href*="/auctions/"]', timeout=30000)
        except Exception:
            print("  Warning: Timeout waiting for listings to load")
            return listings, False

        # The site uses various selectors - try multiple approaches
        # First try to find listing items using link elements with auction URLs
        links = await self.page.query_selector_all('a[href*="/auctions/"]')

        seen_urls = set()
        found_old_listing = False

        for link in links:
            try:
                href = await link.get_attribute('href')
                if not href or '/auctions/' not in href:
                    continue

                full_url = f"https://carsandbids.com{href}" if not href.startswith('http') else href

                # Skip duplicates
                if full_url in seen_urls:
                    continue
                seen_urls.add(full_url)

                listing = {'url': full_url}

                # Try to get title from img alt or link text
                img = await link.query_selector('img')
                if img:
                    listing['title'] = await img.get_attribute('alt')
                    listing['image_url'] = await img.get_attribute('src')
                else:
                    # Try to get text from link
                    text = await link.inner_text()
                    if text and len(text) > 5:
                        listing['title'] = text.strip().split('\n')[0]

                # Try to find price in parent or sibling elements
                parent = await link.query_selector('xpath=..')
                if parent:
                    parent_text = await parent.inner_text()
                    if 'Sold for' in parent_text:
                        listing['sold'] = True
                        listing['sale_price'] = parse_price(parent_text)
                    elif 'Bid to' in parent_text:
                        listing['sold'] = False
                        listing['sale_price'] = parse_price(parent_text)

                    # Try to find end date in grandparent (card container)
                    grandparent = await parent.query_selector('xpath=..')
                    if grandparent:
                        gp_text = await grandparent.inner_text()
                        if 'Ended' in gp_text:
                            listing['end_date'] = parse_date(gp_text)

                # Check if this listing is within the date range
                if cutoff_date and listing.get('end_date'):
                    if not is_date_within_range(listing['end_date'], cutoff_date):
                        found_old_listing = True
                        should_continue = False
                        # Don't add this listing or any after it
                        continue

                # Only add if we have meaningful data and haven't hit old listings
                if listing.get('title') and listing.get('url') and not found_old_listing:
                    listings.append(listing)

            except Exception as e:
                print(f"Error parsing listing: {e}")
                continue

        return listings, should_continue

    async def scrape_detail_page(self, url: str) -> dict:
        """Scrape detailed info from a listing page."""
        details = {'url': url}

        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=60000)
            # Wait for content to load
            try:
                await self.page.wait_for_selector('h1', timeout=15000)
            except Exception:
                pass
            await asyncio.sleep(self.delay)

            # Get main title
            title_el = await self.page.query_selector('h1')
            if title_el:
                details['full_title'] = await title_el.inner_text()
                # Parse year, make, model from title
                title = details['full_title']
                match = re.match(r'(\d{4})\s+(.+)', title)
                if match:
                    details['year'] = int(match.group(1))
                    details['make_model'] = match.group(2)

            # Get main image
            main_img = await self.page.query_selector('article img')
            if main_img:
                details['image_url'] = await main_img.get_attribute('src')

            # Get all the definition list items (make, model, mileage, etc.)
            dt_elements = await self.page.query_selector_all('dt')
            dd_elements = await self.page.query_selector_all('dd')

            for dt, dd in zip(dt_elements, dd_elements):
                try:
                    key = (await dt.inner_text()).strip().lower()
                    value = (await dd.inner_text()).strip()

                    if key == 'make':
                        details['make'] = value
                    elif key == 'model':
                        details['model'] = value
                    elif key == 'mileage':
                        details['mileage'] = parse_mileage(value)
                        details['mileage_text'] = value
                    elif key == 'vin':
                        details['vin'] = value
                    elif key == 'title status':
                        details['title_status'] = value
                    elif key == 'location':
                        details['location'] = value
                    elif key == 'engine':
                        details['engine'] = value
                    elif key == 'drivetrain':
                        details['drivetrain'] = value
                    elif key == 'transmission':
                        details['transmission'] = value
                    elif key == 'body style':
                        details['body_style'] = value
                    elif key == 'exterior color':
                        details['exterior_color'] = value
                    elif key == 'interior color':
                        details['interior_color'] = value
                    elif key == 'seller type':
                        details['seller_type'] = value
                except Exception:
                    continue

            # Get auction stats (bids, views, watchers)
            # Bids: look for li.num-bids span.value
            try:
                bids_el = await self.page.query_selector('li.num-bids span.value')
                if bids_el:
                    bids_text = await bids_el.inner_text()
                    details['num_bids'] = int(bids_text.replace(',', ''))
            except Exception:
                pass

            # Also check the stats section for views/watchers
            stats_items = await self.page.query_selector_all('ul.stats li, ul.bid-stats li')
            for item in stats_items:
                try:
                    text = await item.inner_text()
                    if 'Views' in text:
                        match = re.search(r'([\d,]+)', text)
                        if match:
                            details['num_views'] = int(match.group(1).replace(',', ''))
                    elif 'Watching' in text or 'Watchers' in text:
                        match = re.search(r'([\d,]+)', text)
                        if match:
                            details['num_watchers'] = int(match.group(1).replace(',', ''))
                except Exception:
                    continue

            # Check for "No Reserve" badge - target the specific badge element only
            # The badge appears in the auction header area with distinctive styling
            # Try multiple selector patterns to find the badge element
            no_reserve_badge = await self.page.query_selector(
                '.no-reserve, .badge-no-reserve, .auction-badge-no-reserve, '
                '[class*="no-reserve" i], [class*="noreserve" i]'
            )
            if no_reserve_badge is None:
                # Fallback: look for text within auction header/info container only
                # This is more targeted than searching the entire page
                no_reserve_badge = await self.page.query_selector(
                    '.auction-title :text("No Reserve"), '
                    '.auction-heading :text("No Reserve"), '
                    '.quick-facts :text("No Reserve"), '
                    'header .badge:has-text("No Reserve")'
                )
            details['is_no_reserve'] = no_reserve_badge is not None

            # Get sold price from the page
            sold_section = await self.page.query_selector_all('h4')
            for section in sold_section:
                text = await section.inner_text()
                if 'Sold' in text:
                    details['sold'] = True
                    # Try to find the price nearby
                    parent = await section.query_selector('xpath=..')
                    if parent:
                        parent_text = await parent.inner_text()
                        price = parse_price(parent_text)
                        if price:
                            details['sale_price'] = price

            # Get modifications section
            mods_section = await self.page.query_selector('h4:has-text("Modifications")')
            if mods_section:
                parent = await mods_section.query_selector('xpath=..')
                if parent:
                    mods_list = await parent.query_selector_all('li')
                    mods = []
                    for mod in mods_list:
                        mods.append(await mod.inner_text())
                    details['modifications'] = '; '.join(mods) if mods else None

            # Get known flaws section
            flaws_section = await self.page.query_selector('h4:has-text("Known Flaws")')
            if flaws_section:
                parent = await flaws_section.query_selector('xpath=..')
                if parent:
                    flaws_list = await parent.query_selector_all('li')
                    flaws = []
                    for flaw in flaws_list:
                        flaws.append(await flaw.inner_text())
                    details['known_flaws'] = '; '.join(flaws) if flaws else None

        except Exception as e:
            print(f"Error scraping detail page {url}: {e}")

        return details

    async def scrape(self, max_pages: int = None, start_year: int = None,
                     body_styles: list = None, scrape_details: bool = True,
                     days: int = None) -> list:
        """
        Main scraping method.

        Args:
            max_pages: Maximum pages to scrape (None for all)
            start_year: Minimum model year (None for all years)
            body_styles: List of body styles to include
            scrape_details: Whether to scrape individual listing pages
            days: Only include auctions ended within the last N days

        Returns:
            List of listing dictionaries
        """
        await self.start()

        # Calculate cutoff date if days parameter is specified
        cutoff_date = None
        if days:
            cutoff_date = datetime.now() - timedelta(days=days)
            print(f"Filtering to auctions ended after: {cutoff_date.strftime('%Y-%m-%d')}")

        try:
            # Navigate to filtered results
            await self.navigate_to_results(start_year=start_year, body_styles=body_styles)

            # Get total pages (note: may be underestimate due to pagination showing subset)
            estimated_pages = await self.get_total_pages()
            if max_pages:
                pages_to_scrape = max_pages
                print(f"Estimated {estimated_pages}+ pages, scraping {pages_to_scrape} (user limit)")
            else:
                # No limit - follow Next button until end or date cutoff
                pages_to_scrape = 999999  # Large number - will stop when Next is disabled or date cutoff hit
                print(f"Estimated {estimated_pages}+ pages, scraping until date cutoff reached")

            all_listings = []
            consecutive_failures = 0
            max_consecutive_failures = 3

            for page_num in range(1, pages_to_scrape + 1):
                print(f"\nScraping page {page_num}...")

                # Scrape current page with date filtering
                listings, should_continue = await self.scrape_listing_page(cutoff_date)
                print(f"  Found {len(listings)} listings within date range on page {page_num}")

                if len(listings) == 0:
                    if not should_continue:
                        print(f"  Reached auctions older than {days} days - stopping")
                        break
                    consecutive_failures += 1
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"  {max_consecutive_failures} consecutive empty pages - stopping")
                        break
                else:
                    consecutive_failures = 0
                    all_listings.extend(listings)

                # Stop if we've hit the date cutoff
                if not should_continue:
                    print(f"  Reached auctions older than {days} days - stopping")
                    break

                # Navigate to next page if not last
                if page_num < pages_to_scrape:
                    try:
                        next_btn = await self.page.query_selector('button:has-text("Next")')
                        if next_btn and await next_btn.is_enabled():
                            await next_btn.click()
                            # Wait for page to load new content
                            try:
                                await self.page.wait_for_load_state("networkidle", timeout=30000)
                            except Exception:
                                # Fallback to fixed delay if networkidle times out
                                await asyncio.sleep(self.delay + 2)
                            await asyncio.sleep(self.delay)
                        else:
                            print("No more pages available")
                            break
                    except Exception as e:
                        print(f"Error navigating to next page: {e}")
                        break

            print(f"\nTotal listings found within {days} days: {len(all_listings)}")

            # Scrape detail pages
            if scrape_details and all_listings:
                print(f"\nScraping {len(all_listings)} detail pages...")
                for i, listing in enumerate(all_listings):
                    if listing.get('url'):
                        title = listing.get('title', 'Unknown')
                        # Handle Unicode characters that Windows console can't display
                        try:
                            print(f"  [{i+1}/{len(all_listings)}] {title}")
                        except UnicodeEncodeError:
                            print(f"  [{i+1}/{len(all_listings)}] {title.encode('ascii', 'replace').decode()}")
                        details = await self.scrape_detail_page(listing['url'])
                        listing.update(details)

            self.listings = all_listings
            return all_listings

        finally:
            await self.stop()

    def export_csv(self, filename: str = "carsandbids_7day.csv"):
        """Export scraped data to CSV."""
        if not self.listings:
            print("No data to export")
            return

        # Define column order
        columns = [
            'year', 'make', 'model', 'full_title', 'mileage', 'sale_price', 'sold',
            'transmission', 'drivetrain', 'engine', 'body_style',
            'exterior_color', 'interior_color', 'title_status', 'location',
            'num_bids', 'num_views', 'num_watchers', 'is_no_reserve',
            'modifications', 'known_flaws', 'end_date', 'url', 'image_url'
        ]

        # Create DataFrame
        df = pd.DataFrame(self.listings)

        # Reorder columns (only include columns that exist)
        existing_cols = [c for c in columns if c in df.columns]
        extra_cols = [c for c in df.columns if c not in columns]
        df = df[existing_cols + extra_cols]

        # Export
        df.to_csv(filename, index=False)
        print(f"Exported {len(df)} listings to {filename}")

        return df

    def export_excel(self, filename: str = "carsandbids_7day.xlsx"):
        """Export scraped data to Excel with formatting."""
        if not self.listings:
            print("No data to export")
            return

        df = pd.DataFrame(self.listings)

        with pd.ExcelWriter(filename, engine='openpyxl') as writer:
            # Main data sheet
            df.to_excel(writer, sheet_name='Listings', index=False)

            # Summary stats sheet
            if 'make' in df.columns and 'sale_price' in df.columns:
                summary = df.groupby('make').agg({
                    'sale_price': ['count', 'mean', 'median', 'min', 'max'],
                    'mileage': ['mean', 'median']
                }).round(0)
                summary.columns = ['_'.join(col) for col in summary.columns]
                summary.to_excel(writer, sheet_name='Summary by Make')

        print(f"Exported {len(df)} listings to {filename}")

        return df


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Scrape Cars & Bids past auctions (incremental/date-filtered version)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Weekly scrape (last 7 days):
    python carsandbids_scraper_7day.py --days 7 --output weekly_update

  Biweekly scrape (last 14 days):
    python carsandbids_scraper_7day.py --days 14 --output biweekly_update

  Debug mode (visible browser):
    python carsandbids_scraper_7day.py --days 7 --visible --output test_data
        """
    )
    parser.add_argument('--days', type=int, required=True,
                        help='Only scrape auctions ended within the last N days (required)')
    parser.add_argument('--pages', type=int, default=None,
                        help='Maximum pages to scrape (default: no limit, stops at date cutoff)')
    parser.add_argument('--output', type=str, default='carsandbids_7day',
                        help='Output filename without extension')
    parser.add_argument('--year', type=int, default=None,
                        help='Minimum model year (default: no filter)')
    parser.add_argument('--all-years', action='store_true',
                        help='Include all years (overrides --year)')
    parser.add_argument('--no-details', action='store_true',
                        help='Skip scraping detail pages (faster but less data)')
    parser.add_argument('--visible', action='store_true',
                        help='Show browser window (for debugging)')
    args = parser.parse_args()

    # Validate days parameter
    if args.days < 1:
        print("Error: --days must be at least 1")
        sys.exit(1)

    # Handle year filter
    start_year = None if args.all_years else args.year

    print("=" * 60)
    print("Cars & Bids Auction Scraper - Incremental/7-Day Version")
    print("=" * 60)
    print(f"Settings:")
    print(f"  - Days to look back: {args.days}")
    print(f"  - Max pages: {args.pages or 'no limit (stops at date cutoff)'}")
    print(f"  - Minimum year: {start_year or 'all years'}")
    print(f"  - Body styles: Sedan, SUV, Wagon")
    print(f"  - Scrape details: {not args.no_details}")
    print("=" * 60)

    scraper = CarsAndBidsScraper(headless=not args.visible, delay=1.5)

    try:
        listings = await scraper.scrape(
            max_pages=args.pages,
            start_year=start_year,
            scrape_details=not args.no_details,
            days=args.days
        )

        if listings:
            # Export to both CSV and Excel
            scraper.export_csv(f"{args.output}.csv")
            scraper.export_excel(f"{args.output}.xlsx")

            print(f"\nDone! Scraped {len(listings)} listings from the last {args.days} days.")
            print(f"Output files:")
            print(f"  - {args.output}.csv")
            print(f"  - {args.output}.xlsx")
        else:
            print(f"\nNo listings found within the last {args.days} days.")

    except KeyboardInterrupt:
        print("\nScraping interrupted by user.")
    except Exception as e:
        print(f"\nError: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
