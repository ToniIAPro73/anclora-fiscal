# Limitaciones conocidas

- Envío AEAT productivo: `PRODUCTION_BLOCKED`.
- Cotejo QR y restauración de backups: `MANUAL_VALIDATION_PENDING`.
- Gastos: alta manual, CSV y cálculo v1 implementados; OCR, mailbox, banca,
  amortizaciones y presentación de modelos no están implementados.

## Shopify

- No se importan extractos bancarios. `PAYOUT_PENDING` y “payout identificado”
  no prueban un abono bancario.
- Los tres exports pueden cubrir rangos distintos y producir evidencia huérfana.
  La aplicación la conserva y solicita importar el stream faltante.
- El export puede no incluir un ID nativo de línea; en ese caso se usa un
  fingerprint reproducible, claramente diferenciado de un ID Shopify.
- El VAT del ledger es evidencia de comisión/plataforma, no una decisión de IVA.
- La emisión exige configuración, perfil, transacción Shopify confirmada y
  decisión fiscal. No exige ledger, payout ni banco.
- Un refund sin factura previa se clasifica para revisión; la cola de incidencias
  específica de refunds aún no tiene una pantalla dedicada.
- `matching_candidates` continúa disponible para datos legacy, pero no participa
  en el flujo nuevo de tres evidencias.

## Fiscalidad y cumplimiento

- `FilesystemStorage` no cifra los expedientes en reposo. La descarga sí exige
  sesión, tenant y permiso, verifica SHA-256 y usa `private, no-store`.
- `SHUTDOWN` no se registra automáticamente: en serverless no es un evento
  fiable. `STARTUP` se deduplica mediante el identificador del despliegue.

- VERI\*FACTU permanece en modo preparación; no hay envío activo a la AEAT ni se
  declara cumplimiento normativo.
- Las reglas internacionales incompletas producen revisión fiscal explícita,
  por ejemplo `PENDIENTE_REVISION_OSS`, o bloqueo seguro.
- La aplicación no debe inferir B2B, OSS o inversión del sujeto pasivo sólo por
  país, compañía, correo o IVA informado por Shopify.
- VERI*FACTU no está certificado ni conectado a AEAT; el modo actual sólo
  prepara datos internos.
- Los textos de privacidad y términos requieren revisión legal antes de uso final.

## Plataforma

- El directorio de identidades es server-only; faltan autoservicio de alta,
  recuperación, MFA y proveedor OIDC/OAuth.
- El procesamiento de XLSX ocurre en el proceso API. Los límites de tamaño y filas
  reducen riesgo, pero falta aislamiento en worker con límites de memoria y tiempo.
- SheetJS usa el tarball parcheado oficial fuera del registro npm; Dependabot no
  cubre esa fuente y la instalación depende de su disponibilidad.

## Validación end-to-end (Fase 24)

- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` están en verde sobre
  `main`.
- `pnpm test:e2e` (Playwright) no pudo ejecutarse en este entorno: el
  `webServer` de Playwright arranca `apps/api` con el `.env.local` local del
  operador, y el valor de `AUTH_IDENTITIES_JSON` en ese archivo está truncado
  (JSON incompleto), por lo que `ConfiguredIdentityProvider` falla al
  construirse y la API no llega a escuchar. Es un problema de configuración
  local no versionada (`.env.local` está en `.gitignore`), no un defecto de
  código. Estado: `MANUAL_VALIDATION_PENDING` — requiere que el operador
  corrija su `AUTH_IDENTITIES_JSON` local y vuelva a ejecutar
  `pnpm --filter @anclora/web test:e2e`.

## Datos de aceptación

Los tres exports reales pueden contener PII. Se conservan sólo en `.evidence/`
local, están ignorados por Git y no se reproducen en fixtures, logs ni informes.
Los tests versionados usan datos sintéticos.

Los archivos sí estuvieron presentes en commits anteriores a SHOPIFY-07. Esta
fase los elimina del árbol actual, pero no reescribe la historia remota porque
esa operación es destructiva y requiere autorización y coordinación explícitas.
