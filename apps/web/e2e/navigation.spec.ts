import { expect, test } from '@playwright/test';

function mockDashboardSummary(page: import('@playwright/test').Page, hasPayoutData: boolean) {
  return page.route('**/api/v1/dashboard/summary', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      openIssuesCount: 2,
      importsThisMonthCount: 3,
      reconciliationStatus: { matched: 1, unmatched: 3, total: 4 },
      documentsIssuedCount: 1,
      royalties: { statementsCount: 1, totalThisPeriod: '10.00', period: '2026-07' },
      hasPayoutData,
    }),
  }));
}

// FASE 03: "Conciliación" only renders once the tenant has a confirmed
// Shopify Payments import (hasPayoutData). Every test below mocks the
// dashboard-summary endpoint with hasPayoutData: true so the pre-existing
// nav assertions (written before the gating behavior existed) keep holding —
// the dedicated gating tests at the bottom cover the hasPayoutData: false case.
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
      await mockDashboardSummary(page, true);
      await page.goto(href);
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
      for (const [label] of enabledNavItems) {
        await expect(page.getByRole('link', { name: new RegExp(label.replaceAll('*', '\\*')) })).toBeVisible();
      }
    });
  }

  test('clicking each enabled nav item navigates to the right route', async ({ page }) => {
    await mockDashboardSummary(page, true);
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
    await mockDashboardSummary(page, true);
    await page.goto('/');
    for (const label of comingSoonNavItems) {
      await expect(page.getByRole('link', { name: label })).toHaveCount(0);
      const disabledItem = page.getByText(label).locator('xpath=ancestor-or-self::span[@aria-disabled="true"]').first();
      await expect(disabledItem).toBeVisible();
    }
  });

  test('pending-count badge reflects dashboard summary data', async ({ page }) => {
    await mockDashboardSummary(page, true);
    await page.goto('/');
    await expect(page.getByLabel('4 pendientes')).toBeVisible();
  });

  test('Conciliación is hidden when the tenant has no payout data', async ({ page }) => {
    await mockDashboardSummary(page, false);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Conciliación/ })).toHaveCount(0);
  });

  test('Conciliación appears once the tenant has confirmed payout data', async ({ page }) => {
    await mockDashboardSummary(page, true);
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Conciliación/ })).toBeVisible();
  });
});
