# Motor fiscal

El motor evalúa reglas versionadas y nunca usa `VAT` de plataforma como IVA
validado. Si faltan país, tipo de cliente o naturaleza del producto, bloquea o
envía a revisión fiscal explícita.

La configuración real se lee de `legal_entities`, `invoice_series` y
`product_tax_profiles`. `DEMO_CONFIG` queda limitado a simuladores y pruebas;
no sustituye al emisor configurado por el usuario.

La regla Shopify segura vigente cubre:

- 4 % para libros, incluidos digitales, en venta nacional.
- 21 % general para operaciones nacionales configuradas como generales.
- `CONSUMIDOR_FINAL_ESPANA` con total positivo hasta 400 EUR: decisión
  `DETERMINADA`, documento `SIMPLIFICADA`, serie `FS`.
- `EMPRESARIO_ESPANA`: documento `COMPLETA` sólo con destinatario suficiente.
- `EMPRESARIO_UE_VAT_VALIDO`: documento `COMPLETA` sin IVA sólo con NIF-IVA
  validado y leyenda configurada.
- `CONSUMIDOR_FINAL_UE`: `PENDIENTE_REVISION_OSS` si falta OSS activo o regla
  de destino efectiva.
- Resto del mundo o cliente desconocido: revisión fiscal, sin estimar IVA.
- Total cero: `REVISION_IMPORTE_CERO`, sin emisión automática.

KDP conserva su política separada: net royalty only cuando el usuario valida
merchant of record.

Fuentes consultadas el 3 de julio de 2026:

- [Tipos IVA 2026 de la AEAT](https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/IVA_reperc/Tipos_IVA_2026.pdf)
- [Cuestiones generales OSS de la AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html)

La configuración no constituye asesoramiento ni una declaración de cumplimiento.
Toda decisión conserva regla, versión, entradas y explicación.
