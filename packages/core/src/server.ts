// Server-only entrypoint for `@anclora/core`. These modules import Node.js
// built-ins (`node:crypto`, `node:fs/promises`, `node:path`) and/or Node-only
// dependencies (`pdf-lib`, `fflate`, `xlsx`). Import from `@anclora/core/server`
// in API routes, Route Handlers, and Server Components — never from
// 'use client' components, which must use the client-safe `@anclora/core`
// entrypoint (`./index.ts`) instead.
export * from './storage.js';
export * from './invoicing.js';
export * from './tax-identity.js';
export * from './verifactu.js';
export * from './verifactu-qr.js';
export * from './verifactu-remediation.js';
export * from './verifactu-aeat-spec.js';
export * from './verifactu-aeat-portal.js';
export * from './verifactu-aeat-local-validation.js';
export * from './verifactu-aeat-diagnostics.js';
export * from './verifactu-aeat-real-soap-transport.js';
export * from './verifactu-aeat-manual-preproduction.js';
export * from './verifactu-aeat-manual-preproduction-submit.js';
export * from './verifactu-aeat-xml.js';
export * from './verifactu-aeat-signing.js';
export * from './verifactu-aeat-transport.js';
export * from './dossier.js';
export * from './sif-events.js';

// Re-export the client-safe surface too, so server-side consumers can import
// everything from a single subpath if convenient.
export * from './matching.js';
export * from './royalty.js';
