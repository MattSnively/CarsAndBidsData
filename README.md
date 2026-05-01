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
   │  (scripts/merge_master.py — dedupes by url, aligns to master schema)
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

The dashboard self-updates weekly. The
[Weekly scrape workflow](.github/workflows/weekly-scrape.yml) runs every
Saturday at 12:00 UTC (07:00 ET / 08:00 EDT — after Friday's last 5pm-ET
auction has settled) and:

1. Scrapes the last 7 days of past auctions with the Playwright scraper
2. Merges new (deduped-by-`url`) listings into `data/carsandbids_master.csv`
3. Rebuilds `public/data/auctions.json`
4. Commits both files back to `main` with a message like
   `Weekly data update 2026-05-04 (87 new listings)`
5. Triggers the Deploy workflow so the live dashboard reflects the new data

GitHub emails the repo owner if any step fails. The master CSV is the
source of truth — the auto-commit always preserves existing rows and only
adds new ones.

### Triggering manually

To run an off-schedule scrape (e.g., to test changes or catch up after a
failed run):

```bash
gh workflow run "Weekly scrape" --ref main
```

Or use the **Run workflow** button on the
[workflow page](https://github.com/MattSnively/CarsAndBidsData/actions/workflows/weekly-scrape.yml).

### Manual fallback (if the workflow is broken)

```bash
# 1. Install deps once
pip install -r requirements.txt
python -m playwright install chromium

# 2. Scrape, merge, rebuild
python scripts/carsandbids_scraper_7day.py --days 7 --output weekly_update
python scripts/merge_master.py weekly_update.csv data/carsandbids_master.csv
python scripts/build_data.py

# 3. Commit and push (auto-triggers deploy)
git add data/carsandbids_master.csv public/data/auctions.json
git commit -m "Manual data update $(date +%Y-%m-%d)"
git push
```

## Project structure

```
.
├── .github/workflows/
│   ├── deploy.yml                       ← build + deploy to Pages on push to main
│   └── weekly-scrape.yml                ← Saturday cron: scrape → merge → rebuild → deploy
├── data/carsandbids_master.csv          ← source of truth (committed)
├── public/data/auctions.json            ← packed dataset (committed, built artifact)
├── scripts/
│   ├── build_data.py                    ← master CSV → packed JSON
│   ├── carsandbids_scraper_7day.py      ← Playwright scraper (incremental)
│   └── merge_master.py                  ← dedup-and-append into master CSV
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
