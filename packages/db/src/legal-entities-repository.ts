import { asc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { legalEntities } from './schema.js';
import * as schema from './schema.js';

export type LegalEntity = typeof legalEntities.$inferSelect;

/**
 * Minimal read repository for legal entities. `canonical_operations.legalEntityId`
 * is NOT NULL, but no production code path resolves "which legal entity does
 * this canonical operation belong to" for a tenant yet. This assumes a single
 * legal entity per tenant for this MVP stage (matching the single-tenant-per-slug
 * pattern already used by `ensureDevelopmentTenant`) — only a read method is
 * provided here, no create/update; onboarding is expected to seed the legal
 * entity separately.
 */
export class DrizzleLegalEntitiesRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async findFirstByTenant(tenantId: string): Promise<LegalEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.tenantId, tenantId))
      .orderBy(asc(legalEntities.createdAt))
      .limit(1);
    return row;
  }
}
