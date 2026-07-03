# API

## Rutas disponibles

### `GET /health`

Devuelve `status` y el estado booleano de `VERIFACTU_ENABLED`.

### `GET /api/v1/session`

Valida la cookie firmada `anclora_session`. Devuelve `authenticated: false`
sin sesión válida o el actor, tenant, rol y expiración de la sesión activa.

### `POST /api/v1/auth/login`

Recibe JSON `{ email, password }`, verifica la identidad configurada en
`AUTH_IDENTITIES_JSON` mediante scrypt y establece una cookie firmada,
`httpOnly`, `SameSite=Strict`, con duración máxima de ocho horas. Está limitado
a cinco intentos cada quince minutos. No devuelve contraseña ni hash.

### `POST /api/v1/auth/logout`

Audita el cierre de sesión cuando existe una sesión válida y elimina la cookie.

Las identidades no se incluyen en el repositorio. Para generar un hash, el
comando solicita la contraseña de forma interactiva y oculta, sin dejarla en
el historial del shell:

```bash
pnpm --filter @anclora/api auth:hash
```

El resultado se asigna a `passwordHash` dentro de `AUTH_IDENTITIES_JSON`. Sus
`actorId` y `tenantId` deben corresponder a filas existentes para que los
eventos de acceso puedan auditarse con integridad referencial.

Para una base remota vacía, después de exportar las variables de `.env.local`,
los comandos operativos son:

```bash
pnpm --filter @anclora/db db:migrate
pnpm --filter @anclora/db db:bootstrap-admin
```

Ambos son idempotentes. Las migraciones verifican el checksum de cada archivo
ya aplicado y el bootstrap reutiliza el tenant, actor y rol existentes.

### `POST /api/v1/imports/preview`

Acepta multipart con campo `file`, máximo 15 MB. MIME permitidos: CSV, PDF y
XLSX. Requiere una sesión firmada cuyo actor tenga rol `FISCAL_OPERATOR` o
`ADMIN`. El tenant de almacenamiento y persistencia se deriva exclusivamente
de esa sesión; la cabecera `x-anclora-role` ya no se consulta.

La respuesta incluye conector, hash de evidencia, resumen e incidencias sin
PII. Los errores son `400 FILE_REQUIRED`, `401 UNAUTHENTICATED`,
`403 FORBIDDEN` y errores `422` de MIME o estructura.

## Recursos no implementados

No existen rutas para operaciones, eventos financieros, payouts, reglas o
decisiones fiscales, documentos, conciliaciones, incidencias, VERI*FACTU,
periodos, expedientes, exports ni auditoría. Construir esa superficie REST y
cablear `packages/db` queda fuera del endurecimiento y sigue siendo el mayor
gap funcional.

## OpenAPI

La interfaz Swagger está en `/documentation`. Actualmente solo parte de los
esquemas de respuesta está descrita de forma explícita.
