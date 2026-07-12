import { z } from "zod";

// Client-safe entrypoint: only re-export modules with no Node.js built-in
// dependencies (no `node:*`, `pdf-lib`, `fflate`, or `xlsx`). This keeps
// `@anclora/core` importable from 'use client' components and Server
// Components without dragging Node-only code into webpack's client bundle
// graph. Node-only modules (storage, invoicing, verifactu, dossier) live
// behind the `@anclora/core/server` subpath — see `./server.ts`.
export * from "./matching.js";
export * from "./royalty.js";
export * from "./spanish-tax-id.js";
export * from "./shopify-payment.js";
export * from "./advisory-export.js";
export * from "./expenses.js";
export * from "./expense-deductibility.js";
export * from "./advanced-expense-capture.js";

export const importStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "PREVIEW_READY",
  "VALIDATED",
  "PARTIALLY_IMPORTED",
  "FAILED",
  "REPROCESSED",
]);
export const operationStatusSchema = z.enum([
  "DRAFT",
  "PENDING_EVIDENCE",
  "PENDING_TAX_REVIEW",
  "READY_FOR_INVOICING",
  "INVOICED",
  "RECTIFIED",
  "SETTLED",
  "CLOSED",
  "BLOCKED",
]);
export const reconciliationStatusSchema = z.enum([
  "UNMATCHED",
  "SUGGESTED",
  "MATCHED",
  "PARTIALLY_MATCHED",
  "EXCEPTION",
  "CONFIRMED",
]);
export const verifactuStatusSchema = z.enum([
  "NOT_APPLICABLE",
  "NOT_CONFIGURED",
  "PENDING",
  "QUEUED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "RETRY_REQUIRED",
  "CANCELLED",
]);
export const dossierStatusSchema = z.enum([
  "OPEN",
  "VALIDATION_IN_PROGRESS",
  "PENDING_REVIEW",
  "READY_TO_CLOSE",
  "CLOSED",
  "REOPENED_WITH_AUDIT_TRAIL",
]);
export const roleSchema = z.enum([
  "ADMIN",
  "FISCAL_OPERATOR",
  "REVIEWER",
  "ADVISOR_READONLY",
]);
export type Role = z.infer<typeof roleSchema>;

export const permissions = {
  ADMIN: ["*"],
  FISCAL_OPERATOR: [
    "expenses:read",
    "expenses:write",
    "imports:write",
    "operations:write",
    "operations:read",
    "events:read",
    "reconciliation:read",
    "reconciliation:write",
    "issues:read",
    "alerts:read",
    "documents:issue",
    "documents:read",
    "periods:read",
    "dossier:read",
    "dashboard:read",
    "settings:read",
    "settings:write",
  ],
  REVIEWER: [
    "expenses:read",
    "operations:read",
    "operations:review",
    "events:read",
    "reconciliation:read",
    "issues:read",
    "issues:write",
    "alerts:read",
    "alerts:resolve",
    "periods:close",
    "periods:read",
    "documents:rectify",
    "documents:read",
    "dossier:read",
    "dossier:write",
    "dashboard:read",
  ],
  ADVISOR_READONLY: ["*:read"],
} as const satisfies Record<Role, readonly string[]>;

export function can(role: Role, permission: string): boolean {
  return permissions[role].some(
    (allowed) =>
      allowed === "*" ||
      allowed === permission ||
      (allowed === "*:read" && permission.endsWith(":read")),
  );
}

export interface AuditContext {
  tenantId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}
