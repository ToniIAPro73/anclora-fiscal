import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe('migrateOfflineDatabase', () => {
  it('aplica las diecinueve migraciones en orden y puede repetirse', async () => {
    const { client } = createOfflineDatabase();
    clients.push(client);

    const first = await migrateOfflineDatabase(client);
    const second = await migrateOfflineDatabase(client);
    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    expect(first.applied).toEqual([
      '0000_foundation.sql',
      '0001_import_evidence.sql',
      '0002_matching_operations.sql',
      '0003_tax_invoicing.sql',
      '0004_dossier_verifactu.sql',
      '0005_royalty_statements.sql',
      '0006_ingestion_link_indexes.sql',
      '0007_operations_matching_idempotency.sql',
      '0008_tax_decision_evidence.sql',
      '0009_commercial_order_evidence.sql',
      '0010_buyer_contact_evidence.sql',
      '0011_fiscal_configuration_foundation.sql',
      '0012_import_states_v2.sql',
      '0013_shopify_order_lines_traceability.sql',
      '0014_shopify_payment_settlement_evidence.sql',
      '0015_shopify_evidence_links.sql',
      '0016_fiscal_issuer_refactor.sql',
      '0017_tax_decision_document_type.sql',
      '0018_fiscal_document_idempotency.sql',
      '0019_verifactu_submission_idempotency.sql',
      '0020_verifactu_submission_attempts.sql',
    ]);
    expect(second).toEqual({ applied: [], skipped: first.applied });
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['tenants', 'import_jobs', 'canonical_operations', 'vat_dossiers', 'royalty_statements', 'royalty_lines', 'order_lines', 'product_tax_profiles', 'channel_fiscal_policies', 'fiscal_counterparties', 'tax_periods', 'payouts', 'shopify_order_payment_events', 'shopify_payments_ledger_entries', 'shopify_evidence_links', 'verifactu_submission_attempts']),
    );
  });
});
