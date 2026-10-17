# Slab Scout

Phone-first scanner for Pokémon cards worth grading, built for vendor booths. Live at https://liminalboaz.github.io/PSA10Multiple/.

- **Raw price:** average of the 10 cheapest Near Mint English copies on Cardmarket. "est." = Cardmarket's own estimate (until live listings are fetched); "yours" = a price you entered.
- **Graded prices:** PriceCharting (US) Grade 8, Grade 9 and PSA 10, in euros.
- **Max buy:** the most you can pay and still break even if the card grades 9.
- **Modern 2020+ toggle:** only cards from sets released in the last six years.
- **On your phone:** grading fee (in €), removed cards and your own prices are saved on the device. Works offline after the first visit; add it to the home screen.

## Add a card

Tap **+**, search by name and number (e.g. `raichu 211`) or name and set (`raichu paldea`), tap the right card (results show the image) and tap **Add**. Prices appear in the app in about 5 minutes. Can't find it? "Enter it yourself" takes name, set, number and optional PriceCharting/Cardmarket links.

- **One-tap:** in Settings → *One-tap adding*, follow the pre-filled link to create a fine-grained GitHub token (Issues: Read and write, only this repository) and paste it. It is stored only on that phone. Without it, **Continue on GitHub** opens the pre-filled form; tap *Create*.
- Every add is an "Add card: …" issue. The *Add card* workflow picks up all open requests from the owner or collaborators, fetches PriceCharting, TCGdex and Cardmarket (live listings need the `APIFY_TOKEN` secret), commits, redeploys and closes the requests.

## Remove a card for everyone

Add its id to `data/excluded.json` (e.g. `"umbreon-skyridge-h30"`) and run `npm run data:build`. Removing a card in the app only hides it on that phone.

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
