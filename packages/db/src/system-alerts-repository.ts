import { and, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { auditEvents, systemAlerts } from './schema.js';
import * as schema from './schema.js';
import type { DrizzleSifEventsRepository } from './sif-events-repository.js';

export type SystemAlertRow = typeof systemAlerts.$inferSelect;

export class DrizzleSystemAlertsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<TQueryResult, typeof schema>, private readonly sifEvents: DrizzleSifEventsRepository<TQueryResult>) {}

  async list(input: { tenantId: string; status?: 'OPEN' | 'RESOLVED' }): Promise<SystemAlertRow[]> {
    return this.db.select().from(systemAlerts)
      .where(input.status ? and(eq(systemAlerts.tenantId, input.tenantId), eq(systemAlerts.status, input.status)) : eq(systemAlerts.tenantId, input.tenantId))
      .orderBy(desc(systemAlerts.openedAt));
  }

  async open(input: { tenantId: string; severity: string; type: string; source: string; detail: Record<string, unknown>; deduplicationKey: string; eventType?: 'INTEGRITY_ERROR' | 'SUBMISSION_ERROR' | 'ANOMALY' }): Promise<SystemAlertRow> {
    const [existing] = await this.db.select().from(systemAlerts).where(and(eq(systemAlerts.tenantId, input.tenantId), eq(systemAlerts.status, 'OPEN'), eq(systemAlerts.deduplicationKey, input.deduplicationKey))).limit(1);
    if (existing) return existing;
    const [alert] = await this.db.insert(systemAlerts).values(input).returning();
    if (!alert) throw new Error('No se pudo abrir la alerta del sistema');
    await this.sifEvents.record({ tenantId: input.tenantId, eventType: input.eventType ?? 'ANOMALY', actor: 'system', detail: { alertId: alert.id, type: input.type, source: input.source } });
    return alert;
  }

  async resolve(input: { tenantId: string; alertId: string; actorId: string; resolution: string }): Promise<SystemAlertRow | null> {
    const [alert] = await this.db.update(systemAlerts).set({ status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: input.actorId, resolution: input.resolution, updatedAt: new Date() })
      .where(and(eq(systemAlerts.id, input.alertId), eq(systemAlerts.tenantId, input.tenantId), eq(systemAlerts.status, 'OPEN'))).returning();
    if (!alert) return null;
    await this.db.insert(auditEvents).values({ tenantId: input.tenantId, actorId: input.actorId, action: 'SYSTEM_ALERT_RESOLVED', entityType: 'SystemAlert', entityId: alert.id, metadata: { resolution: input.resolution } });
    await this.sifEvents.record({ tenantId: input.tenantId, eventType: 'ALERT_RESOLVED', actor: input.actorId, detail: { alertId: alert.id, resolution: input.resolution } });
    return alert;
  }

  async report(input: { tenantId: string; dossierId: string; period: string; expectedSha256: string; actualSha256: string }): Promise<void> {
    await this.open({ tenantId: input.tenantId, severity: 'CRITICAL', type: 'DOSSIER_INTEGRITY_ERROR', source: 'vat-dossier', detail: input, deduplicationKey: `dossier-integrity:${input.dossierId}`, eventType: 'INTEGRITY_ERROR' });
  }
}
