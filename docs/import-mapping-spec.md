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

## Estados

`PENDING → PROCESSING → PREVIEW_READY → VALIDATED`. Un reproceso conserva el
archivo y las filas anteriores y genera una nueva ejecución enlazada.
