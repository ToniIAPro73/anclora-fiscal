import { afterEach, describe, expect, it } from 'vitest';
import type { RoyaltyLine, RoyaltyStatement } from '@anclora/core';
import { createOfflineDatabase } from './index';
import { ensureDevelopmentTenant } from './import-preview-repository';
import { migrateOfflineDatabase } from './migrations';
import { DrizzleRoyaltyRepository } from './royalty-repository';

const clients: Array<ReturnType<typeof createOfflineDatabase>['client']> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function seedImportFile(db: ReturnType<typeof createOfflineDatabase>['db'], tenantId: string) {
  const { importFiles, importJobs } = await import('./schema.js');
  const [job] = await db.insert(importJobs).values({ tenantId, status: 'PREVIEW_READY', connectorId: 'kdp-xlsx' }).returning({ id: importJobs.id });
  if (!job) throw new Error('job missing');
  const [file] = await db.insert(importFiles).values({
    tenantId,
    importJobId: job.id,
    storageKey: `${tenantId}/kdp`,
    originalNameEncrypted: 'v1:ciphertext',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byteSize: '128',
    sha256: 'b'.repeat(64),
    importerVersion: 'kdp-xlsx@0.1.0',
  }).returning({ id: importFiles.id });
  if (!file) throw new Error('file missing');
  return file.id;
}

const line = (overrides: Partial<RoyaltyLine> = {}): RoyaltyLine => ({
  businessKey: 'key-1',
  classification: 'ebook',
  status: 'RECOGNIZED',
  period: '2026-06',
  isbnOrAsin: 'B0000001',
  amount: 6.99,
  currency: 'EUR',
  sourceSheet: 'Regalías de eBooks',
  ...overrides,
});

describe('DrizzleRoyaltyRepository', () => {
  it('persiste el estado de regalías y sus líneas', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await ensureDevelopmentTenant(db);
    const importFileId = await seedImportFile(db, tenantId);
    const repository = new DrizzleRoyaltyRepository(db);

    const statement: RoyaltyStatement = { hash: 'c'.repeat(64), sourceConnector: 'kdp', currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    const lines: RoyaltyLine[] = [line({ averageUnitPrice: 6.99, productionCost: 0.2 })];

    const result = await repository.persist({ tenantId, importFileId, statement, lines });
    expect(result.duplicate).toBe(false);

    const counts = await client.query<{ table_name: string; count: number }>(`
      SELECT 'royalty_statements' AS table_name, count(*)::int AS count FROM royalty_statements
      UNION ALL SELECT 'royalty_lines', count(*)::int FROM royalty_lines
    `);
    expect(counts.rows).toEqual([
      { table_name: 'royalty_statements', count: 1 },
      { table_name: 'royalty_lines', count: 1 },
    ]);
  });

  it('es idempotente por hash de estado', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await ensureDevelopmentTenant(db);
    const importFileId = await seedImportFile(db, tenantId);
    const repository = new DrizzleRoyaltyRepository(db);

    const statement: RoyaltyStatement = { hash: 'd'.repeat(64), sourceConnector: 'kdp', currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    const lines: RoyaltyLine[] = [line()];

    const first = await repository.persist({ tenantId, importFileId, statement, lines });
    const second = await repository.persist({ tenantId, importFileId, statement, lines });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.statementId).toBe(first.statementId);

    const countRows = (await client.query<{ count: number }>('SELECT count(*)::int FROM royalty_lines')).rows;
    expect(countRows[0]?.count).toBe(1);
  });

  it('omite líneas ya registradas por otro estado sin fallar (businessKey repetido entre exportaciones solapadas)', async () => {
    const { client, db } = createOfflineDatabase();
    clients.push(client);
    await migrateOfflineDatabase(client);
    const tenantId = await ensureDevelopmentTenant(db);
    const importFileId = await seedImportFile(db, tenantId);
    const repository = new DrizzleRoyaltyRepository(db);

    const firstStatement: RoyaltyStatement = { hash: 'e'.repeat(64), sourceConnector: 'kdp', currency: 'EUR', periods: ['2026-06'], totalRoyalties: 6.99, lineCount: 1 };
    await repository.persist({ tenantId, importFileId, statement: firstStatement, lines: [line({ businessKey: 'shared-key' })] });

    const secondStatement: RoyaltyStatement = { hash: 'f'.repeat(64), sourceConnector: 'kdp', currency: 'EUR', periods: ['2026-06', '2026-07'], totalRoyalties: 13.98, lineCount: 2 };
    await expect(repository.persist({
      tenantId,
      importFileId,
      statement: secondStatement,
      lines: [line({ businessKey: 'shared-key' }), line({ businessKey: 'new-key' })],
    })).resolves.toMatchObject({ duplicate: false });

    const countRows = (await client.query<{ count: number }>('SELECT count(*)::int FROM royalty_lines')).rows;
    expect(countRows[0]?.count).toBe(2);
  });
});
