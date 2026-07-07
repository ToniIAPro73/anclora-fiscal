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

Acepta multipart con campo `file` (máximo 15 MB) y campo de texto
**obligatorio** `connectorId`, uno de `shopify-orders`,
`shopify-order-transactions`, `shopify-payments` o `amazon-kdp-royalties`
(FASE 03 — ver
`packages/db/src/import-issue-codes.ts`). MIME permitidos: CSV, PDF y XLSX.
Requiere una sesión firmada cuyo actor tenga rol `FISCAL_OPERATOR` o `ADMIN`.
El tenant de almacenamiento y persistencia se deriva exclusivamente de esa
sesión (ver `docs/security.md` para el mecanismo de sesión firmada).

La respuesta incluye conector, hash de evidencia, resumen e incidencias sin
PII, y `status: 'ANALYZED'` para trabajos nuevos (antes `'PREVIEW_READY'` —
cambio de contrato intencional de FASE 03). Los errores son
`400 FILE_REQUIRED`, `400 CONNECTOR_ID_REQUIRED` (falta o valor inválido de
`connectorId`), `401 UNAUTHENTICATED`, `403 FORBIDDEN` y errores `422` de MIME
o estructura.

### `POST /api/v1/imports/:jobId/confirm`

Requiere `imports:write`. Body opcional `{ acknowledgedIssueIds?: string[] }`
con los ids de `import_errors` que el operador reconoce explícitamente. Es la
**única** acción que persiste los registros fiscales finales
(`commercial_orders`/`financial_events`/`royalty_lines`) derivados de la
importación — `preview`/`retry` nunca escriben esas tablas.

- `200` → `{ jobId, status: 'IMPORTED' | 'IMPORTED_WITH_ISSUES', createdRecordIds }`
  (`IMPORTED_WITH_ISSUES` si quedan incidencias no bloqueantes, o bloqueantes
  ya reconocidas, tras la confirmación).
- `404 IMPORT_JOB_NOT_FOUND`
- `409 IMPORT_JOB_NOT_CONFIRMABLE` — el job no está en `ANALYZED`/`PENDING_CONFIRMATION`.
- `422 IMPORT_JOB_BLOCKING_ISSUES` — quedan incidencias bloqueantes sin
  reconocer; el cuerpo incluye `unacknowledgedIssueIds`.

### `POST /api/v1/imports/:jobId/reject`

Requiere `imports:write`. Body opcional `{ reason?: string }`. Transiciona el
job a `REJECTED` sin borrar `import_files`/`evidence_documents` (la custodia
del archivo original se conserva).

- `200` → `{ jobId, status: 'REJECTED' }`
- `404 IMPORT_JOB_NOT_FOUND`
- `409 IMPORT_JOB_ALREADY_CONFIRMED` — el job ya está `IMPORTED`/`IMPORTED_WITH_ISSUES`.

### `POST /api/v1/imports/:jobId/retry`

Requiere `imports:write`. Body opcional `{ reason?: string }`. Reanaliza el
archivo ya custodiado (mismo `sha256` + `mapping_version`, sin crear un nuevo
`import_jobs`/`import_files`) y registra quién reintentó y por qué en
`import_jobs.summary.retryHistory` (jsonb, ver
`packages/db/src/import-preview-repository.ts`).

- `200` → `{ jobId, status: 'ANALYZED' | 'FAILED', summary, issues }`
- `404 IMPORT_JOB_NOT_FOUND` — el job o el archivo custodiado no existen.

### `GET /api/v1/fiscal-configuration`

Requiere `settings:read`. Devuelve la configuración fiscal del tenant,
incluyendo `emisorFiscal`, series, perfiles de producto y readiness. No devuelve
NIF/NIE ni identidad fiscal cifrada en claro; sólo expone flags como
`nifConfigurado` o `taxIdentityConfigured`.

### `PUT /api/v1/fiscal-configuration`

Requiere `settings:write`. Acepta el contrato español del refactor:
`datosEmisor`, `oss`, `perfilProducto` y `ejercicio`. Valida NIF/NIE español,
cifra la identidad fiscal con secreto server-only y crea/actualiza
idempotentemente las series `FS`, `F` y `FR`. También conserva el contrato legacy
para compatibilidad técnica.

## Paginación

Las rutas de listado comparten `parsePagination()`
(`apps/api/src/pagination.ts`): query params `page` (entero ≥ 1, defecto 1) y
`pageSize` (entero 1-100, defecto 20), validados con Zod (`z.coerce.number()`).
Un valor no numérico o fuera de rango responde `400` con el error de Zod. La
respuesta siempre tiene la forma `{ items: T[], page, pageSize, total }`.

Todas las rutas listadas a continuación exigen sesión firmada válida
(`401 UNAUTHENTICATED` si falta) y aplican `requireRole()` — `403 FORBIDDEN` si
el rol de la sesión no tiene el permiso indicado. El `tenantId` se deriva
siempre de la sesión, nunca de query params o body; no hay forma de listar o
mutar datos de otro tenant.

### `GET /api/v1/operations`

Requiere `operations:read`. Filtro opcional `status` (query). Repositorio no
cableado → `503 OPERATIONS_REPOSITORY_UNAVAILABLE`.

### `GET /api/v1/financial-events`

Requiere `events:read`. Filtro opcional `eventType` (query). Repositorio no
cableado → `503 FINANCIAL_EVENTS_REPOSITORY_UNAVAILABLE`.

### `GET /api/v1/reconciliation/candidates`

Requiere `reconciliation:read`. Filtro opcional `accepted` (query, `"true"` se
interpreta como booleano; cualquier otro valor no filtra). Repositorio no
cableado → `503 RECONCILIATION_REPOSITORY_UNAVAILABLE`.

`matching_candidates` es un modelo legacy de solo compatibilidad. No se usa
para crear los nuevos enlaces Shopify y el matching legacy ya no emite ni
rectifica facturas automáticamente.

### `GET /api/v1/shopify/evidence-links`

Requiere `reconciliation:read`. Lista los enlaces explícitos y aislados por
tenant. Admite `state=PROPOSED|AUTO_LINKED|CONFIRMED|REJECTED`. Los enlaces
exactos pedido→transacción y pedido→ledger son `AUTO_LINKED`; la relación
transacción→ledger siempre comienza como `PROPOSED`. Ningún estado significa
conciliación bancaria.

### `PATCH /api/v1/shopify/evidence-links/:id`

Requiere `reconciliation:write`. Acepta exclusivamente
`{"state":"CONFIRMED"}` o `{"state":"REJECTED"}`. Registra actor, fecha y
evento de auditoría. Estados como `BANK_RECONCILED` son inválidos porque ni un
ledger pendiente ni un payout sin extracto bancario prueban un cobro bancario.

### `GET /api/v1/issues`

Requiere `issues:read`. Filtros opcionales `status` y `severity` (query).
Repositorio no cableado → `503 ISSUES_REPOSITORY_UNAVAILABLE`.

### `PATCH /api/v1/issues/:id`

Requiere `issues:write`. Resuelve la incidencia como el actor de la sesión.
Devuelve la incidencia actualizada o `404 ISSUE_NOT_FOUND` si no existe para
el tenant. Repositorio no cableado → `503 ISSUES_REPOSITORY_UNAVAILABLE`.

### `POST /api/v1/operations/:id/invoices`

Requiere `documents:issue`. Emite la factura del `canonicalOperationId`
indicado. Idempotente: si ya existe una factura emitida para la operación,
devuelve `200` con el documento existente en lugar de crear una nueva
(`alreadyIssued: true` internamente, no expuesto en el payload); si es la
primera emisión, `201`. Errores: `404 OPERATION_NOT_FOUND`,
`422 TAX_DECISION_MISSING` (la operación no tiene decisión fiscal registrada),
`500 INVOICE_ISSUE_FAILED`. Repositorio no cableado →
`503 FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE`.

### `POST /api/v1/fiscal-documents/:id/rectify`

Requiere `documents:rectify`. Rectifica el documento fiscal indicado.
Idempotente igual que la emisión: `200` si ya estaba rectificado, `201` en la
primera rectificación. Errores: `404 DOCUMENT_NOT_FOUND`,
`409 INVALID_DOCUMENT_STATE` (el documento no puede rectificarse en su estado
actual), `500 INVOICE_RECTIFY_FAILED`. Repositorio no cableado →
`503 FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE`.

### `POST /api/v1/periods/:period/close`

Requiere `periods:close`. Cierra el período si no existen incidencias
`OPEN`/`BLOCKING` vinculadas (vía `canonicalOperationId`) a operaciones de ese
período; en caso contrario `409 BLOCKING_ISSUES_OPEN` con la lista
`issueIds`. Idempotente: cerrar un período ya cerrado devuelve `200` con la
fila existente; el primer cierre devuelve `201`. Error genérico:
`500 PERIOD_CLOSE_FAILED`. Repositorio no cableado →
`503 PERIOD_CLOSES_REPOSITORY_UNAVAILABLE`.

### `POST /api/v1/periods/:period/reopen`

Requiere `periods:close` (mismo permiso que el cierre). Solo válido si el
período está `CLOSED`; en caso contrario `409 PERIOD_NOT_CLOSED`. Nunca borra
el historial de auditoría del cierre previo. Devuelve `200` con la fila
actualizada. Error genérico: `500 PERIOD_REOPEN_FAILED`. Repositorio no
cableado → `503 PERIOD_CLOSES_REPOSITORY_UNAVAILABLE`.

### `POST /api/v1/periods/:period/vat-dossier`

Requiere `dossier:write`. Solo genera el expediente si el período está
`CLOSED` (`409 PERIOD_NOT_CLOSED` en caso contrario). Si quedan incidencias
bloqueantes sin aprobar, `409 BLOCKING_ISSUES_REQUIRE_APPROVAL`. Idempotente:
regenerar un expediente ya existente devuelve `200` con la fila existente,
salvo que se pase `?force=true` — y solo el rol lo puede forzar si el rol de
la sesión es `ADMIN` o `REVIEWER` (cualquier otro rol con `dossier:write` que
pase `force=true` es ignorado silenciosamente y recibe la respuesta
idempotente normal). Primera generación → `201`. Error genérico:
`500 VAT_DOSSIER_GENERATE_FAILED`. Repositorio no cableado →
`503 VAT_DOSSIERS_REPOSITORY_UNAVAILABLE`.

### `GET /api/v1/periods/:period/vat-dossier`

Requiere `dossier:read`. Devuelve los metadatos del expediente
(`storageKey`, `archiveSha256`, `manifest`, `status`, etc.) o
`404 NOT_FOUND` si no existe para el período/tenant. **No** incluye una URL de
descarga firmada — `StoragePort` no expone ese mecanismo todavía; se devuelve
el `storageKey` en crudo. Ver la brecha documentada en `docs/security.md`.

### `GET /api/v1/shopify/sales`

Listado operativo tenant-scoped de pedidos Shopify. Admite filtros de fecha,
estado de pago, reembolso, fiscalidad, liquidación y pedidos de importe cero.
Incluye métricas de ventas, reembolsos, comisiones y liquidaciones pendientes.

### `GET /api/v1/shopify/sales/:orderId`

Devuelve el expediente completo: pedido y líneas, transacciones, ledger,
enlaces, payout pendiente o identificado, operación, decisión fiscal,
documentos y auditoría. Un payout identificado no equivale a verificación bancaria.

### `POST /api/v1/shopify/sales/:orderId/invoice`

Emisión manual con permiso `documents:issue`. El servidor exige expediente,
importe distinto de cero, configuración y perfil fiscal, transacción Shopify
confirmada y decisión fiscal. No exige ledger, payout ni banco. La emisión
automática sólo puede ocurrir al persistir una transacción Shopify de cobro
confirmada y nunca por pedido, matching, ledger, payout o banco.

## Recursos no implementados

Quedan sin ruta de API: payouts, motor de reglas/decisiones fiscales
(`TaxRule`/`TaxContext`, más allá de la comprobación de existencia al emitir
factura), envío/consulta de VERI*FACTU, exports y un endpoint de lectura de
`auditEvents` (los eventos de auditoría se insertan desde las mutaciones de
este plan, pero no hay `GET` para consultarlos). Ver
`docs/known-limitations.md` para el detalle de los escenarios E2E que
dependen de esta superficie.

## OpenAPI

La interfaz Swagger está en `/documentation`. Actualmente solo parte de los
esquemas de respuesta está descrita de forma explícita.
