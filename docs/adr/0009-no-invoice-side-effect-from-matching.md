# ADR 0009 — Matching sin efectos de facturación

## Status

Accepted

## Context

Relacionar evidencias no prueba configuración fiscal, autorización del actor ni
que el caso sea facturable.

## Decision

El caso fiscal se crea desde un pedido confirmado. Import, matching y enlace no
emiten ni rectifican documentos. La emisión es una acción manual protegida por
RBAC y por elegibilidad calculada en servidor.

## Consequences

Pedidos a cero, evidencia incompleta y decisiones no determinadas quedan fuera
de emisión. Los refunds siguen una rama explícita de revisión o rectificación.
