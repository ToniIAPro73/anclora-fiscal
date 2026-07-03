import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createProductionApp } from './create-production-app.js';

// Source for the Vercel Function, bundled by scripts/build-vercel-handler.mjs
// into api/_handler.mjs (a fully self-contained artifact with every
// @anclora/* workspace package inlined). Vercel's own dependency tracing for
// this pnpm monorepo repeatedly failed to resolve workspace packages
// (@anclora/connectors, then @anclora/db) at runtime — bundling removes that
// failure mode entirely: the deployed artifact carries its own code, so
// there is nothing left for Vercel's tracer to get wrong.
let appPromise: Promise<FastifyInstance> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  appPromise ??= createProductionApp();
  const app = await appPromise;
  await app.ready();
  app.server.emit('request', req, res);
}
