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

## ADR-011 — Remediación de seguridad `xlsx` para parseo de entrada no confiable

- Estado: aceptada
- Fecha: 2026-07-03
- Contexto: `packages/connectors/package.json` fijaba `xlsx@0.18.5`, la única
  versión publicada en el registro público de npm, con vulnerabilidades
  Prototype Pollution/ReDoS conocidas y sin parche. `packages/connectors/src/kdp-xlsx.ts`
  usa `xlsx` para parsear **bytes subidos por el usuario, no confiables**
  (`isKdpXlsxFile`/`previewKdpXlsx`). Se reverificó el registro npm en esta
  fecha (`npm view xlsx versions --json` / `npm view xlsx`): `0.18.5` sigue
  siendo la última versión publicada en npm; no existe versión parcheada
  publicada allí. `packages/core/src/dossier.ts` también importa `xlsx`, pero
  únicamente para **generar** ficheros XLSX de exportación interna confiable
  (`XLSX.write`), nunca para parsear bytes externos — perfil de riesgo
  distinto, fuera de alcance de este ADR.
- Decisión: en `packages/connectors/package.json` se sustituye el pin de npm
  `xlsx@0.18.5` por el tarball parcheado alojado en el CDN oficial de SheetJS:
  `xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. Se verificó
  antes de fijarlo que el `package.json` empaquetado en ese tarball no declara
  ningún script `preinstall`/`install`/`postinstall` (regla dura del proyecto:
  no añadir dependencias con scripts de postinstall sin preguntar antes —
  verificado, no aplica aquí). `pnpm install` resuelve y fija el tarball en
  `pnpm-lock.yaml`; la suite existente (`kdp-xlsx.test.ts` + `shopify.test.ts`,
  9/9) y `tsc --noEmit` pasan sin cambios de comportamiento. `packages/core/src/dossier.ts`
  mantiene `xlsx@0.18.5` de npm sin cambios, ya que solo genera ficheros
  confiables y no parsea entrada externa.
- Consecuencia: el conector KDP XLSX que procesa subidas de usuarios queda en
  una build parcheada de SheetJS en lugar de la última versión (vulnerable)
  publicada en npm. El pin al CDN de SheetJS es una dependencia fuera del
  registro npm estándar — riesgo residual documentado en
  `docs/known-limitations.md` (disponibilidad del CDN en `pnpm install`,
  ausencia de auditoría automática vía `npm audit` para esta dependencia
  concreta). `packages/core/src/dossier.ts` sigue usando `xlsx@0.18.5` de npm
  para generación confiable; si en el futuro se detecta que la ruta de
  generación también procesa datos no confiables, debe revisarse el mismo
  parche.
