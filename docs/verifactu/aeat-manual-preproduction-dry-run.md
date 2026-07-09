# VERI*FACTU — dry-run manual de preproducción AEAT

## Objetivo

Este comando genera un reporte local para comprobar si Anclora Fiscal está preparada para una prueba manual controlada contra la preproducción AEAT.

No envía datos a AEAT.

No abre red.

No usa endpoint público.

No añade botón de envío.

No activa `/send`.

No activa `/submit`.

## Comando

Primero compila core:

| Paso | Comando |
|---|---|
| Compilar core | `pnpm --filter @anclora/core build` |
| Ejecutar dry-run | `node scripts/verifactu-aeat-preproduction-dry-run.mjs` |

## Variables principales

| Variable | Uso |
|---|---|
| `VERIFACTU_AEAT_TEST_ENDPOINT_URL` | Endpoint de preproducción AEAT |
| `VERIFACTU_AEAT_CERTIFICATE_PATH` | Ruta local al certificado PFX/P12 |
| `VERIFACTU_AEAT_CERTIFICATE_PASSWORD` | Contraseña del certificado |
| `VERIFACTU_AEAT_CERTIFICATE_FINGERPRINT` | Huella SHA-1 o SHA-256 del certificado |
| `VERIFACTU_ISSUER_NIF` | NIF del obligado emisor |
| `VERIFACTU_ISSUER_NAME` | Nombre o razón social del obligado emisor |
| `VERIFACTU_SOFTWARE_PRODUCER_NIF` | NIF del productor del software |
| `VERIFACTU_SOFTWARE_PRODUCER_NAME` | Nombre del productor del software |

## Resultado

El comando imprime JSON con:

| Campo | Significado |
|---|---|
| `canRunManualPreproductionTest` | Indica si portal y XML están listos |
| `portalReady` | Readiness de configuración AEAT |
| `xmlPreflightReady` | Validación local del XML |
| `nextAction` | Acción siguiente recomendada |
| `blockingReasons` | Bloqueos detectados |
| `warnings` | Avisos no bloqueantes |
| `soapPreview` | Vista previa técnica del POST SOAP, sin XML completo ni secretos |

## Códigos de salida

| Código | Significado |
|---|---|
| `0` | Dry-run listo |
| `2` | Falta configuración o hay bloqueos |

## Política

Este dry-run no sustituye una prueba real de preproducción. Es sólo una barrera previa.

Antes de cualquier envío real hay que tener:

1. certificado correcto;
2. endpoint de preproducción confirmado;
3. XML validado localmente;
4. decisión explícita de activar transporte real;
5. registro auditable de la prueba;
6. prohibición de pruebas masivas.
