import { describe, expect, it, vi } from 'vitest';
import {
  AuthService,
  ConfiguredIdentityProvider,
  hashPassword,
} from './auth-service.js';

const actorId = '01977d43-75de-7000-8000-000000000020';
const tenantId = '01977d43-75de-7000-8000-000000000010';

async function createIdentityProvider() {
  const passwordHash = await hashPassword(
    'correct horse battery staple',
    Buffer.alloc(16, 1),
  );

  return new ConfiguredIdentityProvider(
    JSON.stringify([
      {
        actorId,
        tenantId,
        email: 'admin@anclora.test',
        displayName: 'Administración',
        role: 'ADMIN',
        passwordHash,
      },
    ]),
  );
}

describe('authentication', () => {
  it('verifica scrypt y emite una sesión corta con actor y tenant', async () => {
    const provider = await createIdentityProvider();
    const record = vi.fn().mockResolvedValue(undefined);
    const auth = new AuthService(provider, { record }, 60);

    await expect(
      auth.login('ADMIN@ANCLORA.TEST', 'incorrecta'),
    ).resolves.toBeNull();

    const session = await auth.login(
      'admin@anclora.test',
      'correct horse battery staple',
    );

    expect(session).toMatchObject({
      role: 'ADMIN',
      tenantId,
    });

    expect(auth.decode(auth.encode(session!))).toEqual(session);
    expect(record).toHaveBeenCalledOnce();
  });

  it('autoriza una identidad externa solo si el correo ya está configurado', async () => {
    const provider = await createIdentityProvider();
    const record = vi.fn().mockResolvedValue(undefined);
    const auth = new AuthService(provider, { record }, 60);

    const session = await auth.loginWithExternalIdentity({
      provider: 'github',
      providerAccountId: '123456',
      email: 'ADMIN@ANCLORA.TEST',
    });

    expect(session).toMatchObject({
      actorId,
      tenantId,
      email: 'admin@anclora.test',
      role: 'ADMIN',
    });

    expect(record).toHaveBeenCalledWith({
      tenantId,
      actorId,
      action: 'LOGIN_SUCCEEDED',
    });

    await expect(
      auth.loginWithExternalIdentity({
        provider: 'github',
        providerAccountId: '999999',
        email: 'intruso@example.com',
      }),
    ).resolves.toBeNull();

    expect(record).toHaveBeenCalledTimes(1);
  });
});
