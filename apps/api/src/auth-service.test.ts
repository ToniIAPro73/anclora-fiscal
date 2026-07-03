import { describe, expect, it, vi } from 'vitest';
import { AuthService, ConfiguredIdentityProvider, hashPassword } from './auth-service';

describe('authentication', () => {
  it('verifica scrypt y emite una sesión corta con actor y tenant', async () => {
    const passwordHash = await hashPassword('correct horse battery staple', Buffer.alloc(16, 1));
    const provider = new ConfiguredIdentityProvider(JSON.stringify([{
      actorId: '01977d43-75de-7000-8000-000000000020', tenantId: '01977d43-75de-7000-8000-000000000010',
      email: 'admin@anclora.test', displayName: 'Administración', role: 'ADMIN', passwordHash,
    }]));
    const record = vi.fn().mockResolvedValue(undefined);
    const auth = new AuthService(provider, { record }, 60);

    await expect(auth.login('ADMIN@ANCLORA.TEST', 'incorrecta')).resolves.toBeNull();
    const session = await auth.login('admin@anclora.test', 'correct horse battery staple');
    expect(session).toMatchObject({ role: 'ADMIN', tenantId: '01977d43-75de-7000-8000-000000000010' });
    expect(auth.decode(auth.encode(session!))).toEqual(session);
    expect(record).toHaveBeenCalledOnce();
  });
});
