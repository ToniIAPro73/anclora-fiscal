import { expect, test } from '@playwright/test';

const enabledNavItems = [
  ['Centro de control', '/'],
  ['Importaciones', '/imports'],
  ['Ventas Shopify', '/sales/shopify'],
  ['Conciliación', '/reconciliation'],
  ['Facturación', '/invoicing'],
  ['VERI*FACTU', '/verifactu'],
  ['Reglas fiscales', '/tax-rules'],
  ['Periodos fiscales', '/tax-periods'],
  ['Configuración', '/settings'],
] as const;

const comingSoonNavItems = ['Liquidaciones KDP', 'Registros'] as const;

const legacyRedirects = [
  ['/operations', '/sales/shopify'],
  ['/vat-dossier', '/tax-periods'],
  ['/tax-engine', '/tax-rules'],
] as const;

test.describe('sidebar navigation', () => {
  for (const [, href] of enabledNavItems) {
    test(`sidebar renders on ${href}`, async ({ page }) => {
      await page.goto(href);
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
      for (const [label] of enabledNavItems) {
        await expect(page.getByRole('link', { name: new RegExp(label.replaceAll('*', '\\*')) })).toBeVisible();
      }
    });
  }

  test('clicking each enabled nav item navigates to the right route', async ({ page }) => {
    await page.goto('/');
    for (const [label, href] of enabledNavItems) {
      await page.getByRole('link', { name: new RegExp(label.replaceAll('*', '\\*')) }).click();
      await expect(page).toHaveURL(href);
    }
  });

  for (const [from, to] of legacyRedirects) {
    test(`${from} redirects to ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }

  test('comingSoon items are disabled and not navigable', async ({ page }) => {
    await page.goto('/');
    for (const label of comingSoonNavItems) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0);
      const disabledItem = page.getByText(label).locator('xpath=ancestor-or-self::span[@aria-disabled="true"]').first();
      await expect(disabledItem).toBeVisible();
    }
  });

  test('pending-count badge reflects dashboard summary data', async ({ page }) => {
    await page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        openIssuesCount: 2,
        importsThisMonthCount: 3,
        reconciliationStatus: { matched: 1, unmatched: 3, total: 4 },
        documentsIssuedCount: 1,
        royalties: { statementsCount: 1, totalThisPeriod: '10.00', period: '2026-07' },
      }),
    }));
    await page.goto('/');
    await expect(page.getByLabel('4 pendientes')).toBeVisible();
  });
});
