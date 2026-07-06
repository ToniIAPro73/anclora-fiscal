# ADR 0008 — Payout pendiente no es conciliación bancaria

## Status

Accepted

## Context

Un ledger puede indicar `pending` sin `Payout ID`, y una referencia de payout
puede existir antes de comprobar el abono en un extracto bancario.

## Decision

Sin `Payout ID` no se crea payout. Con ID se muestra “payout identificado”,
nunca “cobro bancario verificado”. `bankVerified` permanece falso mientras no
exista una fuente bancaria independiente.

## Consequences

Los cierres no pueden usar el ledger como sustituto de banco. La UI y la API
mantienen estados separados y lenguaje no engañoso.
