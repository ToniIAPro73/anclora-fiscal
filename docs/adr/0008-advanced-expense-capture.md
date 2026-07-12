# ADR 0008: captura avanzada de gastos

## Estado

Contratos definidos; mailbox, OCR y banca no implementados.

## Decisión

Toda fuente conserva original, SHA-256, versión del extractor, confidence, campos, bounding boxes opcionales, provenance y revisión humana. Ningún resultado OCR se convierte en decisión fiscal sin revisión.

## Opciones y límites

- OCR open-source: Tesseract/PaddleOCR reduce coste, pero exige workers con memoria/CPU no garantizados en serverless.
- OCR gestionado: mejor operación, con coste y transferencia de documentos a un tercero; requiere DPA, región y aprobación.
- Mailbox: OAuth y allowlist por remitente; prohibido almacenar credenciales en código.
- Banca: cuarta fuente de evidencia futura, nunca inferida desde payouts. Requiere proveedor regulado, consentimiento y alcance aprobado.

Prioridad: open-source y procesamiento aislado cuando privacidad/calidad lo permitan. No se crean botones ni datos de demostración para capacidades inexistentes.
