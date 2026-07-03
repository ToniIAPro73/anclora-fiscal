# Especificación de mapeo de importaciones

## Principios

- La detección usa estructura, MIME y cabeceras; nunca el nombre por sí solo.
- El binario original se custodia antes del análisis con SHA-256.
- Una repetición del mismo hash dentro del tenant se marca como duplicada.
- Ninguna fila se elimina: queda válida, inválida, duplicada o no clasificada.
- La vista previa no expone nombres, direcciones, correos ni texto PDF original.

## Shopify Payments CSV v1

El contrato exige las 18 cabeceras canónicas, en orden. Las fechas conservan
la zona horaria. `Amount`, `Fee`, `Net` y `VAT` se guardan como valores fuente.
`VAT` es IVA informado por plataforma y no sustituye la decisión fiscal.

La clave de negocio se calcula con pedido, checkout, fecha, tipo, importe y
moneda. El orden de las filas no tiene significado semántico.

## Shopify pedido PDF v1

Un PDF puede contener varios pedidos. Cada bloque empieza por `Pedido AI-NNNN`
y se normaliza como evidencia comercial independiente. No se extraen importes
fiscales porque el documento no los contiene. `0 de 0` produce la incidencia
`INCOHERENT_QUANTITY`.

## Amazon KDP Regalías XLSX v1

Amazon es el comerciante registrado en las ventas KDP a lectores finales
(principio #7): las filas de regalías se modelan como `RoyaltyStatement` /
`RoyaltyLine` en `packages/core`, nunca como `CanonicalOperation` facturadas al
lector. La detección exige extensión/MIME `.xlsx` **y** al menos una hoja
conocida (por nombre, tras recortar espacios) — la extensión sola no basta.

Los nombres de hoja se normalizan con `trim()` antes de cualquier búsqueda,
porque el fichero real de Amazon incluye una hoja con espacio final
(`"Regalías de los libros de tapa "`). Las fechas mensuales en español
(`"junio 2026"`) se convierten a `"YYYY-MM"` mediante `parseSpanishMonth`.

Mapeo hoja por hoja:

| Hoja | Uso |
| --- | --- |
| `Definiciones del informe` | Metadato only. Nunca se valida ni se normaliza a operaciones. |
| `Resumen` | Solo para la comprobación de coherencia contra el detalle (no genera `RoyaltyLine`). |
| `Ventas combinadas` | Detalle de venta multi-formato → `RoyaltyLine`. |
| `Regalías de eBooks` | Detalle eBook → `RoyaltyLine` clasificada `ebook`. |
| `Regalías de libros impresos` | Detalle impreso → `RoyaltyLine` clasificada `impreso`. |
| `Regalías de los libros de tapa ` (espacio final) | Misma forma que la anterior; incluida vía normalización de nombre. |
| `Pedidos procesados` / `Pedidos completados de eBooks` | Informativas: se validan pero no generan `RoyaltyLine` propia, para evitar doble conteo de la misma venta ya contada en las hojas de regalías (incidencia `INFO` `INFORMATIONAL_ONLY_NOT_COUNTED`). |
| `KENP leídas` | Cada fila se convierte en `RoyaltyLine` con `classification: 'kenp_lectura'` y `status: 'PENDING_TAX_REVIEW'` siempre, hasta que el tenant configure el tratamiento fiscal. |

Cuando la misma venta aparece en más de una hoja de detalle (p. ej.
`Ventas combinadas` y `Regalías de libros impresos`), la clave de negocio
(periodo + ISBN/ASIN + unidades netas + regalías + moneda) deduplica la
segunda aparición con la incidencia `INFO` `DUPLICATE_ACROSS_SHEETS`.

La comprobación contra `Resumen` es solo de coherencia — nunca bloquea el
import. Ver ADR-008 sobre la tolerancia elegida.

## Estados

`PENDING → PROCESSING → PREVIEW_READY → VALIDATED`. Un reproceso conserva el
archivo y las filas anteriores y genera una nueva ejecución enlazada.
