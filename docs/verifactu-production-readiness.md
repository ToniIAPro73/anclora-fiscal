# Política de flags y preparación de producción VERI*FACTU

Estado consolidado: infraestructura y tests locales `IMPLEMENTED/TESTED`;
transporte productivo `PRODUCTION_BLOCKED`; QR, certificado, declaración
responsable y restauración `MANUAL_VALIDATION_PENDING`.

> **Aviso de alcance**: este documento describe el estado técnico de preparación del
> módulo VERI\*FACTU en `anclora-fiscal`. No constituye una afirmación de cumplimiento
> normativo definitivo. La activación en producción requiere validación jurídica y
> técnica con la asesoría fiscal del cliente antes de la fecha límite aplicable.

## Modalidad elegida

**VERI\*FACTU** (remisión continuada de registros de facturación a la AEAT), frente a la
alternativa de sistema no VERI\*FACTU con conservación local. Ver
[`docs/verifactu-compliance-matrix.md`](./verifactu-compliance-matrix.md) para el detalle
requisito-por-requisito y su estado (Parcial / Pendiente / No implementado) a fecha de
este documento.

## Flags de entorno

Todos leídos en `apps/api/src/verifactu-runtime.ts` (`ApiVerifactuEnvironment`).

### Modo y activación general

| Flag | Valores | Efecto |
|---|---|---|
| `VERIFACTU_MODE` | `disabled` \| `mock` \| `test` \| `production` | Modo runtime global. `disabled` por defecto si no está definida. |
| `VERIFACTU_ENABLED` | `true` / no definida | Compuerta legacy adicional, evaluada junto a `VERIFACTU_MODE` — ver `resolveVerifactuRuntimeConfig` en `packages/core/src/verifactu.ts`. |

### Adaptador y firma AEAT (entorno de pruebas)

| Flag | Efecto |
|---|---|
| `VERIFACTU_AEAT_ADAPTER_ENABLED` | Habilita el adaptador XML/SOAP interno. Sin esto, las submissions quedan en `PENDING` sin intentar envío. |
| `VERIFACTU_AEAT_SIGNING_ENABLED` | Habilita la firma XAdES del XML antes de transporte. |
| `VERIFACTU_AEAT_CERTIFICATE_PATH` / `VERIFACTU_AEAT_CERTIFICATE_PASSWORD` / `VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT` | Certificado de firma. Sin los tres, `resolveAeatVerifactuPortalReadiness` marca `certificateConfigured: false` y bloquea el envío. |
| `VERIFACTU_AEAT_TEST_ENDPOINT_URL` / `VERIFACTU_AEAT_ENDPOINT_URL` | Endpoint de preproducción AEAT (host `prewww1`/`prewww2`/`preportal.aeat.es` reconocido explícitamente). |
| `VERIFACTU_AEAT_ALLOW_LOAD_TESTS` | Debe permanecer `false`/no definida — si es `true` en modo `test`, `resolveAeatVerifactuPortalReadiness` bloquea deliberadamente (`AEAT_VERIFACTU_PREPRODUCTION_LOAD_TESTS_NOT_ALLOWED`). |
| `VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED` | **Debe mantenerse `false`** salvo instrucción explícita de una fase que lo requiera. Gate independiente del transporte SOAP real frente al mock determinista. |

### Identidad del software y del emisor (para el XML AEAT)

`VERIFACTU_AEAT_ISSUER_NIF`, `VERIFACTU_AEAT_ISSUER_NAME`, `VERIFACTU_AEAT_SOFTWARE_NAME`,
`VERIFACTU_AEAT_SOFTWARE_ID`, `VERIFACTU_AEAT_SOFTWARE_VERSION`,
`VERIFACTU_AEAT_SOFTWARE_INSTALLATION_NUMBER`, `VERIFACTU_AEAT_SOFTWARE_PRODUCER_NIF`,
`VERIFACTU_AEAT_SOFTWARE_PRODUCER_NAME`. Sin datos reales de productor de software
homologado, no se puede activar producción de buena fe.

### Producción

| Flag | Efecto |
|---|---|
| `VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL` | Endpoint real de producción AEAT. No usado mientras `VERIFACTU_MODE != production`. |
| `VERIFACTU_PRODUCTION_SUBMISSION_ENABLED` | **Debe permanecer `false`.** Es el único flag que `resolveAeatVerifactuPortalReadiness` exige explícitamente en `true` para no bloquear el modo `production` (`AEAT_VERIFACTU_PRODUCTION_SUBMISSION_NOT_ENABLED`). No existe ningún flujo de aprobación formal para activarlo todavía. |

### Fuera de VERI\*FACTU pero relacionado

| Flag | Efecto |
|---|---|
| `AUTO_ISSUE_ENABLED` | **No leído por ningún código todavía** (FASE 10 dejó la emisión por lote como acción manual explícita, sin disparo automático tras importación). Reservado para cuando exista ese flujo. |

## Gates obligatorios antes de producción

1. `VERIFACTU_MODE=production` y `VERIFACTU_PRODUCTION_SUBMISSION_ENABLED=true` (ambos,
   actualmente ninguno se activa en ningún entorno gestionado por este repositorio).
2. Certificado de firma real cargado (`VERIFACTU_AEAT_CERTIFICATE_*`), distinto del
   certificado de pruebas usado en preproducción.
3. `VERIFACTU_AEAT_PRODUCTION_ENDPOINT_URL` apuntando al host de producción real (no un
   host `pre*` reconocido como preproducción — `resolveAeatVerifactuPortalReadiness`
   bloquea explícitamente esa combinación).
4. Identidad de software productor (`VERIFACTU_AEAT_SOFTWARE_PRODUCER_*`) con datos reales
   de la entidad homologada, no valores de desarrollo.
5. Declaración responsable presentada ante la AEAT — **pendiente**, no emitida por este
   proyecto. Requiere gestión externa con la asesoría/certificación del sistema informático.
6. Endpoint público de envío y botón "Enviar a AEAT" en UI — **deliberadamente no
   existen**. Su ausencia es una decisión de diseño (ver ADR-0005), no un descuido.

## Certificado

El certificado de firma XAdES vive fuera del repositorio (`VERIFACTU_AEAT_CERTIFICATE_PATH`
apunta a un fichero `.p12`/`.pfx` en el sistema de archivos del entorno de ejecución, nunca
commiteado). `docs/verifactu/aeat-preproduction-env-check.md` documenta la verificación de
huella (`VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT`) usada en preproducción. Para producción,
el certificado de firma real es un artefacto de gestión externa (renovación, custodia,
rotación) sin automatización todavía en este repositorio.

## Declaración responsable

**Pendiente.** No se ha presentado ninguna declaración responsable de sistema informático
de facturación ante la AEAT desde este proyecto. Es un trámite legal/administrativo externo
al código, no resoluble por cambios en el repositorio.

## QR y leyenda en factura

Implementado (FASE 8, `packages/core/src/verifactu-qr.ts` +
`packages/core/src/invoicing.ts`). El host de cotejo AEAT usado para construir la URL del
QR está marcado como "buena fe, pendiente de confirmación contra el anexo técnico oficial"
en `docs/verifactu-compliance-matrix.md` — debe verificarse contra la especificación AEAT
publicada antes de considerarlo definitivo para producción.

## Eventos SIF

Implementado (FASE 14, `packages/core/src/sif-events.ts` +
`packages/db/src/sif-events-repository.ts`): cadena de eventos con huella/huella anterior
(SHA-256), tipos `STARTUP`/`SHUTDOWN`/`INTEGRITY_ERROR`/`SUBMISSION_ERROR`/
`RESTORE_RETRY`/`ANOMALY`, panel de sólo lectura con navegación paginada y verificación de
cadena bajo demanda (`GET /api/v1/sif-events/verify`). **Pendiente**: los eventos no se
emiten todavía automáticamente en el arranque/parada real del proceso ni en errores reales
de integridad/envío — sólo existe la capacidad de registrarlos (`record()`), no el cableado
a cada punto real del ciclo de vida de la aplicación.

## Reintentos

Implementado (FASE 5, `packages/core/src/verifactu.ts`): estado `RETRY_SCHEDULED` con
`nextAttemptAt`/`lastError` (migración 0022), cadencia mínima de 1 hora salvo override
explícito de test, orden temporal respetado (no se reintenta un registro posterior mientras
uno anterior sigue pendiente).

## Backups

**Pendiente.** No existe en este repositorio ninguna política de backup automatizada para
la base de datos de producción (Neon) ni para el almacenamiento de PDFs/XML (Vercel Blob /
filesystem). La estrategia de backup de la base de datos, si existe, es responsabilidad de
la configuración de la plataforma gestionada (Neon), no de código en este repositorio.

## Retención y borrado de evidencias

**Pendiente.** No existe una política de retención/purga formalizada para
`evidence_documents`, `fiscal_documents`, `integrity_chain_records`, `sif_events` ni los
datos cifrados de `fiscal_counterparties`. La normativa española de facturación exige
conservación mínima de varios años; el diseño actual no aplica purga automática (todo se
conserva indefinidamente por defecto), lo cual es conservador respecto a conservación pero
no resuelve el derecho de supresión de datos personales una vez vencido el plazo de
conservación fiscal. Requiere definición explícita con asesoría legal antes de producción.

## Fecha objetivo

El plan de referencia sitúa la obligación VERI\*FACTU para autónomos antes del **1 de
julio de 2027**. Este documento no fija por sí mismo una fecha de activación del
repositorio — la fecha objetivo interna del equipo/asesoría debe registrarse aparte y
revisarse contra los gates de esta lista, no contra la fecha límite normativa directamente
(dejar margen para pruebas y declaración responsable).

## Resumen de estado

| Área | Estado |
|---|---|
| Modo activo | `disabled` en todos los entornos gestionados por este repo |
| Producción AEAT | Bloqueada explícitamente (`VERIFACTU_PRODUCTION_SUBMISSION_ENABLED=false`) |
| Certificado de pruebas | Configurable vía env, verificado en `aeat-preproduction-env-check` |
| Certificado de producción | No configurado |
| Declaración responsable | No presentada |
| QR y leyenda | Implementado, host AEAT pendiente de confirmación final |
| Eventos SIF | Capacidad implementada, cableado automático a eventos reales pendiente |
| Reintentos | Implementado |
| Backups | Pendiente (depende de la plataforma gestionada) |
| Retención/borrado de evidencias | Pendiente de definición legal |
