# Motor fiscal

El motor evalúa reglas versionadas y nunca usa `VAT` de plataforma como IVA
validado. Si faltan país, tipo de cliente o naturaleza del producto, bloquea.

`DEMO_CONFIG` incluye, como datos editables y no como constantes del motor:

- 4 % para libros, incluidos digitales, en venta nacional.
- 21 % general para operaciones nacionales configuradas como generales.
- KDP a 0 solo cuando el usuario valida explícitamente merchant of record.
- B2C intracomunitario siempre en `PENDING_TAX_REVIEW` hasta configurar OSS.

Fuentes consultadas el 3 de julio de 2026:

- [Tipos IVA 2026 de la AEAT](https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/IVA_reperc/Tipos_IVA_2026.pdf)
- [Cuestiones generales OSS de la AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html)

La configuración demo no constituye asesoramiento ni una declaración de
cumplimiento. Toda decisión conserva regla, versión, entradas y explicación.
