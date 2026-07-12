import { createHash } from "node:crypto";
import type { StoragePort } from "@anclora/core/server";
import { assertPurchaseTotals } from "@anclora/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ImportMetadataCipher } from "./import-preview-persistence.js";
export interface ExpensesRepositoryPort {
  list(tenantId: string): Promise<unknown[]>;
  findById(
    tenantId: string,
    id: string,
  ): Promise<Record<string, unknown> | null>;
  createSupplier(input: {
    tenantId: string;
    taxIdEncrypted?: string;
    normalizedTaxIdHash?: string;
    legalName: string;
    countryCode: string;
    source: string;
  }): Promise<{ id: string }>;
  createPurchase(
    input: Record<string, unknown>,
  ): Promise<{ document: unknown; duplicate: boolean }>;
}
const allowedMime = new Set(["application/pdf", "image/png", "image/jpeg"]);
export function createExpensesListHandler(repository?: ExpensesRepositoryPort) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    if (!repository)
      return reply.code(503).send({ code: "EXPENSES_UNAVAILABLE" });
    return { items: await repository.list(tenantId) };
  };
}
export function createExpenseCreateHandler(deps: {
  repository?: ExpensesRepositoryPort | undefined;
  storage: StoragePort;
  cipher: ImportMetadataCipher;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    if (!deps.repository)
      return reply.code(503).send({ code: "EXPENSES_UNAVAILABLE" });
    const body = request.body as Record<string, unknown>;
    const mimeType = String(body.mimeType ?? "");
    const bytes = Buffer.from(String(body.attachmentBase64 ?? ""), "base64");
    if (
      !allowedMime.has(mimeType) ||
      bytes.length === 0 ||
      bytes.length > 15 * 1024 * 1024
    )
      return reply.code(400).send({ code: "EXPENSE_ATTACHMENT_INVALID" });
    const values = {
      taxBase: Number(body.taxBase),
      vatAmount: Number(body.vatAmount),
      withholdingAmount: Number(body.withholdingAmount ?? 0),
      totalAmount: Number(body.totalAmount),
    };
    try {
      assertPurchaseTotals(values);
    } catch {
      return reply.code(400).send({ code: "PURCHASE_TOTALS_INCOHERENT" });
    }
    const taxId = String(body.supplierTaxId ?? "")
      .replace(/\s/g, "")
      .toUpperCase();
    const supplier = await deps.repository.createSupplier({
      tenantId,
      legalName: String(body.supplierName),
      countryCode: String(body.countryCode ?? "ES"),
      source: "MANUAL",
      ...(taxId
        ? {
            taxIdEncrypted: deps.cipher.encrypt(taxId),
            normalizedTaxIdHash: createHash("sha256")
              .update(taxId)
              .digest("hex"),
          }
        : {}),
    });
    const stored = await deps.storage.put({ tenantId, bytes, mimeType });
    const result = await deps.repository.createPurchase({
      tenantId,
      supplierId: supplier.id,
      documentType: String(body.documentType ?? "COMPRA"),
      documentNumber: String(body.documentNumber),
      issueDate: String(body.issueDate),
      currency: String(body.currency ?? "EUR"),
      taxBase: String(values.taxBase),
      vatAmount: String(values.vatAmount),
      totalAmount: String(values.totalAmount),
      withholdingAmount: String(values.withholdingAmount),
      categoryCode: String(body.categoryCode ?? "OTHER_REVIEW"),
      description: String(body.description ?? ""),
      status: "DRAFT",
      storageKey: stored.key,
      sha256: stored.sha256,
      mimeType,
    });
    return reply.code(result.duplicate ? 409 : 201).send(result);
  };
}
export function createExpenseDownloadHandler(deps: {
  repository?: ExpensesRepositoryPort | undefined;
  storage: StoragePort;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const document = await deps.repository?.findById(
      tenantId,
      (request.params as { id: string }).id,
    );
    if (!document) return reply.code(404).send({ code: "EXPENSE_NOT_FOUND" });
    const bytes = await deps.storage.get(String(document.storageKey));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== document.sha256)
      return reply.code(409).send({ code: "EXPENSE_INTEGRITY_ERROR" });
    return reply
      .header("cache-control", "private, no-store")
      .header("content-disposition", "attachment")
      .type(String(document.mimeType))
      .send(Buffer.from(bytes));
  };
}
