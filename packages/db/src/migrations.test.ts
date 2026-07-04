import { afterEach, describe, expect, it } from 'vitest';
import { createOfflineDatabase } from './index';
import { migrateOfflineDatabase } from './migrations';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe('migrateOfflineDatabase', () => {
  it('aplica las seis migraciones en orden y puede repetirse', async () => {
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
    ]);
    expect(second).toEqual({ applied: [], skipped: first.applied });
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['tenants', 'import_jobs', 'canonical_operations', 'vat_dossiers', 'royalty_statements', 'royalty_lines']),
    );
  });
});
