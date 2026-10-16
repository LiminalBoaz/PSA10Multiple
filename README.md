# Slab Scout

Phone-first scanner for the PokeViews grading list, built for vendor booths. For every card it shows:

- **Raw (Cardmarket):** the average of the 10 cheapest Near Mint English listings from EU sellers, plus a Netherlands-only average when there are at least 3 NL listings.
- **PSA 8 / 9 / 10:** PriceCharting US sold prices, converted to euros at the ECB rate.
- **Max buy (PSA 9 safe):** PSA 9 price minus the grading fee. Pay less than this and even a 9 breaks even.

The site works offline after the first visit and can be added to the home screen.

## Refresh prices

**From GitHub (easiest):** Actions → **Refresh prices** → Run workflow. It pulls everything, commits the new prices and redeploys. Cardmarket listings need an `APIFY_TOKEN` repository secret (Settings → Secrets and variables → Actions); without it the run keeps the last listings and uses Cardmarket's trend for the rest.

**Locally:**

```sh
npm ci
export APIFY_TOKEN=…             # Cardmarket listings via Apify
export NODE_USE_ENV_PROXY=1      # only behind a proxy
npm run data
git add data public && git commit -m "Refresh prices" && git push
```

| Step | Command | What it does |
| --- | --- | --- |
| Card list | `npm run data:contenders` | PokeViews' grading list (96 cards) → `data/contenders.json` |
| Graded prices | `npm run data:pricecharting` | Finds each card on PriceCharting; keeps the product whose raw and PSA 10 match PokeViews and whose set matches → `data/pricecharting.json` |
| Cardmarket id + trend | `npm run data:tcgdex` | TCGdex links cards to Cardmarket product ids and Cardmarket's daily trend → `data/tcgdex.json` |
| Cardmarket page | `npm run data:cmproducts` | The exact Cardmarket product URL (`/Singles/<Set>/<Card>-V<n>-<CODE><NUMBER>`), from pokemontcg.io or `data/cm-urls.json`, with the card number checked → `data/cmproducts.json` |
| Cardmarket listings | `npm run data:cardmarket [-- --nl] [card-id …]` | Apify `phantom_coder/cardmarket-listings-scraper`: up to 10 cheapest Near Mint English listings (EU-wide; `--nl` adds Netherlands-only) → `data/cardmarket.json` |
| Merge and check | `npm run data:build` | `public/cards.json`, thumbnails, quality report |

How the raw baseline is decided, per card:

1. **Cardmarket listings**: the mean of the 10 cheapest Near Mint English listings. Listings whose seller comment mentions a grade or slab (PSA, BGS, CGC, …) or damage are dropped. Listings are also dropped when the page's card number doesn't match the card or their mean is more than 3× away from the US raw price, which usually means the wrong version of the card.
2. Otherwise **Cardmarket's trend**, but only when two sources agree on the product and the trend is within 0.5–2× the US raw price. These cards are marked "trend" in the app.
3. Otherwise no baseline ("Check CM").

Apify cost: about $0.005 per listing on the free plan. The scraper skips listings priced above 3.5× the US raw price (almost always slabs), and stops before the account's monthly limit.

If a card points at the wrong Cardmarket page, add the right URL to `data/cm-urls.json` and rerun from `data:cmproducts`.

## Develop

```sh
npm run dev        # local site
npm test           # price math and parsers
npm run e2e        # phone-size browser tests (sample data)
```

Stack: Vite, Preact, TypeScript, Vitest, Playwright, vite-plugin-pwa. Deploys to GitHub Pages on every push to `main`.
