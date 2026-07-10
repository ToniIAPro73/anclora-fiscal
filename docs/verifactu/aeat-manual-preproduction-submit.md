# VERI*FACTU — envío manual controlado a preproducción AEAT

## Objetivo

Este comando permite una prueba manual real contra la preproducción AEAT.

No añade endpoint público.

No añade botón en la interfaz.

No activa `/send`.

No activa `/submit`.

No ejecuta red salvo activación explícita por variables de entorno.

## Triple safety gate

El envío sólo se intenta si se cumplen estas condiciones:

| Gate | Variable |
|---|---|
| Transporte real activo | `VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED=true` |
| Confirmación literal | `VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM=I_UNDERSTAND_THIS_SENDS_TO_AEAT_PREPRODUCTION` |
| Endpoint preproducción | `VERIFACTU_AEAT_TEST_ENDPOINT_URL` con host AEAT de preproducción reconocido |

Además, el dry-run previo debe estar listo:

| Requisito | Variable |
|---|---|
| Certificado | `VERIFACTU_AEAT_CERTIFICATE_PATH` |
| Contraseña | `VERIFACTU_AEAT_CERTIFICATE_PASSWORD` |
| Huella | `VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT` |
| Emisor | `VERIFACTU_ISSUER_NIF`, `VERIFACTU_ISSUER_NAME` |
| Productor software | `VERIFACTU_SOFTWARE_PRODUCER_NIF`, `VERIFACTU_SOFTWARE_PRODUCER_NAME` |

## Compilación

`pnpm --filter @anclora/core build`

## Ejecución

Ejemplo de ejecución manual:

| Variable | Valor de ejemplo |
|---|---|
| `VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED` | `true` |
| `VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM` | `I_UNDERSTAND_THIS_SENDS_TO_AEAT_PREPRODUCTION` |
| `VERIFACTU_AEAT_TEST_ENDPOINT_URL` | `https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` |
| `VERIFACTU_AEAT_CERTIFICATE_PATH` | `/ruta/local/certificado.p12` |
| `VERIFACTU_AEAT_CERTIFICATE_PASSWORD` | contraseña local del certificado |
| `VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT` | huella del certificado |
| `VERIFACTU_ISSUER_NIF` | NIF del obligado emisor |
| `VERIFACTU_ISSUER_NAME` | nombre o razón social del obligado emisor |
| `VERIFACTU_SOFTWARE_PRODUCER_NIF` | NIF del productor del software |
| `VERIFACTU_SOFTWARE_PRODUCER_NAME` | nombre del productor del software |

Comando:

    VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED=true \
    VERIFACTU_AEAT_PREPRODUCTION_MANUAL_CONFIRM=I_UNDERSTAND_THIS_SENDS_TO_AEAT_PREPRODUCTION \
    VERIFACTU_AEAT_TEST_ENDPOINT_URL='https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP' \
    VERIFACTU_AEAT_CERTIFICATE_PATH='/ruta/local/certificado.p12' \
    VERIFACTU_AEAT_CERTIFICATE_PASSWORD='***' \
    VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT='HUELLA_CERTIFICADO' \
    VERIFACTU_ISSUER_NIF='B12345678' \
    VERIFACTU_ISSUER_NAME='Anclora Fiscal Test' \
    VERIFACTU_SOFTWARE_PRODUCER_NIF='B87654321' \
    VERIFACTU_SOFTWARE_PRODUCER_NAME='Anclora Labs' \
    node scripts/verifactu-aeat-preproduction-submit.mjs

## Reporte

El comando guarda un JSON local en:

`artifacts/verifactu/preproduction/`

El reporte no incluye XML completo, certificado, contraseña ni respuesta SOAP completa. Sólo guarda hashes, estado, referencia y metadatos mínimos.

## Política de uso

No usar para pruebas masivas.

No ejecutar desde CI.

No ejecutar en producción.

No commitear reportes locales.

No convertir este comando en endpoint público sin una fase específica de seguridad, auditoría y autorización.
