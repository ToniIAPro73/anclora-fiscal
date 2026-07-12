import { and, count, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { createSifEvent, verifySifEventChain, type SifEvent, type SifEventType } from '@anclora/core/server';
import { sifEvents, tenants } from './schema.js';
import * as schema from './schema.js';

export interface RecordSifEventInput {
  tenantId: string;
  eventType: SifEventType;
  actor: string;
  detail: Record<string, unknown>;
  idempotencyKey?: string;
}

export type SifEventRow = typeof sifEvents.$inferSelect;

export interface ListSifEventsInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

export class DrizzleSifEventsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Appends a new SIF event, chained off the tenant's most recently recorded
   * event (by occurredAt). Runs inside a transaction so the "read last hash,
   * write next" step is atomic per tenant — two concurrent record() calls
   * for the same tenant cannot both chain off the same previousHash.
   */
  async record(input: RecordSifEventInput): Promise<SifEventRow> {
    if (input.idempotencyKey) {
      const [existing] = await this.db.select().from(sifEvents).where(and(eq(sifEvents.tenantId, input.tenantId), eq(sifEvents.idempotencyKey, input.idempotencyKey))).limit(1);
      if (existing) return existing;
    }
    return this.db.transaction(async (transaction) => {
      const [lastEvent] = await transaction
        .select({ hash: sifEvents.hash })
        .from(sifEvents)
        .where(eq(sifEvents.tenantId, input.tenantId))
        .orderBy(desc(sifEvents.occurredAt), desc(sifEvents.createdAt))
        .limit(1);

      const occurredAt = new Date();
      const event = createSifEvent(
        {
          eventType: input.eventType,
          actor: input.actor,
          detail: input.detail,
          previousHash: lastEvent?.hash,
        },
        occurredAt.toISOString(),
      );

      const [row] = await transaction
        .insert(sifEvents)
        .values({
          tenantId: input.tenantId,
          eventType: event.eventType,
          actor: event.actor,
          detail: event.detail,
          canonicalPayload: event.canonicalPayload,
          hash: event.hash,
          previousHash: event.previousHash ?? null,
          algorithm: event.algorithm,
          idempotencyKey: input.idempotencyKey ?? null,
          occurredAt,
        })
        .returning();

      if (!row) throw new Error('No se pudo registrar el evento SIF');

      return row;
    });
  }

  async recordStartupForAll(deploymentId: string): Promise<number> {
    const tenantRows = await this.db.select({ id: tenants.id }).from(tenants);
    for (const tenant of tenantRows) {
      await this.record({ tenantId: tenant.id, eventType: 'STARTUP', actor: 'system', detail: { deploymentId }, idempotencyKey: `startup:${deploymentId}` });
    }
    return tenantRows.length;
  }

  async list(input: ListSifEventsInput): Promise<{ items: SifEventRow[]; page: number; pageSize: number; total: number }> {
    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(sifEvents)
        .where(eq(sifEvents.tenantId, input.tenantId))
        .orderBy(desc(sifEvents.occurredAt), desc(sifEvents.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ total: count() })
        .from(sifEvents)
        .where(eq(sifEvents.tenantId, input.tenantId)),
    ]);

    return { items, page: input.page, pageSize: input.pageSize, total: totalRow?.total ?? 0 };
  }

  /** Verifies the full chain for a tenant, oldest-first, using the same logic as `verifySifEventChain`. */
  async verifyChain(tenantId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(sifEvents)
      .where(eq(sifEvents.tenantId, tenantId))
      .orderBy(sifEvents.occurredAt, sifEvents.createdAt);

    const events: SifEvent[] = rows.map((row) => ({
      eventType: row.eventType as SifEventType,
      actor: row.actor,
      detail: row.detail as Record<string, unknown>,
      previousHash: row.previousHash ?? undefined,
      canonicalPayload: row.canonicalPayload,
      hash: row.hash,
      algorithm: 'SHA-256',
      occurredAt: row.occurredAt.toISOString(),
    }));

    return verifySifEventChain(events);
  }
}
