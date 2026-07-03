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
