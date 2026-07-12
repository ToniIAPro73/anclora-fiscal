import type { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations/', import.meta.url));
const REMOTE_MIGRATION_LOCK_ID = 1_572_921_537;
const LEGACY_BASELINE_LAST_MIGRATION = '0022_verifactu_submission_retry_scheduling.sql';

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

async function migrationFiles(migrationsFolder: string) {
  return Promise.all((await readdir(migrationsFolder))
    .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name))
    .sort()
    .map(async (name) => {
      const sql = await readFile(`${migrationsFolder}/${name}`, 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }));
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

  const entries = await migrationFiles(migrationsFolder);
  const appliedRows = await client.query<AppliedMigration>(
    'SELECT "name", "checksum" FROM "_anclora_migrations"',
  );
  const known = new Map(appliedRows.rows.map((row) => [row.name, row.checksum]));
  const result: MigrationResult = { applied: [], skipped: [] };

  for (const migration of entries) {
    const { name, sql, checksum: sqlChecksum } = migration;
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

async function reconcileLegacyRemoteBaseline(
  client: ReturnType<typeof postgres>,
  migrations: Awaited<ReturnType<typeof migrationFiles>>,
): Promise<void> {
  const [{ legacyThrough0022, sifEventsExists }] = await client<{
    legacyThrough0022: boolean;
    sifEventsExists: boolean;
  }[]>`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'verifactu_submissions'
          AND column_name = 'next_attempt_at'
      ) AS "legacyThrough0022",
      to_regclass('public.sif_events') IS NOT NULL AS "sifEventsExists"
  `;

  if (!legacyThrough0022 || sifEventsExists) return;

  const baseline = migrations.filter(
    (migration) => migration.name <= LEGACY_BASELINE_LAST_MIGRATION,
  );

  for (const migration of baseline) {
    await client`
      INSERT INTO "_anclora_migrations" ("name", "checksum")
      VALUES (${migration.name}, ${migration.checksum})
      ON CONFLICT ("name") DO NOTHING
    `;
  }
}

/** Applies the same immutable migration files to a remote PostgreSQL database. */
export async function migrateRemoteDatabase(
  url: string,
  migrationsFolder = DEFAULT_MIGRATIONS_FOLDER,
): Promise<MigrationResult> {
  const client = postgres(url, { max: 1, prepare: false });
  try {
    await client`SELECT pg_advisory_lock(${REMOTE_MIGRATION_LOCK_ID})`;
    try {
      await client.unsafe(`
        CREATE TABLE IF NOT EXISTS "_anclora_migrations" (
          "name" text PRIMARY KEY,
          "checksum" text NOT NULL,
          "applied_at" timestamptz NOT NULL DEFAULT now()
        )
      `);
      const migrations = await migrationFiles(migrationsFolder);
      await reconcileLegacyRemoteBaseline(client, migrations);

      const appliedRows = await client<{ name: string; checksum: string }[]>`
        SELECT "name", "checksum" FROM "_anclora_migrations"
      `;
      const known = new Map(appliedRows.map((row) => [row.name, row.checksum]));
      const result: MigrationResult = { applied: [], skipped: [] };

      for (const migration of migrations) {
        const appliedChecksum = known.get(migration.name);
        if (appliedChecksum) {
          if (appliedChecksum !== migration.checksum) {
            throw new Error(`La migración aplicada ${migration.name} ha cambiado de contenido`);
          }
          result.skipped.push(migration.name);
          continue;
        }

        await client.begin(async (transaction) => {
          await transaction.unsafe(migration.sql).simple();
          await transaction`
            INSERT INTO "_anclora_migrations" ("name", "checksum")
            VALUES (${migration.name}, ${migration.checksum})
          `;
        });
        result.applied.push(migration.name);
      }
      return result;
    } finally {
      await client`SELECT pg_advisory_unlock(${REMOTE_MIGRATION_LOCK_ID})`;
    }
  } finally {
    await client.end();
  }
}
