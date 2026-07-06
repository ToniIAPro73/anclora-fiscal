# Anclora Fiscal — Redefinición Shopify-first y plan de acción por fases

**Estado:** especificación funcional y técnica para ejecución  
**Fecha:** 5 de julio de 2026  
**Ámbito:** Shopify exclusivamente. Amazon KDP queda explícitamente fuera de estas fases.  
**Base revisada:** la última exportación del repositorio, el documento de gestión Shopify, el plan y prompt previos, y los tres CSV reales aportados.

> **Decisión de producto**
>
> Anclora Fiscal debe modelar Shopify mediante **tres evidencias complementarias y no intercambiables**:
>
> ```text
> 1. Pedido comercial          → qué se vendió, a quién, por cuánto y con qué impuestos reportados
> 2. Transacción de pedido     → qué ocurrió en el medio de pago del pedido: sale, refund, authorization…
> 3. Libro de Shopify Payments → cómo Shopify liquida cargos, refunds, fees y payouts
> ```
>
> Un pedido no necesita un payout para existir ni para ser revisable fiscalmente.  
> Una transacción de pedido no demuestra por sí sola que el banco haya recibido un ingreso.  
> Un movimiento de payout no sustituye el pedido ni determina por sí mismo la factura o el IVA.

---

## 1. Alcance y límites

### Incluido

- Importación, normalización, persistencia y trazabilidad de:
  - `orders_export_1.csv`
  - `transactions_export_1.csv`
  - `payment_transactions_export_1.csv`
- Ventas Shopify, líneas de pedido, pagos por pedido, ledger de Shopify Payments, fees, refunds, payouts y conciliación de evidencias.
- Revisión fiscal operativa de ventas Shopify ya cubierta por la configuración creada en las fases 1–3.
- Facturación y rectificación **sin depender de que exista payout**, con controles de revisión y auditoría.
- Corrección del CI roto por fixtures ausentes o incompatibles.

### Fuera de alcance

- Amazon KDP: conectores, tablas, pantallas, cálculos y migraciones KDP.
- Conexión en vivo con la API de Shopify.
- Conector bancario, conciliación contra extracto de banco o confirmación del abono bancario.
- Activación o declaración de cumplimiento de VERI*FACTU.
- Automatización de B2B, OSS, inversión del sujeto pasivo o reglas internacionales sin evidencia y configuración verificadas.
- Sustitución de la revisión de asesoría fiscal.

---

## 2. Evidencia observada en los CSV aportados

Los datos se resumen sin reproducir nombres, emails, direcciones ni referencias de pago personales.

| Stream | Archivo | Registros observados | Qué representa | Clave de cruce primaria |
|---|---:|---:|---|---|
| Pedidos | `orders_export_1.csv` | 4 filas / 4 pedidos en esta muestra | venta comercial, líneas, descuento, impuestos reportados, cliente y estados | `Id` interno + `Name` visible |
| Transacciones de pedido | `transactions_export_1.csv` | 2 | eventos de pago del pedido: una venta y un refund | `Order` ↔ `orders.Id` |
| Shopify Payments | `payment_transactions_export_1.csv` | 2 | movimientos de liquidación: charge, refund, fee, neto y estado de payout | `Order` ↔ `orders.Name` |

### 2.1 Hallazgos verificables de la muestra

1. El export de pedidos usa dos identificadores distintos:
   - `Id`: identificador interno numérico de Shopify.
   - `Name`: número visible/comercial del pedido.

2. El historial de transacciones de pedido referencia el **ID interno**:

   ```text
   transactions_export_1.Order = orders_export_1.Id
   ```

3. El export de Shopify Payments referencia el **número visible**:

   ```text
   payment_transactions_export_1.Order = orders_export_1.Name
   ```

4. La muestra contiene una venta y un refund completo del mismo pedido en el historial de transacciones; el ledger de Shopify Payments contiene el charge con fee y el refund posterior.

5. En esa muestra, los importes del ledger implican:

   ```text
   charge neto:   +6,54 EUR
   refund neto:   -6,99 EUR
   saldo ledger:  -0,45 EUR
   ```

   El estado de payout figura como `pending` y el `Payout ID` está vacío. Por tanto, **no existe todavía evidencia de un payout liquidado ni de un abono bancario**. La aplicación debe mostrarlo como liquidación prevista o saldo pendiente, no como payout conciliado.

6. Hay pedidos con descuento del 100 %: total e impuestos reportados a cero, aunque `Financial Status` sea `paid`. Son pedidos comerciales válidos como evidencia, pero no deben entrar automáticamente en una cola de factura o en métricas de ingreso sin una regla explícita de importe cero.

7. En la muestra, `Lineitem requires shipping=false`, por lo que el producto puede clasificarse operacionalmente como digital/no sujeto a envío. Esta señal es de producto/logística; no reemplaza la configuración fiscal.

8. La muestra no aporta NIF/VAT del cliente. `Billing Company`, el país o el IVA reportado por Shopify no deben activar por sí solos un flujo B2B o internacional.

### 2.2 Consecuencia técnica inmediata

La clave `orderReference` genérica no es suficiente para todo Shopify. El modelo debe preservar al menos:

```text
shopify_order_id      = Id interno del export Orders
shopify_order_name    = Name visible/comercial del export Orders
checkout_reference    = Checkout del ledger de Shopify Payments, cuando exista
payout_id             = identificador real del payout, sólo cuando Shopify lo haya emitido
```

Nunca se debe inferir que `Payment Reference`, `Payment ID` o cualquier texto de Orders sea el `Checkout` del ledger. En la muestra no son el mismo valor.

---

## 3. Diagnóstico del estado posterior a las fases 1–3

Las fases 1–3 ya aportan activos que deben conservarse:

- shell, navegación y componentes UI;
- configuración fiscal persistente, perfiles de producto, series y readiness;
- custodia de evidencias, hash, preview, confirmación, rechazo, reintento e idempotencia;
- tablas de `order_lines`, `payouts` y `payout_allocations` preparadas;
- endpoints y repositorios de pedidos, eventos financieros, incidencias y conciliación;
- control de acceso por tenant y auditoría.

No se debe reescribir el monorepo ni eliminar estos controles.

### 3.1 Brechas que bloquean el flujo Shopify real

| Prioridad | Brecha actual | Riesgo | Corrección requerida |
|---|---|---|---|
| P0 | El parser de pedidos produce un objeto por fila CSV, no un pedido agrupado con líneas. | Un pedido multi-línea se duplicará o perderá semántica comercial. | Agrupar por `Name` y persistir `order_lines`. |
| P0 | `shopify-csv` representa sólo el ledger de Shopify Payments, pero su nombre y UI lo presentan como “pagos y payouts”. | Se omite el historial de transacciones de pedido. | Crear un conector y tarjeta exclusivos para `transactions_export`. |
| P0 | El parser de ledger exige cabeceras exactas y un patrón local `AI-\d+`. | Frágil ante cambios de Shopify y no reutilizable con números de pedido reales. | Detectores por firma/versionado, no por orden exacto ni prefijo local. |
| P0 | `commercial_orders` tiene tabla `order_lines`, pero la persistencia actual no las crea. | Facturación y fiscalidad por producto no son fiables. | Repositorio y servicio de escritura atómicos para pedido + líneas. |
| P0 | El `matching-service` crea operaciones sólo al cruzar pedido y evento financiero y puede intentar emitir automáticamente. | Contradice el principio de que una venta existe antes del cobro/payout; puede emitir por un evento mal interpretado. | Crear operación de venta desde el pedido y desacoplar facturación de matching/settlement. |
| P0 | `matching_candidates` mezcla la relación pedido↔evento con el concepto de conciliación. | No permite expresar los tres cruces necesarios ni sus distintos niveles de evidencia. | Introducir enlaces de evidencia Shopify tipados y auditables. |
| P0 | Un payout pendiente y sin `Payout ID` no cabe semánticamente como payout real. | Se puede marcar como cobro bancario algo que aún no está liquidado. | Conservarlo como ledger/estado pendiente; crear `payout` sólo con identificador real. |
| P0 | CI no está en verde por fixtures Shopify ausentes/desalineados. | Ninguna fase posterior tiene puerta de calidad fiable. | Reparación aislada antes de cambios funcionales. |
| P1 | Ventas Shopify y conciliación muestran capas internas, no un caso comercial completo. | El usuario no entiende qué falta: pedido, pago, refund o settlement. | Vista de caso de venta y workbench por estado de evidencia. |
| P1 | Los pedidos con total cero quedan mezclados con ventas facturables. | Métricas e invoice queue engañosas. | Estado explícito `ZERO_VALUE_REVIEW` o equivalente, sin automatismo fiscal. |

---

## 4. Contrato Shopify objetivo

### 4.1 Tres conectores con responsabilidades exclusivas

| Identificador lógico | Archivo | Entidades que crea | No puede crear |
|---|---|---|---|
| `SHOPIFY_ORDERS_CSV` | Orders export | pedido comercial, líneas, señales de cliente, impuestos reportados | payout, fee, abono bancario |
| `SHOPIFY_ORDER_TRANSACTIONS_CSV` | Order transaction history | eventos de pago del pedido: sale/refund/authorization/capture/void según export | factura, payout bancario |
| `SHOPIFY_PAYMENTS_LEDGER_CSV` | Shopify Payments transactions/payout ledger | charge/refund/fee/adjustment, neto, estado y referencia de payout | pedido comercial, invoice fiscal automática |

Los nombres técnicos de conector deben quedar versionados, por ejemplo:

```text
shopify-orders-csv@2
shopify-order-transactions-csv@1
shopify-payments-ledger-csv@2
```

El actual identificador ambiguo `shopify-csv` debe quedar sólo como compatibilidad de lectura/migración controlada; no debe ser el contrato principal de nuevos imports.

### 4.2 Reglas de identificación y cruce

```text
Orders.Id                       ↔ Order transactions.Order
Orders.Name                     ↔ Payments ledger.Order
Payments ledger.Checkout        ↔ señal auxiliar; no clave universal
Payout ID no vacío              ↔ payout real
Payout ID vacío + pending       ↔ settlement pendiente, nunca payout liquidado
```

Orden de fuerza de evidencia:

1. coincidencia exacta por ID interno de pedido;
2. coincidencia exacta por número visible de pedido;
3. coincidencia por checkout, tipo, moneda, importe y ventana temporal;
4. propuesta para revisión;
5. nunca una asociación silenciosa por texto libre, email o importe aislado.

### 4.3 Estados separados

```text
Pedido comercial
  IMPORTED | ZERO_VALUE_REVIEW | REFUNDED | PENDING_FISCAL_REVIEW | EXCLUDED_WITH_REASON

Pago de pedido
  SALE | AUTHORIZATION | CAPTURE | REFUND | VOID | FAILURE | CHARGEBACK | UNKNOWN

Ledger Shopify Payments
  CHARGE | REFUND | FEE | ADJUSTMENT | CHARGEBACK | PAYOUT_ADJUSTMENT | UNKNOWN

Liquidación
  NOT_ASSIGNED | PENDING | PAID | FAILED | REVIEW_REQUIRED

Conciliación de evidencia
  NOT_STARTED | PROPOSED | AUTO_LINKED | CONFIRMED | REJECTED | EXCEPTION
```

Estos estados no deben mezclarse en una única columna `operationStatus`.

---

## 5. Modelo de datos objetivo y estrategia de migración

### 5.1 Principios

- No editar migraciones existentes ni destruir datos.
- Conservar `commercial_orders`, `order_lines`, `payouts` y la custodia de importación.
- Evitar sobrecargar `financial_events` con semánticas incompatibles.
- Mantener los datos de pago y liquidación inmutables como evidencia importada; las decisiones y enlaces viven en entidades separadas.
- Todo dato personal procedente de Shopify se minimiza/cifra según el patrón ya adoptado por el repositorio.
- Las filas de CSV originales no se exponen completas en la API ni se versionan como fixtures reales.

### 5.2 Evolución recomendada

Crear migraciones nuevas y aditivas, a partir del siguiente número disponible.

#### A. Extensión de pedido Shopify

Añadir a `commercial_orders` o a una extensión específica `shopify_order_details`:

```text
shopify_order_id                 -- Orders.Id, único por tenant/canal cuando exista
shopify_order_name               -- equivalente a external_order_id / Orders.Name
financial_status
fulfillment_status
paid_at
fulfilled_at
cancelled_at
discount_code
discount_amount
shipping_amount
reported_total_amount
reported_subtotal_amount
reported_tax_amount
source_import_file_id
```

`external_order_id` debe seguir siendo el identificador visible para no romper enlaces existentes; el nuevo ID interno se usa para conectar `transactions_export`.

#### B. Líneas de pedido reales

Usar la tabla existente `order_lines` y añadir, si hace falta:

```text
source_line_fingerprint          -- hash determinista de la línea evidenciada
source_row_number
requires_shipping
taxable
reported_tax_label
reported_tax_rate
line_snapshot_minimized
```

Regla de identidad ante ausencia de un `Lineitem ID` de Shopify:

```text
fingerprint = hash(
  shopify_order_id/name +
  sku + title + unit_price + discount + taxable +
  requires_shipping + occurrence_index_within_equal_lines
)
```

La ausencia de un ID de línea del export no permite inventar una identidad oficial de Shopify. El fingerprint es una identidad de importación reproducible y debe conservarse junto al número de fila de evidencia.

#### C. Transacciones de pedido

Crear una tabla dedicada, por ejemplo `shopify_order_payment_events`:

```text
tenant_id
import_file_id
commercial_order_id nullable durante el staging
external_event_key                 -- hash determinista cuando Shopify no expone ID de transacción
shopify_order_id
shopify_order_name
kind                               -- sale/refund/authorization/capture/void/...
gateway
status
amount
currency
card_type
payment_method
occurred_at
source_row_number
evidence_snapshot_minimized
```

Un evento se conecta automáticamente al pedido sólo por `shopify_order_id` exacto. Si ese pedido no se ha importado, queda pendiente con incidencia `ORDER_EVIDENCE_MISSING`.

#### D. Ledger de Shopify Payments

Crear una tabla dedicada, por ejemplo `shopify_payments_ledger_entries`:

```text
tenant_id
import_file_id
external_entry_key
commercial_order_id nullable
shopify_order_name
checkout_reference
entry_type                         -- charge/refund/fee/adjustment/chargeback/unknown
amount
fee_amount
net_amount
currency
presentment_amount
presentment_currency
platform_vat_amount               -- evidencia del canal, no IVA fiscal
card_brand
card_source
payment_method
payout_status
payout_date
available_on
external_payout_id nullable
source_row_number
evidence_snapshot_minimized
```

Cuando `external_payout_id` esté vacío o `payout_status` no sea liquidado, **no crear ni marcar un `payout` como recibido**. El ledger debe seguir visible como saldo previsto o pendiente.

#### E. Enlaces de evidencia Shopify

Crear una tabla, por ejemplo `shopify_evidence_links`, para enlaces que no proceden de una FK inequívoca:

```text
tenant_id
left_evidence_type
left_evidence_id
right_evidence_type
right_evidence_id
link_type                          -- TX_TO_LEDGER | ORDER_TO_LEDGER | ...
confidence
state                              -- PROPOSED | AUTO_LINKED | CONFIRMED | REJECTED
explanation_json
created_by / decided_by
decided_at
```

No reutilizar `matching_candidates` para todos los casos nuevos. Puede mantenerse para compatibilidad de datos anteriores, pero el nuevo flujo Shopify debe expresar de manera explícita qué está siendo relacionado.

#### F. Payouts reales

La tabla `payouts` se utiliza sólo cuando el CSV aporta un `Payout ID` no vacío. Para el resto:

- conservar el estado previsto en `shopify_payments_ledger_entries`;
- sumar por moneda y fecha prevista en una vista/read model;
- permitir que una importación posterior con payout real enlace o confirme el conjunto;
- no sintetizar un ID externo como si Shopify lo hubiera emitido.

### 5.3 Compatibilidad

- Los imports antiguos con `shopify-csv` continúan visibles como evidencia legacy.
- No borrar `financial_events`, `matching_candidates` ni `canonical_operations`.
- Añadir un adaptador de solo lectura para explicar registros legacy en la UI o solicitar reimportación.
- No hacer un backfill automático si no se puede reconstruir de forma inequívoca el origen. La reimportación controlada es preferible a inventar relaciones.

---

## 6. UX objetivo

### 6.1 Importar datos

Sustituir las dos tarjetas Shopify actuales por tres tarjetas inequívocas:

```text
Shopify — Pedidos
  "CSV exportado desde Orders. Crea pedidos y líneas comerciales."

Shopify — Transacciones de pedido
  "Historial de Payments por pedido. Crea ventas, refunds y otros eventos de pago."

Shopify Payments — Ledger y payouts
  "Movimientos de liquidación, comisiones y estado de payout. No equivale a banco."
```

Cada tarjeta implementa:

```text
selección
→ detección de formato y versión
→ análisis
→ preview específico por fuente
→ incidencias y acciones sugeridas
→ confirmación explícita
→ persistencia transaccional
→ resultado con enlaces de trabajo
```

La preview debe informar de **filas**, **entidades resultantes**, **duplicados omitidos**, **incidencias** y **qué no se puede concluir**.

### 6.2 Ventas Shopify

Convertir `/sales/shopify` en un registro de ventas basado en pedidos, no en operaciones canónicas surgidas tras un match.

Filtros mínimos:

```text
periodo · estado comercial · estado fiscal · total 0 / con importe · refund ·
payment evidence · settlement state · incidencia · producto
```

Cada fila debe mostrar:

```text
pedido visible
fecha
importe comercial e impuesto reportado
estado de facturación
estado de pago del pedido
estado de liquidación
incidencias
```

Crear detalle `/sales/shopify/[orderId]` con línea temporal:

```text
Pedido y líneas
→ eventos de pago por pedido
→ movimientos Shopify Payments
→ payout real o estado pendiente
→ decisión fiscal
→ documento emitido / rectificativa
→ auditoría
```

### 6.3 Cobros y conciliación

La pantalla no debe prometer “conciliado con banco” hasta que exista extracto bancario u otra evidencia bancaria.

Estados vacíos útiles:

- faltan transacciones de pedido;
- faltan movimientos de Shopify Payments;
- hay ledger pendiente sin Payout ID;
- hay payout real, pero no hay banco;
- hay relaciones propuestas que requieren revisión.

### 6.4 Facturas

La emisión sigue un camino independiente del settlement:

```text
pedido confirmado
→ configuración mínima válida
→ decisión fiscal determinada o revisión manual autorizada
→ emisión explícita
→ documento inmutable
→ refund posterior
→ rectificativa vinculada, nunca edición
```

Reglas de control:

- no emitir de forma automática al importar un payment event o al crear un matching candidate;
- no emitir para `total=0` salvo acción explícita autorizada y motivo;
- un refund sin factura emitida crea una incidencia o estado de revisión, no una rectificativa ficticia;
- un refund sobre una factura emitida habilita propuesta de rectificativa vinculada;
- país, `Billing Company`, IVA cero o correo no bastan para B2B.

---

## 7. Plan de ejecución por fases

### SHOPIFY-00 — Reparar la línea base de calidad

**Objetivo:** dejar CI verde antes de ampliar dominio.

**Trabajo obligatorio**

- Crear fixtures sintéticos y anonimizados dentro de `packages/connectors/test/fixtures/`.
- Separar:
  - fixture Orders;
  - fixture Orders sin datos opcionales;
  - fixture Order Transactions;
  - fixture Shopify Payments Ledger.
- Eliminar referencias de tests a `.evidence/pedido-shopify*.csv` y a archivos reales de usuario.
- Corregir expectativas que usan el CSV masivo/real como si tuviera una sola fila.
- Mantener detección estricta por tipo de export, no hacer que un Orders CSV pase por el parser de Payments.

**Salida**

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

en verde, más pruebas específicas de conectores.

---

### SHOPIFY-01 — Contrato de tres evidencias y detectores robustos

**Objetivo:** definir contratos de entrada estables sin ambigüedad.

**Trabajo obligatorio**

- Crear `shopify-order-transactions-csv.ts`.
- Renombrar/refactorizar `shopify-csv.ts` a un contrato de ledger de Shopify Payments; preservar export de compatibilidad si hace falta.
- Sustituir la validación de cabeceras por orden exacto por:
  - firma de columnas obligatorias;
  - columnas opcionales conocidas;
  - versión de mapping;
  - aviso explícito ante columnas críticas ausentes;
  - rechazo sólo si el contrato no es identificable.
- Eliminar la regex que exige `AI-\d+`; aceptar números de pedido no vacíos y normalizar sin inventar prefijos.
- Detectar el tipo de fuente antes de parsear y devolver un error legible si se carga el archivo en la tarjeta incorrecta.
- Definir business keys deterministas por stream y por fila.
- Añadir pruebas de cabeceras reordenadas, columnas opcionales, CSV incorrecto, caracteres BOM y tres formatos.

**Salida**

Los tres CSV proporcionados se detectan como tres formatos distintos y los parsers producen objetos tipados sin PII expuesta.

---

### SHOPIFY-02 — Normalización de pedidos y líneas

**Objetivo:** convertir las filas de Orders en pedidos comerciales correctos.

**Trabajo obligatorio**

- Agrupar todas las filas de igual `Name`.
- Conservar `Id` interno y `Name` visible.
- Crear un pedido con N líneas.
- Calcular y validar:

```text
sum(lineas antes de descuento)
- descuentos de línea/pedido
+ shipping
+ impuestos reportados
= total reportado
```

- Establecer tolerancia monetaria documentada, por defecto 0,01 EUR.
- No corregir silenciosamente una discrepancia; crear `ORDER_TOTAL_MISMATCH`.
- Preservar por separado:
  - importe total;
  - subtotal;
  - descuento;
  - envío;
  - impuestos reportados, etiqueta y tasa;
  - estados de pago/refund/fulfillment;
  - datos de país de billing y shipping;
  - producto requiere envío;
  - archivo y fila de origen.
- Marcar:
  - pedidos de importe cero por descuento;
  - refunds en Orders;
  - posibles señales B2B sin VAT/NIF;
  - ventas transfronterizas sin configuración/evidencia.
- Implementar escritura atómica de pedido + líneas e idempotencia por negocio, no sólo por hash de archivo.

**Salida**

Un pedido multi-línea se persiste una sola vez con todas sus líneas y una reimportación no duplica ni pedido ni líneas.

---

### SHOPIFY-03 — Persistencia de transacciones de pedido y ledger de Shopify Payments

**Objetivo:** registrar eventos y liquidaciones sin confundirlos.

**Trabajo obligatorio**

- Crear las migraciones/repositorios de `shopify_order_payment_events` y `shopify_payments_ledger_entries`, o una alternativa equivalente documentada que mantenga las dos semánticas separadas.
- Importar transacciones de pedido con vínculo por `Orders.Id`.
- Importar movimientos de ledger con vínculo por `Orders.Name`.
- Conservar gateway, método, estado, card type/brand, importes, moneda, fecha y referencia de origen.
- Para el ledger, conservar `Amount`, `Fee`, `Net`, `VAT` de plataforma, `Payout Status`, `Payout Date`, `Available On`, `Payout ID` y `Checkout`.
- Validar `amount - fee = net` con tolerancia; registrar `GROSS_FEE_NET_MISMATCH` si falla.
- Payout con ID vacío/pending:
  - se persiste el movimiento;
  - no se crea payout real;
  - se expone como settlement pendiente;
  - se crea una incidencia si la UI intenta tratarlo como cobro bancario.
- Payout con ID presente:
  - crear/actualizar payout real;
  - vincular ledger entries;
  - no declarar conciliación bancaria.

**Salida**

Los tres streams se importan de manera independiente, idempotente y con su propia trazabilidad.

---

### SHOPIFY-04 — Enlaces de evidencia y conciliación segura

**Objetivo:** pasar de coincidencias implícitas a relaciones explicables.

**Trabajo obligatorio**

- Crear enlaces exactos:
  - pedido ↔ transacción de pedido por `shopify_order_id`;
  - pedido ↔ ledger por `shopify_order_name`.
- Crear candidatos para transacción ↔ ledger sólo cuando haya evidencia suficiente:
  - tipo compatible;
  - mismo pedido;
  - misma moneda;
  - importe compatible;
  - ventana temporal configurable;
  - señales auxiliares de checkout, gateway o método cuando existan.
- No usar importe aislado ni email para enlazar.
- Persistir explicación, confianza, estado y actor de confirmación/rechazo.
- Mostrar para el caso de refund completo:
  - importe comercial neto;
  - fee no reembolsada cuando exista;
  - saldo de ledger;
  - estado de payout;
  - diferencia entre devolución comercial y liquidación de plataforma.
- Reemplazar o aislar `matching_candidates` para que el nuevo flujo no cree operaciones fiscales ni facturas como efecto colateral.

**Salida**

Cada enlace tiene origen, explicación y estado. La app distingue “pedido cobrado”, “refund registrado”, “saldo pendiente de Shopify” y “banco no verificado”.

---

### SHOPIFY-05 — Ventas Shopify y workbench operativo

**Objetivo:** ofrecer una interfaz de trabajo comprensible.

**Trabajo obligatorio**

- Implementar lista de ventas basada en pedidos y líneas.
- Añadir detalle de venta con timeline de las tres fuentes.
- Actualizar las tarjetas de importación y sus previews por tipo.
- Rehacer conciliación como “Cobros y liquidación Shopify”, con:
  - pendientes de transacciones;
  - pendientes de ledger;
  - payouts pendientes;
  - candidatos de enlace;
  - excepciones y reglas de revisión.
- Exponer estados vacíos con enlace directo al tipo de importación faltante.
- No mostrar “conciliado” cuando sólo hay payout pending o no hay banco.

**Salida**

El usuario puede abrir un pedido y entender, sin leer logs, qué ocurrió comercialmente, qué cobró/devolvió Shopify y qué queda por liquidar.

---

### SHOPIFY-06 — Decisión fiscal, facturación y refunds bajo control

**Objetivo:** hacer utilizable el flujo fiscal Shopify sin automatismos inseguros.

**Trabajo obligatorio**

- Crear la operación fiscal de una venta a partir de un pedido confirmado, no a partir de un match de pago.
- Eliminar el trigger que emite automáticamente una factura al coincidir eventos financieros.
- Mantener la decisión fiscal versionada y explicable.
- Bloquear emisión si falta configuración mínima, perfil fiscal, evidencia suficiente o decisión determinada.
- Separar cola:
  - facturables;
  - en revisión;
  - importe cero;
  - emitidas;
  - refunds con rectificativa pendiente;
  - rectificadas.
- Refund:
  - sin factura previa → incidencia/revisión;
  - con factura emitida → propuesta o emisión explícita de rectificativa vinculada;
  - nunca editar la factura original.
- Conservar la política de país y cliente: no inferir B2B/OSS/inversión de sujeto pasivo por heurística.

**Salida**

Una venta nacional configurada puede facturarse; un refund completo puede llegar a una rectificativa cuando la factura original exista; ambos flujos son auditables y no dependen de un payout.

---

### SHOPIFY-07 — Cierre de calidad, documentación y aceptación con los tres exports

**Objetivo:** cerrar el alcance Shopify con evidencia reproducible.

**Trabajo obligatorio**

- Actualizar:
  - `docs/import-mapping-spec.md`;
  - `docs/reconciliation.md`;
  - `docs/domain-model.md`;
  - `docs/data-model.md`;
  - `docs/known-limitations.md`;
  - `docs/implementation-phase-log.md`;
  - ADRs nuevos de contrato de tres evidencias y payout pendiente.
- Añadir guía de extracción de los tres informes.
- Ejecutar una aceptación manual usando los tres archivos reales proporcionados, sin añadirlos a Git.
- Verificar:
  - 4 pedidos comerciales de la muestra;
  - 2 eventos de pago de pedido;
  - 2 movimientos de ledger;
  - una relación exacta por ID interno;
  - una relación exacta por nombre;
  - refund completo visible;
  - saldo ledger de -0,45 EUR;
  - payout pendiente sin Payout ID no marcado como banco;
  - pedidos de importe cero fuera de emisión automática.
- Generar informe de verificación veraz.

**Salida**

CI verde, tests sintéticos versionados, aceptación manual de los exports reales y documentación suficiente para mantener el flujo.

---

## 8. Criterios de aceptación obligatorios

### Importación

- [ ] Cada CSV se detecta como fuente correcta.
- [ ] Un Orders CSV nunca se procesa con el parser de payout ledger.
- [ ] Un CSV de transacciones de pedido nunca crea un pedido comercial.
- [ ] Un payout ledger nunca crea una factura ni confirma un banco.
- [ ] Un reimport idéntico no duplica entidades.
- [ ] Un reimport ampliado añade sólo las entidades nuevas cuando se puede establecer identidad.

### Pedidos y líneas

- [ ] Dos filas del mismo `Name` generan un pedido y dos líneas.
- [ ] La suma se valida y deja incidencia si no cuadra.
- [ ] `Name` e `Id` se conservan y tienen usos distintos.
- [ ] Pedido con total cero se marca para revisión, no se factura automáticamente.
- [ ] Refund no borra pedido ni línea.

### Pagos y settlement

- [ ] `transactions.Order` enlaza con `orders.Id`.
- [ ] `payments.Order` enlaza con `orders.Name`.
- [ ] Payout sin ID no se convierte en payout recibido.
- [ ] Fee se conserva como fee de plataforma, separada del importe comercial.
- [ ] `VAT` del ledger es evidencia de Shopify, no una decisión de IVA fiscal.
- [ ] Un refund completo puede generar neto comercial cero y un saldo de ledger distinto de cero por fees.

### Fiscalidad y facturación

- [ ] La venta se puede revisar sin transacción ni payout.
- [ ] La factura no se emite por un matching automático.
- [ ] País, compañía, email o IVA cero no clasifican por sí solos B2B.
- [ ] Una factura emitida se rectifica mediante documento vinculado.
- [ ] Las operaciones internacionales sin regla configurada quedan en revisión o bloqueadas.

### Calidad

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e` cuando el entorno local esté configurado
- [ ] `git diff --check`
- [ ] sin datos reales en fixtures, snapshots, logs ni commits.

---

## 9. Riesgos abiertos y decisiones explícitas

| Riesgo | Tratamiento en este alcance |
|---|---|
| Los exports no incluyen un ID de línea Shopify inequívoco. | Identity de línea reproducible basada en fingerprint + posición; conservar fila de origen; no fingir ID nativo. |
| Un payout pending puede agrupar eventos futuros no visibles aún. | No cerrar ni declarar settlement final hasta export posterior con Payout ID real. |
| Pueden existir ventas sin transacción o transacciones sin pedido, por rango de export diferente. | Mantenerlos como evidencia huérfana con incidencia y acción de importar el stream faltante. |
| La tasa/importe de Shopify puede no coincidir con decisión fiscal interna. | Mostrar ambas capas y exigir revisión; no mutar la evidencia. |
| La muestra contiene datos personales. | Sólo se usa para aceptación local; fixtures de repo son sintéticos y anonimizados. |
| El historial actual incluye código posterior a fases 1–3 y registros de fase incoherentes. | El agente debe tratar el código y las pruebas como evidencia primaria, revisar Git y documentar cualquier discrepancia antes de modificar comportamiento. |

---

## 10. Referencias operativas

- Shopify documenta que el export de Orders incluye una estructura de CSV de pedidos y otra de historial de transacciones.  
  <https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders>

- Shopify documenta la exportación de detalles de payouts y transacciones desde Shopify Payments.  
  <https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details>

- Shopify advierte que los informes de ventas/pagos pueden reflejar tiempos y totales distintos de un informe de conciliación de payouts. Esta diferencia respalda mantener separadas las tres capas de evidencia.  
  <https://help.shopify.com/en/manual/payments/shopify-payments/payouts/payout-reconciliation-report>

- La documentación fiscal debe seguir tratándose como una regla condicionada a configuración y revisión. Las facturas rectificativas requieren un documento nuevo que identifique la factura rectificada.  
  <https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2025/capitulo-10-obligac-formales-suj-registro/obligaciones-materia-facturacion/facturas-rectificacion.html>

> Este documento no declara conformidad fiscal ni sustituye la revisión de asesoría. Su función es definir controles de producto y de implementación.
