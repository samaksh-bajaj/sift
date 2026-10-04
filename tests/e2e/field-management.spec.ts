import { expect, test } from '@playwright/test';
test('invalid boolean filters are rejected instead of becoming false', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Field', exact: true })
    .selectOption({ label: 'Parking' });
  await page.getByLabel('Value', { exact: true }).fill('maybe');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'wrong type',
  );
  await page.getByLabel('Value', { exact: true }).fill('false');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Whyte Avenue Studio', exact: true }),
  ).toBeVisible();
});
test('field labels can be edited and existing items populated from snapshots', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page
    .getByRole('button', { name: 'Manage Utilities included', exact: true })
    .click();
  await page.getByLabel('Field label').fill('Included utilities');
  await page.getByRole('button', { name: 'Save label' }).click();
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page
    .getByRole('button', { name: 'Manage Included utilities', exact: true })
    .click();
  await page.getByRole('button', { name: 'Populate existing items' }).click();
  await page
    .getByRole('button', { name: 'Garneau Place', exact: true })
    .click();
  const utilities = page.locator('.field-detail').filter({
    has: page.getByRole('heading', {
      name: 'Included utilities',
      exact: true,
    }),
  });
  await expect(
    utilities.getByText('Heat and water', { exact: true }),
  ).toBeVisible();
  await expect(
    utilities.getByText('“utilities: Heat and water”'),
  ).toBeVisible();
});
