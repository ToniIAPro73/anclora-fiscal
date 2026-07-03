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

`x-anclora-role` es solo un sustituto para desarrollo y tests. El middleware lo
rechaza cuando `NODE_ENV=production`, incluso si declara `ADMIN`. Producción
permanece cerrada hasta integrar una identidad y sesión verificadas.

## Subidas

La extensión y el MIME no bastan: CSV, PDF y KDP XLSX deben superar sus parsers
y contratos. Los bytes inválidos no se escriben en storage. La lectura XLSX no
confiable usa SheetJS 0.20.3 parcheado desde su CDN oficial.

## Dependencias

La Fase 6 actualiza Next.js a 15.5.18 y Drizzle ORM a 0.45.2 tras ejecutar
`pnpm audit --prod`. SheetJS queda fijado al tarball oficial 0.20.3 en los dos
paquetes que lo usan. La auditoría queda sin vulnerabilidades conocidas.

## Riesgos pendientes

No hay aislamiento efectivo por tenant porque DB no está cableada; filesystem
no cifra en reposo; no existen URLs firmadas; tampoco hay CSRF token específico
ni rotación de sesión porque no existe login. SSRF no aplica a las rutas actuales:
ninguna realiza peticiones a URLs aportadas por usuarios.
