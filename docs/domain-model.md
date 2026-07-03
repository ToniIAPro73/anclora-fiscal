# Modelo de dominio

## Contextos implementados

Identidad incluye `Tenant`, `LegalEntity`, `User`, `Role`, `Permission` y
`AuditEvent`. Importación incluye jobs, archivos, filas, errores y evidencias.
El contexto comercial contiene pedidos, eventos financieros, operaciones,
candidatos de matching e incidencias.

Fiscalidad incluye configuración, series, decisiones, documentos, cadena de
integridad y envíos VERI*FACTU. Cierre incluye periodos y expedientes IVA.
KDP usa `RoyaltyStatement` y `RoyaltyLine` en `packages/core/src/royalty.ts`.

## Entidades implementadas solo como esquema

Las tablas Drizzle existen y tienen migraciones versionadas, pero `apps/api`
no crea repositorios ni conexiones a `@anclora/db`. Por ello no representan
persistencia activa en los flujos actuales.

## Entidades especificadas aún ausentes

No existen todavía tablas específicas para `TaxProfile`, `InvoiceRender`,
`Payout`, `PayoutLine`, `PlatformFee`, `BankTransaction`, `EvidenceLink`,
`IssueComment`, `ReviewTask`, `Approval`, `VATDossierItem` o `ExportJob`.
Tampoco hay modelos persistidos de `RoyaltyStatement` y `RoyaltyLine`.

## Invariantes

- Pedido, evento financiero, documento fiscal y payout son capas distintas.
- Un refund añade eventos y rectificación; nunca elimina el original.
- El VAT de plataforma no es el IVA fiscal calculado.
- Una decisión conserva regla, versión y explicación.
- Un documento emitido es inmutable y se corrige con otro documento.

