import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './build-app';
import { AuthService } from './auth-service';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe('signed session API', () => {
  it('crea, valida y elimina una cookie firmada sin exponer secretos', async () => {
    const actions: string[] = [];
    const app = await buildApp({ authService: new AuthService({ authenticate: async (email, password) =>
      email === 'admin@anclora.test' && password === 'secret-value'
        ? { actorId: '01977d43-75de-7000-8000-000000000020', tenantId: '01977d43-75de-7000-8000-000000000010', email, displayName: 'Admin', role: 'ADMIN' }
        : null
    }, { record: async ({ action }) => { actions.push(action); } }) });
    apps.push(app);

    const invalid = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@anclora.test', password: 'wrong' } });
    expect(invalid.statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@anclora.test', password: 'secret-value' } });
    const setCookie = login.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? '';
    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');
    expect(login.body).not.toContain('secret-value');

    const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } });
    expect(session.json()).toMatchObject({ authenticated: true, actor: { role: 'ADMIN' } });
    const tampered = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: `${cookie}x` } });
    expect(tampered.json()).toEqual({ authenticated: false });
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    expect(actions).toEqual(['LOGIN_SUCCEEDED', 'LOGOUT']);
  });
});
