import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// UI tests run against sample data (e2e/fixtures). Slots in the sample: €0–25: 2, €25–50: 1, €50–100: 1, €100–250: 1, €500–1000: 1, no price: 1.
const sample = readFileSync(new URL('./fixtures/sample-cards.json', import.meta.url), 'utf8');

async function open(page: Page) {
  await page.route('**/cards.json', (r) => r.fulfill({ body: sample, contentType: 'application/json' }));
  await page.route('https://github.com/**', (r) => r.fulfill({ body: 'github', contentType: 'text/plain' }));
  await page.goto('/');
  await expect(page.locator('.tile').first()).toBeVisible();
}
const names = (page: Page) => page.locator('.tile-name').allTextContents();
const chip = (page: Page, label: RegExp) => page.locator('.chip').filter({ hasText: label });

test('no horizontal scroll at phone width', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('price slots: select several, "All" resets', async ({ page }) => {
  await open(page);
  await chip(page, /^€0–25/).click();
  await expect(page.locator('.tile')).toHaveCount(2);
  await chip(page, /^€500–1000/).click();
  await expect(page.locator('.tile')).toHaveCount(3);
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'false');
  await chip(page, /^All/).click();
  await expect(page.locator('.tile')).toHaveCount(7);
  await expect(chip(page, /^All/)).toHaveAttribute('aria-pressed', 'true');
});

test('search looks through every card, whatever slots are selected', async ({ page }) => {
  await open(page);
  await chip(page, /^€0–25/).click();
  await page.getByPlaceholder('Search all cards').fill('charizard');
  expect((await names(page)).sort()).toEqual(['Charizard (sample)', 'Charizard ex (sample)']);
  await expect(page.locator('.count')).toContainText('2 found in all cards');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.tile')).toHaveCount(2);
});

test('a card opens at the top, links first, and "Cards" goes back', async ({ page }) => {
  await open(page);
  await page.mouse.wheel(0, 600);
  await page.locator('.tile').nth(5).click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('button', { name: 'Cards' })).toBeInViewport();
  await expect(detail.getByRole('link', { name: /Cardmarket/ })).toBeInViewport();
  await expect(detail.getByRole('link', { name: /PriceCharting/ })).toBeInViewport();
  await expect(detail.getByRole('heading', { level: 2 })).toBeInViewport();
  expect(await page.locator('.detail-scroll').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.locator('.detail-scroll').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/detail-top.png' });
  await detail.getByRole('button', { name: 'Cards' }).click();
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
  await d.getByRole('button', { name: 'Cards' }).click();
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

test('add a card opens a filled-in GitHub form and waits for it', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add a card' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Fetch prices' })).toBeDisabled();
  const fetchLink = sheet.getByRole('link', { name: 'Fetch prices' });
  await sheet.getByLabel('Card name').fill('Umbreon VMAX');
  await sheet.getByLabel('Set').fill('Evolving Skies');
  await sheet.getByLabel('Card number').fill('215');
  const href = await fetchLink.getAttribute('href');
  expect(href).toContain('/issues/new?');
  expect(href).toContain('template=add-card.yml');
  expect(href).toContain('name=Umbreon+VMAX');
  const popup = page.waitForEvent('popup');
  await fetchLink.click();
  await (await popup).close();
  await expect(sheet.getByText('Fetching prices')).toBeVisible();
  await expect(sheet.locator('.list')).toContainText('Umbreon VMAX');
  await page.screenshot({ path: 'test-results/add-sheet.png' });
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
