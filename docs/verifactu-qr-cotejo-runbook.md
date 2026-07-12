# Runbook de cotejo del QR VERI*FACTU

Estado: `PENDING_MANUAL_COTEJO`.

## Gates

- Usar exclusivamente entorno de pruebas y datos sintéticos, sin PII.
- Mantener bloqueada la generación QR de producción.
- No marcar la matriz como verificada sin evidencia humana fechada.

## Procedimiento

1. Generar una factura sintética de preproducción con NIF de prueba, serie,
   fecha e importe conocidos.
2. Abrir el PDF y escanear físicamente el QR con un segundo dispositivo.
3. Comprobar que el destino es el servicio de cotejo de pruebas y comparar
   `nif`, `numserie`, `fecha` (`dd-mm-aaaa`) e `importe` con el documento.
4. Registrar fecha/hora, entorno, versión/commit, dispositivo lector, resultado
   HTTP y correspondencia de parámetros. Redactar cualquier identificador real.
5. Guardar solo capturas y respuestas redactadas en el repositorio de evidencia
   autorizado; nunca commitear XML, certificados ni respuestas reales.
6. Tras revisión humana, enlazar la evidencia y actualizar la matriz. Si falla,
   mantener `PENDING_MANUAL_COTEJO`, abrir alerta y no habilitar producción.

## Automatización disponible

`pnpm --filter @anclora/core test -- verifactu-qr.test.ts` valida URL, parser,
fecha UTC, formato monetario, PNG 300×300 y corrección `M`. El escaneo y la
respuesta del servicio siguen siendo deliberadamente manuales.
