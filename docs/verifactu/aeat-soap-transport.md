# VERI*FACTU — transporte SOAP AEAT preparado y apagado por defecto

## Estado

El cliente SOAP real está implementado en core, pero permanece apagado por defecto.

No está cableado a ningún endpoint público.

No está cableado a ningún botón de UI.

No existe endpoint `/send`.

No existe endpoint `/submit`.

No existe acción manual de envío en el panel VERI*FACTU.

## Operación SOAP preparada

La operación técnica preparada es `RegFactuSistemaFacturacion`.

Parámetros técnicos:

| Campo | Valor |
|---|---|
| Operación | `RegFactuSistemaFacturacion` |
| SOAP action | cadena vacía |
| Estilo | SOAP document/literal |
| Payload | XML SOAP con `RegFactuSistemaFacturacion` |

Esta pieza sólo prepara el transporte. No activa el envío.

## Certificado cliente

El transporte soporta certificado cliente mediante:

| Formato | Configuración |
|---|---|
| PFX/P12 | `pfxPath` o `pfxBuffer` |
| Certificado + clave | `certPath` + `keyPath` |
| CA opcional | `caPath` |
| Contraseña | `passphrase` |

El transporte falla si no existe certificado cliente.

## Seguridad por defecto

El transporte real lanza `AEAT_VERIFACTU_REAL_SOAP_TRANSPORT_DISABLED` salvo que se habilite explícitamente al construir el objeto.

Además:

- En entorno `test`, sólo permite hosts reconocidos de preproducción AEAT.
- En entorno `production`, bloquea hosts de preproducción.
- Requiere HTTPS.
- Requiere certificado cliente.
- No se cablea al flujo de emisión de facturas.
- No se expone en API pública.
- No se activa por variables de entorno si no existe cableado explícito en código.

## Variables de entorno previstas

Estas variables sólo describen configuración. No activan por sí solas un envío público.

| Variable | Ejemplo | Uso |
|---|---|---|
| `VERIFACTU_AEAT_REAL_SOAP_TRANSPORT_ENABLED` | `false` | Mantener el transporte real apagado por defecto |
| `VERIFACTU_AEAT_CERTIFICATE_PATH` | `/secrets/aeat-test.p12` | Ruta del certificado PFX/P12 |
| `VERIFACTU_AEAT_CERTIFICATE_PASSWORD` | valor secreto | Contraseña del certificado |
| `VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT` | huella SHA-1 o SHA-256 | Control de identidad del certificado |
| `VERIFACTU_AEAT_TEST_ENDPOINT_URL` | `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` | Endpoint de preproducción |

## Política de producto antes de cualquier envío real

Antes de activar cualquier envío real a AEAT hay que completar:

1. Validación XML local.
2. Readiness del portal AEAT.
3. Prueba manual controlada en preproducción.
4. Revisión legal y operativa.
5. Confirmación explícita de que el producto pasa de preparación a integración activa.
6. Registro auditable de cada intento de envío.
7. Política de reintentos y tratamiento de errores AEAT.
8. Confirmación de que no existen pruebas masivas ni automatizadas contra preproducción.

## Alcance excluido en esta fase

Esta fase no incluye:

- envío real a AEAT;
- endpoint público de envío;
- botón de envío;
- job automático;
- reintentos automáticos;
- activación en producción;
- almacenamiento de certificados en base de datos.

## Siguiente paso técnico

El siguiente paso seguro sería preparar una prueba manual interna de preproducción mediante comando controlado, con variables de entorno explícitas, sin endpoint público y sin UI.
