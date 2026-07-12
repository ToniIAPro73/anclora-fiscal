# Runbook de backup y restauración

Estado actual: `PENDING_MANUAL_VALIDATION`. Este documento no demuestra que exista un backup recuperable.

## Objetivos propuestos

- RPO: 24 horas. RTO: 8 horas. Deben aprobarse y verificarse antes de producción.
- Neon: confirmar plan, retención/PITR y export independiente en consola oficial.
- Vercel Blob: inventariar objetos y preparar copia cifrada en un dominio de fallo separado.

## Prueba

1. Crear un entorno aislado sin endpoints productivos.
2. Restaurar snapshot de base y copia de objetos.
3. Verificar conteos tenant-scoped, hashes de PDFs/dossiers, cadena fiscal y SIF.
4. Registrar fecha, operadores, RPO/RTO observado, muestras y fallos redactados.
5. Marcar `VERIFIED` solo tras revisión humana de la evidencia. Nunca usar producción como destino de prueba.
