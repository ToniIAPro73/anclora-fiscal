# VERI*FACTU — comprobación local de entorno AEAT preproducción

Este comando valida el entorno local antes de ejecutar un envío manual real a preproducción AEAT.

No envía datos.

No abre red.

No crea endpoint público.

No guarda secretos.

## Comando

    node scripts/verifactu-aeat-preproduction-env-check.mjs

## Qué comprueba

- Endpoint HTTPS de preproducción AEAT.
- Ruta local del certificado.
- Lectura del certificado.
- Contraseña configurada.
- Huella del certificado en formato hexadecimal.
- NIF y nombre del obligado emisor.
- NIF y nombre del productor del software.
- Ausencia de placeholders.
- Activación explícita del gate de red.
- Confirmación literal de envío a preproducción.

## Resultado esperado antes del envío real

El resultado debe incluir:

    {
      "ok": true,
      "gates": {
        "networkEnabled": true,
        "confirmationAccepted": true
      },
      "blockingReasons": []
    }

Si `ok` es `false`, no debe ejecutarse el submit real.

## Regla operativa

Este script es sólo una comprobación previa. El hecho de que devuelva `ok: true` no implica que deba ejecutarse el envío real automáticamente. El submit manual debe hacerse como una acción separada y consciente.
