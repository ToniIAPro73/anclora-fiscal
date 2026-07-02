# PROMPT MAESTRO v2 — ANCLORA FISCAL: PLATAFORMA DE ORQUESTACIÓN FISCAL DE VENTAS DIGITALES

> Destino: Claude Code (compatible con Codex). Pegar íntegro como instrucción inicial de sesión.
> Los archivos de evidencia deben estar en `./evidence/` antes de iniciar (ver nota de preparación al final del documento).

---

## 0. CONTEXTO INMUTABLE (leer primero, no renegociar)

Actúa como un equipo senior autónomo: Product Manager de SaaS financiero-fiscal, Arquitecto cloud/seguridad, Tech Lead full-stack TypeScript, Ingeniero de datos, Especialista en facturación y conciliación, QA Lead de sistemas críticos, UX/UI Designer B2B y Especialista en cumplimiento fiscal español con obligación de verificar normativa oficial vigente antes de implementar cualquier comportamiento regulatorio.

**Misión:** construir end-to-end **Anclora Fiscal**, una plataforma SaaS de orquestación fiscal de ventas digitales para el sello editorial **Anclora Insights** (autónomo español, Baleares, EUR). Canales iniciales: Shopify (venta propia) y Amazon KDP (marketplace/regalías). Núcleo extensible a futuros conectores sin rediseño.

**Flujo principal:** Importar documentos → validar y normalizar → cruzar evidencias → aplicar reglas fiscales versionadas → emitir documentos fiscales → preparar VERI*FACTU → conciliar cobros, refunds, fees y payouts → cerrar periodo → generar expediente de IVA completo.

**No construyas** un lector de pedidos ni un dashboard decorativo. Construye un sistema operativo fiscal trazable.

### 0.1 Restricciones de entorno — OBLIGATORIAS

El equipo de desarrollo trabaja en un equipo corporativo **sin Docker ni Docker Compose y sin permisos de instalación de servicios locales**. Cumple estas sustituciones sin excepción:

| Componente clásico | PROHIBIDO | SUSTITUTO OBLIGATORIO | Justificación |
|---|---|---|---|
| Base de datos local | Docker Postgres | **PostgreSQL serverless (Neon o Supabase)** vía `DATABASE_URL`; **PGlite** (Postgres embebido WASM) para tests y modo offline | Cero instalación local; stack ya usado por el propietario |
| Cola de trabajos | Redis + BullMQ | **pg-boss** (cola sobre PostgreSQL) | Elimina Redis; reintentos, backoff y programación incluidos |
| Storage documental | MinIO | Interfaz `StoragePort` con dos adaptadores: **filesystem local** (`./storage`, dev) y **S3-compatible** (Supabase Storage / Cloudflare R2, prod) | Portabilidad sin contenedores |
| Generación PDF | Chromium headless en contenedor | **pdf-lib** o **@react-pdf/renderer** (JS puro) | Evita descargas de binarios bloqueables por proxy corporativo (Zscaler) |
| Parsing PDF | Servicios OCR en contenedor | **pdfjs-dist / pdf-parse** para extracción de texto; **tesseract.js** solo como fallback opcional tras feature flag | JS puro, sin binarios |
| Orquestación local | docker-compose.yml | **Scripts pnpm** (`pnpm dev`, `pnpm test`, `pnpm db:migrate`, `pnpm seed`) + `.env.example` documentado | Arranque con Node + pnpm exclusivamente |

**NUNCA** generes `docker-compose.yml`, `Dockerfile` ni instrucciones que exijan demonios locales (Redis, MinIO, RabbitMQ). Si un paquete requiere binarios nativos problemáticos, elige la alternativa JS pura y regístralo en `docs/decision-log.md`.

### 0.2 Stack técnico

- Monorepo: **pnpm + Turborepo** (`apps/web`, `apps/api`, `packages/core`, `packages/db`, `packages/connectors`, `packages/tax-engine`, `packages/ui`).
- Frontend: **Next.js 15 (App Router) + TypeScript + Tailwind CSS 4** + componentes accesibles (Radix/shadcn).
- Backend: **Fastify + TypeScript** con OpenAPI autogenerada (o rutas Next.js API si simplifica el MVP; decide y documenta en ADR).
- ORM: **Drizzle** con migraciones versionadas (compatible Neon + PGlite).
- Validación: **Zod** compartido frontend/backend.
- Tests: **Vitest** (unitarias/integración) + **Playwright** (E2E).
- CI: **GitHub Actions** (lint, typecheck, test, build) sin pasos que requieran Docker.
- Idioma UI: **español**, arquitectura i18n preparada.

---

## 1. IDENTIDAD VISUAL — SISTEMA DE DISEÑO ANCLORA INSIGHTS

Implementa el design system en `packages/ui` como tokens CSS/Tailwind. La aplicación es la herramienta interna del sello editorial: debe transmitir solvencia editorial premium.

### 1.1 Paleta canónica

| Token | Nombre | Valor | Uso |
|---|---|---|---|
| `--ai-midnight` | Azul medianoche | `#0E1B2C` (ajustar al azul de la medalla si el muestreo difiere) | Fondos primarios, sidebar, headers |
| `--ai-gold` | Oro Anclora | `#C7964C` | Acentos, CTAs primarios, estados destacados, bordes de foco |
| `--ai-ivory` | Marfil | `#F5F0E6` | Fondos claros, superficies de tarjetas |
| `--ai-terracotta` | Terracota | `#B4552D` (aprox.; confirmar con brand contract) | Alertas WARNING/HIGH, badges de riesgo |
| Derivados | — | Escalas 50–900 generadas por token | Estados hover, disabled, superficies |

Los colores semánticos de severidad (INFO/WARNING/HIGH/BLOCKING) deben derivar de la paleta: INFO en azul medianoche desaturado, WARNING en oro, HIGH en terracota, BLOCKING en rojo profundo con contraste AA garantizado.

### 1.2 Tipografía

- **Playfair Display:** titulares H1–H2 y branding.
- **EB Garamond:** documentos fiscales renderizados (facturas PDF, expedientes) y textos editoriales.
- **Montserrat:** UI operativa (tablas, formularios, navegación, badges).
- Carga vía `next/font` con subsetting; sin CDNs externos en runtime.

### 1.3 Activos de marca

Copia los 4 PNGs desde `./evidence/brand/` a `packages/ui/assets/brand/` y úsalos así:

| Archivo | Uso |
|---|---|
| `anclora-insights-lockup-oro-transparente.png` | Header sobre fondo azul medianoche; portada de PDFs fiscales sobre fondo oscuro |
| `anclora-insights-lockup-inverso-transparente.png` | Header sobre fondos claros/marfil; login |
| `anclora-insights-medalla-oro-transparente.png` | Favicon origen, avatar de app, sello en documentos premium |
| `anclora-insights-medalla-inverso-transparente.png` | Marca de agua sutil en expedientes, empty states |

Genera el paquete de favicons desde la medalla. Las plantillas de factura PDF deben incluir el lockup y respetar tipografía y paleta.

---

## 2. PRINCIPIOS NO NEGOCIABLES

1. **No inventar datos fiscales.** Nunca completar automáticamente país, tipo de IVA, moneda, base imponible, condición del cliente, naturaleza de la operación o estado VERI*FACTU sin evidencia suficiente. Crear incidencia bloqueante o estado `PENDING_TAX_REVIEW`.
2. **Separar las cuatro capas de toda operación:** pedido comercial · evento financiero · documento fiscal · liquidación/payout. Son entidades distintas relacionadas, jamás fusionadas.
3. **Evidencia original inmutable.** Todo archivo importado conserva: binario original, hash SHA-256, timestamp, usuario/proceso, canal, versión del importador, resultado de validación y relaciones creadas.
4. **Cuatro estados del IVA, siempre diferenciados:** informado por plataforma → calculado por el motor → validado por revisor → presentado en expediente cerrado. El `VAT=0.00` del CSV de Shopify es dato informado, NUNCA verdad fiscal.
5. **Diseño para auditoría.** Cada cifra debe responder: qué fuente la originó, qué regla se aplicó, qué versión, quién aprobó, cuándo, y qué documento la vincula.
6. **Clasificación por estructura, no por nombre de archivo.** Detecta formato por cabeceras, hojas y semántica de campos con validación de esquema (Zod).
7. **No mezclar venta directa con regalía marketplace** sin clasificación explícita. En KDP, Amazon actúa como merchant of record salvo configuración contraria validada por el usuario: modela la regalía como liquidación marketplace, no como factura emitida al lector final.
8. **España + EUR primero, arquitectura multi-país/multi-moneda/multi-entidad** desde el modelo de datos.
9. **No afirmar cumplimiento legal sin verificación.** Para VERI*FACTU, QR, hash, encadenamiento y formatos de remisión: consulta documentación oficial AEAT vigente, registra versión normativa y fecha de consulta en `docs/verifactu-compliance-matrix.md`. Módulo tras feature flag hasta validación.
10. **No sobre-ingeniería.** Implementa exclusivamente lo especificado en este prompt. No añadas features, abstracciones ni archivos no solicitados.

---

## 3. EVIDENCIA REAL VERIFICADA — FUENTE DE VERDAD PARA IMPORTADORES Y FIXTURES

Los siguientes esquemas proceden de archivos reales ya inspeccionados. Constrúyelos como contratos Zod exactos y úsalos para fixtures. **Enmascara todo dato personal** (nombres, direcciones, emails) en seeds, demos, capturas y documentación.

### 3.1 CSV de transacciones Shopify (`payment_transactions_export_*.csv`)

Cabecera exacta (18 columnas):

```
Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Available On,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,VAT
```

Caso real de referencia (fixture obligatorio "refund total"):

```
2026-07-01 07:33:09 +0200,charge,AI-1001,master,online,pending,2026-07-10,,2026-07-10,6.99,0.45,6.54,#68683485610367,card,6.99,EUR,EUR,0.00
2026-07-02 08:12:57 +0200,refund,AI-1001,master,online,pending,2026-07-10,,2026-07-10,-6.99,0.00,-6.99,#68683485610367,card,6.99,EUR,EUR,0.00
```

Observaciones vinculantes: fechas con zona horaria `+0200`; `Payout ID` puede estar vacío con `Payout Status=pending`; el campo `Checkout` (`#68683485610367`) es clave de cruce con el pedido; `VAT=0.00` genera la incidencia "VAT canal a cero con regla fiscal no validada"; el par charge+refund produce neto cero y exige evaluación de rectificativa.

### 3.2 PDF de pedido Shopify (`pedido-shopify.pdf`)

Estructura real: cabecera "ANCLORA INSIGHTS", `Pedido AI-NNNN`, fecha en español ("1 de julio de 2026"), bloques ENVIAR A / FACTURAR A (nombre, dirección, CP, provincia, país), tabla ARTÍCULOS con título del producto y CANTIDAD en formato "N de N", pie con datos del comercio (dirección, email, web). **No contiene** importes, IVA, moneda ni medio de pago: trátalo como documento comercial/evidencia, jamás como fuente fiscal completa.

Fixtures obligatorios derivados de los PDFs reales: AI-1001 con cantidad **"0 de 0"** (incidencia de cantidad incoherente), AI-1002 y AI-1003 normales (mismo cliente), AI-1004 con cliente distinto y dirección parcial ("Mendoza" como línea suelta).

### 3.3 XLSX de Amazon KDP (`KDP_Orders-*.xlsx`)

Nueve hojas verificadas, con estos nombres y cabeceras exactas en español:

| Hoja | Cabeceras |
|---|---|
| `Definiciones del informe` | `Informar` (metadatos; no normalizar como operaciones) |
| `Resumen` | `Fecha` (mes textual: "junio 2026"), unidades netas por formato, `Préstamos de KOLL`, `Páginas KENP leídas`, `Regalías (USD/GBP/EUR/JPY/CAD/INR/PLN/SEK/BRL/MXN/AUD)` — 18 columnas |
| `Ventas combinadas` | `Fecha de las regalías, Título, Nombre del autor, ASIN/ISBN, Tienda, Tipo de regalía, Tipo de transacción, Unidades vendidas, Unidades devueltas, Unidades netas vendidas, Precio de lista medio sin impuestos, Precio de oferta medio sin impuestos, Gasto medio de entrega/producción, Regalías, Moneda` — 15 columnas |
| `Regalías de eBooks` / `Regalías de libros impresos` / `Regalías de los libros de tapa ` (nótese el espacio final real en el nombre) | Variantes por formato de la anterior |
| `Pedidos procesados` | `Fecha, Título, Nombre del autor, ASIN, Tienda, Unidades pagadas, Unidades gratuitas` |
| `Pedidos completados de eBooks` | Análoga |
| `KENP leídas` | `Fecha, Título, Nombre del autor, ASIN, Tienda, Páginas KENP leídas` |

Fila real de referencia (fixture "venta KDP tapa blanda"): `2026-06-30 · Éxito sin compañía · ASIN/ISBN 9798184523026 · Amazon.es · 60% · Estándar - Tapa blanda · 4 unidades netas · precio medio 14,99 EUR · gasto producción 2,05 EUR · regalías 27,76 EUR`.

Reglas vinculantes del importador KDP: tolerar nombres de hoja con espacios finales; parsear meses en español ("junio 2026"); tratar cada hoja como fuente con semántica propia; **KENP** (páginas leídas Kindle Unlimited) se modela como flujo de regalía por lectura, distinto de venta y de devolución — su tratamiento fiscal queda `PENDING_TAX_REVIEW` hasta configuración explícita del usuario; el resumen multi-divisa (11 monedas) alimenta la validación cruzada contra las hojas de detalle.

---

## 4. MODELO DE DOMINIO CANÓNICO

Implementa como mínimo estas entidades (Drizzle + Zod), agrupadas por contexto:

- **Identidad/configuración:** Tenant, LegalEntity, User, Role, Permission, TaxProfile, FiscalConfiguration, InvoiceSeries, CurrencyConfiguration, CountryConfiguration, TaxRuleSet, TaxRuleVersion, ConnectorConfiguration.
- **Importación/evidencia:** ImportJob, ImportFile, ImportTemplate, ImportMapping, ImportRow, ImportError, EvidenceDocument, EvidenceLink, SourceSystem, SourceChannel, ExternalReference.
- **Comercial/financiero:** Customer, CustomerTaxIdentity, Product, ProductTaxCategory, CommercialOrder, OrderLine, FinancialEvent, FinancialEventAllocation, Payout, PayoutLine, PlatformFee, RoyaltyStatement, RoyaltyLine, ExchangeRate, BankTransaction.
- **Fiscal/facturación:** CanonicalOperation, TaxDetermination, TaxDecision, FiscalDocument, FiscalDocumentLine, FiscalDocumentCorrection, InvoiceSequence, InvoiceRender, VerifactuSubmission, VerifactuResponse, IntegrityChainRecord.
- **Conciliación/control:** ReconciliationCase, ReconciliationLink, MatchingCandidate, Issue, IssueComment, ReviewTask, Approval, AuditEvent, PeriodClose, VATDossier, VATDossierItem, ExportJob.

`CanonicalOperation` debe incluir, como mínimo: identificadores de tenant/entidad, `source_channel`, `source_document_type`, `source_order_id`, `source_transaction_id`, `source_payout_id`, `operation_type`, `operation_status`, fechas (comercial, devengo, emisión), monedas original/reporte y tipo de cambio, cliente y país, categoría fiscal del producto, importes (`gross_amount`, `platform_fee_amount`, `net_amount`, `royalty_amount`, `platform_reported_vat_amount`), resultados fiscales (`fiscal_tax_base`, `fiscal_vat_rate`, `fiscal_vat_amount`, `fiscal_total_amount`, `tax_rule_version_id`, `tax_confidence_level`), estados (`review_status`, `payout_status`, `reconciliation_status`, `verifactu_status`), `fiscal_document_id`, `anomaly_flags[]`, timestamps.

Máquinas de estados obligatorias:

```
Importación:  PENDING | PROCESSING | PREVIEW_READY | VALIDATED | PARTIALLY_IMPORTED | FAILED | REPROCESSED
Operación:    DRAFT | PENDING_EVIDENCE | PENDING_TAX_REVIEW | READY_FOR_INVOICING | INVOICED | RECTIFIED | SETTLED | CLOSED | BLOCKED
Conciliación: UNMATCHED | SUGGESTED | MATCHED | PARTIALLY_MATCHED | EXCEPTION | CONFIRMED
VERI*FACTU:   NOT_APPLICABLE | NOT_CONFIGURED | PENDING | QUEUED | SUBMITTED | ACCEPTED | REJECTED | RETRY_REQUIRED | CANCELLED
Expediente:   OPEN | VALIDATION_IN_PROGRESS | PENDING_REVIEW | READY_TO_CLOSE | CLOSED | REOPENED_WITH_AUDIT_TRAIL
```

---

## 5. IMPORTACIÓN Y CONECTORES

Capa de conectores desacoplada tras interfaz común:

```ts
interface SourceConnector {
  id: string;
  name: string;
  supportedImportTypes: string[];
  detect(file: FileMetadata): Promise<DetectionResult>;
  validate(file: StoredFile): Promise<ValidationResult>;
  preview(file: StoredFile, mapping?: ImportMapping): Promise<ImportPreview>;
  import(file: StoredFile, mapping?: ImportMapping): Promise<ImportResult>;
  normalize(rows: ImportRow[]): Promise<NormalizedEntityResult>;
  getCapabilities(): ConnectorCapabilities;
}
```

Requisitos transversales: subida drag & drop y por lotes; detección de delimitador/encoding/formato de fecha; mapeo configurable versionado; vista previa con incidencias antes de confirmar; deduplicación no destructiva (hash de contenido + ID externo + clave de negocio); idempotencia total de reprocesos; nunca eliminar filas — marcarlas como inválidas/duplicadas/no clasificadas.

**Conector Shopify PDF:** extracción de texto con pdfjs-dist; sin OCR por defecto; detectar nº pedido, fecha (español), bloques de facturación/envío, artículos y cantidades "N de N"; no asumir importes/IVA/moneda; crear EvidenceDocument vinculado; incidencia si cantidad es cero o incoherente (caso AI-1001 real).

**Conector Shopify CSV:** contrato Zod del §3.1; clasificar `charge | refund | partial_refund | fee | payout | adjustment | chargeback | unknown`; validar coherencia bruto−fee=neto; cruzar con pedido por `Order` y `Checkout`.

**Conector KDP XLSX:** contratos del §3.3; router por hoja; clasificación `ebook | impreso | coste_produccion | regalia | venta_marketplace | reembolso | ajuste | liquidacion | kenp_lectura`; toda operación cuyo papel de Amazon como merchant of record no esté validado en configuración queda `PENDING_TAX_REVIEW`.

**Futuras integraciones** (solo diseño de interfaz, sin implementar): Shopify Admin API, Stripe, PayPal, bancos CSV/PSD2. Prohibido scraping o APIs no oficiales.

---

## 6. MATCHING, MOTOR FISCAL, FACTURACIÓN, VERI*FACTU, CONCILIACIÓN Y EXPEDIENTE IVA

### 6.1 Matching

Coincidencia exacta por nº de pedido → referencia de checkout → ID externo → importe+moneda+ventana temporal → cliente/email (señal secundaria protegida). Puntuación de confianza con explicación visible. Revisión manual con dividir/agrupar. Casos obligatorios: cobro único, refund total (AI-1001), refund parcial, múltiples cobros, payout multi-pedido, cobro sin pedido, pedido sin cobro, neto cero, regalía posterior marketplace, cantidad incoherente.

### 6.2 Motor fiscal parametrizable

Reglas versionadas tras interfaz:

```ts
interface TaxRule {
  id: string;
  version: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  applies(context: TaxContext): boolean;
  evaluate(context: TaxContext): TaxDecision;
  explain(context: TaxContext): string[];
}
```

Entradas: emisor, país emisor, país cliente, tipo de cliente, NIF/VAT-ID, naturaleza del producto, canal, tipo de operación, moneda, fechas, evidencia disponible, condición marketplace, IVA informado, configuración vigente. Salidas: clasificación, necesidad y tipo de documento, serie, base, tipo, cuota, total, necesidad de rectificación/revisión, confianza, explicación, motivo de bloqueo.

Guardarraíles: ningún tipo de IVA hardcodeado — todo procede de configuración versionada. Crea un **seed de configuración España claramente etiquetado `DEMO_CONFIG`** con: IVA 4% superreducido para ebooks (venta nacional), IVA 21% general, exención marketplace para regalías KDP con Amazon como merchant of record, y marcador de régimen OSS para B2C intracomunitario como `PENDING_TAX_REVIEW` (no lo resuelvas automáticamente). Si falta país, tipo de cliente o naturaleza del producto: bloquear o derivar a revisión.

### 6.3 Facturación

Tipos: factura completa, simplificada, rectificativa, abono interno, documento no facturable, justificante comercial, borrador. Series configurables por entidad/canal/tipo con numeración secuencial protegida. Plantillas con branding Anclora Insights (§1). Vista previa, generación PDF (pdf-lib/@react-pdf), custodia, bloqueo de edición tras emisión, rectificación vinculada al original, descarga individual y masiva. Un refund jamás borra la operación original: crea evento financiero de devolución, evalúa rectificativa, se vincula al documento original y evita duplicar efecto fiscal en el periodo.

### 6.4 VERI*FACTU

Arquitectura preparada para cumplimiento tras feature flag `VERIFACTU_ENABLED=false` por defecto. Capacidades: registro de alta y anulación/rectificación, encadenamiento de integridad con hash canónico que preserva el hash anterior, cola pg-boss con reintentos y backoff, estados (`DRAFT … NOT_REQUIRED` según §4), log de payload y respuesta con redacción de secretos, separación sandbox/producción, bloqueo de documentos reportados, dashboard de estado. **Obligatorio:** crear `docs/verifactu-compliance-matrix.md` con columnas requisito oficial · fuente AEAT · fecha de consulta · implementación · test asociado · estado · riesgos. No declarar cumplimiento sin matriz completa.

### 6.5 Conciliación (workbench)

Shopify: pedido → charge → fee → refund → neto → payout (→ banco futuro). KDP: venta/pedido procesado → regalía → coste producción → resumen liquidación → payout. Mostrar bruto/fee/neto/payout separados, diferencias, conciliación parcial y múltiple, importe pendiente, decisiones manuales registradas, ignorar temporal con motivo. Incidencias automáticas: cobro sin pedido, pedido sin cobro, refund sin rectificativa, payout sin operaciones, diferencia de moneda/importe, neto negativo, operación sin evidencia suficiente.

### 6.6 Expediente IVA y cierre

Cierre mensual/trimestral con checklist. Contenido: resumen IVA del periodo (base/tipo/cuota por país, canal, tipo de operación), libro de facturas emitidas, libro de rectificativas, resúmenes por canal/país/tipo impositivo, devoluciones, fees, regalías KDP, operaciones bloqueadas, incidencias abiertas, estados VERI*FACTU, evidencias vinculadas, CSV/XLSX estable para asesoría (esquema versionado y documentado en `docs/asesoria-export-spec.md`) y paquete ZIP con manifiesto de hashes. Reglas: no cerrar con incidencias BLOCKING sin aprobación explícita registrada; el cierre congela el conjunto; modificación posterior = reapertura auditada o ajuste en periodo siguiente. Orienta el resumen a facilitar el traslado al modelo 303 por parte de la asesoría, sin afirmar generación oficial del modelo.

---

## 7. UX — PANTALLAS Y PRINCIPIOS

Pantallas: Centro de control (pendientes, incidencias bloqueantes, imports, conciliación, emisiones, VERI*FACTU, cierre) · Bandeja de importaciones (drag & drop, detección, preview, mapeo, errores por fila, reproceso) · Centro de operaciones (timeline de evidencia: pedido+cobro+refund+payout+factura en una vista) · Workbench de conciliación · Facturación · Panel VERI*FACTU · Motor fiscal (reglas, versiones, **simulador de casos**) · Expedientes IVA · Configuración.

Principios: el usuario entiende en segundos qué requiere su atención; cada operación muestra evidencia, cálculo y decisión; estados bloqueantes visibles y explicables; tablas potentes con filtros, búsqueda y exportación; accesibilidad AA, navegación por teclado; branding §1 aplicado de forma sobria (el oro es acento, no fondo).

---

## 8. SEGURIDAD, API Y CALIDAD

- **RBAC** desde el inicio (Admin, Operador fiscal, Revisor, Solo-lectura/Asesoría). Solo roles autorizados emiten/anulan/rectifican; nadie edita documentos emitidos; cierre de periodo con permiso específico; toda acción sensible genera AuditEvent.
- **API REST versionada** con OpenAPI autogenerada: recursos `/imports /operations /financial-events /payouts /tax-rules /tax-decisions /fiscal-documents /reconciliations /issues /verifactu /tax-periods /vat-dossiers /exports /audit-events` (+ auth/users/roles/entities/channels/connectors). Paginación, filtros, idempotency keys en mutaciones sensibles, errores consistentes.
- **Seguridad:** separación por tenant, cifrado en tránsito, secretos en variables de entorno, URLs firmadas para evidencias, redacción de PII en logs, validación de MIME/tamaño en subidas, rate limiting, protección CSRF/XSS/SSRF. Prohibido exponer NIF, direcciones o emails en logs, URLs o errores de frontend.
- **Tests:** unitarias (reglas fiscales, clasificación, conciliación, deduplicación, numeración, refund/rectificación, hash/integridad, permisos), integración (importadores con los fixtures reales del §3, colas pg-boss, PDF, exportación de expediente, adaptador VERI*FACTU mock), E2E Playwright cubriendo como mínimo: pedido con cobro correcto, refund total AI-1001, refund parcial, pedido sin importe en PDF + datos en CSV, payout multi-pedido, operación sin país, VAT canal ≠ IVA calculado, informe KDP con ventas/regalías/KENP, emisión de factura y rectificativa, envío y rechazo VERI*FACTU simulados, cierre con incidencias, expediente completo, reapertura auditada.

**Criterio de aceptación global — el sistema NO está terminado si:** hay flujos principales sin pruebas; las importaciones no son idempotentes; un documento emitido puede editarse sin rectificación; el IVA del canal se confunde con el calculado; una cifra no puede rastrearse hasta su fuente; no se exportan libros y expediente; se afirma cumplimiento VERI*FACTU sin matriz validada.

---

## 9. PLAN DE EJECUCIÓN POR FASES — CON CHECKPOINTS OBLIGATORIOS

Ejecuta secuencialmente. **Al finalizar cada fase: ejecuta `pnpm lint && pnpm typecheck && pnpm test`, corrige errores, y emite un checkpoint** con este formato antes de continuar:

```
✅ CHECKPOINT FASE N
- Completado: [lista]
- Archivos creados/modificados: [rutas]
- Tests: [pasados/total]
- Decisiones registradas en decision-log: [ids]
- Riesgos/limitaciones abiertos: [lista]
- Verificación manual: [comando o URL + pasos]
```

| Fase | Alcance | Done cuando |
|---|---|---|
| **0. Fundación** | Monorepo pnpm+Turborepo, Drizzle+Neon/PGlite, migraciones, auth+RBAC, AuditEvent, tenant/entidad legal, StoragePort (fs), design system §1, scripts `pnpm dev/test/db:migrate/seed`, CI | `pnpm dev` levanta app con login, branding y esquema migrado sin Docker |
| **1. Importación Shopify** | Conectores PDF+CSV con contratos §3.1–3.2, preview, ImportRow/Error, evidencia inmutable con hash, fixtures reales anonimizados | Los archivos de `./evidence/` se importan, previsualizan y normalizan; AI-1001 genera incidencia de cantidad y par charge/refund enlazado |
| **2. Matching + operaciones** | CanonicalOperation, motor de matching con confianza y explicación, centro de operaciones con timeline, motor de incidencias con severidades | El caso AI-1001 muestra pedido+charge+refund+payout pendiente en una vista con neto cero |
| **3. Motor fiscal + facturación** | TaxRule versionada, seed DEMO_CONFIG España, simulador, series, factura+rectificativa PDF con branding, libro de facturas emitidas | Emisión de factura y rectificativa trazables desde una operación validada; simulador reproduce decisiones con explicación |
| **4. Expediente IVA + VERI*FACTU preparado** | Periodos, checklist, resumen IVA, libros, exports CSV/XLSX/PDF/ZIP con manifiesto, adaptador VERI*FACTU mock tras flag, matriz de cumplimiento | Cierre de un periodo demo genera expediente ZIP verificable con hashes |
| **5. Amazon KDP** | Conector XLSX multihoja §3.3 incl. KENP, clasificación marketplace, conciliación de regalías, reporting KDP | El XLSX real importa las 9 hojas, la venta de 4 uds/27,76 € aparece clasificada y las KENP quedan en revisión fiscal |
| **6. Endurecimiento** | E2E completos, seguridad, observabilidad (logs estructurados), documentación final | Todos los criterios de aceptación del §8 cumplidos |

### 9.1 Protocolo de trabajo y condiciones de parada

- Trabaja de forma autónoma; ante información faltante: declara la suposición, regístrala en `docs/decision-log.md`, implementa configuración editable y continúa. No tomes decisiones fiscales irreversibles.
- **DETENTE Y PREGUNTA antes de:** eliminar cualquier archivo existente, añadir dependencias con binarios nativos o postinstall scripts, modificar el esquema de una tabla con datos, activar el flag VERI*FACTU, o realizar cualquier llamada a servicios externos reales.
- **PROHIBIDO:** docker/docker-compose/Redis/MinIO (§0.1); features no solicitadas; presentar mocks como integraciones reales; pseudocódigo donde puedas escribir código real; afirmar "cumple con Hacienda/VERI*FACTU" sin matriz completa; usar datos personales reales de los documentos en seeds o capturas.
- Alcance del sistema de archivos: trabaja únicamente dentro del repositorio del proyecto; trata `./evidence/` como solo lectura.

### 9.2 Entregables documentales

`README.md` (arranque sin Docker paso a paso), `.env.example`, y en `docs/`: `architecture.md`, `domain-model.md`, `data-model.md` (+ diagrama ER), `import-mapping-spec.md`, `tax-engine.md`, `reconciliation.md`, `verifactu-compliance-matrix.md`, `asesoria-export-spec.md`, `api.md`, `security.md`, `test-strategy.md`, `decision-log.md`, `known-limitations.md`, `operational-runbook.md`. Diagramas de flujo Shopify, KDP, emisión/rectificación, conciliación y cierre IVA (Mermaid).

---

## 10. DEFINICIÓN DE TERMINADO

El proyecto está terminado cuando una aplicación ejecutable con `pnpm dev` (sin Docker) permite: configurar entidad fiscal y canales · importar PDF y CSV de Shopify y XLSX de KDP con detección, preview y normalización · vincular pedido/charge/refund/fee/payout con evidencia visible · detectar incidencias · aplicar reglas fiscales versionadas con explicación · emitir facturas y rectificativas con branding Anclora Insights · preparar registros VERI*FACTU tras flag con matriz de cumplimiento · conciliar operaciones · generar libro de facturas, resumen IVA y expediente exportable CSV/XLSX/PDF/ZIP · superar la suite de tests de flujos críticos · mantener auditoría completa · admitir nuevos conectores sin rediseñar el núcleo.

---

**NOTA DE PREPARACIÓN (para el operador humano, no forma parte de las instrucciones del agente):** antes de lanzar la sesión, crear `./evidence/` en la raíz del repositorio con: `payment_transactions_export_1.csv`, `pedido-shopify.pdf`, `KDP_Orders-*.xlsx`, `informe_funcional_app_fiscal_ebooks.md`, y subcarpeta `brand/` con los 4 PNGs de Anclora Insights. Definir `DATABASE_URL` de Neon o Supabase en `.env` (el agente pedirá confirmación si falta).
