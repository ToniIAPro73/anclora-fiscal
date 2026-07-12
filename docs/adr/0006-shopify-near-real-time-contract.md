# ADR 0006: contrato near-real-time de Shopify

## Estado

Aceptado como diseño; implementación de endpoint y Shopify App aplazada.

## Decisión

Los webhooks serán fuente rápida y los CSV actuales seguirán siendo evidencia de reconciliación secundaria. Cada evento incluye versión, tenant/store mapping, timestamp, idempotency key, firma HMAC, hash de evidencia cruda y provenance.

Eventos fuera de orden se custodian y reprocesan cuando llegan sus dependencias. Duplicados se descartan por idempotency key sin perder auditoría. Fallos agotados pasan a dead-letter y crean incidencia. El receptor futuro aplicará replay window, límites de tasa y resolución explícita de store a tenant antes de normalizar.

## Seguridad

No se implementa endpoint público en esta fase. Un receptor futuro verificará HMAC sobre bytes crudos antes de parsear, rechazará timestamps antiguos y nunca aceptará tenant desde el payload sin mapping interno.

## Migración

1. Registrar Shopify App, secretos y stores mediante procedimiento aprobado.
2. Implementar inbox durable y verificación antes del dominio.
3. Reutilizar normalizadores de Orders, Transactions y Ledger.
4. Ejecutar webhooks y CSV en paralelo, comparar resultados e idempotencia.
5. Mantener CSV como reconciliación mientras no exista evidencia operativa suficiente.
