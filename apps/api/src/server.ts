import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProductionApp } from './create-production-app.js';

// Local-dev-only env loading. Deliberately kept out of create-production-app.ts
// (shared with the bundled Vercel handler) — a literal file path reference
// there would get traced and copied into the deployed function artifact by
// static bundling analysis, even though this NODE_ENV guard would never
// actually read it in production.
const localEnvFile = fileURLToPath(new URL('../../../.env.local', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(localEnvFile)) loadEnvFile(localEnvFile);

const app = await createProductionApp();
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
