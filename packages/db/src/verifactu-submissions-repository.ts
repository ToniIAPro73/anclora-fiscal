import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { VerifactuSubmissionAttemptOutcome } from '@anclora/core/server';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  fiscalDocuments,
  integrityChainRecords,
  verifactuSubmissions,
} from './schema.js';
import * as schema from './schema.js';

export interface VerifactuSubmissionListItem {
  id: string;
  tenantId: string;
  integrityRecordId: string;
  environment: string;
  status: string;
  payloadRedacted: unknown;
  responseRedacted: unknown | null;
  attemptCount: string;
  createdAt: Date;
  updatedAt: Date;
  fiscalDocumentId: string;
  fiscalDocumentNumber: string;
  documentType: string;
  issuedAt: Date;
  recordType: string;
  chainHash: string;
  previousHash: string | null;
}

export interface ListVerifactuSubmissionsInput {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: string | undefined;
  environment?: string | undefined;
}

export interface PaginatedVerifactuSubmissions {
  items: VerifactuSubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApplyVerifactuSubmissionOutcomeInput {
  tenantId: string;
  submissionId: string;
  outcome: VerifactuSubmissionAttemptOutcome;
}

export class DrizzleVerifactuSubmissionsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async applyAttemptOutcome(input: ApplyVerifactuSubmissionOutcomeInput): Promise<VerifactuSubmissionListItem | null> {
    const [updated] = await this.db
      .update(verifactuSubmissions)
      .set({
        status: input.outcome.status,
        responseRedacted: input.outcome.responseRedacted,
        attemptCount: sql`${verifactuSubmissions.attemptCount} + ${input.outcome.attemptCountIncrement}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(verifactuSubmissions.tenantId, input.tenantId),
        eq(verifactuSubmissions.id, input.submissionId),
        eq(verifactuSubmissions.status, 'PENDING'),
      ))
      .returning({ id: verifactuSubmissions.id });

    if (!updated) return null;

    const result = await this.list({
      tenantId: input.tenantId,
      page: 1,
      pageSize: 1,
    });

    return result.items.find((item) => item.id === updated.id) ?? null;
  }

  async list(input: ListVerifactuSubmissionsInput): Promise<PaginatedVerifactuSubmissions> {
    const conditions: SQL[] = [
      eq(verifactuSubmissions.tenantId, input.tenantId),
    ];

    if (input.status) {
      conditions.push(eq(verifactuSubmissions.status, input.status));
    }

    if (input.environment) {
      conditions.push(eq(verifactuSubmissions.environment, input.environment));
    }

    const where = and(...conditions);
    const offset = (input.page - 1) * input.pageSize;

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(verifactuSubmissions)
      .innerJoin(integrityChainRecords, eq(verifactuSubmissions.integrityRecordId, integrityChainRecords.id))
      .innerJoin(fiscalDocuments, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id))
      .where(where);

    const rows = await this.db
      .select({
        id: verifactuSubmissions.id,
        tenantId: verifactuSubmissions.tenantId,
        integrityRecordId: verifactuSubmissions.integrityRecordId,
        environment: verifactuSubmissions.environment,
        status: verifactuSubmissions.status,
        payloadRedacted: verifactuSubmissions.payloadRedacted,
        responseRedacted: verifactuSubmissions.responseRedacted,
        attemptCount: verifactuSubmissions.attemptCount,
        createdAt: verifactuSubmissions.createdAt,
        updatedAt: verifactuSubmissions.updatedAt,
        fiscalDocumentId: fiscalDocuments.id,
        fiscalDocumentNumber: fiscalDocuments.number,
        documentType: fiscalDocuments.documentType,
        issuedAt: fiscalDocuments.issuedAt,
        recordType: integrityChainRecords.recordType,
        chainHash: integrityChainRecords.hash,
        previousHash: integrityChainRecords.previousHash,
      })
      .from(verifactuSubmissions)
      .innerJoin(integrityChainRecords, eq(verifactuSubmissions.integrityRecordId, integrityChainRecords.id))
      .innerJoin(fiscalDocuments, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id))
      .where(where)
      .orderBy(desc(verifactuSubmissions.createdAt))
      .limit(input.pageSize)
      .offset(offset);

    return {
      items: rows.map((row) => ({
        ...row,
        attemptCount: String(row.attemptCount),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }
}
