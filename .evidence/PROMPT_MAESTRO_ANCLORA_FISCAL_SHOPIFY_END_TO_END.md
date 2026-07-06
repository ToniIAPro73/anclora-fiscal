# PROMPT MAESTRO END-TO-END — ANCLORA FISCAL / SHOPIFY THREE-EVIDENCE FLOW

> **Destino:** agente de desarrollo con acceso al repositorio, terminal, Git y
> remoto `origin`.
> **Alcance:** Shopify exclusivamente. No implementar, refactorizar ni ampliar
> Amazon KDP salvo un cambio mínimo imprescindible para que compile y esté
> cubierto por regresión.
> **Resultado esperado:** una rama revisable, con commits y push por fase, que
> permita importar pedidos, transacciones de pedido y ledger de Shopify Payments
> como fuentes separadas, relacionarlas con trazabilidad y operar facturación
> sin depender de payout.

---

## 0. Misión y definición del problema

Trabaja como arquitecto TypeScript full-stack, ingeniero de datos de comercio
electrónico, especialista QA y revisor de seguridad para software fiscal
español.

No reescribas `anclora-fiscal` desde cero. Aprovecha y preserva:

- el monorepo actual;
- el shell y navegación de fases 1–3;
- RBAC, aislamiento por tenant y auditoría;
- custodia de evidencias, hash, import jobs, preview, confirm/reject/retry;
- configuración fiscal y readiness de emisión;
- migraciones existentes;
- tests y compatibilidad razonable con datos legacy.

El producto Shopify no es un único “importador de pagos”. Debe operar sobre tres
fuentes que representan cosas distintas:

```text
A. Shopify Orders CSV
   Pedido comercial + líneas + descuento + envío + impuestos reportados +
   estado comercial.

B. Shopify Order Transaction History CSV
   Eventos de pago asociados al pedido: sale, refund, authorization, capture,
   void, etc.

C. Shopify Payments Ledger / Payout Transactions CSV
   Charge, refund, fees, net, estado de payout y Payout ID cuando exista.
```

Principio cardinal:

```text
Pedido ≠ transacción de pedido ≠ movimiento de ledger ≠ payout ≠ banco
≠ factura fiscal.
```

No mezcles las capas. Ninguna mejora visual justifica inventar una relación o un
resultado fiscal.

---

## 1. Inspección obligatoria antes de editar

Ejecuta y registra:

```bash
git status --short
git branch --show-current
git remote -v
git fetch origin --prune
git log --oneline --decorate -20
git branch -a --contains HEAD
```

Lee, como mínimo:

```text
README.md
docs/architecture.md
docs/domain-model.md
docs/data-model.md
docs/import-mapping-spec.md
docs/reconciliation.md
docs/security.md
docs/known-limitations.md
docs/implementation-phase-log.md
docs/product-redefinition-implementation-plan.md
docs/adr/*
PROMPT_MAESTRO_ANCLORA_FISCAL_REDEFINICION_POR_FASES.md
ANCLORA_FISCAL_REDEFINICION_PRODUCTO_Y_PLAN_DE_CAMBIOS.md
```

Inspecciona específicamente:

```text
packages/connectors/src/shopify-orders-csv.ts
packages/connectors/src/shopify-csv.ts
packages/connectors/src/*.test.ts
apps/api/src/import-service.ts
apps/api/src/import-lifecycle-service.ts
apps/api/src/import-preview-persistence.ts
apps/api/src/ingestion-normalization-service.ts
apps/api/src/matching-service.ts
packages/core/src/matching.ts
packages/db/src/schema.ts
packages/db/src/*repository.ts
packages/db/migrations/
apps/web/app/imports/
apps/web/app/sales/shopify/
apps/web/app/reconciliation/
.github/workflows/ci.yml
```

### Hechos de partida que debes verificar, no asumir ciegamente

1. Fases 1, 2 y 3 ya han introducido shell, configuración fiscal, import
   preview/confirm/retry, import states y estructuras preparadas.
2. El CI actual puede fallar por fixtures Shopify ausentes o incompatibles.
3. El parser de pedidos puede crear una entidad por fila en vez de agrupar un
   pedido multi-línea.
4. El flujo actual puede crear operaciones, decisiones o documentos a partir del
   matching de eventos. Esto contradice el objetivo si bloquea la venta o
   dispara factura automáticamente.
5. El repositorio puede contener cambios no reflejados correctamente en
   `implementation-phase-log.md`. El código, las pruebas y el historial Git son
   la evidencia principal. Registra cualquier divergencia antes de adoptar una
   decisión.

Si existen cambios no relacionados sin confirmar, **detente y repórtalos**. No
borres, no hagas stash, no ejecutes `reset --hard`, `clean -fd`, `push --force`,
`commit --amend` ni rebase de commits publicados.

---

## 2. Rama, commits, push y control de alcance

### 2.1 Rama

No trabajes directamente sobre `main`, `master`, `production` ni `staging`.

Determina la base:

1. usa `origin/development` si existe y contiene el trabajo de fases 1–3;
2. si no, usa la rama no protegida que realmente contiene ese trabajo;
3. documenta la base y el SHA inicial.

Crea o retoma una única rama:

```text
feat/anclora-fiscal-shopify-three-evidence
```

No dupliques trabajo ya realizado en esa rama.

### 2.2 Al final de cada fase

Ejecuta siempre:

```bash
git status --short
git diff --check
git diff --stat
```

Revisa los ficheros que se van a incluir. Usa `git add <rutas explícitas>`,
nunca `git add .` ni `git add -A` sin revisión explícita de todos los cambios.

Haz commit y push:

```bash
git commit -m "<mensaje exacto de la fase>"
git push -u origin feat/anclora-fiscal-shopify-three-evidence
```

En pushes posteriores:

```bash
git push origin feat/anclora-fiscal-shopify-three-evidence
```

Actualiza `docs/implementation-phase-log.md` dentro del commit de la misma fase
con:

- nombre de fase;
- objetivo;
- archivos/migraciones reales;
- comandos ejecutados y resultado literal;
- SHA corto;
- rama remota;
- limitaciones abiertas;
- siguiente fase.

No declares que una prueba pasó si no la ejecutaste.

### 2.3 No subir datos reales

Los CSV reales utilizados para aceptación contienen datos comerciales/personales
y **no se añaden al repositorio**.

Prohibido subir:

```text
.env
secrets
dumps
exports reales
emails/direcciones/nombres reales
artefactos de build
coverage
storage
snapshots con PII
```

Los fixtures versionados deben ser sintéticos y anonimizados.

---

## 3. Contrato funcional obligatorio

### 3.1 Tres streams de importación

- **Pedidos**
  - Código: `SHOPIFY_ORDERS_CSV`
  - Fichero de referencia: `orders_export_1.csv`
  - Entidad primaria: `commercial_orders` + `order_lines`
- **Transacciones de pedido**
  - Código: `SHOPIFY_ORDER_TRANSACTIONS_CSV`
  - Fichero de referencia: `transactions_export_1.csv`
  - Entidad primaria: `shopify_order_payment_events` o equivalente
- **Ledger/payouts**
  - Código: `SHOPIFY_PAYMENTS_LEDGER_CSV`
  - Fichero de referencia: `payment_transactions_export_1.csv`
  - Entidad primaria: `shopify_payments_ledger_entries` + `payouts` sólo si hay
    `Payout ID`

Usa versiones de mapping explícitas:

```text
shopify-orders-csv@2
shopify-order-transactions-csv@1
shopify-payments-ledger-csv@2
```

No reutilices `shopify-csv` como nombre ambiguo para todas las fuentes nuevas.
Puede permanecer como adaptador de lectura legacy si hace falta.

### 3.2 Identificadores

Debes conservar dos IDs de pedido:

```text
orders.Id     = ID interno de Shopify
orders.Name   = número visible de pedido
```

Relaciones obligatorias:

```text
order_transactions.Order → orders.Id
payments_ledger.Order    → orders.Name
```

`Checkout` es una señal auxiliar del ledger, no una clave universal.

No asumas que `Payment Reference`, `Payment ID`, `Order`, `Name` y `Checkout`
son intercambiables.

### 3.3 Payout pending

Cuando el ledger tenga:

```text
Payout ID vacío
o
Payout Status pendiente/no liquidado
```

debes:

- persistir el movimiento de ledger;
- mostrar el importe previsto y el neto;
- **no** crear un payout real;
- **no** marcarlo como cobro bancario;
- **no** marcar la conciliación como completa.

Sólo crear/actualizar `payouts` cuando exista un identificador real de payout de
Shopify.

### 3.4 Facturación

- Un pedido existe y puede revisarse aunque no haya pago/payout.
- No crear una factura automáticamente al importar un event o al encontrar un
  match.
- No emitir para importe cero sin acción explícita autorizada y motivo.
- Refund no borra pedido ni documento.
- Si hay factura emitida, la corrección se realiza por rectificativa vinculada;
  no editar el documento original.
- País, nombre de empresa, email, IVA cero o `Billing Company` no prueban B2B.

---

## 4. Invariantes técnicas y de seguridad

Estas reglas deben protegerse con tipos, restricciones, servicios y tests:

1. Una fila de Orders no equivale necesariamente a un pedido: las filas con el
   mismo `Name` se agrupan.
2. Cada pedido conserva el `Id` interno y el `Name` visible.
3. El parser de Order Transactions no crea pedidos ni líneas.
4. El parser de Payments Ledger no crea pedidos, facturas ni payouts ficticios.
5. Un reimport idéntico no duplica pedidos, líneas, eventos, ledger entries,
   payouts, incidencias ni enlaces.
6. La evidencia de Shopify no se sobrescribe; los cambios se representan como
   nuevas evidencias, links o decisiones.
7. `VAT` del ledger es evidencia de plataforma, no el IVA fiscal final.
8. Fee de Shopify se conserva independiente del importe comercial.
9. Un refund completo puede dejar ingreso comercial neto cero y,
   simultáneamente, un saldo de ledger distinto de cero por una fee no devuelta.
10. Los imports, descargas, detalles y decisiones validan autenticación, rol y
    tenant.
11. No exponer PII ni snapshots brutos de CSV en respuesta HTTP, logs o tests.
12. Una venta puede tener decisión fiscal sin evento financiero.
13. Payout real no significa banco conciliado sin evidencia bancaria.
14. Mantener KDP sin cambios de dominio, salvo correcciones de
    compilación/regresión.

---

## 5. FASE SHOPIFY-00 — Reparación de CI y baseline confiable

**Objetivo:** arreglar los fixtures antes de cambiar lógica de negocio.

### Trabajo de Shopify-00

1. Localiza todos los tests que leen:

   ```text
   .evidence/pedido-shopify.csv
   .evidence/pedido-shopify-sin-pais.csv
   .evidence/pedido-shopify-pruebas.csv
   .evidence/payment_transactions_export_1.csv
   ```

2. Crea fixtures sintéticos en:

   ```text
   packages/connectors/test/fixtures/
   ```

   Como mínimo:

   ```text
   shopify-orders-anonymized.csv
   shopify-orders-no-optional-data.csv
   shopify-order-transactions-anonymized.csv
   shopify-payments-ledger-pending-anonymized.csv
   shopify-payments-ledger-settled-anonymized.csv
   ```

3. Los fixtures deben cubrir:
   - pedido multi-línea;
   - un refund completo;
   - pedido de importe cero por descuento;
   - country shipping prioritario / fallback billing;
   - order transactions con sale y refund;
   - ledger con charge, fee, refund y payout pending sin ID;
   - ledger con Payout ID real;
   - datos no personales.
4. Corrige las expectativas contradictorias: no uses un CSV masivo para esperar
   una sola fila; no uses Orders CSV con el parser de ledger.
5. Añade un test que confirme la detección de los tres tipos de CSV.
6. No “arregles” los tests relajando el parser para aceptar un tipo de archivo
   equivocado.

### Validación

```bash
pnpm --filter @anclora/connectors test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

### Commit de Shopify-00

```text
test(fiscal): shopify-00 - restore deterministic connector fixtures
```

No continúes si esta fase no queda verde.

---

## 6. FASE SHOPIFY-01 — Detectores y conectores de tres evidencias

**Objetivo:** crear parsers separados, robustos y versionados.

### Trabajo de Shopify-01

1. Crea:

   ```text
   packages/connectors/src/shopify-order-transactions-csv.ts
   ```

2. Refactoriza el actual parser de Shopify Payments para que sea explícitamente
   ledger:

   ```text
   shopify-payments-ledger-csv.ts
   ```

   Puedes conservar un re-export temporal en `shopify-csv.ts` si otras partes
   del monorepo lo necesitan, pero documenta su deprecación.

3. Refactoriza `shopify-orders-csv.ts`:
   - eliminar regex de pedido `AI-\d+`;
   - no depender del orden exacto de cabeceras;
   - soportar BOM, columnas añadidas y reordenadas;
   - validar columnas obligatorias y opcionales;
   - explicar qué columna falta en errores;
   - no aceptar CSV de otro tipo.
4. Define detectores:

   ```text
   isShopifyOrdersCsvFile
   isShopifyOrderTransactionsCsvFile
   isShopifyPaymentsLedgerCsvFile
   ```

5. Implementa business keys:
   - Orders: hash del identificador de pedido/estructura comercial relevante.
   - Order transactions: hash de
     `Order + Name + Kind + Gateway + Created At + Amount + Currency + Status`.
   - Ledger: hash de
     `Order + Checkout + Type + Transaction Date + Amount + Fee + Net + Currency`.
6. Define objetos tipados sin PII innecesaria:
   - Order row / grouped order draft;
   - payment event row;
   - ledger entry row.
7. Emitir códigos de incidencia específicos, como mínimo:

   ```text
   MAPPING_VERSION_UNSUPPORTED
   ORDER_TOTAL_MISMATCH
   ORDER_EVIDENCE_MISSING
   ORDER_TRANSACTION_STATUS_UNSUPPORTED
   PAYOUT_EVIDENCE_MISSING
   GROSS_FEE_NET_MISMATCH
   REFUND_EXCEEDS_ORIGINAL
   PLATFORM_VAT_ZERO_UNVALIDATED
   ```

8. Mantén los tipos unknown cuando Shopify use un `Kind`/`Type` no reconocido;
   no inventes semántica.

### Tests obligatorios de Shopify-01

- headers reordenados y columna opcional extra;
- header crítico ausente;
- BOM;
- order number sin prefijo `AI`;
- CSV de stream equivocado rechazado con mensaje preciso;
- business keys estables;
- preservación de importe negativo de refund.

### Validación y commit

```bash
pnpm --filter @anclora/connectors test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

```text
feat(fiscal): shopify-01 - define three Shopify evidence connectors
```

---

## 7. FASE SHOPIFY-02 — Pedidos multi-línea y persistencia de líneas

**Objetivo:** convertir el export Orders en pedidos comerciales correctos.

### Trabajo de Shopify-02

1. Crear migración aditiva a partir del número disponible. No modificar `0011`
   ni `0012`.
2. Extender el modelo de pedidos con:

   ```text
   shopify_order_id
   financial_status
   fulfillment_status
   paid_at
   fulfilled_at
   cancelled_at
   discount_code
   discount_amount
   shipping_amount
   reported_subtotal_amount
   reported_total_amount
   source_import_file_id
   ```

   Usa los nombres existentes cuando ya cubran la necesidad. No duplica columnas
   sin motivo.

3. Usar `order_lines` existente para persistir líneas reales.
4. Añadir campos mínimos de trazabilidad de línea sólo si no existen:

   ```text
   source_line_fingerprint
   source_row_number
   requires_shipping
   taxable
   reported_tax_label
   reported_tax_rate
   ```

5. Agrupar filas por `Name` antes de normalizar.
6. Preservar `Id` interno por pedido y hacer que `Name` siga siendo el
   identificador visible.
7. Calcular:

   ```text
   line subtotal
   - discounts
   + shipping
   + reported tax
   = reported total
   ```

   con tolerancia documentada de 0,01 EUR.

8. No corrijas importes. Crear `ORDER_TOTAL_MISMATCH` si hay diferencia.
9. Si el export no tiene `Lineitem ID`, genera un fingerprint reproducible de
   importación y conserva `source_row_number`. No digas que es un ID oficial
   Shopify.
10. Pedido con `Total=0`:

- conservar;
- marcar como `ZERO_VALUE_REVIEW` o estado equivalente;
- no enviar a emisión automática.

1. Persistencia de pedido + líneas:

- transacción atómica;
- tenant isolation;
- idempotencia de pedido y líneas;
- no sobrescribir evidencia original.

1. Actualizar las respuestas de preview para diferenciar:

```text
filas analizadas
pedidos agrupados
líneas
duplicados omitidos
incidencias
```

### Tests obligatorios de Shopify-02

- 2+ líneas mismo `Name` → 1 pedido + N líneas;
- reimport idempotente;
- total correcto;
- total incoherente;
- descuento 100 %;
- refund no borra;
- tenant isolation;
- importación sin country/email/dirección no inventa datos.

### Commit de Shopify-02

```text
feat(fiscal): shopify-02 - normalize orders and persist line items
```

---

## 8. FASE SHOPIFY-03 — Transacciones y ledger persistentes

**Objetivo:** registrar pago de pedido y settlement de plataforma como
evidencias independientes.

### Trabajo de Shopify-03

1. Crear migración aditiva para tablas dedicadas:

   ```text
   shopify_order_payment_events
   shopify_payments_ledger_entries
   ```

   Sólo puedes proponer una alternativa si conserva exactamente las mismas
   fronteras semánticas y queda justificada en ADR.

2. `shopify_order_payment_events` debe almacenar:

   ```text
   tenant_id
   import_file_id
   external_event_key
   commercial_order_id nullable
   shopify_order_id
   shopify_order_name
   kind
   gateway
   status
   amount
   currency
   card_type
   payment_method
   occurred_at
   source_row_number
   minimized_snapshot
   ```

3. `shopify_payments_ledger_entries` debe almacenar:

   ```text
   tenant_id
   import_file_id
   external_entry_key
   commercial_order_id nullable
   shopify_order_name
   checkout_reference
   entry_type
   amount
   fee_amount
   net_amount
   currency
   presentment_amount
   presentment_currency
   platform_vat_amount
   card_brand
   card_source
   payment_method
   payout_status
   payout_date
   available_on
   external_payout_id nullable
   source_row_number
   minimized_snapshot
   ```

4. Crea repositorios con:
   - `createMany` idempotente;
   - búsqueda por tenant y pedido;
   - búsquedas paginadas;
   - controles explícitos de tenant.
5. Crea payout real sólo cuando `external_payout_id` tenga valor. Cuando no lo
   tenga:
   - guardar ledger entry;
   - no crear `payouts`;
   - exponer read model de settlement pending.
6. Validar:

   ```text
   amount - fee = net
   ```

   con tolerancia 0,01.

7. `platform_vat_amount` nunca alimenta una decisión fiscal automáticamente.
8. Mantener `financial_events` y `matching_candidates` legacy sin borrarlos. Los
   nuevos imports Shopify no deben depender de ellos para operar.

### Tests obligatorios de Shopify-03

- transaction Order ID ↔ commercial order internal ID;
- ledger Order name ↔ commercial order visible name;
- refund en dos fechas distintas;
- fee preservada;
- payout pending vacío;
- payout settled con ID;
- idempotencia;
- no PII en error/log/snapshot;
- cada lectura por tenant no filtra datos de otro tenant.

### Commit de Shopify-03

```text
feat(fiscal): shopify-03 - persist payment and settlement evidence
```

---

## 9. FASE SHOPIFY-04 — Orquestador de importación y previews por fuente

**Objetivo:** conectar los tres parsers al flujo analyze → preview → confirm.

### Trabajo de Shopify-04

1. Evolucionar `previewImport()` y tipos asociados para devolver contratos
   explícitos por fuente:

   ```text
   shopifyOrders
   shopifyOrderTransactions
   shopifyPaymentsLedger
   ```

2. El detector no debe usar sólo extensión MIME. Debe identificar el stream
   mediante el contrato de cabeceras.
3. Mantener:

   ```text
   selección
   → análisis
   → preview
   → incidencias
   → confirmación
   → persistencia
   ```

4. Confirmación:
   - Orders crea pedido + líneas;
   - Transactions crea payment events;
   - Ledger crea ledger entries y payout real sólo si corresponde;
   - ninguna confirmación crea factura automática.
5. Reintento:
   - reutiliza el fichero custodiado;
   - no duplica import_file ni evidencia;
   - conserva determinismo.
6. Actualizar issue mappings y estados import:

   ```text
   ANALYZED
   PENDING_CONFIRMATION
   IMPORTED
   IMPORTED_WITH_ISSUES
   REJECTED
   ```

7. UI:
   - tres tarjetas Shopify;
   - preview de Orders = pedido/lineas/importe/estado/incidencias;
   - preview Transactions = pedido interno/visible/tipo/estado/importe/fecha;
   - preview Ledger = pedido/charge-refund/fee/net/payout status/payout
     date/incidencias.
8. No llamar “Payout” a una fila sin `Payout ID`.

### Tests obligatorios de Shopify-04

- API preview y confirm para los tres streams;
- rechazo;
- retry;
- blocking issue acknowledgements;
- ensure incorrect stream reports exact error;
- E2E de tres tarjetas y confirmación.

### Commit de Shopify-04

```text
feat(fiscal): shopify-04 - import three Shopify evidence streams
```

---

## 10. FASE SHOPIFY-05 — Relaciones de evidencia y conciliación controlada

**Objetivo:** explicitar cómo se relacionan pedido, pago y settlement.

### Trabajo de Shopify-05

1. Crear migración y repositorio para `shopify_evidence_links`.
2. Enlazar automáticamente sólo:

   ```text
   Order transaction → Commercial order por shopify_order_id exacto
   Ledger entry → Commercial order por shopify_order_name exacto
   ```

3. Proponer relación:

   ```text
   Order transaction ↔ Ledger entry
   ```

   únicamente si coinciden pedido, tipo compatible, moneda, importe y ventana
   temporal.

4. Persistir:

   ```text
   confidence
   state
   explanation_json
   actor/fecha si hay decisión manual
   ```

5. No marcar como banco:
   - un ledger pending;
   - un payout con ID pero sin extracto de banco.
6. Mostrar caso de refund completo:
   - venta comercial;
   - refund de transaction history;
   - refund de ledger;
   - fee no revertida si existe;
   - net ledger;
   - payout status.
7. Eliminar efectos colaterales:
   - matching no puede emitir factura;
   - matching no puede convertir payout pending en cobro bancario;
   - matching no puede bloquear la existencia fiscal de la venta.
8. Documentar qué ocurre con legacy `matching_candidates`.

### Tests obligatorios de Shopify-05

- exact links;
- proposed transaction-to-ledger match;
- rejected candidate;
- collision con dos eventos similares;
- refund completo con fee;
- pending payout;
- no invoice side effect;
- auditoría de confirm/reject.

### Commit de Shopify-05

```text
feat(fiscal): shopify-05 - link commercial payment and settlement evidence
```

---

## 11. FASE SHOPIFY-06 — Ventas Shopify, conciliación y facturación segura

**Objetivo:** llevar el nuevo modelo a una UI operable y desacoplar la emisión
de settlement.

### Trabajo de Shopify-06

1. Rehacer `/sales/shopify`:
   - lista de pedidos, no lista de operaciones creadas por matching;
   - filtros por estado comercial/fiscal/pago/ledger/payout/refund/importe cero;
   - métricas separadas: ventas, refunds, fees, saldo de settlement pendiente.
2. Crear `/sales/shopify/[orderId]`:

   ```text
   pedido y líneas
   → transacciones de pedido
   → ledger Shopify Payments
   → payout o settlement pendiente
   → decisión fiscal
   → documento/rectificativa
   → auditoría
   ```

3. Rehacer `/reconciliation` como:

   ```text
   Cobros y liquidación Shopify
   ```

   sin prometer conciliación bancaria.

4. Estados vacíos deben indicar exactamente qué importar:
   - faltan Orders;
   - faltan Order Transactions;
   - falta ledger;
   - hay payout pending;
   - existen propuestas pendientes de revisar.
5. Cambiar la lógica:
   - crear operación fiscal/caso de venta desde un pedido confirmado, no desde
     matching;
   - no emitir documento automáticamente al hacer match;
   - mantener readiness de configuración;
   - emitir mediante acción explícita y rol autorizado;
   - excluir importe cero de la cola automática;
   - refund de factura emitida → rectificativa vinculada;
   - refund sin factura previa → incidencia y revisión.
6. No ampliar KDP.

### Tests obligatorios de Shopify-06

- UI lista y detalle;
- panel pending ledger;
- pending payout not bank;
- no auto invoice during imports/matches;
- manual issuance gated by configuration;
- refund with original invoice yields rectification path;
- refund without original invoice yields review;
- E2E completo en datos sintéticos.

### Commit de Shopify-06

```text
feat(fiscal): shopify-06 - operationalize sales settlement and invoicing
```

---

## 12. FASE SHOPIFY-07 — Documentación y aceptación real no versionada

**Objetivo:** terminar con pruebas reproducibles y evidencia veraz.

### Trabajo de Shopify-07

1. Actualizar:

   ```text
   docs/import-mapping-spec.md
   docs/reconciliation.md
   docs/domain-model.md
   docs/data-model.md
   docs/known-limitations.md
   docs/api.md
   docs/implementation-phase-log.md
   docs/adr/
   ```

2. Crear ADRs:
   - contrato de tres evidencias Shopify;
   - doble identificador `Id`/`Name`;
   - payout pending no es banco;
   - no invoice side effect from matching.
3. Crear guía operativa:

   ```text
   docs/shopify-export-runbook.md
   ```

   con cómo extraer cada export, rango recomendado y qué pantalla usar.

4. Usar los tres CSV reales de la sesión sólo para aceptación local, sin
   añadirlos a Git.
5. Verificar manualmente:

   ```text
   Orders:              4 pedidos comerciales en la muestra
   Order transactions:  2 eventos del mismo pedido
   Ledger:              2 movimientos
   Exact order-ID link: transactions.Order → orders.Id
   Exact name link:     ledger.Order → orders.Name
   Refund:              visible en ambos streams
   Ledger net:          -0,45 EUR en la muestra
   Payout:              pending y sin ID, no conciliado con banco
   Zero value orders:   fuera de auto-emisión
   ```

6. Crear:

   ```text
   docs/shopify-final-verification-report.md
   ```

   Sólo con resultados que hayas ejecutado y observado.

### Validación completa

```bash
pnpm --filter @anclora/connectors test
pnpm --filter @anclora/db test
pnpm --filter @anclora/api test
pnpm --filter @anclora/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

Si `pnpm test:e2e` no puede ejecutarse por una dependencia objetiva del entorno,
no lo ocultes: diagnostica, corrige el setup si pertenece al repo y vuelve a
ejecutarlo. No cierres esta fase con un E2E roto.

### Commit de Shopify-07

```text
docs(fiscal): shopify-07 - verify Shopify three-evidence workflow
```

---

## 13. Puertas de calidad globales

No confirmes ni hagas push de una fase si falla cualquiera de los checks que
aplican.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Además:

- ejecutar tests de los módulos afectados antes de la suite completa;
- ejecutar migraciones sobre base limpia de test/local aislado;
- comprobar segunda ejecución de migración cuando aplique;
- revisar que el bundle Vercel del API sigue construyéndose e importando el
  handler;
- revisar manualmente UI desktop y móvil de importación, ventas, detalle y
  conciliación;
- no bajar cobertura ni borrar tests para obtener verde;
- no desactivar controles de tenant/RBAC para facilitar pruebas.

---

## 14. Informe final obligatorio

El agente debe terminar con este formato exacto:

```markdown
# Anclora Fiscal — Shopify three-evidence implementation report

## Rama y base

- Rama base:
- SHA base:
- Rama de trabajo:
- Push remoto:

## Fases

| Fase | Commit | Push | Estado | Resumen |
| ---- | ------ | ---- | ------ | ------- |

## Flujos implementados

### Orders CSV

- ...

### Order Transaction History CSV

- ...

### Shopify Payments Ledger CSV

- ...

### Relaciones de evidencia

- ...

### Ventas, settlement y facturación

- ...

## Migraciones

| Migración | Propósito | Base limpia | Segunda ejecución | Estado |
| --------- | --------- | ----------- | ----------------- | ------ |

## Calidad ejecutada

| Comando | Resultado real | Observaciones |
| ------- | -------------- | ------------- |

## Aceptación con exports reales

- Archivos usados localmente:
- Resultado:
- Datos no versionados: confirmado

## Riesgos abiertos y límites

- Sólo riesgos reales.
- Indicar si faltan datos Shopify, regla fiscal, evidencia bancaria o decisión
  de producto.

## Siguiente paso

- PR desde `feat/anclora-fiscal-shopify-three-evidence` hacia la rama base
  detectada.
```

No abras ni fusiones una PR y no despliegues a producción sin instrucción
explícita.
