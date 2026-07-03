import { z } from 'zod';
export * from './storage';
export * from './matching';
export * from './invoicing';
export * from './verifactu';
export * from './dossier';

export const importStatusSchema = z.enum([
  'PENDING', 'PROCESSING', 'PREVIEW_READY', 'VALIDATED', 'PARTIALLY_IMPORTED', 'FAILED', 'REPROCESSED',
]);
export const operationStatusSchema = z.enum([
  'DRAFT', 'PENDING_EVIDENCE', 'PENDING_TAX_REVIEW', 'READY_FOR_INVOICING', 'INVOICED',
  'RECTIFIED', 'SETTLED', 'CLOSED', 'BLOCKED',
]);
export const reconciliationStatusSchema = z.enum([
  'UNMATCHED', 'SUGGESTED', 'MATCHED', 'PARTIALLY_MATCHED', 'EXCEPTION', 'CONFIRMED',
]);
export const verifactuStatusSchema = z.enum([
  'NOT_APPLICABLE', 'NOT_CONFIGURED', 'PENDING', 'QUEUED', 'SUBMITTED', 'ACCEPTED',
  'REJECTED', 'RETRY_REQUIRED', 'CANCELLED',
]);
export const dossierStatusSchema = z.enum([
  'OPEN', 'VALIDATION_IN_PROGRESS', 'PENDING_REVIEW', 'READY_TO_CLOSE', 'CLOSED',
  'REOPENED_WITH_AUDIT_TRAIL',
]);
export const roleSchema = z.enum(['ADMIN', 'FISCAL_OPERATOR', 'REVIEWER', 'ADVISOR_READONLY']);
export type Role = z.infer<typeof roleSchema>;

export const permissions = {
  ADMIN: ['*'],
  FISCAL_OPERATOR: ['imports:write', 'operations:write', 'documents:issue'],
  REVIEWER: ['operations:review', 'periods:close', 'documents:rectify'],
  ADVISOR_READONLY: ['*:read'],
} as const satisfies Record<Role, readonly string[]>;

export function can(role: Role, permission: string): boolean {
  return permissions[role].some((allowed) =>
    allowed === '*' || allowed === permission || (allowed === '*:read' && permission.endsWith(':read')),
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
