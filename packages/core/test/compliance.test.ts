import { describe, expect, it } from 'vitest';
import { createIntegrityRecord, createVatDossier, MockVerifactuAdapter, verifyIntegrityChain, verifyVatDossier } from '../src/server';

describe('cadena de integridad', () => {
  it('detecta alteraciones y mantiene el hash anterior', () => {
    const first = createIntegrityRecord({ documentId: '1', documentNumber: 'AF-1', recordType: 'ALTA', issuedAt: '2026-07-03', totalAmount: 6.99, taxAmount: .27 }, '2026-07-03T10:00:00Z');
    const second = createIntegrityRecord({ documentId: '2', documentNumber: 'AR-1', recordType: 'ANULACION', issuedAt: '2026-07-04', totalAmount: -6.99, taxAmount: -.27, previousHash: first.hash }, '2026-07-04T10:00:00Z');
    expect(verifyIntegrityChain([first, second])).toBe(true);
    expect(verifyIntegrityChain([first, { ...second, totalAmount: -5 }])).toBe(false);
  });
  it('impide remitir cuando el flag está apagado', async () => { await expect(new MockVerifactuAdapter(false).submit(createIntegrityRecord({ documentId: '1', documentNumber: 'AF-1', recordType: 'ALTA', issuedAt: '2026-07-03', totalAmount: 1, taxAmount: 0 }, '2026-07-03T10:00:00Z'))).rejects.toThrow('VERIFACTU_NOT_ENABLED'); });
});

describe('expediente IVA', () => {
  const invoice = { number: 'AF-1', issuedAt: '2026-07-03', type: 'FULL_INVOICE' as const, country: 'ES', channel: 'shopify', taxBase: 6.72, taxRate: .04, taxAmount: .27, totalAmount: 6.99, currency: 'EUR', evidenceHash: 'a'.repeat(64) };
  it('genera ZIP verificable con CSV, XLSX, PDF y manifiesto', async () => {
    const dossier = await createVatDossier({ period: '2026-Q3', invoices: [invoice], issues: [], verifactuStatuses: { NOT_CONFIGURED: 1 } });

    expect(dossier.status).toBe('CLOSED');
    expect(verifyVatDossier(dossier.zipBytes)).toBe(true);
    expect(Object.keys(dossier.manifest).sort()).toEqual([
      'advertencias.json',
      'estado-verifactu.json',
      'expense-deductibility.csv',
      'facturas.csv',
      'facturas.xlsx',
      'gastos-resumen.json',
      'purchases.csv',
      'regalias-kdp.csv',
      'resumen-iva.pdf',
    ]);
  });
  it('bloquea el cierre con incidencias sin aprobación', async () => { await expect(createVatDossier({ period: '2026-Q3', invoices: [invoice], issues: [{ code: 'COUNTRY_MISSING', severity: 'BLOCKING', status: 'OPEN' }], verifactuStatuses: {} })).rejects.toThrow('BLOCKING_ISSUES_REQUIRE_APPROVAL'); });
});
