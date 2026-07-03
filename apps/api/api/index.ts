import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createProductionApp } from '../src/create-production-app.js';

// Vercel Function adapter: wraps the Fastify app (built once per cold start,
// reused across warm invocations) so it can serve requests as a standard
// Vercel Node.js Function under the `/api` directory convention. This
// sidesteps Vercel's "Fastify" framework preset entirely — that preset's
// zero-config entrypoint detection and dependency bundling proved unreliable
// for this pnpm monorepo (repeatedly failed to trace workspace packages like
// @anclora/connectors and @anclora/db into the deployed function). A
// `vercel.json` rewrite routes every incoming path to this single function,
// and Fastify's own router dispatches based on the request's real path.
let appPromise: Promise<FastifyInstance> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  appPromise ??= createProductionApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit('request', req, res);
}
