import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@anclora/core';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';
import type { VerifactuSubmissionsRepositoryPort } from './verifactu-submissions-controller';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function authenticatedApp(role: Role, repository?: VerifactuSubmissionsRepositoryPort) {
  const app = await buildApp({
    verifactuSubmissionsRepository: repository,
    authService: new AuthService({ authenticate: async () => ({
      actorId: '01977d43-75de-7000-8000-000000000020',
      tenantId: '01977d43-75de-7000-8000-000000000010',
      email: 'operator@example.test',
      displayName: 'Operador',
      role,
    }) }, { record: async () => undefined }),
  });
  apps.push(app);

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'operator@example.test', password: 'valid-password' },
  });

  const setCookie = login.headers['set-cookie'];
  return {
    app,
    cookie: (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '',
  };
}

describe('GET /api/v1/verifactu/submissions', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ verifactuSubmissionsRepository: { list: vi.fn() } });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/v1/verifactu/submissions' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 503 cuando no se ha inyectado repositorio', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', undefined);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verifactu/submissions',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'VERIFACTU_SUBMISSIONS_REPOSITORY_UNAVAILABLE' });
  });

  it('lista estados VERI*FACTU pasando tenant, paginación y filtros al repositorio', async () => {
    const page = {
      items: [
        {
          id: 'vs-1',
          tenantId: '01977d43-75de-7000-8000-000000000010',
          integrityRecordId: 'ir-1',
          environment: 'mock',
          status: 'PENDING',
          payloadRedacted: { documentNumber: 'FS-1' },
          responseRedacted: null,
          attemptCount: '0',
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:00:00.000Z',
          fiscalDocumentId: 'fd-1',
          fiscalDocumentNumber: 'FS-1',
          documentType: 'SIMPLIFICADA',
          issuedAt: '2026-07-09T00:00:00.000Z',
          recordType: 'ALTA',
          chainHash: 'hash-1',
          previousHash: null,
        },
      ],
      page: 2,
      pageSize: 10,
      total: 1,
    };

    const list = vi.fn().mockResolvedValue(page);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verifactu/submissions?page=2&pageSize=10&status=PENDING&environment=mock',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(page);
    expect(list).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      page: 2,
      pageSize: 10,
      status: 'PENDING',
      environment: 'mock',
    });
  });
});

describe('GET /api/v1/verifactu/submissions/:submissionId/attempts', () => {
  it('devuelve 401 cuando no existe sesión autenticada', async () => {
    const app = await buildApp({ verifactuSubmissionsRepository: { list: vi.fn(), listAttempts: vi.fn() } });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verifactu/submissions/vs-1/attempts',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('devuelve 503 cuando el historial no está disponible', async () => {
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list: vi.fn() });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verifactu/submissions/vs-1/attempts',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'VERIFACTU_SUBMISSION_ATTEMPTS_REPOSITORY_UNAVAILABLE' });
  });

  it('lista intentos pasando tenant y submissionId al repositorio', async () => {
    const items = [
      {
        id: 'attempt-1',
        tenantId: '01977d43-75de-7000-8000-000000000010',
        verifactuSubmissionId: 'vs-1',
        attemptNumber: '1',
        status: 'ACCEPTED',
        responseRedacted: {
          schemaVersion: 'anclora-verifactu-response-redacted-v1',
          environment: 'test',
          status: 'ACCEPTED',
          reference: 'aeat-ref-1',
          message: 'Aceptado',
          submittedAt: '2026-07-09T10:00:00.000Z',
        },
        attemptedAt: '2026-07-09T10:00:00.000Z',
        createdAt: '2026-07-09T10:00:00.000Z',
        updatedAt: '2026-07-09T10:00:00.000Z',
      },
    ];

    const list = vi.fn();
    const listAttempts = vi.fn().mockResolvedValue(items);
    const { app, cookie } = await authenticatedApp('FISCAL_OPERATOR', { list, listAttempts });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/verifactu/submissions/vs-1/attempts',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items });
    expect(listAttempts).toHaveBeenCalledWith({
      tenantId: '01977d43-75de-7000-8000-000000000010',
      submissionId: 'vs-1',
    });
  });
});
