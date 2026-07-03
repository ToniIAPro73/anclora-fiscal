# Especificación de exportación para asesoría

Versión: `anclora-vat-dossier-v1`.

El ZIP contiene `facturas.csv`, `facturas.xlsx`, `resumen-iva.pdf`,
`estado-verifactu.json` y `manifest.json`. El manifiesto incluye SHA-256 de
cada archivo exportado.

## Columnas del libro de facturas

`number`, `issued_at`, `type`, `country`, `channel`, `tax_base`, `tax_rate`,
`tax_amount`, `total_amount`, `currency`, `evidence_sha256`.

Los importes usan punto decimal y dos posiciones en CSV. `tax_rate` conserva
cuatro posiciones. La exportación ayuda a trasladar datos al modelo 303, pero
no genera ni presenta el modelo oficial.

## Cierre

Una incidencia `BLOCKING` abierta impide el cierre salvo aprobación explícita
registrada. El expediente cerrado se congela. Cualquier cambio exige reapertura
auditada o ajuste posterior.
