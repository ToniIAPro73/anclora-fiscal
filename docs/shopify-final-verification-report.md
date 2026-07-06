# Anclora Fiscal — Shopify three-evidence implementation report

## Rama y base

- Rama base: `main`
- SHA base: `88eb092` (inicio del plan Shopify-first)
- Rama de trabajo: `main`
- Push remoto: `origin/main`

## Fases

<!-- markdownlint-disable MD013 -->

| Fase | Commit | Push | Estado | Resumen |
| ---- | ------ | ---- | ------ | ------- |
| SHOPIFY-00 | `88eb092` | `origin/main` | Aceptada | CI y fixtures deterministas. |
| SHOPIFY-01 | `9555846` | `origin/main` | Aceptada | Tres conectores y detectores. |
| SHOPIFY-02 | `5155f2d` | `origin/main` | Aceptada | Pedidos y líneas normalizados. |
| SHOPIFY-03 | `a97b955` | `origin/main` | Aceptada | Transacciones y ledger persistidos. |
| SHOPIFY-04 | `1c8d298` | `origin/main` | Aceptada | Ciclo de importación por stream. |
| SHOPIFY-05 | `9a0f6ca` | `origin/main` | Aceptada | Enlaces de evidencia seguros. |
| SHOPIFY-06 | `fe31c97` | `origin/main` | Aceptada | Ventas, liquidación y emisión manual. |
| SHOPIFY-07 | este commit | `origin/main` | Aceptada | Documentación y aceptación real. |

<!-- markdownlint-enable MD013 -->

## Flujos implementados

### Orders CSV

- Detector exclusivo, preview sin PII, confirmación e idempotencia.
- Agrupación por `Name`, persistencia de líneas y revisión de importe cero.

### Order Transaction History CSV

- Eventos de sale/refund conservan signo, ID interno, nombre y estado fuente.
- No crean pedidos ni documentos fiscales.

### Shopify Payments Ledger CSV

- Conserva bruto, fee, neto, VAT y estado de payout.
- Sin Payout ID permanece pendiente; no afirma banco.

### Relaciones de evidencia

- Enlaces exactos pedido–transacción y pedido–ledger.
- Propuestas transacción–ledger explicables y decidibles con auditoría.

### Ventas, settlement y facturación

- Expediente operativo por pedido y estados precisos de evidencia.
- Caso fiscal desde pedido confirmado; emisión sólo manual y autorizada.
- Refund con factura conduce a rectificación; sin factura, a revisión.

## Migraciones

<!-- markdownlint-disable MD013 -->

| Migración | Propósito | Base limpia | Segunda ejecución | Estado |
| --------- | --------- | ----------- | ----------------- | ------ |
| 0012 | Estados de importación v2 | Correcta | Correcta | Aceptada |
| 0013 | Líneas Shopify trazables | Correcta | Correcta | Aceptada |
| 0014 | Eventos y ledger Payments | Correcta | Correcta | Aceptada |
| 0015 | Enlaces de evidencia | Correcta | Correcta | Aceptada |

<!-- markdownlint-enable MD013 -->

## Calidad ejecutada

| Comando | Resultado real | Observaciones |
| ------- | -------------- | ------------- |
| `pnpm lint` | 7/7 tareas | Sin errores. |
| `pnpm typecheck` | 7/7 tareas | Sin errores. |
| `pnpm test` | 429 pruebas | API 176; DB 100; web 58; resto 95. |
| `pnpm build` | 7/7 tareas | Bundle API Vercel verificado. |
| `pnpm test:e2e` | 33/33 | Chromium autenticado. |
| `git diff --check` | Correcto | Sin errores de whitespace. |
| Markdown afectado | 11 archivos, 0 errores | `markdownlint-cli2`. |
| UI manual | 8 vistas | Desktop y móvil, sin overflow ni errores. |

## Aceptación con exports reales

- Archivos usados localmente: tres CSV en `.evidence/`, identificados sólo por
  hashes abreviados `b21b525c66f4`, `388149823208` y `478513dcf6f7`.
- Resultado: detectores exclusivos correctos; 4 pedidos, 2 transacciones y 2
  movimientos; enlaces por ID y por nombre; refund visible en ambos streams;
  ledger neto −0,45 EUR; 2 payouts pending sin ID; 3 pedidos a cero excluidos.
- Datos no versionados en el árbol final: confirmado; retirados del índice y
  protegidos por `.gitignore`. Persisten en commits históricos previos.

## Riesgos abiertos y límites

- No existe evidencia bancaria ni debe inferirse desde payout.
- Las reglas fiscales incompletas bloquean o envían a revisión.
- La cola específica de refund sin factura no tiene pantalla dedicada.
- Eliminar los CSV de la historia remota exige una reescritura destructiva fuera
  del alcance autorizado de esta fase.

## Siguiente paso

- Publicar el commit SHOPIFY-07 en `origin/main`. No se abre ni fusiona PR y no
  se despliega a producción sin instrucción explícita.
