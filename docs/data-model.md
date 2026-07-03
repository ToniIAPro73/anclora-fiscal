# Modelo de datos

## Estado

El esquema usa PostgreSQL mediante Drizzle y cinco migraciones incrementales.
Está definido en `packages/db/src/schema.ts`, pero todavía no se usa desde la
API. Los importes emplean `numeric` y todas las tablas operativas incluyen
`tenant_id`.

## Grupos de tablas

- Identidad: `tenants`, `legal_entities`, `users`, `roles`, `permissions`,
  `user_roles`, `audit_events`.
- Configuración: `fiscal_configurations`, `invoice_series`.
- Importación: `import_jobs`, `import_files`, `import_rows`, `import_errors`,
  `evidence_documents`.
- Operaciones: `commercial_orders`, `financial_events`,
  `canonical_operations`, `matching_candidates`, `issues`.
- Fiscal: `tax_decisions`, `fiscal_documents`, `integrity_chain_records`,
  `verifactu_submissions`.
- Cierre: `period_closes`, `vat_dossiers`.

## Relaciones principales

```mermaid
erDiagram
  TENANTS ||--o{ LEGAL_ENTITIES : owns
  TENANTS ||--o{ USERS : contains
  USERS }o--o{ ROLES : user_roles
  TENANTS ||--o{ IMPORT_JOBS : runs
  IMPORT_JOBS ||--o{ IMPORT_FILES : contains
  IMPORT_FILES ||--o{ IMPORT_ROWS : parses
  IMPORT_FILES ||--o{ EVIDENCE_DOCUMENTS : preserves
  EVIDENCE_DOCUMENTS ||--o{ COMMERCIAL_ORDERS : supports
  COMMERCIAL_ORDERS ||--o{ MATCHING_CANDIDATES : proposes
  FINANCIAL_EVENTS ||--o{ MATCHING_CANDIDATES : proposes
  LEGAL_ENTITIES ||--o{ CANONICAL_OPERATIONS : owns
  CANONICAL_OPERATIONS ||--o{ TAX_DECISIONS : evaluates
  CANONICAL_OPERATIONS ||--o{ FISCAL_DOCUMENTS : issues
  CANONICAL_OPERATIONS ||--o{ ISSUES : raises
  FISCAL_DOCUMENTS ||--o{ INTEGRITY_CHAIN_RECORDS : chains
  INTEGRITY_CHAIN_RECORDS ||--o{ VERIFACTU_SUBMISSIONS : queues
  PERIOD_CLOSES ||--o{ VAT_DOSSIERS : exports
```

## Integridad y aislamiento

Índices únicos protegen slugs, referencias externas, hashes y números de
factura dentro de su ámbito. El aislamiento por tenant está modelado, pero no
puede considerarse aplicado hasta que la API use repositorios persistentes.

