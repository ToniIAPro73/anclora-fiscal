# ADR 0004 — El periodo fiscal es un rango de fechas real, no una etiqueta

## Status

Accepted

## Context

Un cierre trimestral, un expediente de IVA o un libro registro necesitan responder de
forma inequívoca "¿qué documentos caen dentro de este periodo?". Si el periodo se trata
como una etiqueta arbitraria (por ejemplo, un trimestre escrito como texto libre) en vez de
como un rango de fechas real, el filtro que compara documentos contra el periodo puede
dejar de coincidir con lo que el usuario introdujo — de forma silenciosa, sin error.

Esto no es hipotético: se ha confirmado por lectura directa del código en esta fase.
`packages/db/src/vat-dossiers-repository.ts` (`DrizzleVatDossiersRepository.generate()`,
línea 98) filtra los documentos fiscales con:

```ts
sql`to_char(${fiscalDocuments.issuedAt}, 'YYYY-MM') = ${input.period}`
```

Es decir, espera que `input.period` tenga el formato de mes `'2026-06'`. Sin embargo, la
UI del expediente de IVA (`apps/web/app/vat-dossier/vat-dossier-panel.tsx`, línea 78, y su
test `vat-dossier-panel.test.tsx`) pide y valida un periodo con formato de **trimestre
literal**: `'2026-T3'`. Con el código actual, introducir `'2026-T3'` en el formulario
nunca producirá una coincidencia con `to_char(..., 'YYYY-MM')`, y el expediente generado
quedará vacío (cero documentos) sin ningún error visible — un caso exactamente del tipo
que este ADR busca prevenir.

`periodCloses` (tabla `period_closes`, `packages/db/src/schema.ts` línea 35) también
almacena `period` como `text` plano, sin columnas de fecha de inicio/fin.

## Decision

El periodo fiscal debe representarse como un rango de fechas real (columnas de inicio y
fin, o al menos una convención de cálculo determinista de rango a partir de una etiqueta
canónica única), no como texto libre comparado con formatos ad-hoc en cada consumidor. Esta
fase (FASE 00) **no modifica el esquema** (sin cambios de negocio); se registra la
discrepancia real encontrada (etiqueta de trimestre en UI vs. filtro de mes en
repositorio) como hallazgo verificado, para que Fase 02/06 lo resuelvan mediante una
migración aditiva que añada columnas `period_start`/`period_end` (o equivalente) a
`period_closes` y actualice `vat-dossiers-repository.ts` para filtrar por rango real en
lugar de por coincidencia de cadena `to_char`.

## Consequences

- Hasta que se resuelva, el flujo real de expediente de IVA por trimestre (`'2026-T3'`)
  está roto en la práctica — documentado también en
  `docs/product-redefinition-implementation-plan.md` como hallazgo `IN PROGRESS`, no
  `RESOLVED`.
- Fase 02/06 debe decidir la convención canónica del periodo (ISO week-based quarter,
  año-trimestre, o rango explícito) y propagarla de forma consistente entre UI, controlador
  y repositorio — un solo lugar de verdad para el cálculo de rango.
- No se corrige en FASE 00 porque excede el alcance "sin cambios de semántica de negocio"
  de esta fase; se deja registrada como limitación abierta en
  `docs/implementation-phase-log.md`.
