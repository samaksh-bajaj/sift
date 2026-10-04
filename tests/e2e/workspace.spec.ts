import { expect, test } from '@playwright/test';
test('apartment comparison, evidence, edit, dynamic field and export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Edmonton Apartments', exact: true }),
  ).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page
    .getByRole('textbox', { name: 'Ask or filter' })
    .fill('under $1300 with parking');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Garneau Place', exact: true })
    .click();
  await expect(page.getByText('“rent: 1250”')).toBeVisible();
  const rent = page.locator('.field-detail').filter({
    has: page.getByRole('heading', { name: 'Monthly rent', exact: true }),
  });
  await rent.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit Monthly rent' }).fill('1225');
  await rent.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    rent.getByText('Manually edited', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByRole('textbox', { name: 'Field name' }).fill('Balcony');
  await page
    .getByRole('button', { name: 'Add field', exact: true })
    .last()
    .click();
  await page
    .getByRole('button', { name: 'Garneau Place', exact: true })
    .click();
  const balcony = page.locator('.field-detail').filter({
    has: page.getByRole('heading', { name: 'Balcony', exact: true }),
  });
  await balcony.getByRole('button', { name: 'Check source' }).click();
  await expect(
    balcony.getByText('No supporting information found.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'XLSX', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Edmonton Apartments.xlsx');
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(
    page.getByRole('button', {
      name: '$1,225.00 Manually edited',
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('project creation persists, rename and delete', async ({ page }) => {
  await page.goto('/projects');
  await page
    .getByRole('button', { name: 'New project', exact: true })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Project name' })
    .fill('Laptop shortlist');
  await page.getByLabel('Start with a template').selectOption('products');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Laptop shortlist', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Project settings' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Work laptop');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(
    page.getByRole('heading', { name: 'Work laptop', exact: true }),
  ).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Project settings' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await expect(
    page.getByRole('heading', { name: 'All projects.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work laptop' })).toHaveCount(
    0,
  );
});
test('mobile layout has no page overflow and dialog remains usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Visible columns' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('desktop screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
