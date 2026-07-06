import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd(), '../..');

const previewResponse = {
  jobId: 'e2e-job-1',
  connector: 'shopify-orders-csv',
  status: 'ANALYZED',
  summary: { records: 1, issues: 1, orderIds: ['AI-9001'] },
  issues: [{ position: 1, code: 'ORDER_TOTAL_MISMATCH', message: 'El total no coincide con el neto comercial', suggestedAction: 'Revisa el pedido AI-9001 antes de confirmar' }],
  shopifyOrders: { orders: [{ orderName: 'AI-9001', commercialDate: '2026-07-01T00:00:00.000Z', totalAmount: '19.99', taxAmount: '1.99', financialStatus: 'paid', lines: [{ title: 'Libro digital', quantity: '1', unitPrice: '19.99', discountAmount: '0', subtotalAmount: '19.99' }] }] },
};

const confirmResponse = { jobId: 'e2e-job-1', status: 'IMPORTED', createdRecordIds: { orders: ['ord-9001'] } };

test.describe('importación — Shopify Pedidos: previsualizar y confirmar', () => {
  test('flujo completo: seleccionar → previsualizar → reconocer incidencia bloqueante → confirmar', async ({ page }) => {
    await page.route('**/api/v1/imports/preview', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(previewResponse),
    }));
    await page.route('**/api/v1/imports/e2e-job-1/confirm', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(confirmResponse),
    }));

    await page.goto('/imports');
    const ordersCard = page.getByRole('article', { name: 'Shopify — Pedidos' });
    await ordersCard.locator('input[type="file"]').setInputFiles(resolve(repositoryRoot, 'packages/connectors/test/fixtures/shopify-orders-four.csv'));
    await ordersCard.getByRole('button', { name: 'Generar vista previa' }).click();

    await expect(ordersCard.getByText('AI-9001', { exact: true })).toBeVisible();
    await expect(ordersCard.getByText('Fila 1 — ORDER_TOTAL_MISMATCH', { exact: true })).toBeVisible();

    const confirmButton = ordersCard.getByRole('button', { name: 'Confirmar importación' });
    await expect(confirmButton).toBeDisabled();
    await ordersCard.getByRole('checkbox').click();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(ordersCard.getByText('Importado')).toBeVisible();
    await expect(ordersCard.getByText(/Próximos pasos/)).toBeVisible();
  });

  test('rechaza un tipo de archivo no admitido', async ({ page }) => {
    await page.goto('/imports');
    const ordersCard = page.getByRole('article', { name: 'Shopify — Pedidos' });
    await ordersCard.locator('input[type="file"]').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('contenido no admitido') });
    await ordersCard.getByRole('button', { name: 'Generar vista previa' }).click();
    await expect(ordersCard.getByText('El archivo no supera la validación estructural')).toBeVisible();
  });
});

test('muestra tres tarjetas Shopify con contratos separados', async ({ page }) => {
  await page.goto('/imports');
  await expect(page.getByRole('article', { name: 'Shopify — Pedidos' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Shopify — Transacciones de pedido' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Shopify Payments — Ledger y liquidación' })).toBeVisible();
});

test.describe('importación — Amazon KDP Regalías: previsualizar', () => {
  test('XLSX muestra clasificación y filas agrupadas', async ({ page }) => {
    await page.route('**/api/v1/imports/preview', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId: 'e2e-job-2',
        connector: 'kdp-xlsx',
        status: 'ANALYZED',
        summary: { records: 1, issues: 0, orderIds: ['9798184523026'] },
        issues: [],
        royalty: {
          statement: { periods: ['2026-06'] },
          lines: [{ isbnOrAsin: '9798184523026', title: 'Mi libro', classification: 'ebook', unitsNet: 3, amount: 7.5, currency: 'EUR', format: 'ebook', date: '2026-06-15' }],
        },
      }),
    }));

    await page.goto('/imports');
    const kdpCard = page.getByRole('article', { name: 'Amazon KDP — Regalías' });
    await kdpCard.locator('input[type="file"]').setInputFiles(resolve(repositoryRoot, 'packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx'));
    await kdpCard.getByRole('button', { name: 'Generar vista previa' }).click();
    await expect(kdpCard.getByText('9798184523026', { exact: true })).toBeVisible();
    await expect(kdpCard.getByText('Mi libro')).toBeVisible();
  });
});
