import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { expect, test as setup } from '@playwright/test';

const authFile = resolve(process.cwd(), 'test-results/.auth/user.json');
const localEnv = resolve(process.cwd(), '../../.env.local');

interface TestIdentity {
  actorId: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
}

setup('authenticated browser state', async ({ context, request }) => {
  if (existsSync(localEnv)) loadEnvFile(localEnv);

  const secret = process.env.SESSION_SECRET;
  const serializedIdentities = process.env.AUTH_IDENTITIES_JSON;
  if (!secret || !serializedIdentities) {
    throw new Error('E2E auth requires SESSION_SECRET and AUTH_IDENTITIES_JSON');
  }

  const [identity] = JSON.parse(serializedIdentities) as TestIdentity[];
  if (!identity) throw new Error('E2E auth requires at least one configured identity');

  const session = Buffer.from(JSON.stringify({
    actorId: identity.actorId,
    tenantId: identity.tenantId,
    email: identity.email,
    displayName: identity.displayName,
    role: identity.role,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(session).digest('base64').replace(/=/gu, '');

  await context.addCookies([{
    name: 'anclora_session',
    value: `${session}.${signature}`,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);

  const response = await request.get('http://127.0.0.1:3001/api/v1/session', {
    headers: { cookie: `anclora_session=${session}.${signature}` },
  });
  await expect(response).toBeOK();
  expect((await response.json()).authenticated).toBe(true);

  mkdirSync(resolve(authFile, '..'), { recursive: true });
  await context.storageState({ path: authFile });
});
