import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './build-app';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('API foundation', () => {
  it('mantiene VERI*FACTU desactivado por defecto', async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', verifactuEnabled: false });
  });

  // Regression: the vat-dossier routes were defined in vat-dossier-controller.ts
  // but never registered in buildApp(), so both endpoints fell through to
  // Fastify's default "route not found" 404 handler regardless of auth state.
  // A missing route and an intentional 401 both surface as non-2xx, so this
  // asserts on Fastify's default not-found response shape (`error: 'Not Found'`)
  // rather than statusCode alone, to actually distinguish "unregistered" from
  // "registered but rejected".
  it('registra las rutas de expediente de IVA (GET y POST /api/v1/periods/:period/vat-dossier)', async () => {
    const app = await buildApp();
    apps.push(app);

    const getResponse = await app.inject({ method: 'GET', url: '/api/v1/periods/2026-06/vat-dossier' });
    expect(getResponse.statusCode).not.toBe(404);
    expect(getResponse.json()).not.toMatchObject({ error: 'Not Found' });

    const postResponse = await app.inject({ method: 'POST', url: '/api/v1/periods/2026-06/vat-dossier' });
    expect(postResponse.statusCode).not.toBe(404);
    expect(postResponse.json()).not.toMatchObject({ error: 'Not Found' });
  });

  it('registra la ruta GET /api/v1/reconciliation/unmatched-orders (Task 4.11)', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/v1/reconciliation/unmatched-orders' });
    expect(response.statusCode).not.toBe(404);
    expect(response.json()).not.toMatchObject({ error: 'Not Found' });
  });
});
