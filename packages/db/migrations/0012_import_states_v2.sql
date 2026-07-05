-- FASE 03: additive import_status states for the connector-aware import
-- pipeline (analyze -> pending confirmation -> imported / imported with
-- issues / rejected). Old values (PENDING, PROCESSING, PREVIEW_READY,
-- VALIDATED, PARTIALLY_IMPORTED, FAILED, REPROCESSED) remain valid for
-- reading existing rows -- no backfill, no rename, no destructive change.
--
-- Note: ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- also *uses* the new value (e.g. a column default or an INSERT referencing
-- it). This migration only adds the enum labels and does not reference them,
-- so it is safe inside the single-transaction migration runner used by both
-- migrate-remote.ts (postgres.js `client.begin`) and the offline PGlite
-- runner (migrations.ts BEGIN/COMMIT) -- verified by running
-- `pnpm --filter db test` against the offline runner after adding this file.
ALTER TYPE "import_status" ADD VALUE IF NOT EXISTS 'ANALYZED';
ALTER TYPE "import_status" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRMATION';
ALTER TYPE "import_status" ADD VALUE IF NOT EXISTS 'IMPORTED';
ALTER TYPE "import_status" ADD VALUE IF NOT EXISTS 'IMPORTED_WITH_ISSUES';
ALTER TYPE "import_status" ADD VALUE IF NOT EXISTS 'REJECTED';
