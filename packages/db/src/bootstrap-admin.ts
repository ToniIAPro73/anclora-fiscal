import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');

interface ConfiguredIdentity {
  displayName?: unknown;
  role?: unknown;
}

const [identity] = JSON.parse(process.env.AUTH_IDENTITIES_JSON ?? '[]') as ConfiguredIdentity[];
if (typeof identity?.displayName !== 'string' || !identity.displayName.trim() || identity.role !== 'ADMIN') {
  throw new Error('AUTH_IDENTITIES_JSON requiere displayName y role ADMIN para el bootstrap');
}
const displayName = identity.displayName.trim();

const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const result = await client.begin(async (transaction) => {
    let [tenant] = await transaction<{ id: string }[]>`
      SELECT id FROM tenants WHERE slug = 'anclora-insights' LIMIT 1
    `;
    tenant ??= (await transaction<{ id: string }[]>`
      INSERT INTO tenants (name, slug)
      VALUES ('Anclora Insights', 'anclora-insights')
      RETURNING id
    `)[0];
    if (!tenant) throw new Error('No se pudo crear el tenant inicial');

    let [actor] = await transaction<{ id: string }[]>`
      SELECT id FROM users WHERE tenant_id = ${tenant.id} ORDER BY created_at LIMIT 1
    `;
    const created = !actor;
    actor ??= (await transaction<{ id: string }[]>`
      INSERT INTO users (tenant_id, email_encrypted, display_name, password_hash)
      VALUES (${tenant.id}, 'managed-by-auth-directory', ${displayName}, 'managed-by-auth-directory')
      RETURNING id
    `)[0];
    if (!actor) throw new Error('No se pudo crear el actor administrador');

    let [role] = await transaction<{ id: string }[]>`
      SELECT id FROM roles WHERE tenant_id = ${tenant.id} AND name = 'ADMIN' LIMIT 1
    `;
    role ??= (await transaction<{ id: string }[]>`
      INSERT INTO roles (tenant_id, name, description)
      VALUES (${tenant.id}, 'ADMIN', 'Administración completa del tenant')
      RETURNING id
    `)[0];
    if (!role) throw new Error('No se pudo crear el rol administrador');

    await transaction`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (${actor.id}, ${role.id})
      ON CONFLICT DO NOTHING
    `;
    if (created) {
      await transaction`
        INSERT INTO audit_events (tenant_id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (${tenant.id}, ${actor.id}, 'BOOTSTRAP_ADMIN_CREATED', 'User', ${actor.id}, ${transaction.json({ source: 'authorized-bootstrap' })})
      `;
    }
    return { tenantId: tenant.id, actorId: actor.id, created };
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await client.end();
}
