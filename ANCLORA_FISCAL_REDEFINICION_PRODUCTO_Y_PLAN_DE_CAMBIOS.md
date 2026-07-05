# Anclora Fiscal — redefinición del producto y plan de cambios

**Estado:** propuesta funcional y técnica para ejecución
**Fecha:** 5 de julio de 2026
**Ámbito:** España; autónomo o pequeña entidad que vende libros y productos digitales mediante Shopify y Amazon KDP.
**Objetivo:** convertir el prototipo actual en una herramienta práctica para registrar evidencia, emitir la documentación fiscal necesaria y preparar cierres tributarios con revisión humana.

> **Decisión principal**
>
> Anclora Fiscal no debe presentarse como un «orquestador fiscal genérico» antes de resolver bien dos flujos concretos: **ventas propias por Shopify** y **liquidaciones de regalías de Amazon KDP**. La aplicación debe priorizar el libro de ventas, las facturas, las rectificaciones, la evidencia original y el cierre de IVA. La conciliación de cobros queda como una capa posterior de control financiero; no debe ser el centro del producto ni bloquear la fiscalidad básica.

---

## 1. Resumen ejecutivo

El repositorio ya contiene una base útil: monorepo TypeScript, persistencia PostgreSQL/Drizzle, trazabilidad de imports por hash, control de acceso por roles, conectores para Shopify y KDP, entidades de documento fiscal, cierre de periodo y expediente. No conviene reescribirlo.

El problema es de producto y de conexión entre piezas:

1. La navegación se diseñó para un sistema de conciliación financiero-fiscal completo antes de validar el caso real de uso.
2. Varios módulos visibles siguen siendo demostrativos, están desconectados de datos reales o no tienen la información mínima para generar resultados fiscales fiables.
3. El importador de Shopify trata el CSV de pedidos como evidencia comercial, pero ese fichero no sustituye al export de transacciones/payouts necesario para conciliación.
4. El XLSX de KDP permite analizar regalías y costes unitarios, pero **no debe convertir automáticamente el coste de producción incluido en la liquidación en un gasto deducible separado** si el ingreso registrado ya es la regalía neta: hacerlo puede duplicar el efecto económico.
5. El sistema necesita una política fiscal configurable por canal y tipo de producto antes de automatizar facturas, IVA, OSS o el tratamiento de KDP.

La propuesta es pasar de una app organizada por conceptos internos (`Operaciones`, `Motor fiscal`, `Expedientes IVA`) a una app organizada por tareas reales:

```text
Importar evidencias → revisar ventas/liquidaciones → emitir o rectificar facturas
→ revisar libros registro → cerrar trimestre → preparar paquete para presentar/revisar
```

---

## 2. Correcciones de criterio antes de desarrollar

### 2.1 Shopify: un pedido no implica siempre una factura completa individual

La app debe conservar y registrar cada venta, pero no debe asumir que cada pedido Shopify exige automáticamente una factura completa por separado. La política de emisión debe decidir, por operación:

- factura simplificada;
- factura completa solicitada por el cliente;
- factura completa B2B;
- factura rectificativa por devolución parcial o total;
- operación pendiente de evidencia;
- operación no facturable por la política configurada del canal.

En España, el Reglamento de facturación permite, con carácter general, factura simplificada cuando el importe no excede 400 € IVA incluido; existen supuestos y limitaciones adicionales, especialmente en ciertas operaciones transfronterizas. Por eso el tipo documental no debe inferirse sólo de que el pedido sea de bajo importe. Debe depender de país, condición del destinatario, evidencia disponible, producto y política de facturación configurada.
Fuente primaria: [BOE — RD 1619/2012, art. 4](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696).

### 2.2 KDP: no duplicar ingreso y gasto

El informe de KDP incluye precio, unidades, gasto medio de entrega/producción y regalías. Esa información es valiosa, pero hay dos formas distintas de registrar la economía de la operación:

- **Política A — liquidación neta:** registrar la regalía o liquidación de KDP como ingreso y conservar el coste de producción/entrega como desglose informativo. No crear un gasto fiscal separado.
- **Política B — bruto y coste separado:** registrar un ingreso bruto y el coste soportado como gasto, sólo cuando la documentación contractual, contable y de liquidación permita justificar esa representación sin doble cómputo.

Para el MVP debe implantarse la **Política A** por defecto. La Política B sólo debe poder activarse por configuración de canal, con advertencia y validación previa de asesoría. El código actual ya conserva `productionCost` en `royalty_lines`; debe añadirse un campo explícito de `cost_treatment` que impida que ese dato entre dos veces en cualquier libro o resumen.

### 2.3 B2B, B2C, OSS y el VAT number

Un país distinto de España, una empresa escrita en `Billing Company` o IVA cero en Shopify **no prueban por sí solos** que una venta sea B2B o que proceda inversión del sujeto pasivo. Deben separarse estas señales:

| Dato | Uso correcto |
|---|---|
| `Billing Company` | Señal de posible empresa; abre revisión si no hay NIF/VAT. |
| VAT intracomunitario validado | Evidencia fuerte para el flujo B2B aplicable, junto con país y localización de cumplimiento. |
| País de envío/facturación | Evidencia de localización; no equivale por sí solo a residencia fiscal ni condición empresarial. |
| IVA informado por Shopify | Evidencia de plataforma; no es una decisión fiscal inmutable. |
| IVA cero | Requiere clasificación: exportación, operación B2B, exención, error de configuración o caso pendiente. |

El OSS es un régimen para operaciones B2C que cumplan los requisitos; no es una etiqueta genérica para cualquier venta a la UE. La AEAT señala que UOSS cubre determinadas prestaciones B2C y ventas intracomunitarias a distancia, y permite centralizar la declaración cuando proceda.
Fuente primaria: [AEAT — Ventanilla Única / OSS](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html).

Shopify ya ofrece validación de VAT number en checkout para comercios que usan Shopify Tax en la UE o Reino Unido; requiere configurar el campo como opcional y depende de la localización de fulfillment. Debe verificarse en tu propia tienda antes de pagar una app adicional.
Fuente primaria: [Shopify Help — VAT validation in checkout](https://help.shopify.com/en/manual/taxes/shopify-tax/vat-validate).

### 2.4 VERI*FACTU: no es una función activa del MVP

No debe mostrarse como integración disponible ni como promesa de cumplimiento. La AEAT informa de los siguientes plazos de adaptación para los SIF: 1 de enero de 2027 para contribuyentes del Impuesto sobre Sociedades y 1 de julio de 2027 para el resto de obligados incluidos en el ámbito. Para tu caso, la pantalla debe ser un panel de preparación y evidencias hasta que exista integración real, matriz de cumplimiento, pruebas y revisión especializada.
Fuente primaria: [AEAT — ampliación de plazos SIF / VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html).

---

## 3. Diagnóstico de la versión actual

### 3.1 Lo que se debe conservar

| Activo actual | Decisión |
|---|---|
| Monorepo `apps/api`, `apps/web`, `packages/*` | Conservar. La separación es adecuada. |
| Drizzle/PostgreSQL, entidades multi-tenant y auditoría | Conservar y ampliar. |
| Custodia de archivos importados, SHA-256, deduplicación y validación MIME/estructura | Conservar. Es una base sólida para evidencia. |
| Conector KDP XLSX y entidad `royalty_lines` | Conservar; revisar tratamiento de coste y añadir liquidaciones/payouts. |
| Conector Shopify pedidos CSV | Conservar; ampliar a líneas de pedido, datos fiscales y workflow de facturación. |
| Modelo de documento fiscal, serie, cadena de integridad y cierre de periodo | Conservar como base, sin declarar conformidad VERI*FACTU. |
| Roles y autorización de API | Conservar; la UI administrativa debe usarlos de verdad. |

### 3.2 Problemas reales detectados

| Prioridad | Hallazgo | Impacto | Cambio requerido |
|---|---|---|---|
| P0 | Las páginas `/operations` y `/invoicing` no resuelven el flujo fiscal completo para los ficheros que hoy importas. | El usuario ve pantallas vacías o escenarios no accionables. | Reorganizar por flujos Shopify/KDP y conectar UI a datos persistidos. |
| P0 | La pantalla de importación dice que las operaciones se crean cuando haya pedido y pago, pero el CSV de pedidos Shopify sólo aporta evidencia comercial. | `Operaciones` y `Conciliación` pueden quedar vacías aunque se hayan importado pedidos correctamente. | Separar importación de pedidos y de transacciones/payouts. |
| P0 | El importador de pedidos usa una única fila por `Name` como pedido. | Puede fallar al importar pedidos Shopify con varias líneas de artículo, descuentos repartidos o envío. | Agrupar por pedido y persistir líneas en `order_lines`. |
| P0 | El CSV no tiene VAT/NIF del cliente y `Billing Company` está vacío en la muestra. | No se puede emitir automáticamente una factura B2B completa fiable. | Workflow de enriquecimiento y solicitud de factura, no inferencia. |
| P0 | `Motor fiscal` usa `demoSpainConfig` y tasas de ejemplo. | Resultado visualmente convincente pero no operativo. | Quitar del menú principal y sustituir por reglas configuradas y auditables. |
| P0 | `Configuración` es de solo lectura y muestra roles/ratios demo. | No se pueden emitir documentos válidos ni controlar el producto. | Rehacerla con entidad emisora, series, catálogo, canales y política fiscal. |
| P0 | `VERI*FACTU` declara de forma honesta que no existe adaptador, pero permanece como menú principal. | Crea expectativa de funcionalidad no disponible. | Convertirlo en estado de preparación dentro de Cumplimiento. |
| P0 | El expediente usa una clave de periodo tipo `2026-T3`, pero el repositorio mostrado filtra documentos por `YYYY-MM`. | Riesgo de generar un expediente trimestral vacío. | Corregir el contrato de periodo y consultar un rango de fechas trimestral. |
| P1 | El ZIP de expediente se genera/almacena pero no hay endpoint de descarga real. | Resultado incompleto para usuario o asesoría. | Añadir descarga autenticada y con autorización. |
| P1 | La conciliación es sólo lectura, sin acciones de aceptar/rechazar/dividir/agrupar. | No resuelve excepciones reales. | Añadir mutaciones auditadas y reglas de matching. |
| P1 | Las pantallas mostradas usan controles HTML sin integrar visualmente en el sistema de diseño. | La app parece incompleta y es difícil de usar. | Crear controles UI compartidos y remaquetar formularios/tablas. |

### 3.3 Por qué «Operaciones» y «Conciliación» están vacías

No son conceptos inútiles, pero están adelantados respecto del flujo actual.

- **Pedido Shopify:** prueba la venta comercial y aporta cliente, producto, impuestos reportados y devolución.
- **Transacción Shopify Payments:** prueba cobro, refund, comisión, neto y eventual payout.
- **Payout / extracto bancario:** prueba la liquidación efectiva en banco.
- **Factura:** prueba el documento fiscal emitido.

Una operación consolidada sólo existe cuando se vinculan al menos pedido y evento financiero. Con el CSV de pedidos que estás importando no hay, en general, un evento de cobro suficientemente completo para conciliar. Por tanto, la pantalla debe decirlo claramente y guiar al usuario: «Importa ahora el export de Shopify Payments para activar el control de cobros».

Para KDP la conciliación es distinta: el informe de regalías describe ventas y liquidación de royalties, pero se necesita además la evidencia de pago/transferencia para reconciliar el abono mensual. No se debe forzar KDP dentro de la misma entidad de pedido+cobro de Shopify.

---

## 4. Definición de producto objetivo

### 4.1 Promesa de producto

> «Anclora Fiscal convierte los informes de Shopify y Amazon KDP en registros trazables, facturas revisables y cierres tributarios preparados para revisión y presentación.»

No debe prometer:

- presentar declaraciones ante AEAT sin revisión;
- determinar la fiscalidad de cualquier país sin configuración;
- cumplir VERI*FACTU antes de disponer de adaptador real y certificación/validación aplicable;
- decidir que un cliente es empresa sólo por nombre, email o país;
- registrar como gasto deducible cualquier coste visible en un informe de marketplace.

### 4.2 Dos flujos principales, no uno

```text
A. SHOPIFY — venta propia
Pedido → clasificación fiscal → factura/rectificativa → libro de ventas → cierre IVA
                   → transacción/payout → conciliación (opcional para MVP)

B. AMAZON KDP — liquidación marketplace
Informe KDP → líneas de royalty → política KDP → liquidación/payout → resumen de ingresos
                                              → desglose económico, sin doble cómputo
```

### 4.3 MVP funcional propuesto

El MVP debe terminar cuando permita:

1. configurar al emisor, las series y el catálogo de productos;
2. importar un CSV de pedidos Shopify y mostrar una vista previa revisable;
3. clasificar cada pedido Shopify y generar una cola de facturación;
4. emitir una factura simplificada, completa o rectificativa según reglas y revisión;
5. importar un XLSX de KDP y registrar sus liquidaciones de regalías sin duplicar coste/ingreso;
6. generar libros de ventas emitidas, rectificativas, ingresos KDP y operaciones pendientes;
7. calcular un borrador de cierre de IVA por trimestre con incidencias y trazabilidad;
8. exportar un paquete descargable para revisión personal o asesoría.

La conciliación de Shopify Payments, los payouts de KDP, la importación bancaria y VERI*FACTU quedan como fases posteriores, pero con modelo de datos preparado.

---

## 5. Navegación propuesta

### 5.1 Sidebar objetivo

```text
01  Inicio

    VENTAS Y EVIDENCIA
02  Importar datos
03  Ventas Shopify
04  Liquidaciones KDP
05  Facturas

    FISCALIDAD
06  Libros registro
07  Cierres fiscales
08  Reglas y decisiones              [avanzado]

    CONTROL
09  Cobros y conciliación            [oculto hasta importar transacciones]
10  Configuración
```

`VERI*FACTU` no debe ser una entrada principal independiente en esta fase. Debe aparecer dentro de **Cierres fiscales** como bloque «Preparación VERI*FACTU», con estado `No activado / En preparación / Sandbox / Integración validada`.

### 5.2 Equivalencias con el menú existente

| Menú actual | Decisión | Sustitución |
|---|---|---|
| Centro de control | Mantener, rehacer contenido. | `Inicio` |
| Importaciones | Mantener, especializar. | `Importar datos` con asistentes por fuente. |
| Operaciones | Renombrar y mover. | `Ventas Shopify` y timeline interno de cada venta. |
| Conciliación | Mantener como módulo avanzado. | `Cobros y conciliación`. |
| Facturación | Mantener y completar. | `Facturas`. |
| VERI*FACTU | Sacar de la navegación primaria. | Panel de cumplimiento dentro de cierre. |
| Motor fiscal | Retirar como simulador principal. | `Reglas y decisiones` avanzado. |
| Expedientes IVA | Renombrar y ampliar. | `Cierres fiscales`. |
| Configuración | Rehacer íntegramente. | `Configuración`. |

### 5.3 Diseño de cada pantalla

#### Inicio

Debe responder sólo a cuatro preguntas:

- ¿qué tengo que revisar hoy?
- ¿qué ventas/facturas están pendientes?
- ¿cómo va el trimestre?
- ¿qué archivo falta para completar un flujo?

KPIs recomendados:

- pedidos Shopify importados / pendientes de decisión;
- facturas emitidas / rectificativas pendientes;
- regalías KDP del periodo;
- IVA repercutido estimado, IVA soportado registrado y resultado preliminar;
- incidencias bloqueantes;
- estado de conciliación, sólo si hay transacciones importadas.

#### Importar datos

Sustituir el upload genérico por tres tarjetas explícitas:

| Tarjeta | Archivo | Resultado |
|---|---|---|
| **Shopify — Pedidos** | CSV exportado desde Orders | Ventas, líneas, cliente, país, impuestos reportados, devoluciones. |
| **Shopify — Pagos y payouts** | CSV de Shopify Payments / transactions | Cobros, refunds, fees, neto y payouts para conciliación. |
| **Amazon KDP — Regalías** | XLSX de KDP | Líneas de royalty, unidades, devoluciones y desglose económico. |

Flujo obligatorio:

```text
Seleccionar archivo → detectar formato → vista previa → incidencias
→ elegir tratamiento (cuando aplique) → confirmar importación → resultado y enlaces
```

La vista previa no debe convertir silenciosamente registros en fiscales definitivos. Puede custodiar el archivo original desde el análisis, pero debe distinguir:

- `ANALIZADO`;
- `PENDIENTE_DE_CONFIRMAR`;
- `IMPORTADO`;
- `IMPORTADO_CON_INCIDENCIAS`;
- `RECHAZADO`.

#### Ventas Shopify

Debe ser el centro de trabajo diario. Cada pedido tendrá:

```text
Pedido AI-xxxx
├─ fecha comercial y fecha de devengo configurada
├─ líneas de producto
├─ comprador y nivel de evidencia fiscal
├─ IVA reportado por Shopify
├─ decisión fiscal aplicada y versión de regla
├─ factura asociada / estado de emisión
├─ devolución y rectificativa, si existe
├─ eventos de pago, si se han importado
└─ evidencia original y auditoría
```

Filtros: trimestre, estado de facturación, país, B2B/B2C/pendiente, tipo de producto, devolución, incidencia.

Acciones: `Revisar`, `Solicitar datos de factura`, `Confirmar clasificación`, `Emitir`, `Emitir rectificativa`, `Excluir con motivo`.

#### Liquidaciones KDP

No llamarlo «Operaciones». Debe mostrar:

- periodo KDP;
- royalty neta de cada línea;
- formato: ebook, impresión, KENP, ajuste, reembolso;
- unidades netas, ISBN/ASIN, tienda, moneda;
- coste medio informado por KDP como desglose;
- política aplicada: `NET_ROYALTY_ONLY` o `GROSS_AND_COST_REVIEW_REQUIRED`;
- estado: `Importada`, `Pendiente de revisar`, `Conciliada con abono`, `Cerrada`.

#### Facturas

Separar tabs:

- Pendientes de emitir.
- Emitidas.
- Rectificativas.
- Solicitudes de factura / datos de cliente pendientes.
- Borradores y anuladas según política permitida.

No crear facturas «desde cero» sin tener un vínculo a una venta o un ajuste registrado, salvo una acción explícita de factura manual con auditoría.

#### Libros registro

Debe representar la salida operativa para revisión:

- libro de facturas expedidas;
- libro de facturas rectificativas;
- ingresos de marketplace KDP;
- gastos externos registrados manualmente con factura soporte;
- incidencias que afectan a IVA/IRPF;
- exportación CSV/XLSX con filtros de periodo.

No mezclar «coste de producción deducible» con «dato de coste informado por KDP» sin una política contable confirmada.

#### Cierres fiscales

Renombrar `Expedientes IVA` por `Cierres fiscales`. Un trimestre debe tener este checklist:

```text
[ ] Todas las importaciones del trimestre confirmadas
[ ] Ventas Shopify clasificadas
[ ] Facturas y rectificativas emitidas
[ ] IVA de cada operación decidido o marcado pendiente
[ ] Incidencias bloqueantes resueltas/aprobadas
[ ] Liquidaciones KDP revisadas
[ ] Libros registro generados
[ ] Borrador de Modelo 303 revisado
[ ] Borrador OSS / Modelo 369, sólo si aplica
[ ] Periodo cerrado y paquete descargado
```

El cierre debe presentar importes de apoyo, no «presentar impuestos» automáticamente:

- IVA repercutido nacional por tipo;
- IVA soportado deducible registrado;
- resultado preliminar del modelo 303;
- ventas B2C UE candidatas a OSS;
- operaciones B2B UE pendientes o validadas;
- operaciones fuera de ámbito / exportación, con evidencia;
- ingresos KDP fuera de las facturas directas.

#### Cobros y conciliación

Debe ocultarse mientras no existan transacciones/payouts. Cuando se active:

- conciliación pedido — cobro/refund/fee;
- conciliación payout — conjunto de operaciones;
- conciliación payout — extracto bancario, en fase posterior;
- acciones auditadas para aceptar/rechazar/dividir/agrupar;
- nunca bloquear una factura ya emitida sólo porque falte el payout, salvo que la política del negocio lo requiera.

#### Reglas y decisiones

Es un área avanzada y de auditoría, no un simulador de escaparate. Debe mostrar:

- regla aplicada a cada venta;
- versión, vigencia y fuente normativa;
- evidencia usada y evidencia ausente;
- quién aprobó un override;
- una simulación para pruebas, claramente marcada como no productiva.

#### Configuración

Secciones mínimas:

1. **Entidad emisora:** razón social, NIF, domicilio, país, moneda, régimen, datos de contacto y logo.
2. **Series de facturación:** prefijo, ejercicio, siguiente número, tipo de documento, estado y reglas de bloqueo.
3. **Catálogo fiscal:** SKU, producto, `ebook_digital`, `libro_fisico`, `servicio_general`, IVA nacional, elegibilidad OSS, descripción de factura.
4. **Canales:** Shopify y KDP, moneda, política de recogida de datos, política de liquidación KDP, cuenta o referencia de payout.
5. **Impuestos y territorios:** reglas activas, versión, fecha de vigencia, OSS activo/no activo, tratamiento de B2B UE, reglas de exportación.
6. **Datos de cliente:** método de solicitud de factura, campos necesarios, tratamiento de VAT, log de validación.
7. **Usuarios y roles:** aprovechar los roles existentes, con UI para asignación y revocación.
8. **Cumplimiento:** estado VERI*FACTU, retención de evidencia, privacidad, exportación para asesoría.

---

## 6. Cambios de modelo de datos

### 6.1 Mantener y ampliar, no reemplazar

El esquema actual ya tiene `commercial_orders`, `financial_events`, `canonical_operations`, `tax_decisions`, `fiscal_documents`, `period_closes`, `vat_dossiers`, `royalty_statements` y `royalty_lines`. El cambio debe ser incremental mediante migraciones.

### 6.2 Nuevas entidades o ampliaciones obligatorias

#### A. Pedido y líneas de pedido Shopify

La tabla actual de pedidos no es suficiente para pedidos multi-línea.

```text
commercial_orders
  + customer_type_evidence_status
  + billing_country
  + shipping_country
  + platform_tax_label
  + platform_tax_amount
  + platform_tax_rate_reported
  + payment_status
  + refund_status
  + fiscal_status
  + source_import_file_id

order_lines
  id
  tenant_id
  commercial_order_id
  external_line_id (nullable)
  sku
  title
  quantity
  unit_price
  discount_amount
  line_subtotal
  line_tax_amount
  product_category_id
  platform_taxable
  requires_shipping
  raw_snapshot
```

**Regla crítica:** agrupar filas del CSV por `Name` antes de crear o actualizar `commercial_orders`. Una fila CSV no es necesariamente un pedido completo.

#### B. Contrapartes fiscales

```text
fiscal_counterparties
  id, tenant_id
  display_name
  legal_name
  company_name
  email
  billing_address
  country_code
  tax_id_encrypted
  vat_number_encrypted
  vat_validation_status
  vat_validation_checked_at
  vat_validation_evidence
  customer_classification (B2C | B2B | UNKNOWN)
```

No guardar el VAT number como texto plano cuando no sea necesario. Mantener evidencia de validación, fecha, fuente y resultado.

#### C. Clasificación de producto y política de canal

```text
product_tax_profiles
  sku / selector de producto
  product_nature
  invoice_description
  domestic_rate_code
  oss_eligible
  requires_shipping
  effective_from / effective_to

channel_fiscal_policies
  channel
  policy_version
  kdp_income_basis
  kdp_embedded_cost_treatment
  invoice_issuer_assumption
  needs_manual_review
  effective_from / effective_to
```

#### D. Payouts y conciliación

```text
payouts
  source_channel
  external_payout_id
  occurred_at
  expected_at
  gross_amount
  fee_amount
  net_amount
  currency
  status
  source_import_file_id

payout_allocations
  payout_id
  financial_event_id
  allocated_amount
  confidence
  status
  matched_by / matched_at
```

#### E. Cierre de periodo

Normalizar periodo como rango, no como string ambiguo:

```text
tax_periods
  id
  tenant_id
  period_type (MONTH | QUARTER | YEAR)
  label (2026-T3)
  start_date
  end_date
  status
  closed_at
  closed_by
```

El expediente debe consultar `issued_at >= start_date AND issued_at < end_date + 1 día`, nunca comparar un trimestre `2026-T3` con `to_char(..., 'YYYY-MM')`.

### 6.3 Campos actuales que no deben usarse como única fuente

| Campo actual | Limitación | Regla nueva |
|---|---|---|
| `customerCountry` | Puede venir de envío o facturación; no expresa condición fiscal. | Conservar país de envío y facturación por separado. |
| `customerType` | No debe inferirse de un nombre de empresa. | Guardar clasificación y evidencia/estado. |
| `taxAmount` Shopify | Es dato reportado por canal, no decisión fiscal. | Distinguir `platform_*` de `fiscal_*`. |
| `productionCost` KDP | Puede estar embebido en royalty neta. | Añadir tratamiento contable/fiscal explícito. |
| `canonical_operations` | No debe ser la entidad primaria para KDP. | Mantener para venta/cobro Shopify; relacionar KDP por liquidación propia. |

---

## 7. Cambios técnicos sobre el código existente

### 7.1 Navegación y shell común

**Problema:** la navegación está hardcodeada en `apps/web/app/page.tsx`; las rutas internas muestran pantallas aisladas y el diseño no conserva el contexto de aplicación.

**Cambios:**

- Crear `apps/web/app/components/app-shell.tsx`.
- Crear una única definición de navegación en `apps/web/app/lib/navigation.ts`.
- Añadir estados `enabled`, `comingSoon`, `requiresData`, `advanced` y contador de pendientes.
- Mostrar el sidebar en todas las rutas autenticadas.
- Dar navegación móvil colapsable.
- Usar rutas nuevas sin romper URLs antiguas: redireccionar `/operations` a `/sales/shopify` y `/vat-dossier` a `/tax-periods` cuando se complete la transición.

### 7.2 Sistema de diseño

Los pantallazos muestran inputs, selects y botones nativos sin jerarquía visual suficiente. Corregir antes de añadir más funcionalidades.

Crear en `packages/ui`:

```text
Button
TextField
SelectField
DateRangeField
CurrencyField
FileDropzone
DataTable
StatusPill
EmptyState
PageHeader
StepIndicator
ConfirmDialog
```

Criterios:

- no usar botones sin clases ni estilo compartido;
- labels siempre asociadas y mensajes de error accesibles;
- tablas con cabecera sticky, estados vacíos útiles y filtros persistentes;
- no presentar controles de demo como funcionales;
- mantener el lenguaje visual oscuro y editorial, pero priorizar legibilidad de importes y estados.

### 7.3 Importación

**Archivos a modificar:**

- `apps/web/app/imports/uploader.tsx`
- `apps/api/src/import-service.ts`
- `apps/api/src/import-controller.ts`
- `apps/api/src/ingestion-normalization-service.ts`
- `packages/connectors/src/shopify-orders-csv.ts`
- `packages/connectors/src/shopify-csv.ts`
- `packages/connectors/src/kdp-xlsx.ts`

**Cambios obligatorios:**

1. Dividir interfaz de importación por fuente y propósito.
2. Añadir endpoint de confirmación tras preview; no tratar `preview` como importación fiscal definitiva.
3. Persistir snapshot normalizado de cada fila/línea y su versión de mapping.
4. Agrupar correctamente pedidos Shopify multi-línea.
5. Añadir validaciones de totales:
   - suma líneas + envío - descuentos + impuestos = total Shopify;
   - refund no supera importe original;
   - mismo pedido no se duplica al reimportar;
   - moneda consistente;
   - impuestos de plataforma conservados incluso si no coinciden con la regla fiscal.
6. Añadir incidencias específicas: `VAT_NUMBER_MISSING_FOR_B2B_SIGNAL`, `CROSS_BORDER_B2C_REVIEW`, `PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION`, `KDP_COST_DOUBLE_COUNT_RISK`, `PAYOUT_EVIDENCE_MISSING`.
7. Para KDP, mantener `Ventas combinadas` como fuente principal, usar hojas específicas para enriquecer/validar y no duplicar líneas procedentes de varias hojas.

### 7.4 Ventas Shopify, operaciones y conciliación

**Archivos de partida:**

- `apps/web/app/operations/*`
- `apps/web/app/reconciliation/*`
- `apps/api/src/operations-controller.ts`
- `apps/api/src/reconciliation-controller.ts`
- repositorios en `packages/db/src/*`

**Cambios:**

- Convertir `operations` en una página de ventas basada inicialmente en `commercial_orders` y sus líneas.
- No exigir un `financial_event` para que una venta pueda ser clasificada y pasar a facturación.
- Mostrar un timeline sólo cuando existan eventos financieros.
- Añadir acciones de conciliación: aceptar, rechazar, crear match manual, dividir, agrupar, ignorar temporalmente con motivo.
- Construir una cola «Falta export de Shopify Payments» si se importaron pedidos sin eventos financieros.
- Añadir imports de payout de KDP y vinculación manual/asistida al extracto bancario en fase posterior.

### 7.5 Facturación

**Archivos de partida:**

- `apps/web/app/invoicing/*`
- `apps/api/src/invoice-issuance-service.ts`
- `apps/api/src/fiscal-documents-controller.ts`
- `packages/core/src/invoicing.ts`
- `packages/db/src/fiscal-documents-repository.ts`

**Cambios:**

- Añadir selector de política documental por venta.
- Implementar series configurables reales; bloquear emisión si no hay entidad emisora, serie, clasificación fiscal o datos obligatorios del destinatario.
- Mantener correlatividad transaccional y bloqueo tras emisión.
- Generar facturas rectificativas a partir de la factura original; nunca editar una factura emitida.
- Incluir líneas reales, descuentos, impuestos aplicados, referencia a pedido y política/decisión fiscal.
- Añadir archivo PDF descargable y vista de impresión.
- Añadir «solicitud de factura»: recoge datos adicionales sin cambiar retroactivamente la evidencia del pedido.

### 7.6 Motor fiscal y decisiones

**Archivos de partida:**

- `packages/tax-engine/src/index.ts`
- `apps/web/app/tax-engine/*`
- `apps/api/src/tax-decision-service.ts`
- `packages/db/src/tax-decisions-repository.ts`

**Cambios:**

- Eliminar `demoSpainConfig` de todo flujo productivo.
- Crear configuración versionada persistida, con fecha de vigencia y procedencia.
- Separar cálculo de IVA de plataforma y decisión fiscal interna.
- El motor debe devolver `DETERMINED`, `REVIEW_REQUIRED` o `BLOCKED`, con evidencia concreta faltante.
- No configurar reglas de OSS ni inversión del sujeto pasivo con datos incompletos.
- El simulador puede sobrevivir como herramienta interna de QA, nunca como menú principal.

### 7.7 Cierres fiscales y expediente

**Archivos de partida:**

- `apps/web/app/vat-dossier/*`
- `apps/api/src/period-closes-controller.ts`
- `apps/api/src/vat-dossier-controller.ts`
- `packages/db/src/period-closes-repository.ts`
- `packages/db/src/vat-dossiers-repository.ts`

**Cambios:**

1. Sustituir el input libre `2026-T3` por selector de año y trimestre, calculado en backend.
2. Corregir el filtro de periodo trimestral por intervalo real de fechas.
3. Antes de cerrar, mostrar incidencias bloqueantes y permitir aprobación justificada por rol adecuado.
4. Incluir en el dossier:
   - libro de facturas emitidas;
   - rectificativas;
   - ventas por país/tipo/IVA;
   - resumen nacional de IVA;
   - candidatos OSS y pendientes de revisión;
   - liquidaciones KDP;
   - incidencias y decisiones manuales;
   - estado de preparación VERI*FACTU, sin simular envío.
5. Crear endpoint autenticado de descarga ZIP; validar tenant y permisos; emitir URL temporal o streaming seguro.
6. No llamar al resultado «modelo 303 presentado». Llamarlo «borrador de cierre / datos de apoyo para Modelo 303».

### 7.8 VERI*FACTU

Mantener el flag y la cadena de integridad como preparación, pero:

- no generar QR ni mensajes de cumplimiento hasta que se cumplan las especificaciones aplicables;
- no exponer «enviar a AEAT» hasta implementar adaptador, reintentos, errores, firma/credenciales y trazabilidad;
- incluir una matriz de readiness por requisito;
- organizar la fase de implementación contra la normativa oficial vigente en el momento de desarrollarla, no contra reglas de demo.

---

## 8. Flujo funcional detallado

### 8.1 Shopify — venta B2C española normal

```text
1. Importar CSV de pedidos Shopify.
2. Detectar pedido, líneas, producto, cliente, país, impuesto reportado y estado de pago/refund.
3. Clasificar producto desde SKU/catálogo.
4. Aplicar regla fiscal configurada o dejar en revisión si falta evidencia.
5. Proponer tipo documental según política de facturación.
6. Emitir documento o dejar en cola.
7. Incorporar al libro de ventas y al cierre del trimestre.
8. Si se importa Shopify Payments: vincular cobro, fee, refund y payout sin alterar la factura emitida.
```

### 8.2 Shopify — cliente UE potencialmente B2B

```text
1. Pedido llega con país UE y/o Billing Company.
2. Estado inicial: CUSTOMER_TYPE_UNKNOWN.
3. Si no hay VAT validado: solicitar datos o tratar según política B2C pendiente de revisión.
4. Si se aporta VAT, guardar validación, timestamp y evidencia.
5. Evaluar elegibilidad fiscal por reglas configuradas y país de fulfillment.
6. Bloquear emisión automática si la decisión exige datos no presentes.
7. Emitir factura completa sólo tras decisión determinada o aprobación documentada.
```

### 8.3 Shopify — refund

```text
Pedido original → devolución detectada → localizar factura emitida
→ validar importe y líneas → crear factura rectificativa vinculada
→ incorporar efectos al periodo fiscal correcto según la regla configurada
→ conciliar refund cuando se importe evento financiero
```

### 8.4 KDP — liquidación mensual

```text
1. Importar XLSX de KDP.
2. Identificar periodo, divisa, líneas de royalty, reembolso, KENP y coste informado.
3. Deduplicar entre hojas y comparar con Resumen sólo como control.
4. Aplicar política KDP de registro: por defecto NET_ROYALTY_ONLY.
5. Crear liquidación y líneas de detalle.
6. Marcar KENP o situaciones no resueltas como revisión, no como IVA calculado.
7. Cuando se importe/registre el abono, conciliar payout con liquidación.
8. Incluir ingresos KDP en el informe de periodo correspondiente, separado de ventas Shopify facturadas.
```

---

## 9. Hoja de ruta priorizada

### Fase 0 — Corrección de producto y UX (P0)

**Objetivo:** que la interfaz deje de dar la impresión de tener funcionalidades activas que no existen.

- Rehacer shell, sidebar y componentes de formulario.
- Renombrar módulos y ocultar features avanzadas sin datos.
- Sustituir textos demo por estados honestos.
- Corregir selector/contrato de periodo trimestral.
- Añadir pruebas visuales y E2E de páginas vacías, carga y error.

**Criterio de salida:** ningún botón lleva a una demo presentada como operación real y los formularios mantienen diseño consistente.

### Fase 1 — Configuración mínima y base de datos (P0)

**Objetivo:** disponer de datos suficientes para facturar correctamente.

- Entidad emisora y series reales.
- Catálogo fiscal por SKU/producto.
- Políticas Shopify/KDP versionadas.
- Contrapartes fiscales y estados de evidencia.
- `order_lines`, rangos de `tax_periods`, payout models.

**Criterio de salida:** no se puede emitir una factura sin configuración mínima válida y toda decisión se puede reconstruir.

### Fase 2 — Importación Shopify y KDP robusta (P0)

**Objetivo:** convertir los dos ficheros actuales en datos útiles y revisables.

- Wizard de importación por fuente.
- Preview + confirmación explícita.
- Pedidos Shopify multi-línea.
- KDP con política de neto/coste protegida contra doble conteo.
- Incidencias accionables y reproceso.

**Criterio de salida:** los dos archivos de ejemplo se importan de forma idempotente, con resultado entendible y sin inventar información fiscal ausente.

### Fase 3 — Facturación y rectificaciones (P0)

**Objetivo:** resolver la obligación operativa más importante de Shopify.

- Cola de emisión.
- Serie y correlatividad.
- Simplificada/completa/rectificativa.
- PDF descargable y evidencia vinculada.
- B2B/UE siempre sujeto a reglas/evidencia antes de automatizar.

**Criterio de salida:** una venta nacional y un refund total pueden recorrer el flujo completo y producir documentos trazables.

### Fase 4 — Libros y cierres (P1)

**Objetivo:** preparar el trimestre para revisión y presentación.

- Libros registro exportables.
- Borrador de IVA por trimestre.
- Dossier descargable y cierre/reapertura auditados.
- Separación de IVA nacional, candidatos OSS y KDP.

**Criterio de salida:** un trimestre puede cerrarse sin expedientes vacíos y con el origen de cada total identificable.

### Fase 5 — Conciliación real (P1)

**Objetivo:** aportar control financiero sin contaminar el flujo fiscal básico.

- Import Shopify Payments / payouts.
- Matching editable y auditado.
- Payouts KDP.
- Extracto bancario como conector posterior.

**Criterio de salida:** se identifica qué ventas están cobradas, devueltas, pagadas por plataforma o sin correspondencia.

### Fase 6 — Preparación VERI*FACTU (P2)

**Objetivo:** implementar únicamente cuando la base de facturación esté validada.

- Matriz normativa vigente.
- Generación de registro, cadena, QR/mensajes y adaptador real cuando proceda.
- Sandbox, reintentos, observabilidad y pruebas de rechazo.
- Revisión especializada antes de activar producción.

---

## 10. Criterios de aceptación y pruebas obligatorias

### Datos y normalización

- [ ] Un pedido Shopify con tres líneas crea un pedido y tres `order_lines`.
- [ ] Un reimport idéntico no duplica pedidos, líneas, facturas ni liquidaciones.
- [ ] Un refund parcial no supera el importe/líneas facturadas.
- [ ] IVA reportado por Shopify se conserva aunque la decisión interna sea distinta.
- [ ] Un pedido UE sin VAT no se etiqueta como B2B automáticamente.
- [ ] Un VAT validation fallido no produce inversión del sujeto pasivo automática.
- [ ] El coste KDP no se suma como gasto si la política es `NET_ROYALTY_ONLY`.
- [ ] Dos hojas KDP que reflejan la misma venta no duplican regalías.

### Facturación

- [ ] No se emite factura sin entidad, serie, fecha, regla fiscal y datos obligatorios.
- [ ] La numeración es correlativa y transaccional por serie.
- [ ] Una factura emitida no se modifica; se rectifica mediante documento vinculado.
- [ ] El PDF incluye líneas, importes, tipo documental y referencia de origen.

### Cierre

- [ ] `2026-T3` resuelve un intervalo de fechas real y no compara contra un mes.
- [ ] El cierre bloquea incidencias de severidad configurada.
- [ ] El ZIP se descarga con autorización y pertenece al tenant correcto.
- [ ] El dossier permite rastrear cada total a facturas, decisiones, líneas KDP o incidencias.

### UX y seguridad

- [ ] Todos los controles muestran el diseño Anclora, foco visible y mensajes accesibles.
- [ ] Las pantallas vacías explican qué archivo o configuración falta y ofrecen acción directa.
- [ ] Datos de identidad fiscal y VAT se almacenan cifrados o minimizados según necesidad.
- [ ] Toda confirmación, override, emisión, rectificación, cierre y reapertura genera auditoría.

---

## 11. Decisiones que debes cerrar antes de dar instrucciones a un agente de desarrollo

1. **Identidad del emisor:** autónomo persona física o sociedad, nombre legal, NIF y domicilio de facturación.
2. **Catálogo Shopify:** confirmar para cada SKU si es ebook digital, libro físico u otro producto.
3. **Política de emisión:** factura simplificada por venta, factura completa bajo solicitud, y cómo se recogen datos para B2B.
4. **Shopify Tax:** comprobar si está activo y si el VAT number de checkout está disponible en tu tienda.
5. **Tratamiento KDP:** validar con asesoría si se registra ingreso neto por royalty o bruto/coste separado. El MVP debe usar neto hasta que se documente otra política.
6. **OSS:** confirmar si estás registrado, si superas el umbral aplicable y qué tipos de ventas realizas realmente fuera de España.
7. **Ámbito del primer lanzamiento:** España nacional primero; UE/OSS y países terceros sólo como modo de revisión hasta validar reglas.
8. **Asesoría:** decidir si el primer entregable trimestral se entrega como ZIP/Excel/PDF a asesoría o se usará sólo como soporte interno.

---

## 12. Conclusión operativa

La aplicación tiene una arquitectura aprovechable, pero necesita una corrección de enfoque: menos «plataforma fiscal total» y más «flujo fiable para Shopify y KDP».

La prioridad correcta es:

```text
Configuración fiscal real
→ importación correcta de pedidos/liquidaciones
→ clasificación y facturación Shopify
→ libros y cierre trimestral revisable
→ conciliación de pagos/payouts
→ VERI*FACTU cuando exista implementación y necesidad reales
```

No elimines operaciones ni conciliación: **muévelas a una capa de control financiero avanzada** y no las uses para definir la experiencia inicial. El usuario debe poder empezar por «Importar un CSV de Shopify» o «Importar regalías KDP» y llegar a una respuesta clara: qué se ha registrado, qué factura falta, qué dato falta y qué queda preparado para el trimestre.

---

## Anexo A — Referencias de partida usadas

- Repositorio y estado técnico aportados: importadores, modelo de datos, pantallas, limitaciones y plan de cierre.
- Ficheros de prueba aportados: `Pedidos_KDP_seed.xlsx` y `pedidos-shopify-seed.csv`.
- Capturas de `/operations` y `/invoicing` aportadas.
- AEAT — [Ventanilla Única / OSS](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html).
- AEAT — [Sistemas Informáticos de Facturación y plazos de adaptación](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html).
- BOE — [Real Decreto 1619/2012, Reglamento de obligaciones de facturación](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696).
- Shopify — [VAT validation in checkout](https://help.shopify.com/en/manual/taxes/shopify-tax/vat-validate).

> **Nota de alcance:** este documento define producto y controles de implementación. No sustituye la revisión de un asesor fiscal colegiado sobre el caso concreto, especialmente para KDP, OSS, ventas internacionales, deducibilidad de costes y activación de VERI*FACTU.
