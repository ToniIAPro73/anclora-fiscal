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
