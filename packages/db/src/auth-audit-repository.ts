import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditEvents } from './schema';
import * as schema from './schema';

export class DrizzleAuthAuditRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<TQueryResult, typeof schema>) {}

  async record(input: { tenantId: string; actorId: string; action: 'LOGIN_SUCCEEDED' | 'LOGOUT'; ipHash?: string }): Promise<void> {
    await this.db.insert(auditEvents).values({
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      entityType: 'Session',
      entityId: input.actorId,
      metadata: {},
      ...(input.ipHash ? { ipHash: input.ipHash } : {}),
    });
  }
}
