import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { FilesystemStorage, type StoragePort } from '@anclora/core/server';
import { resolve } from 'node:path';
import { createImportPreviewHandler } from './import-controller';
import type { ImportPreviewPersistencePort } from './import-preview-persistence';
import { requireRole } from './rbac-plugin';
import { registerAuthRoutes } from './auth-controller';
import { AuthService, ConfiguredIdentityProvider } from './auth-service';

export async function buildApp(options: {
  storage?: StoragePort;
  importPreviewPersistence?: ImportPreviewPersistencePort;
  authService?: AuthService;
} = {}) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production');
  }
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.taxId', '*.address'] } });
  await app.register(helmet, { contentSecurityPolicy: true });
  await app.register(cookie, {
    secret: sessionSecret ?? 'development-only-secret-change-me',
    parseOptions: { sameSite: 'lax', httpOnly: true, path: '/' },
  });
  await app.register(cors, { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true });
  await app.register(multipart, { limits: { files: 10, fileSize: 15 * 1024 * 1024 } });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(swagger, { openapi: { info: { title: 'Anclora Fiscal API', version: '0.1.0' }, servers: [{ url: '/api/v1' }] } });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  app.get('/health', { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' }, verifactuEnabled: { type: 'boolean' } } } } } }, async () => ({ status: 'ok', verifactuEnabled: process.env.VERIFACTU_ENABLED === 'true' }));
  const authService = options.authService ?? new AuthService(
    new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON),
    { record: async () => undefined },
  );
  registerAuthRoutes(app, authService);
  app.post(
    '/api/v1/imports/preview',
    { preHandler: requireRole(['imports:write']) },
    createImportPreviewHandler({
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      persistence: options.importPreviewPersistence,
    }),
  );
  return app;
}
