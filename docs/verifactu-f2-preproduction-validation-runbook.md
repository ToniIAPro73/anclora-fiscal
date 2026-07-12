# Validación manual F2 en preproducción VERI*FACTU

Estado: `PENDING_MANUAL_VALIDATION`.

## Objetivo

Validar con datos sintéticos que una factura simplificada B2C produce
`TipoFactura=F2`, omite `Destinatarios`, conserva cadena y supera preflight
local antes de cualquier envío humano.

## Gates obligatorios

```bash
export VERIFACTU_MODE=test
export VERIFACTU_PRODUCTION_SUBMISSION_ENABLED=false
export VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED=false
unset VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM
```

- Certificado y contraseña permanecen fuera del repositorio.
- Producción nunca se habilita.
- Solo datos sintéticos.
- Dry-run no abre red ni carga certificado real.

## Dry-run local

```bash
pnpm verifactu:aeat:env-check
pnpm verifactu:aeat:preproduction:dry-run
```

Comprobar:

- `sendsNetworkRequest=false`;
- `TipoFactura=F2`;
- ausencia de `Destinatarios` e `IDDestinatario`;
- huella SHA-256 en mayúsculas;
- `PrimerRegistro=S` o referencia completa al registro anterior;
- preflight sin incidencias bloqueantes.

## Envío manual posterior

No ejecutar durante automatización. Persona autorizada debe revisar primero
XML sintético, readiness, certificado de pruebas y endpoint. Solo entonces
puede seguir el script manual y su confirmación literal documentada.

## Evidencia esperada

- Fecha UTC y operador.
- Commit validado.
- Hash SHA-256 del XML, nunca XML completo.
- Tipo `F2` y confirmación de ausencia de destinatario.
- Estado normalizado AEAT y código, sin respuesta completa.
- Hash de respuesta redactada.

No versionar XML, PDFs, certificados, respuestas AEAT, NIF, direcciones,
emails, cookies ni cabeceras de autorización.

## Cierre

Marcar validación manual con fecha solo tras cotejo real. Un `ACCEPTED`
estructural no prueba por sí solo corrección material ni cumplimiento fiscal
definitivo.
