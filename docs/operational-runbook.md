# Runbook operativo

## Arranque local

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Web: `http://localhost:3000`. API: `http://localhost:3001`. OpenAPI:
`http://localhost:3001/documentation`.

## Validación y build

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Playwright arranca automáticamente ambos procesos. Para instalar Chromium:
`pnpm --filter @anclora/web exec playwright install chromium`.

## Base de datos

```bash
pnpm db:migrate
pnpm seed
```

No ejecute estos comandos sobre una URL compartida sin revisar antes
`DATABASE_URL` y las cinco migraciones. La API aún no consume `packages/db`.

Las migraciones también se validan sin servicios externos mediante
`migrateOfflineDatabase()` y PGlite:

```bash
pnpm --filter @anclora/db test
```

## Operación segura

Mantenga `VERIFACTU_ENABLED=false`. No existe integración AEAT real. En
producción la ruta de importación devuelve 403 hasta integrar autenticación.
Revise `storage/` y elimine evidencias solo conforme a una política aprobada;
la aplicación no implementa todavía retención ni borrado administrativo.

## Diagnóstico

- `422`: revisar MIME, cabeceras, hojas y estructura del archivo.
- `403`: en local, comprobar el rol demo; en producción es el cierre esperado.
- Fallo KDP: verificar las nueve hojas y nombres tolerando espacios finales.
- Fallo de build web: comprobar que módulos Node se importan desde
  `@anclora/core/server`, nunca desde componentes cliente.
