# Seguridad

## Controles activos

- Helmet y CSP predeterminada.
- CORS limitado a `APP_ORIGIN` y métodos GET/POST.
- Rate limit de 100 solicitudes por minuto.
- Multipart limitado a 10 archivos y 15 MB por archivo.
- Allowlist MIME y validación estructural antes de custodiar la evidencia.
- Logs con redacción de autorización, cookies, email, NIF y direcciones.
- Cookies `SameSite=Lax`, `HttpOnly` y path raíz.
- RBAC reutiliza `roleSchema` y `can()` de `@anclora/core`.

## Modelo de confianza RBAC

No existe ningún mecanismo de rol por cabecera. El
rol, actor y tenant provienen exclusivamente de la sesión firmada
(`apps/api/src/auth-service.ts`, `apps/api/src/auth-controller.ts`):

- `POST /api/v1/auth/login` valida `email`/`password` contra las identidades
  configuradas en `AUTH_IDENTITIES_JSON` (scrypt + `timingSafeEqual`) y emite
  una sesión (`AuthSession`) codificada en base64url dentro de una cookie
  `anclora_session` firmada por `@fastify/cookie` (`httpOnly`, `SameSite=Strict`,
  `secure` en producción, expiración máxima de ocho horas).
- Cada request pasa por un hook `preHandler` global
  (`registerAuthRoutes`) que decodifica la cookie, valida su firma y su
  `expiresAt`, y expone `request.authSession` (`null` si no hay sesión válida
  o ha expirado).
- `requireRole()` (`apps/api/src/rbac-plugin.ts`) es el único punto donde se
  aplica autorización por ruta: reutiliza `can()`/`roleSchema` de
  `@anclora/core` sobre `request.authSession.role`. Sin sesión → `401
  UNAUTHENTICATED`; sesión con rol insuficiente → `403 FORBIDDEN`.
- El `tenantId` de cada operación (listados, mutaciones, cierre de período,
  expediente IVA) se lee siempre de `request.authSession.tenantId`, nunca de
  query params, body ni cabeceras — no hay forma de que un actor autenticado
  opere sobre el tenant de otro.
- `POST /api/v1/auth/logout` audita el cierre (`AuthAuditPort.record`) y
  limpia la cookie con `reply.clearCookie`.

## Subidas

La extensión y el MIME no bastan: CSV, PDF y KDP XLSX deben superar sus parsers
y contratos. Los bytes inválidos no se escriben en storage. La lectura XLSX no
confiable usa SheetJS 0.20.3 parcheado desde su CDN oficial.

## Dependencias

La Fase 6 actualiza Next.js a 15.5.18 y Drizzle ORM a 0.45.2 tras ejecutar
`pnpm audit --prod`. SheetJS queda fijado al tarball oficial 0.20.3 en los dos
paquetes que lo usan. La auditoría queda sin vulnerabilidades conocidas.

## Riesgos pendientes

El filesystem de `FilesystemStorage` no cifra en reposo. No existen URLs de
descarga firmadas: `GET /api/v1/periods/:period/vat-dossier` devuelve el
`storageKey` en crudo porque `StoragePort` no expone todavía un mecanismo de
firma (ver `docs/api.md`) — cualquier cliente con acceso al `storageKey` y al
filesystem/almacén subyacente puede leer el expediente sin control adicional
de expiración o alcance. Tampoco hay CSRF token específico más allá de
`SameSite=Strict` en la cookie de sesión, ni rotación de sesión (la sesión
vive hasta su `expiresAt` de ocho horas o hasta el logout explícito). SSRF no
aplica a las rutas actuales: ninguna realiza peticiones a URLs aportadas por
usuarios.
