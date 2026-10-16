# Slab Scout

Phone-first scanner for the PokeViews grading list, built for vendor booths. For every card it shows:

- **Raw (Cardmarket):** the average of the 10 cheapest Near Mint English listings from EU sellers, plus a Netherlands-only average when there are at least 3 NL listings.
- **PSA 8 / 9 / 10:** PriceCharting US sold prices, converted to euros at the ECB rate.
- **Max buy (PSA 9 safe):** PSA 9 price minus the grading fee. Pay less than this and even a 9 breaks even.

The site works offline after the first visit and can be added to the home screen.

## Refresh prices

```sh
npm ci
NODE_USE_ENV_PROXY=1 npm run data   # PokeViews → PriceCharting → Cardmarket → public/cards.json
git add public data && git commit -m "Refresh prices" && git push   # GitHub Pages redeploys
```

`npm run data` runs four steps. Each step can be rerun on its own:

| Step | Command | Output |
| --- | --- | --- |
| Card list | `npm run data:contenders` | `data/contenders.json` |
| Graded prices | `npm run data:pricecharting` | `data/pricecharting.json` |
| Cardmarket listings | `npm run data:cardmarket [card-id …]` | `data/cardmarket.json` |
| Merge and check | `npm run data:build` | `public/cards.json`, `public/img/` |

The build step prints a quality report and stops if fewer than 90% of cards have a PSA 10 price or fewer than 80% have Cardmarket listings.

If a card maps to the wrong Cardmarket product, add `"card-id": "https://www.cardmarket.com/en/Pokemon/Products/Singles/…"` to `data/cm-overrides.json`.

## Develop

```sh
npm run dev        # local site
npm test           # price math and parsers
npm run e2e        # phone-size browser tests (sample data)
```

Stack: Vite, Preact, TypeScript, Vitest, Playwright, vite-plugin-pwa. Deploys to GitHub Pages on every push to `main`.
