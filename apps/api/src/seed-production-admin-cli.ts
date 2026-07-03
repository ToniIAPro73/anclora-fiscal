import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createRemoteDatabase, tenants, users } from '@anclora/db';
import { roleSchema } from '@anclora/core';

// Interactive, idempotent script to seed (or update) exactly one tenant +
// admin user in a real Neon/Postgres database, then print the
// AUTH_IDENTITIES_JSON value to paste into Vercel's dashboard. Never run
// automatically — always requires a human at the keyboard, and connects
// only to the DATABASE_URL you provide when running it (never touches
// Vercel directly). Safe to re-run: matching an existing tenant slug or user
// email updates that row instead of creating a duplicate.
//
// Generate the password hash first (hides input, per pnpm auth:hash):
//   pnpm --filter @anclora/api auth:hash
// Then run this script and paste that hash when prompted:
//   DATABASE_URL=postgresql://... IMPORT_METADATA_SECRET=... \
//     pnpm --filter @anclora/api exec tsx src/seed-production-admin-cli.ts

function encryptEmail(email: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

function decryptEmail(payload: string, secret: string): string | null {
  const key = createHash('sha256').update(secret).digest();
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL es obligatoria. Exporta la cadena de conexión de producción antes de ejecutar este script.');
  const secret = process.env.IMPORT_METADATA_SECRET;
  if (!secret || secret.length < 32) throw new Error('IMPORT_METADATA_SECRET (>= 32 caracteres) es obligatoria — se reutiliza para cifrar el email en reposo, igual que en producción.');

  const rl = createInterface({ input: stdin, output: stdout });
  const tenantSlug = (await rl.question('Slug del tenant (p.ej. "anclora-insights"): ')).trim();
  const tenantName = (await rl.question('Nombre del tenant (p.ej. "Anclora Insights"): ')).trim();
  const email = (await rl.question('Email del usuario: ')).trim().toLowerCase();
  const displayName = (await rl.question('Nombre para mostrar: ')).trim();
  const roleInput = (await rl.question(`Rol [${roleSchema.options.join('|')}] (default ADMIN): `)).trim() || 'ADMIN';
  const role = roleSchema.parse(roleInput);
  const passwordHash = (await rl.question('Hash de contraseña (genera con "pnpm --filter @anclora/api auth:hash" primero): ')).trim();
  rl.close();

  if (!tenantSlug || !tenantName || !email || !displayName || !passwordHash) {
    throw new Error('Todos los campos son obligatorios.');
  }

  const { db, close } = createRemoteDatabase(databaseUrl);
  try {
    let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (!tenant) {
      [tenant] = await db.insert(tenants).values({ name: tenantName, slug: tenantSlug }).returning();
      console.log(`Tenant creado: ${tenant!.id}`);
    } else {
      console.log(`Tenant existente reutilizado: ${tenant!.id}`);
    }

    const existingUsers = await db.select().from(users).where(eq(users.tenantId, tenant!.id));
    const matched = existingUsers.find((u) => decryptEmail(u.emailEncrypted, secret) === email);
    const emailEncrypted = encryptEmail(email, secret);

    let userId: string;
    if (matched) {
      await db.update(users).set({ displayName, passwordHash, emailEncrypted }).where(eq(users.id, matched.id));
      userId = matched.id;
      console.log(`Usuario existente actualizado: ${userId}`);
    } else {
      const [created] = await db.insert(users).values({ tenantId: tenant!.id, emailEncrypted, displayName, passwordHash }).returning();
      userId = created!.id;
      console.log(`Usuario creado: ${userId}`);
    }

    const identity = { actorId: userId, tenantId: tenant!.id, email, displayName, role, passwordHash };
    console.log('\nPega esto en Vercel → anclora-fiscal-api → Environment Variables → AUTH_IDENTITIES_JSON:\n');
    console.log(JSON.stringify([identity]));
  } finally {
    await close();
  }
}

await main();
