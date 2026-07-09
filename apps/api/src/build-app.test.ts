import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './build-app';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

async function withTemporaryEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void>,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(values)) {
    previous.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('API foundation', () => {
  it('mantiene VERI*FACTU desactivado por defecto', async () => {
    const app = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      verifactuEnabled: false,
      verifactuMode: 'disabled',
      verifactuCanSubmit: false,
      verifactuProductionSafe: true,
    });
  });

  // FASE 00: confirms not just the flag default but the actual absence of an
  // active VERI*FACTU submission endpoint — see docs/adr/0005-verifactu-preparation-only.md.
  // Fastify's printRoutes() dumps the full registered route tree as text; asserting
  // it contains no submission-style path is the cheapest way to catch a future
  // accidental registration without hardcoding the full route list here.
  it('expone configuración runtime VERI*FACTU de pruebas cuando el adapter está configurado por env', async () => {
    await withTemporaryEnv(
      {
        NODE_ENV: 'test',
        VERIFACTU_MODE: 'test',
        VERIFACTU_AEAT_ADAPTER_ENABLED: 'true',
        VERIFACTU_AEAT_SIGNING_ENABLED: 'true',
        VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT: 'cert-fp-1',
        VERIFACTU_AEAT_TEST_ENDPOINT_URL: 'https://aeat.test.example/verifactu',
      },
      async () => {
        const app = await buildApp();
        apps.push(app);

        const response = await app.inject({ method: 'GET', url: '/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          status: 'ok',
          verifactuEnabled: true,
          verifactuMode: 'test',
          verifactuCanSubmit: true,
          verifactuProductionSafe: true,
        });
      },
    );
  });

  it('no registra ningún endpoint de envío VERI*FACTU (preparación, no integración activa)', async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();
    const routes = app.printRoutes();
    expect(routes).not.toMatch(/verifactu\/submit/i);
    expect(routes).not.toMatch(/verifactu\/send/i);
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

  it('registra la ruta GET /api/v1/verifactu/submissions como read model sin envío', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/v1/verifactu/submissions' });
    expect(response.statusCode).not.toBe(404);
    expect(response.json()).not.toMatchObject({ error: 'Not Found' });

    await app.ready();
    const routes = app.printRoutes();
    expect(routes).toMatch(/verifactu\/submissions/i);
    expect(routes).toMatch(/verifactu\/submissions\/:submissionId\/attempts/i);
    expect(routes).not.toMatch(/verifactu\/submit/i);
    expect(routes).not.toMatch(/verifactu\/send/i);
  });
});
