# CarsAndBidsData

Interactive auction analytics dashboard built on 31,253 real Cars & Bids
listings spanning 55 months (Aug 2021 – Feb 2026).

🚀 **Live:** https://mattsnively.github.io/CarsAndBidsData/

Cross-filterable across Overview, Trends, Listings, and Compare tabs. Click
any chart element to filter the dashboard; selections persist across tabs.

## Stack

- **React 18** + **Vite 5** (build tooling)
- **Tailwind CSS** (utility styling)
- **Recharts** (charts)
- **Python + pandas** (build-time data prep, run locally)
- **GitHub Actions** + **GitHub Pages** (deployment)

## First-time setup

```bash
# 1. Clone
git clone https://github.com/MattSnively/CarsAndBidsData.git
cd CarsAndBidsData

# 2. Install dependencies
npm install

# 3. (Optional) Regenerate the packed JSON from the master CSV.
#    auctions.json is already committed, so this only matters after the
#    master CSV (data/carsandbids_master.csv) has been updated.
python scripts/build_data.py

# 4. Start the dev server
npm run dev
```

The dev server runs at http://localhost:5173.

## Deploying to GitHub Pages

The workflow at `.github/workflows/deploy.yml` deploys automatically on
push to `main`. Two-step setup:

1. Push the repo to GitHub (`git push origin main`).
2. In the repo settings → Pages, set **Source** to **GitHub Actions**.
   (Settings → Pages → Build and deployment → Source dropdown.)

That's it. Within a minute or two of the next push, the site will be live
at https://mattsnively.github.io/CarsAndBidsData/.

The workflow runs `npm ci`, then `npm run build` with
`VITE_BASE=/CarsAndBidsData/` (so asset URLs resolve under the
`/CarsAndBidsData/` subpath GitHub Pages serves project pages at), then
uploads the `dist/` directory and deploys it.

### Custom domain or user page later

If you eventually move this to a custom domain or rename to
`mattsnively.github.io` (a user page), edit `.github/workflows/deploy.yml`
and change `VITE_BASE: /CarsAndBidsData/` to `VITE_BASE: /`.

## Data pipeline

```
carsandbids.com
   │  (Playwright scraper, scripts/carsandbids_scraper_7day.py)
   ▼
weekly_update.csv  (transient, gitignored)
   │  (manual dedupe + append by url)
   ▼
data/carsandbids_master.csv  (committed source of truth, ~29 MB)
   │  (scripts/build_data.py)
   ▼
public/data/auctions.json    (committed, ~1.6 MB / ~475 KB gzipped)
   │  (Vite build → GitHub Actions → GitHub Pages)
   ▼
https://mattsnively.github.io/CarsAndBidsData/
```

The dashboard only consumes the packed JSON. `build_data.py` reads the
master CSV, packs each record into a 12-element array, and emits a JSON
keyed by `makes` / `bodies` / `records` / `meta`. Field schema is
documented at the top of `scripts/build_data.py`.

## Updating the data

To refresh the dashboard with newly-ended auctions:

### 1. Install Python dependencies (one-time)

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

### 2. Scrape the last N days

```bash
# Default output: weekly_update.csv (last 7 days)
python scripts/carsandbids_scraper_7day.py --days 7 --output weekly_update
```

The scraper is rate-limited at 1.5s per detail page (don't lower this — it
respects carsandbids.com). Expect ~2 minutes per 50 listings.

### 3. Merge new listings into the master CSV

For now this is a manual deduplicate-and-append step (use Excel, pandas,
or a quick Python script — drop rows whose `url` already appears in
`data/carsandbids_master.csv`, then concat the rest).

A merge helper script will land in a future change.

### 4. Rebuild the packed JSON

```bash
python scripts/build_data.py
```

This reads `data/carsandbids_master.csv` and overwrites
`public/data/auctions.json`.

### 5. Commit and push

```bash
git add data/carsandbids_master.csv public/data/auctions.json
git commit -m "Update auction data (week of YYYY-MM-DD)"
git push
```

GitHub Actions auto-deploys on push to `main`.

## Project structure

```
.
├── .github/workflows/deploy.yml         ← CI/CD (build + deploy to Pages)
├── data/carsandbids_master.csv          ← source of truth (committed)
├── public/data/auctions.json            ← packed dataset (committed, built artifact)
├── scripts/
│   ├── build_data.py                    ← master CSV → packed JSON
│   └── carsandbids_scraper_7day.py      ← Playwright scraper (incremental)
├── src/
│   ├── App.jsx                          ← root, data loading + tab state
│   ├── main.jsx                         ← React entry point
│   ├── data.js                          ← filter logic + aggregations
│   ├── tokens.js                        ← design tokens, formatters, constants
│   ├── components/                      ← Header, Sidebar, ActiveFilterBar, primitives
│   └── tabs/                            ← Overview, Trends, Listings, Compare
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── requirements.txt                     ← Python deps for the data pipeline
```

## Filter semantics

A subtle but important bit of the data model: filters fall into two
categories.

- **Universe filters** (makes, bodies, reserve, transmission, monthRange,
  mileageMax) change which listings exist. They affect both the numerator
  (sold) and denominator (listed) of sell-through rate.
- **Sold-side filters** (priceBands) only narrow the *sold* subset. A
  price band can't apply to an unsold listing because there's no sale
  price.

STR-bearing charts (sell-through rate KPI, monthly STR, reserve tiles) use
universe-filter records. GMV / avg-price / scatter charts use the full
filter set. This is encapsulated in `applyUniverseFilters()` and
`applyAllFilters()` in `src/data.js`.

## Notes

- The master data lives at `data/carsandbids_master.csv` and is committed
  as the source of truth. The packed JSON at `public/data/auctions.json`
  is the built artifact the dashboard consumes; it's also committed so
  the GitHub Actions deploy stays simple (no Python step in CI).
- Bundle size after gzip is ~475 KB for data plus ~150 KB for code — fast
  first load even on slow connections.
- The 31K full dataset means rare exotics (single-listing brands like
  Bugatti, Spyker, etc.) appear in the data but the Compare tab filters
  to makes with ≥30 listings to keep the bubble chart legible.
