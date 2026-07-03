# Arquitectura

## Estructura del monorepo

- `apps/web`: Next.js 15 App Router, páginas operativas y demos de dominio.
- `apps/api`: Fastify, OpenAPI y vista previa de importaciones.
- `packages/core`: lógica de matching y regalías segura para navegador.
- `packages/core/server`: storage, PDF, expedientes y VERI*FACTU mock para Node.js.
- `packages/db`: esquema Drizzle y migraciones PostgreSQL, todavía sin cablear a la API.
- `packages/connectors`: parsers Shopify CSV/PDF y Amazon KDP XLSX.
- `packages/tax-engine`: reglas fiscales versionadas y `DEMO_CONFIG`.
- `packages/ui`: tokens y componentes compartidos.

## Procesos y límites

Turborepo coordina dos procesos: web en el puerto 3000 y API en el 3001. La
separación `@anclora/core` / `@anclora/core/server` evita incluir módulos Node
en componentes cliente.

```mermaid
flowchart LR
  Browser --> Web[Next.js web]
  Web -->|multipart preview| API[Fastify API]
  API --> Connectors[Connectors]
  Connectors --> Storage[Filesystem Storage]
  Web --> Core[Core demo logic]
  API -. no conectado .-> DB[(Drizzle schema)]
```

## Flujos reales

La importación sí realiza un recorrido navegador → API → conector → storage.
Las páginas de operaciones, conciliación, facturación, VERI*FACTU, expedientes
y configuración ejecutan casos demo fijos y no consultan datos persistidos.

## Restricciones operativas

No se usa Docker, Redis, MinIO ni Chromium para PDF. PGlite está disponible
para pruebas offline y PostgreSQL serverless para una integración futura.

