import { expect, test } from '@playwright/test';

test('static viewer loads and renders a WebGL canvas', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/viewer/index.html');
  await page.locator('#loading.hidden').waitFor({ timeout: 30_000 });

  await expect(page).toHaveTitle(/Sligo|Geology|Digital Twin/i);

  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(100);
  expect(box?.height).toBeGreaterThan(100);

  const criticalErrors = consoleErrors.filter((error) => {
    const text = error.toLowerCase();
    return !text.includes('webgl') && !text.includes('satellite imagery failed');
  });
  expect(criticalErrors).toEqual([]);
});
