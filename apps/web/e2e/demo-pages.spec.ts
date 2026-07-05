import { expect, test } from '@playwright/test';

const routes = [
  ['/', 'Centro de control'],
  ['/imports', 'Bandeja de importaciones'],
  ['/sales/shopify', 'Ventas Shopify'],
  ['/reconciliation', 'Conciliación'],
  ['/invoicing', 'Facturación'],
  ['/verifactu', 'VERI*FACTU'],
  ['/tax-rules', 'Reglas fiscales'],
  ['/tax-periods', 'Periodos fiscales'],
  ['/settlements/kdp', 'Liquidaciones KDP'],
  ['/registers', 'Registros'],
  ['/settings', 'Configuración'],
] as const;

for (const [route, heading] of routes) {
  test(`${route} renderiza sin errores de consola`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
