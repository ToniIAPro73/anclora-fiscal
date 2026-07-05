# ADR 0005 — VERI*FACTU: preparación únicamente, sin integración activa

## Status

Accepted

## Context

VERI\*FACTU es un requisito normativo de la AEAT que exige un sistema de facturación
verificable con cadena de integridad y, cuando corresponda, envío a la administración. El
producto no debe declarar ni sugerir cumplimiento normativo activo hasta que el flujo real
de facturación (Fase 05) esté validado — activar prematuramente una integración o mostrar
un flag como si estuviera operativo sería una afirmación de cumplimiento falsa, prohibida
explícitamente en §2.5 del master prompt.

## Decision

El flag de activación vive en una única variable de entorno, leída en un único punto:

```ts
// apps/api/src/build-app.ts:93
app.get('/health', ..., async () => ({
  status: 'ok',
  verifactuEnabled: process.env.VERIFACTU_ENABLED === 'true',
}));
```

`VERIFACTU_ENABLED` no está definida en el entorno de desarrollo/test por defecto, por lo
que `verifactuEnabled` resuelve a `false` — confirmado por el test existente
`apps/api/src/build-app.test.ts` ("mantiene VERI\*FACTU desactivado por defecto").

Se ha verificado por lectura directa de la tabla completa de rutas registradas en
`apps/api/src/build-app.ts` (líneas 93-184) que **no existe ningún endpoint de envío**
(`/verifactu/submit` o equivalente): las únicas rutas registradas son `/health`, las rutas
de auth, `/api/v1/imports/preview`, `/api/v1/operations`, `/api/v1/financial-events`,
`/api/v1/reconciliation/candidates`, `/api/v1/reconciliation/unmatched-orders`,
`/api/v1/issues`, `/api/v1/issues/:id`, `/api/v1/operations/:id/invoices`,
`/api/v1/fiscal-documents/:id/rectify`, `/api/v1/periods/:period/close`,
`/api/v1/periods/:period/reopen`, `/api/v1/periods/:period/vat-dossier` (GET/POST) y
`/api/v1/dashboard/summary`. `apps/web/app/verifactu/page.tsx` refuerza esto en la propia
UI, declarando explícitamente que no existe integración AEAT real.

Esta fase (FASE 00) extiende el test de regresión existente
(`apps/api/src/build-app.test.ts`) para además afirmar la ausencia de ruta de envío, no
sólo el valor del flag — ver Tarea 5 del plan de esta fase.

## Consequences

- Cualquier trabajo de Fase 08 ("Preparación VERI\*FACTU y endurecimiento final de
  cumplimiento") que añada un endpoint de envío deberá actualizar este test de regresión
  de forma consciente, no accidental — el test fallará intencionadamente si se registra
  una ruta de envío mientras `VERIFACTU_ENABLED` siga sin flujo de aprobación explícito.
- El esquema de preparación (tablas `verifactuSubmissions`, `integrityChainRecords` en
  `packages/db/migrations/0004_dossier_verifactu.sql`) puede seguir evolucionando en fases
  intermedias (schema/interfaces) sin activar envío real, cumpliendo el principio
  "preparación, no integración activa".
