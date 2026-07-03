import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd(), '../..');

test.describe('vista previa de importaciones', () => {
  test('Shopify CSV muestra VAT de canal y refund total', async ({ page }) => {
    await page.goto('/imports');
    await page.getByLabel('Archivos de evidencia').setInputFiles(resolve(repositoryRoot, '.evidence/payment_transactions_export_1.csv'));
    await page.getByRole('button', { name: 'Generar vista previa' }).click();
    await expect(page.getByRole('heading', { name: 'shopify-csv' })).toBeVisible();
    await expect(page.getByText('PLATFORM_VAT_ZERO_UNVALIDATED').first()).toBeVisible();
    await expect(page.getByText('FULL_REFUND_NET_ZERO')).toBeVisible();
  });

  test('KDP XLSX muestra clasificación y KENP pendiente', async ({ page }) => {
    await page.goto('/imports');
    await page.getByLabel('Archivos de evidencia').setInputFiles(resolve(repositoryRoot, 'packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx'));
    await page.getByRole('button', { name: 'Generar vista previa' }).click();
    await expect(page.getByRole('heading', { name: 'kdp-xlsx' })).toBeVisible();
    await expect(page.getByText('KENP_PENDING_REVIEW')).toBeVisible();
    await expect(page.getByText('9798184523026', { exact: true })).toBeVisible();
  });

  test('rechaza un tipo de archivo no admitido', async ({ page }) => {
    await page.goto('/imports');
    await page.getByLabel('Archivos de evidencia').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('contenido no admitido') });
    await page.getByRole('button', { name: 'Generar vista previa' }).click();
    await expect(page.getByText('El archivo no supera la validación estructural')).toBeVisible();
  });
});
