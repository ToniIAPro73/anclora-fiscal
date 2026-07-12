# Anclora Fiscal

Sistema operativo fiscal trazable para ventas digitales de Anclora Insights.

## Requisitos

- Node.js 22
- pnpm 10
- PostgreSQL serverless mediante `DATABASE_URL` para entornos compartidos
- Ningún contenedor ni servicio local

## Inicio local

```bash
cp .env.example .env
pnpm install
pnpm dev
```

La web queda disponible en `http://localhost:3000` y la API en
`http://localhost:3001`. La documentación OpenAPI se publica en
`http://localhost:3001/documentation`.

No ejecute `pnpm db:migrate` o `pnpm seed` contra una base compartida sin una
revisión previa de la URL y la migración versionada.

## Calidad

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

VERI*FACTU permanece desactivado por defecto. La aplicación no declara
cumplimiento fiscal hasta completar y validar la matriz normativa.

## Documentación VERI*FACTU

- [`docs/verifactu-compliance-matrix.md`](docs/verifactu-compliance-matrix.md) — matriz
  requisito-por-requisito y su estado de implementación.
- [`docs/verifactu-production-readiness.md`](docs/verifactu-production-readiness.md) —
  flags de entorno, gates obligatorios antes de producción y qué queda pendiente
  (declaración responsable, certificado de producción, backups, retención de evidencias).
- [`docs/adr/0005-verifactu-preparation-only.md`](docs/adr/0005-verifactu-preparation-only.md)
  — decisión de diseño: preparación técnica, sin endpoint de envío público ni botón de
  envío en la UI.
