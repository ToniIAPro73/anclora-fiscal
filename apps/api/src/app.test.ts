import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

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
});
