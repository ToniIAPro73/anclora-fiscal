import { eq, and } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { encryptTaxIdentity } from '@anclora/core/server';
import { isValidSpanishNifNie, normalizeSpanishTaxId } from '@anclora/core';
import { fiscalCounterparties } from './schema.js';
import * as schema from './schema.js';

export interface CreateFiscalCounterpartyInput {
  tenantId: string;
  displayName: string;
  legalName?: string | undefined;
  companyName?: string | undefined;
  email?: string | undefined;
  billingAddress: string;
  taxIdentity: string;
  customerType: 'B2C' | 'B2B';
}

export type CreateFiscalCounterpartyResult =
  | { ok: true; counterparty: typeof fiscalCounterparties.$inferSelect }
  | { ok: false; reason: 'INVALID_TAX_IDENTITY' };

export class DrizzleFiscalCounterpartiesRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Persists a buyer for the full-invoice-on-request flow (FASE 15). The
   * taxIdentity is validated explicitly against the real NIF/NIE checksum —
   * never inferred from email domain, shipping country, or company name —
   * and the resulting row is marked VALIDATED immediately since the buyer
   * supplied it directly for this specific invoice request.
   */
  async create(input: CreateFiscalCounterpartyInput): Promise<CreateFiscalCounterpartyResult> {
    const normalizedTaxIdentity = normalizeSpanishTaxId(input.taxIdentity);

    if (!isValidSpanishNifNie(normalizedTaxIdentity)) {
      return { ok: false, reason: 'INVALID_TAX_IDENTITY' };
    }

    const [row] = await this.db
      .insert(fiscalCounterparties)
      .values({
        tenantId: input.tenantId,
        displayName: input.displayName,
        legalName: input.legalName ?? null,
        companyName: input.companyName ?? null,
        emailEncrypted: input.email ? encryptTaxIdentity(input.email) : null,
        billingAddressEncrypted: encryptTaxIdentity(input.billingAddress),
        customerType: input.customerType,
        taxIdentityEncrypted: encryptTaxIdentity(normalizedTaxIdentity),
        validationStatus: 'VALIDATED',
        validatedAt: new Date(),
        validationSource: 'BUYER_REQUEST_EXPLICIT',
      })
      .returning();

    if (!row) throw new Error('No se pudo crear el destinatario fiscal');

    return { ok: true, counterparty: row };
  }

  async findById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(fiscalCounterparties)
      .where(and(eq(fiscalCounterparties.tenantId, tenantId), eq(fiscalCounterparties.id, id)))
      .limit(1);

    return row ?? null;
  }
}
