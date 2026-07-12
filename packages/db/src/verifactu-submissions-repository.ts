import { and, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type {
  VerifactuChainMember,
  VerifactuPayloadRedacted,
  VerifactuPersistedSubmissionOutcome,
  VerifactuSubmissionExecutable,
} from '@anclora/core/server';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  fiscalDocuments,
  integrityChainRecords,
  verifactuSubmissionAttempts,
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
  nextAttemptAt: string | null;
  lastError: string | null;
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
  outcome: VerifactuPersistedSubmissionOutcome;
}

const EXECUTABLE_SUBMISSION_STATUSES = ['PENDING', 'RETRY_SCHEDULED'] as const;

export interface VerifactuSubmissionAttemptItem {
  id: string;
  tenantId: string;
  verifactuSubmissionId: string;
  attemptNumber: string;
  status: string;
  responseRedacted: unknown;
  attemptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class DrizzleVerifactuSubmissionsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async findPendingById(input: {
    tenantId: string;
    submissionId: string;
  }): Promise<VerifactuSubmissionExecutable | null> {
    const [row] = await this.db
      .select({
        id: verifactuSubmissions.id,
        tenantId: verifactuSubmissions.tenantId,
        environment: verifactuSubmissions.environment,
        status: verifactuSubmissions.status,
        payloadRedacted: verifactuSubmissions.payloadRedacted,
        attemptCount: verifactuSubmissions.attemptCount,
        nextAttemptAt: verifactuSubmissions.nextAttemptAt,
        lastError: verifactuSubmissions.lastError,
        fiscalDocumentId: integrityChainRecords.fiscalDocumentId,
      })
      .from(verifactuSubmissions)
      .innerJoin(integrityChainRecords, eq(verifactuSubmissions.integrityRecordId, integrityChainRecords.id))
      .where(and(
        eq(verifactuSubmissions.tenantId, input.tenantId),
        eq(verifactuSubmissions.id, input.submissionId),
        inArray(verifactuSubmissions.status, EXECUTABLE_SUBMISSION_STATUSES),
      ))
      .limit(1);

    if (!row) return null;

    const environment = row.environment as VerifactuSubmissionExecutable['environment'];
    const payloadRedacted = row.payloadRedacted as Partial<VerifactuPayloadRedacted>;

    return {
      id: row.id,
      tenantId: row.tenantId,
      fiscalDocumentId: row.fiscalDocumentId,
      environment,
      status: row.status as VerifactuSubmissionExecutable['status'],
      payloadRedacted: {
        ...payloadRedacted,
        environment,
      } as VerifactuPayloadRedacted,
      attemptCount: String(row.attemptCount),
      nextAttemptAt: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
      lastError: row.lastError,
    };
  }

  /**
   * Returns every other submission in the same AEAT chain scope (tenant +
   * legal entity + software installation), ordered by the real issuance
   * timestamp -- the AEAT chain order, not row insertion order. Used by
   * VerifactuSubmissionExecutionService to enforce that a later record is
   * never sent while an earlier one is still unresolved (FASE 5).
   */
  async findChainMembers(input: {
    tenantId: string;
    legalEntityId: string;
    softwareInstallationNumber: string;
    excludeSubmissionId: string;
  }): Promise<VerifactuChainMember[]> {
    const rows = await this.db
      .select({
        id: verifactuSubmissions.id,
        status: verifactuSubmissions.status,
        issuedAt: fiscalDocuments.issuedAt,
      })
      .from(verifactuSubmissions)
      .innerJoin(integrityChainRecords, eq(verifactuSubmissions.integrityRecordId, integrityChainRecords.id))
      .innerJoin(fiscalDocuments, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id))
      .where(and(
        eq(verifactuSubmissions.tenantId, input.tenantId),
        eq(integrityChainRecords.legalEntityId, input.legalEntityId),
        eq(integrityChainRecords.softwareInstallationNumber, input.softwareInstallationNumber),
        ne(verifactuSubmissions.id, input.excludeSubmissionId),
      ));

    return rows.map((row) => ({
      id: row.id,
      status: row.status as VerifactuChainMember['status'],
      issuedAt: row.issuedAt.toISOString(),
    }));
  }

  async applyAttemptOutcome(input: ApplyVerifactuSubmissionOutcomeInput): Promise<VerifactuSubmissionListItem | null> {
    const updatedId = await this.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          id: verifactuSubmissions.id,
          attemptCount: verifactuSubmissions.attemptCount,
        })
        .from(verifactuSubmissions)
        .where(and(
          eq(verifactuSubmissions.tenantId, input.tenantId),
          eq(verifactuSubmissions.id, input.submissionId),
          inArray(verifactuSubmissions.status, EXECUTABLE_SUBMISSION_STATUSES),
        ))
        .limit(1);

      if (!current) return null;

      const attemptNumber = Number(current.attemptCount) + input.outcome.attemptCountIncrement;
      const attemptedAt = new Date(input.outcome.responseRedacted.submittedAt);

      const [updated] = await transaction
        .update(verifactuSubmissions)
        .set({
          status: input.outcome.status,
          responseRedacted: input.outcome.responseRedacted,
          attemptCount: sql`${verifactuSubmissions.attemptCount} + ${input.outcome.attemptCountIncrement}`,
          nextAttemptAt: input.outcome.nextAttemptAt ? new Date(input.outcome.nextAttemptAt) : null,
          lastError: input.outcome.lastError,
          updatedAt: new Date(),
        })
        .where(and(
          eq(verifactuSubmissions.tenantId, input.tenantId),
          eq(verifactuSubmissions.id, input.submissionId),
          inArray(verifactuSubmissions.status, EXECUTABLE_SUBMISSION_STATUSES),
        ))
        .returning({ id: verifactuSubmissions.id });

      if (!updated) return null;

      await transaction.insert(verifactuSubmissionAttempts).values({
        tenantId: input.tenantId,
        verifactuSubmissionId: input.submissionId,
        attemptNumber: String(attemptNumber),
        status: input.outcome.status,
        responseRedacted: input.outcome.responseRedacted,
        attemptedAt,
      });

      return updated.id;
    });

    if (!updatedId) return null;

    const result = await this.list({
      tenantId: input.tenantId,
      page: 1,
      pageSize: 1,
    });

    return result.items.find((item) => item.id === updatedId) ?? null;
  }

  async listAttempts(input: {
    tenantId: string;
    submissionId: string;
  }): Promise<VerifactuSubmissionAttemptItem[]> {
    const rows = await this.db
      .select({
        id: verifactuSubmissionAttempts.id,
        tenantId: verifactuSubmissionAttempts.tenantId,
        verifactuSubmissionId: verifactuSubmissionAttempts.verifactuSubmissionId,
        attemptNumber: verifactuSubmissionAttempts.attemptNumber,
        status: verifactuSubmissionAttempts.status,
        responseRedacted: verifactuSubmissionAttempts.responseRedacted,
        attemptedAt: verifactuSubmissionAttempts.attemptedAt,
        createdAt: verifactuSubmissionAttempts.createdAt,
        updatedAt: verifactuSubmissionAttempts.updatedAt,
      })
      .from(verifactuSubmissionAttempts)
      .innerJoin(verifactuSubmissions, eq(verifactuSubmissionAttempts.verifactuSubmissionId, verifactuSubmissions.id))
      .where(and(
        eq(verifactuSubmissionAttempts.tenantId, input.tenantId),
        eq(verifactuSubmissionAttempts.verifactuSubmissionId, input.submissionId),
        eq(verifactuSubmissions.tenantId, input.tenantId),
      ))
      .orderBy(desc(verifactuSubmissionAttempts.attemptedAt), desc(verifactuSubmissionAttempts.createdAt));

    return rows.map((row) => ({
      ...row,
      attemptNumber: String(row.attemptNumber),
    }));
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
        nextAttemptAt: verifactuSubmissions.nextAttemptAt,
        lastError: verifactuSubmissions.lastError,
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
        nextAttemptAt: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
      })),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(countRow?.total ?? 0),
    };
  }
}
