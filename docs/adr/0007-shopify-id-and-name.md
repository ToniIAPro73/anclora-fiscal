# ADR 0007 — Identificadores Shopify `Id` y `Name`

## Status

Accepted

## Context

Los exports usan el ID interno y la referencia visible del pedido en columnas
distintas. Ambos aparecen en los tres archivos reales, pero no son equivalentes.

## Decision

Se preservan ambos. `Name` es la clave estable del pedido comercial y del
enlace con ledger. `Order` del historial conserva el ID interno; `Name` permite
resolver el pedido en el modelo persistido sin sustituir ni descartar el ID.

## Consequences

La trazabilidad puede demostrar tanto el enlace por ID del export como el enlace
por nombre. La aplicación no presenta un fingerprint como ID nativo de Shopify.
