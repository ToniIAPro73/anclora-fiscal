import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe('migrateOfflineDatabase', () => {
  it('aplica las veinticuatro migraciones en orden y puede repetirse', async () => {
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
      '0021_verifactu_chain_metadata.sql',
      '0022_verifactu_submission_retry_scheduling.sql',
      '0023_sif_events.sql',
      '0024_fiscal_document_counterparty.sql',
      '0025_aeat_invoice_semantics.sql',
    ]);
    expect(second).toEqual({ applied: [], skipped: first.applied });
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['tenants', 'import_jobs', 'canonical_operations', 'vat_dossiers', 'royalty_statements', 'royalty_lines', 'order_lines', 'product_tax_profiles', 'channel_fiscal_policies', 'fiscal_counterparties', 'tax_periods', 'payouts', 'shopify_order_payment_events', 'shopify_payments_ledger_entries', 'shopify_evidence_links', 'verifactu_submission_attempts']),
    );
  });

  it('la migración 0021 añade columnas de metadatos de encadenamiento AEAT en integrity_chain_records', async () => {
    const { client } = createOfflineDatabase();
    clients.push(client);

    await migrateOfflineDatabase(client);

    const columns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'integrity_chain_records'
    `);
    const columnNames = columns.rows.map((row) => row.column_name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        'legal_entity_id',
        'software_installation_number',
        'aeat_id_emisor_factura',
        'aeat_num_serie_factura',
        'aeat_fecha_expedicion_factura',
        'aeat_tipo_factura',
        'aeat_huella',
        'aeat_huella_generated_at',
        'aeat_previous_huella',
        'previous_fiscal_document_id',
        'chain_status',
        'aeat_csv',
      ]),
    );
  });

  it('la migración 0022 añade next_attempt_at y last_error en verifactu_submissions', async () => {
    const { client } = createOfflineDatabase();
    clients.push(client);

    await migrateOfflineDatabase(client);

    const columns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'verifactu_submissions'
    `);
    const columnNames = columns.rows.map((row) => row.column_name);

    expect(columnNames).toEqual(
      expect.arrayContaining(['next_attempt_at', 'last_error']),
    );
  });
});
