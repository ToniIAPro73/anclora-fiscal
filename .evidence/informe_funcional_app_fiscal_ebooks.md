# Informe funcional para una aplicación de gestión fiscal de ventas de ebooks en Shopify y Amazon KDP

## Alcance y objetivo

La aplicación debe centralizar ventas, devoluciones, regalías, facturación, conciliación y reporting fiscal de ebooks vendidos en Shopify y Amazon KDP, con capacidad de importar documentos heterogéneos y convertirlos en un registro fiscal único, trazable y apto para cumplimiento. [file:1][file:2][file:3]

El objetivo no es solo almacenar pedidos, sino automatizar el circuito completo desde la captura del dato hasta la generación de documentación fiscal, reduciendo al mínimo la intervención manual y dejando un rastro auditable de cada operación. [file:1][file:2][file:3]

## Evidencia analizada

El informe de Amazon KDP en XLSX contiene hojas de resumen, ventas combinadas, regalías por formato, pedidos procesados y definiciones del propio informe. [file:1] En la muestra aportada aparece una venta en Amazon.es de 4 unidades netas vendidas en tapa blanda, con precio medio sin impuestos de 14,99 EUR, gasto medio de producción de 2,05 EUR y regalías de 27,76 EUR. [file:1]

El PDF de Shopify muestra números de pedido, fecha, datos de facturación y líneas de artículo, pero en el texto extraído no aparecen importes, desglose de IVA, moneda, medio de pago ni una referencia clara a una factura fiscal emitida. [file:2] Por tanto, ese PDF debe tratarse como documento comercial o soporte del pedido, no como fuente fiscal completa por sí sola. [file:2]

El CSV de Shopify aporta el detalle transaccional que faltaba: fecha, tipo de movimiento, pedido, marca de tarjeta, estado de payout, fecha de payout, importe, comisión, neto, moneda y campo VAT. [file:3] En la muestra, el pedido AI-1001 tiene un cargo de 6,99 EUR con comisión de 0,45 EUR y neto de 6,54 EUR, seguido de un reembolso de -6,99 EUR al día siguiente, con payout pendiente para el 10 de julio de 2026. [file:3]

## Conclusiones funcionales

Shopify y Amazon KDP deben modelarse como canales distintos dentro de la misma plataforma fiscal. [file:1][file:2][file:3] Shopify actúa como canal de venta propio con necesidad de reconstruir y emitir documentación fiscal por operación, mientras que KDP, con la evidencia disponible, aporta principalmente información de liquidación, regalías y pedidos procesados del marketplace. [file:1][file:2][file:3]

La aplicación debe separar claramente cuatro capas: pedido comercial, evento financiero, documento fiscal y liquidación/conciliación. [file:1][file:2][file:3] Esta separación es imprescindible porque una misma operación puede existir como pedido en Shopify, convertirse en un cobro, revertirse mediante un refund y terminar con efecto neto cero, como ocurre en AI-1001. [file:2][file:3]

El campo VAT a 0,00 en el CSV de Shopify no debe usarse como verdad fiscal absoluta. [file:3] La aplicación debe distinguir entre el IVA informado por el canal y el IVA fiscalmente aplicable según reglas internas, país del cliente, tipo de producto y configuración tributaria vigente. [file:3]

## Arquitectura funcional recomendada

### 1. Módulo de importación y conectores

Debe existir un subsistema de importación multi-formato con soporte, como mínimo, para PDF de pedidos Shopify, CSV de transacciones Shopify y XLSX de pedidos/regalías KDP. [file:1][file:2][file:3] Cada importador debe tener versión de plantilla, validación de columnas esperadas, detección de errores y vista previa antes de consolidar datos.

#### Requisitos del importador

- Importación manual por arrastre y suelta.
- Importación por lotes.
- Registro de versión del formato origen.
- Mapeo configurable de columnas/campos.
- Detección de duplicados por clave de negocio.
- Vista previa con incidencias antes de confirmar.
- Reprocesado de ficheros con trazabilidad.

#### Reglas por canal

| Canal | Formato | Uso principal | Observaciones |
|---|---|---|---|
| Shopify | PDF pedido [file:2] | Datos comerciales del pedido | No suficiente por sí solo para fiscalidad. [file:2] |
| Shopify | CSV transacciones [file:3] | Cobros, refunds, fees, netos, payouts | Fuente principal para conciliación financiera. [file:3] |
| Amazon KDP | XLSX pedidos/regalías [file:1] | Regalías, pedidos procesados, resumen de ventas | Estructura multihoja con semántica distinta por pestaña. [file:1] |

### 2. Módulo de normalización de datos

Todos los datos importados deben transformarse a un modelo canónico único. [file:1][file:2][file:3] Este modelo es el núcleo de la aplicación y debe abstraer el origen para que el resto del sistema trabaje siempre con las mismas entidades.

#### Entidades mínimas

- Canal.
- Pedido.
- Cliente.
- Producto.
- Línea de pedido.
- Evento financiero.
- Documento fiscal.
- Liquidación/payout.
- Asiento de conciliación.
- Evidencia documental.
- Incidencia.
- Regla fiscal aplicada.
- País fiscal.
- Moneda y tipo de cambio.

#### Campos recomendados del registro unificado

| Campo | Descripción | Fuente típica |
|---|---|---|
| source_channel | Shopify / KDP | [file:1][file:2][file:3] |
| source_document_type | PDF pedido / CSV pago / XLSX regalías | [file:1][file:2][file:3] |
| source_order_id | Número de pedido o referencia del canal | [file:2][file:3] |
| transaction_type | charge / refund / royalty / payout | [file:1][file:3] |
| customer_name | Cliente facturable | [file:2] |
| customer_country | País del cliente | [file:2] |
| issue_date | Fecha de pedido o hecho imponible | [file:1][file:2][file:3] |
| currency | Moneda | [file:1][file:3] |
| gross_amount | Importe bruto | [file:3] |
| platform_fee | Comisión del canal/PSP | [file:3] |
| net_amount | Neto liquidable | [file:3] |
| platform_reported_vat | VAT informado por el canal | [file:3] |
| fiscal_vat_rate | Tipo de IVA calculado por el motor | Interno |
| fiscal_vat_amount | Cuota de IVA calculada | Interno |
| payout_status | Estado de liquidación | [file:3] |
| payout_date | Fecha prevista o real de payout | [file:3] |
| royalty_amount | Regalía neta KDP | [file:1] |
| anomaly_flag | Indicador de revisión | [file:2][file:3] |

### 3. Módulo de motor fiscal

Debe existir un motor de reglas fiscales parametrizable que resuelva automáticamente el tratamiento de cada operación. [file:2][file:3] Este motor no puede depender únicamente de lo que informe el canal, porque los datos de Shopify y KDP no cubren por sí solos toda la lógica tributaria necesaria. [file:1][file:3]

#### Decisiones que debe resolver el motor

- Tipo de operación: venta propia, devolución, liquidación marketplace, regularización.
- Naturaleza del producto: ebook/digital, impreso, mixto.
- Tipo de cliente: particular o empresa.
- País del cliente.
- País del canal o marketplace cuando sea relevante.
- Moneda funcional y de reporte.
- Serie de facturación aplicable.
- Necesidad de factura completa, simplificada o rectificativa.
- Momento de devengo y fecha de emisión.
- Necesidad de revisión manual por falta de evidencia.

#### Reglas de control recomendadas

- Bloquear emisión automática si faltan país o datos mínimos de cliente.
- Marcar para revisión pedidos con cantidad cero o incoherente. [file:2]
- Marcar para revisión operaciones con charge y refund total en un plazo corto. [file:3]
- Marcar para revisión si la base fiscal calculada no cuadra con el bruto del canal.
- Marcar para revisión si hay moneda o VAT ausentes.

### 4. Módulo de facturación

La aplicación debe emitir y custodiar documentos fiscales propios, independientemente de que el canal disponga de documentos comerciales. [file:2][file:3] El PDF de Shopify no muestra una factura fiscal completa en la muestra disponible, por lo que el sistema debe poder generar la factura correspondiente a partir del registro normalizado. [file:2]

#### Tipos documentales

- Factura completa.
- Factura simplificada, si procede según la configuración fiscal.
- Factura rectificativa por refund total o parcial.
- Abono o documento interno de reversión.
- Justificante de operación no facturable, cuando aplique.

#### Funciones clave

- Series y numeración por canal o tipo de operación.
- Plantillas configurables.
- Emisión automática o semiautomática.
- PDF fiscal descargable.
- Vinculación con evidencia origen.
- Bloqueo de edición tras emisión.
- Reemisión controlada con historial.

### 5. Módulo Verifactu

La integración con Verifactu debe ser nativa, no un añadido superficial. La app debe generar el registro de facturación exigible, controlar estados de envío, almacenar respuestas y mantener la trazabilidad completa del ciclo de vida del documento.

#### Capacidades necesarias

- Generación del registro de alta.
- Generación del registro de anulación o rectificación.
- Gestión de cola de envío.
- Reintentos automáticos y manuales.
- Estados: pendiente, aceptado, rechazado, corregido.
- Bloqueo de documentos ya reportados.
- Huella o identificador de integridad.
- Log de payload enviado y respuesta recibida.

### 6. Módulo de conciliación

La conciliación debe ser uno de los pilares del sistema. [file:1][file:3] En Shopify hay que conciliar pedido, charge, refund, fee, neto y payout; en KDP hay que conciliar pedidos procesados, resumen de regalías y cobros/liquidaciones posteriores cuando se incorporen. [file:1][file:3]

#### Casos que debe soportar

- Charge único por pedido. [file:3]
- Refund total. [file:3]
- Refund parcial.
- Múltiples eventos financieros para un mismo pedido.
- Payout con múltiples pedidos agregados.
- Operaciones con neto cero o negativo.
- Diferencias entre bruto comercial y neto liquidado.

#### Vista recomendada de conciliación

| Elemento | Shopify | KDP |
|---|---|---|
| Pedido comercial | Sí [file:2] | Parcial, según hoja [file:1] |
| Cobro/reembolso | Sí [file:3] | No en el archivo aportado [file:1] |
| Fee / coste plataforma | Sí [file:3] | Parcial, vía regalía/coste producción [file:1] |
| Payout/liquidación | Sí, con estado y fecha [file:3] | Requiere más ficheros de pago/liquidación |
| Documento fiscal propio | Debe generarlo la app | Depende del tratamiento configurado |

### 7. Módulo de reporting fiscal y contable

La aplicación debe producir salidas comprensibles para el empresario y útiles para asesoría/contabilidad. [file:1][file:3] No basta con un dashboard; hace falta también generar ficheros estructurados y libros registro.

#### Informes mínimos

- Libro registro de facturas emitidas.
- Libro registro de facturas rectificativas.
- Resumen mensual por país.
- Resumen por canal.
- Resumen por tipo impositivo aplicado.
- Resumen de devoluciones.
- Resumen de fees/comisiones.
- Resumen de regalías KDP. [file:1]
- Export contable en CSV/XLSX.
- Reporte de incidencias abiertas.

## Documento para presentar el IVA

La aplicación debe poder extraer o generar el documento necesario para preparar la presentación del IVA ante Hacienda. Ese requisito debe resolverse con un enfoque doble: generación de informes fiscales interpretables y exportación de ficheros estructurados listos para revisión, copia o carga en el circuito de presentación.

### Salidas recomendadas para IVA

#### A. Resumen liquidable por periodo

Documento mensual o trimestral con, como mínimo:

- Periodo fiscal.
- Base imponible por tipo impositivo.
- Cuota de IVA repercutida por tipo impositivo.
- Operaciones sin IVA o con tratamiento especial.
- Devoluciones/rectificativas del periodo.
- Total devengado neto del periodo.
- Desglose por país y por canal.

#### B. Libro registro de facturas emitidas

Debe poder exportarse en CSV/XLSX y PDF, con una fila por documento fiscal generado por la app.

#### C. Fichero estructurado para asesoría

Debe incluir un esquema estable para que la asesoría pueda importarlo o copiarlo fácilmente a su software de presentación.

#### D. Paquete documental del periodo

Debe agrupar:

- Resumen IVA del periodo.
- Libro de facturas emitidas.
- Libro de rectificativas.
- Relación de operaciones con incidencias.
- Evidencias documentales asociadas.

### Estructura sugerida del “resumen IVA del periodo”

| Campo | Descripción |
|---|---|
| periodo | Mes o trimestre fiscal |
| canal | Shopify / KDP / consolidado |
| pais_cliente | País atribuido a la operación |
| tipo_operacion | Venta, refund, rectificativa, marketplace |
| base_imponible | Base fiscal calculada |
| tipo_iva | Tipo aplicado |
| cuota_iva | Cuota calculada |
| total | Importe total |
| moneda | Moneda original |
| moneda_reporte | Moneda fiscal de reporte |
| estado_verifactu | Estado del documento asociado |
| referencia_documento | Nº factura / rectificativa |

### Recomendación práctica sobre Hacienda

La aplicación debe centrarse en generar un **expediente IVA preparado para presentación**, no solo un PDF bonito. Ese expediente debería contener un resumen validado, un libro registro exportable y los documentos de soporte necesarios para que tú o la asesoría podáis trasladar la información al modelo que corresponda en cada periodo.

## Flujos operativos recomendados

### Flujo Shopify

1. Se importa el PDF del pedido. [file:2]
2. Se importa el CSV de transacciones. [file:3]
3. El sistema cruza por número de pedido y checkout cuando exista. [file:3]
4. Se genera un registro unificado de operación.
5. El motor fiscal calcula tratamiento, base, IVA y necesidad documental.
6. Se emite factura o rectificativa si procede.
7. Se registra en Verifactu.
8. Se espera o concilia payout.
9. La operación entra en reporting de IVA y contabilidad.

### Flujo KDP

1. Se importa el XLSX de KDP. [file:1]
2. El sistema identifica hoja y tipología de dato. [file:1]
3. Se transforma la información a operaciones de marketplace/regalía.
4. Se aplican reglas específicas del canal.
5. Se incorporan al reporting y conciliación del periodo.

## Interfaz y experiencia de usuario

La app debe priorizar claridad operativa y resolución de excepciones, no solo visualización de datos. Un diseño orientado a bandejas de trabajo reducirá mucho más esfuerzo que un dashboard genérico.

### Pantallas clave

- Bandeja de importaciones.
- Vista de incidencias fiscales.
- Centro de operaciones unificadas.
- Pantalla de conciliación.
- Módulo de facturación.
- Panel Verifactu.
- Centro de reporting IVA.
- Cierre mensual/trimestral con checklist.

### Alertas inteligentes

- Pedido sin documento suficiente. [file:2]
- Cobro sin pedido asociado.
- Refund sin rectificativa emitida. [file:3]
- VAT canal a cero con regla fiscal no validada. [file:3]
- Operación sin país fiscal confiable.
- Diferencia entre bruto y neto sin explicación.
- Documento rechazado por Verifactu.

## MVP recomendado

El primer alcance útil debería centrarse en cerrar Shopify y dejar KDP correctamente modelado pero con menos automatización inicial. [file:1][file:2][file:3] Shopify aporta más fricción operativa por la combinación de pedidos, cobros, refunds y facturación propia. [file:2][file:3]

### MVP fase 1

- Importador PDF Shopify. [file:2]
- Importador CSV Shopify. [file:3]
- Matching automático entre pedido y transacción.
- Motor fiscal básico configurable.
- Emisión de factura y rectificativa.
- Libro registro de facturas emitidas.
- Resumen IVA por periodo.
- Export CSV/XLSX para asesoría.
- Integración inicial Verifactu.
- Gestión de incidencias.

### Fase 2

- Importador KDP avanzado multihoja. [file:1]
- Reglas específicas de marketplace y regalías. [file:1]
- Conciliación ampliada con liquidaciones KDP.
- Multi-moneda y tipos de cambio.
- Dossier fiscal automático del periodo.

### Fase 3

- Conectores API directos donde sea posible.
- Automatización de cierres.
- Motor de validaciones avanzadas.
- Cuadro de mando de riesgo fiscal.
- Integración con ERP/contabilidad.

## Requisitos no funcionales

- Trazabilidad completa por operación.
- Historial de cambios y auditoría.
- Almacenamiento seguro de documentos.
- Reproceso idempotente de importaciones.
- Control de permisos por rol.
- Exportabilidad total de datos.
- Versionado de reglas fiscales.
- Alta observabilidad y logs.

## Riesgos y decisiones a validar

Hay varios puntos que conviene validar antes del desarrollo definitivo porque la información disponible sigue siendo parcial. [file:1][file:2][file:3]

- Qué configuración fiscal exacta usas hoy en Shopify.
- Si Shopify está generando algún documento adicional con impuestos detallados aparte del PDF aportado. [file:2]
- Qué ficheros de pago/liquidación adicionales puede exportar KDP además del XLSX mostrado. [file:1]
- Qué alcance exacto tendrá la integración Verifactu en la primera versión.
- Qué formato prefiere tu asesoría para importar el libro de IVA.
- Qué criterio vas a seguir para operaciones marketplace frente a venta propia.

## Recomendación final de producto

La mejor aproximación es construir una aplicación de **orquestación fiscal de ventas digitales**, no un simple lector de pedidos. [file:1][file:2][file:3] Su ventaja competitiva estará en combinar importación documental, motor fiscal, facturación, Verifactu, conciliación y generación del expediente de IVA del periodo en un solo flujo. [file:1][file:2][file:3]
