# Limitaciones conocidas

- La Fase 0 no conecta todavía el formulario de acceso a un proveedor de
  identidad. El modelo RBAC y los límites de autorización ya están definidos.
- No se ha ejecutado ninguna migración contra la `DATABASE_URL` externa.
- VERI*FACTU permanece desactivado y no se declara cumplimiento normativo.
- Los datos mostrados en el centro de control son una vista demostrativa
  anonimizada hasta completar los importadores.
- El fichero real de KDP (`.evidence/KDP_Orders-*.xlsx`) no contiene ninguna
  fila en la hoja `KENP leídas`, así que la cobertura de prueba de KENP
  depende de una única fila sintética inyectada en el fixture anonimizado
  (`packages/connectors/test/fixtures/kdp-orders-anonymized.xlsx`). Revisar si
  se dispone de una exportación real con lecturas KENP.
- El conector KDP XLSX no calcula todavía tipo impositivo ni integra
  `TaxRule`/`TaxContext` (ver ADR-010) — las `RoyaltyLine` quedan como
  entidades de importación/clasificación, sin motor fiscal aplicado.
- Operaciones, Conciliación, Facturación, VERI*FACTU y Expedientes IVA son
  vistas de demostración sobre casos fijos (AI-1001 / venta KDP). El esquema y
  las migraciones existen en `packages/db`, pero estos flujos todavía no usan
  repositorios persistentes ni reflejan datos reales de tenant.
- Las páginas Facturación, VERI*FACTU y Expedientes IVA son Server Components
  que ejecutan lógica de `packages/core` en cada render. La Fase 6 cubre su
  render real mediante Playwright, junto con las otras seis rutas, sin añadir
  un renderer RSC experimental. No hay pruebas unitarias específicas para
  Server Components; la cobertura de componentes aislados sigue limitada a
  Operaciones y Conciliación con React Testing Library.
- `packages/connectors` fija `xlsx` al tarball parcheado del CDN oficial de
  SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, ver
  ADR-011) en lugar de una versión del registro npm, porque `xlsx@0.18.5`
  (última versión publicada en npm) tiene vulnerabilidades Prototype
  Pollution/ReDoS sin parche. Riesgo residual: esta dependencia queda fuera
  del alcance de `npm audit`/Dependabot estándar y depende de la
  disponibilidad del CDN de SheetJS en `pnpm install`. `packages/core` usa el
  mismo tarball parcheado para la generación de expedientes.
- RBAC (Fase 6): `apps/api/src/rbac-plugin.ts` reutiliza el `can()`/`roleSchema`
  ya implementado y probado en `packages/core` (`packages/core/test/rbac.test.ts`)
  y lo aplica como `preHandler` sobre `POST /api/v1/imports/preview`. No existe
  todavía sesión/autenticación real (ver nota de Fase 0 más arriba), así que el
  rol del llamante se lee de la cabecera `x-anclora-role` solo en pruebas y
  desarrollo. En producción esa cabecera se ignora y la ruta falla cerrada
  hasta que exista autenticación real. La mayoría de las acciones con puerta RBAC
  descritas en §8 (emitir/anular/rectificar factura, cierre de periodo) no
  tienen todavía una ruta de API correspondiente — la aplicación de RBAC está
  cableada sobre las rutas que existen hoy; la cobertura completa sobre el
  conjunto de recursos está bloqueada por la superficie REST que falta (ver
  `docs/api.md`), no es una omisión de la Fase 6.
- Seguridad (Fase 6): `POST /api/v1/imports/preview` ahora valida el
  `mimetype` del adjunto contra una lista permitida (CSV/PDF/XLSX), valida la
  estructura con el parser correspondiente antes de persistir el original y
  limita los XLSX KDP a 10.000 filas por hoja durante el parseo. Devuelve 422
  para tipos o estructuras no admitidos. La cookie de sesión
  registrada vía `@fastify/cookie` fija `sameSite: 'lax'` y `httpOnly: true`.
  El CSP de `@fastify/helmet` se deja en su configuración por defecto
  (`contentSecurityPolicy: true`) — no hay scripts/estilos inline servidos
  por esta API que requieran una política a medida. SSRF no aplica: ninguna
  ruta de `apps/api` realiza peticiones salientes a URLs proporcionadas por
  el usuario; se revisará si en el futuro se añaden webhooks de conectores
  que sí lo hagan.
- Los escenarios E2E de refund parcial persistido, payout con múltiples
  pedidos, operación sin país enviada a revisión, emisión/rectificación de
  factura, envío/rechazo VERI*FACTU y cierre/reapertura de expediente no se
  pueden implementar sin inventar rutas o persistencia. Playwright valida hoy
  los flujos realmente disponibles: importación Shopify con IVA y devolución
  completa, importación KDP con KENP/ISBN, rechazo MIME y las nueve páginas.
- El límite de 15 MB y el tope de filas reducen el riesgo de agotamiento al
  procesar XLSX, pero no eliminan completamente el riesgo de un archivo ZIP
  altamente comprimido. El parser se ejecuta en el proceso de API; falta
  aislarlo en un worker con límites de memoria/tiempo antes de aceptar ficheros
  de terceros en producción.
