# Matriz de preparación VERI*FACTU

> Los expedientes IVA se descargan con autorización tenant-scoped, verificación
> SHA-256 y bloqueo ante alteración.

> Estado del módulo: preparación técnica. `VERIFACTU_ENABLED=false`. No existe
> conexión con la AEAT ni declaración responsable del productor.

| Requisito oficial | Fuente AEAT/BOE | Consulta | Implementación | Test | Estado | Riesgo |
|---|---|---|---|---|---|---|
| Integridad e inalterabilidad | RD 1007/2023, art. 8 | 2026-07-03 | Payload canónico y SHA-256 | `compliance.test.ts` | Parcial | Falta validación del formato oficial |
| Trazabilidad y encadenamiento | RD 1007/2023, art. 8.2.b | 2026-07-03 | Hash anterior obligatorio | `compliance.test.ts` | Parcial | Falta persistencia transaccional |
| Corrección mediante registro posterior | RD 1007/2023, art. 8.2.a | 2026-07-03 | Alta y anulación separadas | `compliance.test.ts` | Parcial | Catálogo oficial pendiente |
| Remisión simultánea VERI*FACTU | Glosario AEAT | 2026-07-03 | `VerifactuPort` y mock | Flag apagado | No implementado | Sin conexión AEAT |
| QR en factura | FAQ AEAT | 2026-07-12 | URL parseable + PNG 300×300/M + leyenda; producción bloqueada | `verifactu-qr.test.ts`, `invoicing.test.ts` | PENDING_MANUAL_COTEJO | Ejecutar `verifactu-qr-cotejo-runbook.md` con evidencia humana |
| Registro de eventos SIF | Modalidades AEAT | 2026-07-12 | Cadena SHA-256, STARTUP por despliegue, errores/reintentos y alertas persistentes | `sif-events-repository.test.ts`, `system-alerts-repository.test.ts` | Implementado técnicamente | Validación preproducción pendiente |
| Exportación legible | RD 1007/2023, art. 8.2.c | 2026-07-03 | CSV/XLSX/PDF/ZIP | `compliance.test.ts` | Parcial | Revisar esquema oficial |
| Declaración responsable | Certificación AEAT | 2026-07-03 | No emitida | No aplica | Pendiente | Requiere validación jurídica/técnica |

Fuentes:

- [Real Decreto 1007/2023 consolidado](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840)
- [Glosario VERI*FACTU de la AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/glosario-terminos.html)
- [Modalidades de cumplimiento AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/modalidades-cumplimiento-obligaciones.html)
- [Certificación de sistemas AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales/certificacion-sistemas-informaticos_.html)
