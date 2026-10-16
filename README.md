# Slab Scout

Phone-first scanner for the PokeViews grading list, built for vendor booths. For every card it shows:

- **Raw (Cardmarket):** the average of the 10 cheapest Near Mint English listings from EU sellers, plus a Netherlands-only average when there are at least 3 NL listings.
- **PSA 8 / 9 / 10:** PriceCharting US sold prices, converted to euros at the ECB rate.
- **Max buy (PSA 9 safe):** PSA 9 price minus the grading fee. Pay less than this and even a 9 breaks even.

The site works offline after the first visit and can be added to the home screen.

## Refresh prices

```sh
npm ci
export NODE_USE_ENV_PROXY=1      # only needed behind a proxy
export APIFY_TOKEN=…             # for live Cardmarket listings; without it the build falls back to Cardmarket's trend
npm run data                     # PokeViews → PriceCharting → TCGdex → Cardmarket listings → public/cards.json
git add data public && git commit -m "Refresh prices" && git push   # GitHub Pages redeploys
```

| Step | Command | What it does |
| --- | --- | --- |
| Card list | `npm run data:contenders` | PokeViews' grading list (96 cards) → `data/contenders.json` |
| Graded prices | `npm run data:pricecharting` | Finds each card on PriceCharting, keeps the product whose raw and PSA 10 match PokeViews and whose set matches → `data/pricecharting.json` |
| Cardmarket match | `npm run data:tcgdex` | TCGdex links each card to its Cardmarket product id and Cardmarket's daily trend → `data/tcgdex.json` |
| Cardmarket listings | `npm run data:cardmarket [card-id …]` | Apify actor `phantom_coder/cardmarket-listings-scraper`: cheapest NM English listings, EU-wide and NL → `data/cardmarket.json` |
| Merge and check | `npm run data:build` | `public/cards.json`, thumbnails in `public/img/`, quality report |

Cardmarket blocks requests from cloud servers, which is why listings go through Apify (about $5–10 per full refresh).

The build only uses Cardmarket's trend when it is within 0.5–2× the US raw price, and drops listings more than 3× away from it (usually a sign the wrong version of the card was matched). It stops if fewer than 95% of cards have graded prices or fewer than 80% match a Cardmarket product.

## Develop

```sh
npm run dev        # local site
npm test           # price math and parsers
npm run e2e        # phone-size browser tests (sample data)
```

Stack: Vite, Preact, TypeScript, Vitest, Playwright, vite-plugin-pwa. Deploys to GitHub Pages on every push to `main`.
