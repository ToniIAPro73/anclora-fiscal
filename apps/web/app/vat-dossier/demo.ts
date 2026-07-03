import type { VatDossierResult } from '@anclora/core/server';
import { createVatDossier } from '@anclora/core/server';
import { buildDemoInvoices } from '../invoicing/demo';

export async function buildDemoDossier(): Promise<VatDossierResult> {
  const { original } = await buildDemoInvoices();
  return createVatDossier({
    period: '2026-T3-DEMO',
    invoices: [{
      number: original.number,
      issuedAt: original.input.issuedAt,
      type: original.type,
      country: 'ES',
      channel: 'shopify',
      taxBase: original.input.taxBase,
      taxRate: original.input.taxRate,
      taxAmount: original.input.taxAmount,
      totalAmount: original.input.totalAmount,
      currency: original.input.currency,
      evidenceHash: original.sha256,
    }],
    issues: [{ code: 'AI1001_REFUND_REVIEW', severity: 'HIGH', status: 'OPEN' }],
    verifactuStatuses: { ACCEPTED: 1, REJECTED: 1 },
  });
}
