import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// UI tests run against sample data (e2e/fixtures). Slots in the sample: €0–50: 3, €50–100: 1, €100–250: 1, €500+: 1, no price: 1.
const sample = readFileSync(new URL('./fixtures/sample-cards.json', import.meta.url), 'utf8');

async function open(page: Page) {
  await page.route('**/cards.json', (r) => r.fulfill({ body: sample, contentType: 'application/json' }));
  await page.route('https://github.com/**', (r) => r.fulfill({ body: 'github', contentType: 'text/plain' }));
  // Card search (TCGdex) for "Add a card", sample answers only.
  await page.route('https://api.tcgdex.net/v2/en/sets', (r) =>
    r.fulfill({ json: [{ id: 'swsh7', name: 'Evolving Skies' }, { id: 'sv02', name: 'Paldea Evolved' }] }),
  );
  const tcgdexCards: Record<string, object[]> = {
    umbreon: [{ id: 'swsh7-215', localId: '215', name: 'Umbreon VMAX', image: 'https://assets.tcgdex.net/en/swsh/swsh7/215' }],
    'umbreon vmax': [{ id: 'swsh7-215', localId: '215', name: 'Umbreon VMAX', image: 'https://assets.tcgdex.net/en/swsh/swsh7/215' }],
    raichu: [
      { id: 'sv02-63', localId: '063', name: 'Raichu' },
      { id: 'sv02-211', localId: '211', name: 'Raichu' },
      { id: 'swsh7-50', localId: '050', name: 'Raichu' },
    ],
  };
  await page.route('https://api.tcgdex.net/v2/en/cards?**', (r) => r.fulfill({ json: tcgdexCards[new URL(r.request().url()).searchParams.get('name') ?? ''] ?? [] }));
  await page.route('https://assets.tcgdex.net/**', (r) => r.fulfill({ status: 404 }));
  await page.goto('/');
  await expect(page.locator('.tile').first()).toBeVisible();
}
const names = (page: Page) => page.locator('.tile-name').allTextContents();
const chip = (page: Page, label: RegExp) => page.locator('.chip').filter({ hasText: label });

test('no horizontal scroll at phone width', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  for (const sel of ['#q', '.toolbar', '.brand']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.x + box.width, sel).toBeLessThanOrEqual(390);
  }
});

test('price slots: select several, "All" resets', async ({ page }) => {
  await open(page);
  await expect(page.locator('.chip')).toHaveText(['All', '€0–503', '€50–1001', '€100–2501', '€250–5000', '€500+1']);
  await chip(page, /^€0–50/).click();
  await expect(page.locator('.tile')).toHaveCount(3);
  await chip(page, /^€500\+/).click();
  await expect(page.locator('.tile')).toHaveCount(4);
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'false');
  await chip(page, /^All/).click();
  await expect(page.locator('.tile')).toHaveCount(7);
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
});

test('search looks through every card, whatever slots are selected', async ({ page }) => {
  await open(page);
  await chip(page, /^€0–50/).click();
  await page.getByPlaceholder('Search all cards').fill('charizard');
  expect((await names(page)).sort()).toEqual(['Charizard (sample)', 'Charizard ex (sample)']);
  await expect(page.locator('.count')).toContainText('2 found in all cards');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.tile')).toHaveCount(3);
  await expect(page.locator('.count')).toHaveText('3 cards');
});

test('a card opens as a sheet at the top, links first, and "Close" goes back', async ({ page }) => {
  await open(page);
  await page.mouse.wheel(0, 600);
  await page.locator('.tile').nth(5).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('button', { name: 'Close' })).toBeInViewport();
  await expect(detail.getByRole('link', { name: /Cardmarket/ })).toBeInViewport();
  await expect(detail.getByRole('link', { name: /PriceCharting/ })).toBeInViewport();
  await expect(detail.getByRole('heading', { level: 2 })).toBeInViewport();
  expect(await page.locator('.detail-scroll').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.locator('.detail-scroll').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/detail-top.png' });
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('tapping the dimmed list above the sheet closes it', async ({ page }) => {
  await open(page);
  await page.locator('.tile').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(195, 8);
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the phone back gesture closes a card', async ({ page }) => {
  await open(page);
  await page.locator('.tile').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('detail numbers: Charizard ex (sample) with a €25 fee', async ({ page }) => {
  await open(page);
  await page.getByPlaceholder('Search all cards').fill('charizard ex');
  await page.locator('.tile').first().click();
  const d = page.getByRole('dialog');
  // Grade 9 $210 × 0.9 = €189 − €25 fee = €164
  await expect(d.locator('.maxbuy-value')).toHaveText('€164');
  await expect(d.getByText('Average of the 10 cheapest Near Mint English copies on Cardmarket')).toBeVisible();
  for (const g of ['Grade 8', 'Grade 9', 'PSA 10']) await expect(d.getByRole('rowheader', { name: g })).toBeVisible();
});

test('your own price replaces Cardmarket and can be removed', async ({ page }) => {
  await open(page);
  await page.getByPlaceholder('Search all cards').fill('lugia');
  await expect(page.locator('.tile .raw')).toContainText('No price');
  await page.locator('.tile').first().click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Your price').fill('50,00');
  await d.getByRole('button', { name: 'Use' }).click();
  await expect(d.locator('.stat-value').first()).toHaveText('€50.00');
  await d.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.tile .raw')).toContainText('€50.00');
  await expect(page.locator('.tile .tag')).toHaveText('yours');
  await page.reload();
  await page.getByPlaceholder('Search all cards').fill('lugia');
  await expect(page.locator('.tile .tag')).toHaveText('yours');
  await page.locator('.tile').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use Cardmarket price again' }).click();
  await expect(page.getByRole('dialog').locator('.stat-value').first()).toHaveText('—');
});

test('remove a card, undo, and restore from settings', async ({ page }) => {
  await open(page);
  await page.getByPlaceholder('Search all cards').fill('pikachu');
  await page.locator('.tile').first().click();
  await page.getByRole('button', { name: 'Remove from my list' }).click();
  await expect(page.locator('.tile')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.tile')).toHaveCount(1);
  await page.locator('.tile').first().click();
  await page.getByRole('button', { name: 'Remove from my list' }).click();
  await page.reload();
  await page.getByPlaceholder('Search all cards').fill('pikachu');
  await expect(page.locator('.tile')).toHaveCount(0);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.tile')).toHaveCount(1);
});

test('grading fee is set in euros', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: /Settings/ })).toHaveText('Fee €25');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel('Grading cost per card').fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByPlaceholder('Search all cards').fill('charizard ex');
  await page.locator('.tile').first().click();
  // €189 − €40 = €149
  await expect(page.getByRole('dialog').locator('.maxbuy-value')).toHaveText('€149');
});

test('add a card: search, pick, and open the filled-in GitHub form', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder(/e.g. raichu 211/).fill('umbreon vmax');
  await sheet.getByRole('button', { name: /Umbreon VMAX/ }).click();
  const link = sheet.getByRole('link', { name: 'Continue on GitHub' });
  const href = (await link.getAttribute('href'))!;
  expect(href).toContain('/issues/new?');
  expect(href).toContain('template=add-card.yml');
  expect(href).toContain('tcgdex=swsh7-215');
  expect(href).toContain('set=Evolving+Skies');
  const popup = page.waitForEvent('popup');
  await link.click();
  await (await popup).close();
  await expect(sheet.getByText('Being added')).toBeVisible();
  await expect(sheet.locator('.list')).toContainText('Umbreon VMAX');
});

test('add search understands name + number: "raichu 211"', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder(/e.g. raichu 211/).fill('raichu 211');
  await expect(sheet.locator('.result')).toHaveCount(1);
  await expect(sheet.locator('.result')).toContainText('Paldea Evolved · 211');
  await sheet.getByPlaceholder(/e.g. raichu 211/).fill('raichu paldea');
  await expect(sheet.locator('.result')).toHaveCount(2);
});

test('modern toggle shows only cards from the last six years and is remembered', async ({ page }) => {
  await open(page);
  const toggle = page.getByRole('button', { name: /Modern/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('.tile')).toHaveCount(4);
  await expect(page.locator('.count')).toHaveText('4 cards');
  await page.reload();
  await expect(page.getByRole('button', { name: /Modern/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tile')).toHaveCount(4);
});

test('one-tap add with a saved GitHub token', async ({ page }) => {
  let body = '';
  await page.addInitScript(() => localStorage.setItem('slab-scout:ghToken', JSON.stringify('test-token')));
  await page.route('https://api.github.com/repos/*/*/issues', async (r) => {
    body = r.request().postDataJSON().body;
    await r.fulfill({ status: 201, json: { number: 1 } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder(/e.g. raichu 211/).fill('umbreon');
  await sheet.getByRole('button', { name: /Umbreon VMAX/ }).click();
  await page.screenshot({ path: 'test-results/add-sheet.png' });
  await sheet.getByRole('button', { name: 'Add Umbreon VMAX' }).click();
  await expect(page.getByRole('status')).toContainText('Adding Umbreon VMAX');
  expect(body).toContain('### TCGdex id\n\nswsh7-215');
  expect(body).toContain('### Set\n\nEvolving Skies');
});

test('connect GitHub for one-tap adding in settings', async ({ page }) => {
  await page.route('https://api.github.com/repos/*/*/issues?per_page=1', (r) => r.fulfill({ json: [] }));
  await open(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByPlaceholder('github_pat_…').fill('test-token');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Connected to GitHub')).toBeVisible();
});

test('screenshots: grid light and dark, detail dark', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ colorScheme, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await open(page);
    await page.screenshot({ path: `test-results/grid-${colorScheme}.png` });
    if (colorScheme === 'dark') {
      await page.locator('.tile').first().click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/detail-dark.png' });
    }
    await ctx.close();
  }
});

// Offline check needs the real published data, so it only runs after `npm run data`.
test('works offline after first visit', async ({ browser }) => {
  test.skip(!existsSync('dist/cards.json'), 'needs real data in dist/cards.json');
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.tile').first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
  await ctx.close();
});
