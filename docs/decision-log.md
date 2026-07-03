# Registro de decisiones

## ADR-001 — API Fastify separada

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: separar `apps/web` y `apps/api` para mantener contratos, colas y
  procesos de importación fuera del ciclo de renderizado de Next.js.
- Consecuencia: dos procesos locales coordinados por Turborepo.

## ADR-002 — Persistencia sin servicios locales

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: Drizzle con PostgreSQL serverless para entornos compartidos y
  PGlite para pruebas y modo offline.
- Consecuencia: las migraciones remotas requieren una acción explícita.

## ADR-003 — Identidad visual de producto

- Estado: aceptada y reversible
- Fecha: 2026-07-03
- Decisión: usar los activos de Anclora Fiscal como identidad principal y los
  activos de Anclora Insights como sello editorial en documentos.
- Consecuencia: el lenguaje visual replica el tema Shopify publicado —noche,
  marfil, hilo dorado, rombos y superficies elevadas— con densidad de backoffice.

## ADR-004 — Fuentes sin CDN en tiempo de ejecución

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: usar `next/font` para Playfair Display, EB Garamond y Montserrat.
- Consecuencia: Next.js descarga y autoaloja las fuentes durante el build.

## ADR-005 — Extracción PDF sin canvas nativo

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: usar el núcleo de extracción textual de `pdf-parse`/PDF.js sin
  renderizado, canvas ni OCR.
- Consecuencia: los PDF escaneados quedan bloqueados salvo futura activación
  explícita del fallback OCR.

## ADR-006 — Preview sin PII

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: el endpoint de preview devuelve referencias de pedido, conteos e
  incidencias; nunca texto PDF, nombres, direcciones o correos.
- Consecuencia: el detalle personal solo se consulta bajo autorización desde
  la evidencia custodiada.

## ADR-007 — Nombres de hoja KDP por coincidencia recortada (`trim`)

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: el conector KDP XLSX busca hojas por nombre normalizado con
  `trim()` en lugar de coincidencia exacta de bytes, porque el fichero real de
  Amazon incluye una hoja con espacio final (`"Regalías de los libros de
  tapa "`).
- Consecuencia: ningún punto de llamada codifica la secuencia exacta de bytes
  del nombre; toda búsqueda pasa por `normalizeSheetName`/`buildSheetLookup`.

## ADR-008 — Tolerancia de coherencia Resumen/detalle: ±0,01 € o ±1%

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: la especificación no fija una tolerancia exacta para comparar la
  hoja `Resumen` contra la suma del detalle por mes; se adopta ±0,01 € o ±1%
  del valor del resumen, lo que sea mayor.
- Consecuencia: el desajuste (`SUMMARY_DETAIL_MISMATCH`) es siempre `WARNING`,
  nunca bloquea el import; revisar si aparecen falsos positivos con datos
  reales de producción.

## ADR-009 — Regalías KDP como `RoyaltyStatement`/`RoyaltyLine`, no `CanonicalOperation`

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: Amazon es el comerciante registrado en las ventas KDP al lector
  final (principio #7), así que las filas de regalías se modelan como nuevas
  entidades `RoyaltyStatement`/`RoyaltyLine` en `packages/core`, no como
  facturas `CanonicalOperation` emitidas al lector.
- Consecuencia: el motor fiscal y de facturación existentes no se reutilizan
  todavía para KDP; la integración fiscal completa queda para una fase
  posterior (ver ADR-010).

## ADR-010 — Motor fiscal (TaxRule/TaxContext) para KDP diferido

- Estado: aceptada
- Fecha: 2026-07-03
- Decisión: el criterio "hecho cuando" de la Fase 5 solo exige importar,
  clasificar y marcar KENP como `PENDING_TAX_REVIEW`; el cableado completo con
  `TaxRule`/`TaxContext` queda explícitamente fuera de alcance.
- Consecuencia: ninguna `RoyaltyLine` lleva todavía tipo impositivo calculado;
  documentado como limitación conocida.
