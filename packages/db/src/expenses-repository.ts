import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";
import { expenseDeductibilityDecisions, purchaseDocuments, suppliers } from "./schema.js";
import * as schema from "./schema.js";
import { decideExpenseDeductibility, type ExpenseDecisionInput } from "@anclora/core";
export class DrizzleExpensesRepository<T extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<T, typeof schema>) {}
  async list(tenantId: string) { return this.db.select().from(purchaseDocuments).where(eq(purchaseDocuments.tenantId, tenantId)); }
  async findById(tenantId: string, id: string) { const [row] = await this.db.select().from(purchaseDocuments).where(and(eq(purchaseDocuments.tenantId, tenantId), eq(purchaseDocuments.id, id))).limit(1); return row ?? null; }
  async createSupplier(input: {
    tenantId: string;
    taxIdEncrypted?: string;
    normalizedTaxIdHash?: string;
    legalName: string;
    countryCode: string;
    source: string;
  }) {
    if (input.normalizedTaxIdHash) {
      const [existing] = await this.db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.tenantId, input.tenantId),
            eq(suppliers.normalizedTaxIdHash, input.normalizedTaxIdHash),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    const [row] = await this.db.insert(suppliers).values(input).returning();
    if (!row) throw new Error("SUPPLIER_CREATE_FAILED");
    return row;
  }
  async createPurchase(input: typeof purchaseDocuments.$inferInsert) {
    const [existing] = await this.db
      .select()
      .from(purchaseDocuments)
      .where(
        and(
          eq(purchaseDocuments.tenantId, input.tenantId),
          eq(purchaseDocuments.supplierId, input.supplierId),
          eq(purchaseDocuments.documentNumber, input.documentNumber),
          eq(purchaseDocuments.issueDate, input.issueDate),
        ),
      )
      .limit(1);
    if (existing) return { document: existing, duplicate: true };
    const [document] = await this.db
      .insert(purchaseDocuments)
      .values(input)
      .returning();
    if (!document) throw new Error("PURCHASE_CREATE_FAILED");
    return { document, duplicate: false };
  }
  async decide(tenantId: string, purchaseDocumentId: string, input: ExpenseDecisionInput) {
    const decision = decideExpenseDeductibility(input);
    const [row] = await this.db.insert(expenseDeductibilityDecisions).values({ tenantId, purchaseDocumentId, ruleVersion: decision.ruleVersion, inputsSnapshot: decision.inputsSnapshot, deductibleIrpfAmount: String(decision.deductibleIrpfAmount), deductibleVatBase: String(decision.deductibleVatBase), deductibleVatAmount: String(decision.deductibleVatAmount), explanation: decision.explanation, warnings: decision.warnings, status: decision.status }).returning();
    if (!row) throw new Error("EXPENSE_DECISION_CREATE_FAILED");
    return row;
  }
}
