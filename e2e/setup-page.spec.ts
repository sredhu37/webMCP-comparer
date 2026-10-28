import { test, expect } from '@playwright/test';

// Walkthrough of the Setup page. Doubles as a smoke test and as the demo video.
test('setup page: pick scenarios and provider', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Valid Suite, 4 Scenarios')).toBeVisible();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByText('4 of 4 selected')).toBeVisible();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'Select none' }).click();
  await expect(page.getByText('0 of 4 selected')).toBeVisible();
  await page.waitForTimeout(800);

  await page.getByLabel('Provider').selectOption('openai');
  await page.waitForTimeout(800);

  await expect(page.getByRole('button', { name: /^Run/ })).toBeDisabled();
  await page.waitForTimeout(800);
});
