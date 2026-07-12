import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createVatDossier, verifyVatDossier, type VatDossierInput } from './dossier';

function readJsonFile(zipBytes: Uint8Array, filename: string) {
  const files = unzipSync(zipBytes);
  const file = files[filename];

  if (!file) {
    throw new Error(`Missing ${filename}`);
  }

  return JSON.parse(new TextDecoder().decode(file)) as unknown;
}

const baseInput: VatDossierInput = {
  period: '2026-07',
  invoices: [
    {
      number: 'FS-2026-000001',
      issuedAt: '2026-07-09T10:00:00.000Z',
      type: 'FULL_INVOICE',
      country: 'ES',
      channel: 'shopify',
      taxBase: 10,
      taxRate: 0.21,
      taxAmount: 2.1,
      totalAmount: 12.1,
      currency: 'EUR',
      evidenceHash: 'invoice-render-sha',
    },
  ],
  issues: [],
  verifactuStatuses: { PENDING: 1 },
  verifactuRecords: [
    {
      invoiceNumber: 'FS-2026-000001',
      documentType: 'FULL_INVOICE',
      issuedAt: '2026-07-09T10:00:00.000Z',
      environment: 'test',
      status: 'PENDING',
      recordType: 'ALTA',
      attemptCount: 0,
      chainHash: 'chain-hash-1',
      previousHash: null,
      responseReference: null,
      responseStatus: null,
      submittedAt: null,
    },
  ],
};

describe('createVatDossier', () => {
  it('integra compras y deducibilidad con manifest SHA sin mezclarlas en VERI*FACTU', async () => { const result=await createVatDossier({...baseInput,purchases:[{documentNumber:'P-1',issueDate:'2026-06-01',category:'SOFTWARE_SAAS',currency:'EUR',taxBase:100,vatAmount:21,totalAmount:121,withholdingAmount:0,decisionStatus:'CALCULATED',deductibleIrpf:121,deductibleVat:21,ruleVersion:'expenses-es-v1',explanation:'100 %'}]}); const files=unzipSync(result.zipBytes);expect(files['purchases.csv']).toBeDefined();expect(files['expense-deductibility.csv']).toBeDefined();expect(verifyVatDossier(result.zipBytes)).toBe(true);expect(JSON.stringify(readJsonFile(result.zipBytes,'estado-verifactu.json'))).not.toContain('P-1'); });
  it('incluye un estado-verifactu.json detallado y verificable por manifest', async () => {
    const result = await createVatDossier(baseInput);

    expect(verifyVatDossier(result.zipBytes)).toBe(true);

    const verifactuState = readJsonFile(result.zipBytes, 'estado-verifactu.json');

    expect(verifactuState).toEqual({
      schemaVersion: 'anclora-verifactu-state-v1',
      period: '2026-07',
      summary: { PENDING: 1 },
      records: [
        {
          invoiceNumber: 'FS-2026-000001',
          documentType: 'FULL_INVOICE',
          issuedAt: '2026-07-09T10:00:00.000Z',
          environment: 'test',
          status: 'PENDING',
          recordType: 'ALTA',
          attemptCount: 0,
          chainHash: 'chain-hash-1',
          previousHash: null,
          responseReference: null,
          responseStatus: null,
          submittedAt: null,
        },
      ],
    });

    const files = unzipSync(result.zipBytes);
    const verifactuBytes = files['estado-verifactu.json'];

    if (!verifactuBytes) {
      throw new Error('Missing estado-verifactu.json');
    }

    expect(result.manifest['estado-verifactu.json']).toBe(
      createHash('sha256').update(verifactuBytes).digest('hex'),
    );
  });

  it('mantiene compatibilidad cuando sólo hay contadores VERI*FACTU', async () => {
    const { verifactuRecords: _verifactuRecords, ...inputWithoutRecords } = baseInput;
    void _verifactuRecords;

    const result = await createVatDossier({
      ...inputWithoutRecords,
      verifactuStatuses: { BLOCKED: 1 },
    });

    const verifactuState = readJsonFile(result.zipBytes, 'estado-verifactu.json');

    expect(verifactuState).toMatchObject({
      schemaVersion: 'anclora-verifactu-state-v1',
      period: '2026-07',
      summary: { BLOCKED: 1 },
      records: [],
    });
  });

  it('incluye regalías KDP por formato y advertencias OSS/B2B/reembolso', async () => {
    const result = await createVatDossier({
      ...baseInput,
      royaltiesByFormat: [
        { format: 'ebook', unitsNet: 120, amount: 84.5, currency: 'EUR' },
        { format: 'impreso', unitsNet: 8, amount: 32.1, currency: 'EUR' },
      ],
      warnings: [
        { type: 'OSS', orderId: 'AI-1001', detail: 'Venta a FR, posible sujeción a OSS' },
        { type: 'B2B', orderId: 'AI-1002', detail: 'Cliente marcado como B2B' },
        { type: 'REFUND', orderId: 'AI-1003', detail: 'Reembolso partial' },
      ],
    });

    expect(verifyVatDossier(result.zipBytes)).toBe(true);

    const files = unzipSync(result.zipBytes);
    const royaltiesCsv = new TextDecoder().decode(files['regalias-kdp.csv']!);

    expect(royaltiesCsv).toContain('format,units_net,amount,currency');
    expect(royaltiesCsv).toContain('"ebook","120","84.50","EUR"');
    expect(royaltiesCsv).toContain('"impreso","8","32.10","EUR"');

    const warnings = readJsonFile(result.zipBytes, 'advertencias.json');

    expect(warnings).toEqual({
      schemaVersion: 'anclora-dossier-warnings-v1',
      period: '2026-07',
      warnings: [
        { type: 'OSS', orderId: 'AI-1001', detail: 'Venta a FR, posible sujeción a OSS' },
        { type: 'B2B', orderId: 'AI-1002', detail: 'Cliente marcado como B2B' },
        { type: 'REFUND', orderId: 'AI-1003', detail: 'Reembolso partial' },
      ],
    });
  });

  it('genera regalias-kdp.csv y advertencias.json vacíos cuando no se pasan datos', async () => {
    const result = await createVatDossier(baseInput);
    const files = unzipSync(result.zipBytes);
    const royaltiesCsv = new TextDecoder().decode(files['regalias-kdp.csv']!);

    expect(royaltiesCsv).toBe('format,units_net,amount,currency');

    const warnings = readJsonFile(result.zipBytes, 'advertencias.json');
    expect(warnings).toMatchObject({ warnings: [] });
  });
});
