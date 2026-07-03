import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { FilesystemStorage } from '@anclora/core/server';
import { resolve } from 'node:path';
import { previewImport } from './import-service';

export async function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.taxId', '*.address'] } });
  await app.register(helmet, { contentSecurityPolicy: true });
  await app.register(cookie, { secret: process.env.SESSION_SECRET ?? 'development-only-secret-change-me' });
  await app.register(cors, { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', methods: ['GET', 'POST'] });
  await app.register(multipart, { limits: { files: 10, fileSize: 15 * 1024 * 1024 } });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(swagger, { openapi: { info: { title: 'Anclora Fiscal API', version: '0.1.0' }, servers: [{ url: '/api/v1' }] } });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  app.get('/health', { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' }, verifactuEnabled: { type: 'boolean' } } } } } }, async () => ({ status: 'ok', verifactuEnabled: process.env.VERIFACTU_ENABLED === 'true' }));
  app.get('/api/v1/session', async () => ({ authenticated: false, availableRoles: ['ADMIN', 'FISCAL_OPERATOR', 'REVIEWER', 'ADVISOR_READONLY'] }));
  app.post('/api/v1/imports/preview', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ code: 'FILE_REQUIRED', message: 'Debe adjuntar un archivo' });
    const bytes = await file.toBuffer();
    try {
      return await previewImport({ tenantId: 'demo-tenant', filename: file.filename, mimeType: file.mimetype, bytes, storage: new FilesystemStorage(resolve(process.cwd(), '../../storage')) });
    } catch (error) {
      request.log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'Import preview rejected');
      return reply.code(422).send({ code: 'INVALID_IMPORT', message: 'El archivo no coincide con un formato admitido' });
    }
  });
  return app;
}
