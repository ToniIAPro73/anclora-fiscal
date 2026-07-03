import type { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));

interface AppliedMigration {
  name: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Applies the versioned PostgreSQL migrations to an embedded PGlite database.
 * Existing migration files are immutable: a checksum mismatch fails closed.
 */
export async function migrateOfflineDatabase(
  client: PGlite,
  migrationsFolder = DEFAULT_MIGRATIONS_FOLDER,
): Promise<MigrationResult> {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS "_anclora_migrations" (
      "name" text PRIMARY KEY,
      "checksum" text NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    );
  `);

  const entries = (await readdir(migrationsFolder))
    .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  const appliedRows = await client.query<AppliedMigration>(
    'SELECT "name", "checksum" FROM "_anclora_migrations"',
  );
  const known = new Map(appliedRows.rows.map((row) => [row.name, row.checksum]));
  const result: MigrationResult = { applied: [], skipped: [] };

  for (const name of entries) {
    const sql = await readFile(`${migrationsFolder}/${name}`, 'utf8');
    const sqlChecksum = checksum(sql);
    const appliedChecksum = known.get(name);

    if (appliedChecksum) {
      if (appliedChecksum !== sqlChecksum) {
        throw new Error(`La migración aplicada ${name} ha cambiado de contenido`);
      }
      result.skipped.push(name);
      continue;
    }

    await client.exec('BEGIN');
    try {
      await client.exec(sql);
      await client.query(
        'INSERT INTO "_anclora_migrations" ("name", "checksum") VALUES ($1, $2)',
        [name, sqlChecksum],
      );
      await client.exec('COMMIT');
      result.applied.push(name);
    } catch (error) {
      await client.exec('ROLLBACK');
      throw error;
    }
  }

  return result;
}
