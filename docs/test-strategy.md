# Estrategia de pruebas

## Pirámide actual

La suite contiene 12 archivos Vitest junto a su código y 2 archivos Playwright.
Vitest cubre parsers Shopify/KDP, RBAC, matching, fiscalidad, facturación,
integridad, expedientes, API y componentes cliente.

Playwright cubre 12 escenarios: las 9 rutas del producto y 3 importaciones
reales — Shopify, KDP y rechazo de tipo no admitido. Web y API se levantan como
procesos separados durante la prueba.

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Límites explícitos

Las pruebas E2E de páginas server cierran el gap de render RSC sin introducir
un renderer experimental. No existen E2E de refund parcial persistido, payout
multi-pedido, emisión mutante, envío VERI*FACTU, cierre/reapertura real o API
multi-tenant porque las rutas y persistencia necesarias no están implementadas.
