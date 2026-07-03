import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { roleSchema, type Role } from '@anclora/core';
import { z } from 'zod';

const scrypt = promisify(scryptCallback);
const DUMMY_PASSWORD_HASH = `scrypt$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;

export interface AuthenticatedActor {
  actorId: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface IdentityProviderPort {
  authenticate(email: string, password: string): Promise<AuthenticatedActor | null>;
}

export interface AuthAuditPort {
  record(input: { tenantId: string; actorId: string; action: 'LOGIN_SUCCEEDED' | 'LOGOUT'; ipHash?: string }): Promise<void>;
}

const configuredIdentitySchema = z.object({
  actorId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: roleSchema,
  passwordHash: z.string().startsWith('scrypt$'),
});

const sessionSchema = z.object({
  actorId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: roleSchema,
  expiresAt: z.number().int().positive(),
});

export type AuthSession = z.infer<typeof sessionSchema>;

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<string> {
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, saltValue, hashValue] = encoded.split('$');
  if (!saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class ConfiguredIdentityProvider implements IdentityProviderPort {
  private readonly identities: z.infer<typeof configuredIdentitySchema>[];

  constructor(serializedIdentities: string | undefined) {
    const parsed = serializedIdentities ? JSON.parse(serializedIdentities) : [];
    this.identities = z.array(configuredIdentitySchema).parse(parsed);
  }

  async authenticate(email: string, password: string): Promise<AuthenticatedActor | null> {
    const identity = this.identities.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
    const validPassword = await verifyPassword(password, identity?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!identity || !validPassword) return null;
    return {
      actorId: identity.actorId,
      tenantId: identity.tenantId,
      email: identity.email,
      displayName: identity.displayName,
      role: identity.role,
    };
  }
}

export class AuthService {
  constructor(
    private readonly identities: IdentityProviderPort,
    private readonly audit: AuthAuditPort,
    private readonly ttlSeconds = 8 * 60 * 60,
  ) {}

  async login(email: string, password: string, ipHash?: string): Promise<AuthSession | null> {
    const actor = await this.identities.authenticate(email, password);
    if (!actor) return null;
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.actorId, action: 'LOGIN_SUCCEEDED', ...(ipHash ? { ipHash } : {}) });
    return { ...actor, expiresAt: Math.floor(Date.now() / 1000) + this.ttlSeconds };
  }

  async logout(session: AuthSession, ipHash?: string): Promise<void> {
    await this.audit.record({ tenantId: session.tenantId, actorId: session.actorId, action: 'LOGOUT', ...(ipHash ? { ipHash } : {}) });
  }

  encode(session: AuthSession): string {
    return Buffer.from(JSON.stringify(session)).toString('base64url');
  }

  decode(value: string): AuthSession | null {
    try {
      const parsed = sessionSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
      if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
