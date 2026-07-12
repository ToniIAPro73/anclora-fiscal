export interface FileMetadata { name: string; mimeType: string; size: number; }
export interface StoredFile extends FileMetadata { key: string; sha256: string; }
export interface ImportMapping { version: string; fields: Record<string, string>; }
export interface DetectionResult { connectorId: string; confidence: number; reasons: string[]; }
export interface ValidationResult { valid: boolean; issues: string[]; }
export interface ImportPreview { columns: string[]; rows: unknown[]; issues: string[]; }
export interface ImportResult { imported: number; rejected: number; duplicates: number; }
export interface NormalizedEntityResult { entityIds: string[]; issues: string[]; }
export interface ImportRow { index: number; raw: unknown; status: 'VALID' | 'INVALID' | 'DUPLICATE' | 'UNCLASSIFIED'; }
export interface ConnectorCapabilities { batch: boolean; preview: boolean; idempotent: boolean; }

export interface SourceConnector {
  id: string;
  name: string;
  supportedImportTypes: string[];
  detect(file: FileMetadata): Promise<DetectionResult>;
  validate(file: StoredFile): Promise<ValidationResult>;
  preview(file: StoredFile, mapping?: ImportMapping): Promise<ImportPreview>;
  import(file: StoredFile, mapping?: ImportMapping): Promise<ImportResult>;
  normalize(rows: ImportRow[]): Promise<NormalizedEntityResult>;
  getCapabilities(): ConnectorCapabilities;
}

// shopify-csv.js is a deprecated re-export of shopify-payments-ledger-csv.js;
// exporting only the latter here avoids a duplicate-member conflict while
// direct imports from 'shopify-csv.js' keep working (backward compatibility).
export * from './shopify-payments-ledger-csv.js';
export * from './expenses-csv.js';
export * from './shopify-orders-csv.js';
export * from './shopify-order-transactions-csv.js';
export * from './kdp-xlsx.js';
