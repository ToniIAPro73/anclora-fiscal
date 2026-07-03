// Server-only entrypoint for `@anclora/core`. These modules import Node.js
// built-ins (`node:crypto`, `node:fs/promises`, `node:path`) and/or Node-only
// dependencies (`pdf-lib`, `fflate`, `xlsx`). Import from `@anclora/core/server`
// in API routes, Route Handlers, and Server Components — never from
// 'use client' components, which must use the client-safe `@anclora/core`
// entrypoint (`./index.ts`) instead.
export * from './storage.js';
export * from './invoicing.js';
export * from './verifactu.js';
export * from './dossier.js';

// Re-export the client-safe surface too, so server-side consumers can import
// everything from a single subpath if convenient.
export * from './matching.js';
export * from './royalty.js';
