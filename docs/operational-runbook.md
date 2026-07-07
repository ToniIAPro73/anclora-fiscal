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
`DATABASE_URL` y las migraciones pendientes. La API productiva consume
repositorios de `packages/db`.

Las migraciones también se validan sin servicios externos mediante
`migrateOfflineDatabase()` y PGlite:

```bash
pnpm --filter @anclora/db test
```

## Operación segura

Mantenga `VERIFACTU_ENABLED=false`. No existe integración AEAT real. En
producción las rutas operativas requieren sesión firmada y permisos RBAC.
Revise `storage/` y elimine evidencias solo conforme a una política aprobada;
la aplicación no implementa todavía retención ni borrado administrativo.

## Configuración fiscal inicial

1. Abra **Configuración** con rol `ADMIN` o `FISCAL_OPERATOR`.
2. Complete el emisor persona física: nombre legal, domicilio fiscal, NIF/NIE,
   IAE, régimen `REGIMEN_REDUCIDO_LIBROS_ES`, país `ES` y moneda `EUR`.
3. Active OSS sólo si existe alta y reglas de destino efectivas. Si no, deje
   OSS inactivo; las ventas B2C UE quedarán en `PENDIENTE_REVISION_OSS`.
4. Configure el perfil de libro digital con tipo nacional 4 % y fecha de
   vigencia documentada.
5. Guarde y verifique que aparecen las series `FS`, `F` y `FR`.
6. Si cambia el NIF/NIE, introdúzcalo de nuevo; el GET nunca lo mostrará en
   claro.

## Acciones fiscales manuales

- OSS incompleto: no emitir; revisar configuración y regla de destino antes de
  reintentar.
- B2B: exigir identidad y domicilio de destinatario; NIF-IVA UE sólo sirve si
  está validado.
- Refund parcial: no edite la factura original; emita rectificativa vinculada
  cuando exista documento previo.
- Importe cero: conservar evidencia y mantener `REVISION_IMPORTE_CERO`.

## Diagnóstico

- `422`: revisar MIME, cabeceras, hojas y estructura del archivo.
- `403`: en local, comprobar el rol demo; en producción es el cierre esperado.
- Fallo KDP: verificar las nueve hojas y nombres tolerando espacios finales.
- Fallo de build web: comprobar que módulos Node se importan desde
  `@anclora/core/server`, nunca desde componentes cliente.
