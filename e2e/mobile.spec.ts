import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// UI tests run against sample data (e2e/fixtures). The real cards.json is never needed here.
const sample = readFileSync(new URL('./fixtures/sample-cards.json', import.meta.url), 'utf8');

async function open(page: Page) {
  await page.route('**/cards.json', (r) => r.fulfill({ body: sample, contentType: 'application/json' }));
  await page.goto('/');
  await expect(page.locator('.tile').first()).toBeVisible();
}

test('no horizontal scroll at phone width', async ({ page }) => {
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('price chip → card → detail in three taps', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /€100–250/ }).click();
  const tiles = page.locator('.tile');
  await expect(tiles).toHaveCount(1);
  await tiles.first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Max buy · PSA 9 safe')).toBeVisible();
  for (const g of ['PSA 8', 'PSA 9', 'PSA 10']) await expect(sheet.getByRole('rowheader', { name: g })).toBeVisible();
  await expect(sheet.getByText('Netherlands')).toBeVisible();
  // Charizard ex (sample): PSA 9 $210 × 0.9 − $25 × 0.9 = €166.50
  await expect(sheet.locator('.big')).toHaveText('€167');
  await page.screenshot({ path: 'test-results/sheet-light.png' });
});

test('phone back gesture closes the sheet', async ({ page }) => {
  await open(page);
  await page.locator('.tile').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('search narrows the list', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByPlaceholder('Search name, set or number').fill('charizard');
  await expect(page.locator('.tile')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^All/ })).toContainText('2');
});

test('default sort puts the biggest PSA 10 profit first, cards without EU price last', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^All/ }).click();
  const names = await page.locator('.tile-name').allTextContents();
  expect(names[0]).toBe('Charizard (sample)');
  expect(names.at(-1)).toBe('Lugia V (sample)');
});

test('changing the grading fee updates max buy', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /€100–250/ }).click();
  await page.getByRole('button', { name: /^Fee \$/ }).click();
  await page.getByLabel('US dollars').fill('50');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.tile').first().click();
  // $210 × 0.9 − $50 × 0.9 = €144
  await expect(page.getByRole('dialog').locator('.big')).toHaveText('€144');
});

test('dark mode screenshot', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await open(page);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.screenshot({ path: 'test-results/grid-dark.png' });
  await page.locator('.tile').first().click();
  await page.screenshot({ path: 'test-results/sheet-dark.png' });
  await ctx.close();
});

test('grid light screenshot', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.screenshot({ path: 'test-results/grid-light.png' });
});

// Offline check needs the real published data, so it only runs after `npm run data`.
test('works offline after first visit', async ({ browser }) => {
  test.skip(!existsSync('dist/cards.json'), 'needs real data in dist/cards.json');
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
  await ctx.close();
});
