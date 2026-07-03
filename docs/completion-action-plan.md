# Plan de cierre del producto

El prompt maestro termina formalmente en la Fase 6, pero su definición de
terminado exige flujos persistentes que aún no existen. Este plan cierra esas
brechas en lotes pequeños, sin activar VERI*FACTU ni conectar servicios reales.

## Alcance

- Incluye persistencia PGlite/Neon, sesión verificable, REST multi-tenant,
  mutaciones fiscales auditadas y E2E de los flujos obligatorios.
- Excluye activar VERI*FACTU, migrar una base remota sin confirmación y añadir
  integraciones externas reales.

## Acciones

- [x] Hacer ejecutables y verificables las migraciones existentes en PGlite.
- [ ] Persistir previews, archivos, incidencias y evidencias de importación.
- [ ] Sustituir el rol de cabecera por una sesión firmada y actor multi-tenant.
- [ ] Implementar REST paginado para operaciones, eventos, conciliación e
  incidencias con aislamiento obligatorio por tenant.
- [ ] Implementar emisión/rectificación y cadena de integridad como mutaciones
  idempotentes, bloqueadas por RBAC y con `AuditEvent`.
- [ ] Implementar cierre/reapertura y expediente IVA persistentes con controles
  de incidencias bloqueantes.
- [ ] Conectar las páginas actuales a la API y retirar los escenarios fijos.
- [ ] Añadir los E2E pendientes del apartado 8 y ejecutar todas las puertas de
  calidad y seguridad.

## Validación

Cada lote debe pasar lint, typecheck, tests de su paquete y una integración
PGlite. El cierre exige además build, Playwright y `pnpm audit --prod` limpios.
