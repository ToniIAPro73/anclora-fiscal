# Conciliación

## Algoritmo implementado

`matchOrder()` compara primero número de pedido y después checkout. Una señal
exacta obtiene confianza 0,95; ambas señales obtienen 1,00. Los eventos sin
señales no se enlazan.

El resultado separa bruto cobrado, fee de plataforma, neto comercial y monto
de liquidación. Los cálculos se normalizan a céntimos.

## Estados y anomalías

El núcleo produce `MATCHED`, `PARTIALLY_MATCHED` o `UNMATCHED`. Detecta cantidad
incoherente, refund total con neto comercial cero y necesidad de revisión de
rectificativa.

## Cobertura demostrativa

La página `/reconciliation` presenta refund total, cobro normal y excepción sin
pedido. No persiste decisiones de dividir, agrupar, confirmar o ignorar.

## Diferencias respecto a la especificación

Faltan matching por importe/moneda/ventana temporal, payouts multi-pedido,
conciliación bancaria, decisiones manuales auditadas y reglas completas para
regalías KDP. Estos flujos requieren la superficie REST y persistencia pendiente.

