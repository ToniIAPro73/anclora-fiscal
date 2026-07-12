# ADR 0007: proveedores separados de contrapartes de venta

## Decisión

Crear `suppliers`. `fiscal_counterparties` representa compradores y contiene semántica `customerType`; extenderla con proveedores introduciría ambigüedad y riesgos de permisos. Se reutilizan patrones de cifrado, hash normalizado, validación y tenant isolation, no la tabla.

Las compras viven en `purchase_documents` y nunca se insertan en cadenas o submissions VERI*FACTU.
