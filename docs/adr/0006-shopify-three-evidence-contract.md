# ADR 0006 — Contrato de tres evidencias Shopify

## Status

Accepted

## Context

Orders, Order Transaction History y Shopify Payments Ledger representan hechos
distintos y pueden cubrir rangos temporales diferentes.

## Decision

Cada export tiene detector, parser, preview, persistencia e idempotencia propios.
Ningún stream crea entidades pertenecientes a otro stream. Las relaciones se
modelan después mediante `shopify_evidence_links`.

## Consequences

Puede existir evidencia huérfana o pendiente sin bloquear el import. La UI debe
indicar qué stream falta y nunca rellenarlo con inferencias.
