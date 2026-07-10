import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { fiscalDocuments, integrityChainRecords } from './schema.js';
import * as schema from './schema.js';

/**
 * The AEAT "encadenamiento" data required to reference the previous official
 * billing record in the next RegistroAlta/RegistroAnulacion XML (see
 * buildEncadenamiento in verifactu-aeat-xml.ts). Field names mirror the AEAT
 * XML element names so callers can pass this straight through as
 * `previousRecord` without renaming.
 */
export interface PreviousOfficialBillingRecord {
  fiscalDocumentId: string;
  idEmisorFactura: string;
  numSerieFactura: string;
  /**
   * ISO date string (YYYY-MM-DD), matching AEAT's FechaExpedicionFactura
   * format. drizzle-orm's `date()` column type returns a plain string (not a
   * `Date` object) with both drivers this package uses — drizzle-orm/pglite
   * (offline/tests) and drizzle-orm/postgres-js (remote) — confirmed by
   * verifactu-chain-resolution-service.test.ts asserting the exact string.
   */
  fechaExpedicionFactura: string;
  huella: string;
}

export interface GetPreviousOfficialBillingRecordInput {
  tenantId: string;
  legalEntityId: string;
  softwareInstallationNumber: string;
}

export class DrizzleVerifactuChainResolutionService<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Resolves the actual last-issued official AEAT billing record for a
   * tenant + legal entity + software installation (the real AEAT chaining
   * scope) so it can be threaded into the next invoice's `previousRecord`.
   *
   * Ordered by the real issuance timestamp (fiscalDocuments.issuedAt) and,
   * as a tie-breaker, the invoice number — NOT by row insertion order
   * (createdAt) — so a record inserted late (e.g. a backfill or retried
   * submission) never displaces the record that was genuinely issued last.
   *
   * Only rows with a persisted aeat_huella are considered: a record whose
   * official AEAT huella hasn't been computed/persisted yet cannot serve as
   * a previous-record reference. Returns undefined for the first invoice
   * ever issued under that scope (no previous record exists).
   */
  async getPreviousOfficialBillingRecord(
    input: GetPreviousOfficialBillingRecordInput,
  ): Promise<PreviousOfficialBillingRecord | undefined> {
    const [row] = await this.db
      .select({
        fiscalDocumentId: integrityChainRecords.fiscalDocumentId,
        idEmisorFactura: integrityChainRecords.aeatIdEmisorFactura,
        numSerieFactura: integrityChainRecords.aeatNumSerieFactura,
        fechaExpedicionFactura: integrityChainRecords.aeatFechaExpedicionFactura,
        huella: integrityChainRecords.aeatHuella,
      })
      .from(integrityChainRecords)
      .innerJoin(fiscalDocuments, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id))
      .where(and(
        eq(integrityChainRecords.tenantId, input.tenantId),
        eq(integrityChainRecords.legalEntityId, input.legalEntityId),
        eq(integrityChainRecords.softwareInstallationNumber, input.softwareInstallationNumber),
        isNotNull(integrityChainRecords.aeatHuella),
      ))
      .orderBy(desc(fiscalDocuments.issuedAt), desc(fiscalDocuments.number))
      .limit(1);

    if (!row || !row.idEmisorFactura || !row.numSerieFactura || !row.fechaExpedicionFactura || !row.huella) {
      return undefined;
    }

    return {
      fiscalDocumentId: row.fiscalDocumentId,
      idEmisorFactura: row.idEmisorFactura,
      numSerieFactura: row.numSerieFactura,
      fechaExpedicionFactura: row.fechaExpedicionFactura,
      huella: row.huella,
    };
  }
}
