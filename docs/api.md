# API

## Rutas disponibles

### `GET /health`

Devuelve `status` y el estado booleano de `VERIFACTU_ENABLED`.

### `GET /api/v1/session`

Devuelve `authenticated: false` y los cuatro roles modelados. No representa
una sesión autenticada real.

### `POST /api/v1/imports/preview`

Acepta multipart con campo `file`, máximo 15 MB. MIME permitidos: CSV, PDF y
XLSX. En desarrollo/test requiere `x-anclora-role: FISCAL_OPERATOR` o `ADMIN`.
En producción el encabezado se deshabilita y la ruta falla con 403 hasta que
exista autenticación real.

La respuesta incluye conector, hash de evidencia, resumen e incidencias sin
PII. Los errores son `400 FILE_REQUIRED`, `403 FORBIDDEN` y errores `422` de
MIME o estructura.

## Recursos no implementados

No existen rutas para operaciones, eventos financieros, payouts, reglas o
decisiones fiscales, documentos, conciliaciones, incidencias, VERI*FACTU,
periodos, expedientes, exports ni auditoría. Construir esa superficie REST y
cablear `packages/db` queda fuera del endurecimiento y sigue siendo el mayor
gap funcional.

## OpenAPI

La interfaz Swagger está en `/documentation`. Actualmente solo parte de los
esquemas de respuesta está descrita de forma explícita.

