# Política de retención de datos

Estado: `IMPLEMENTED` como control documental y reporte no destructivo; purga `PRODUCTION_BLOCKED`.

- Facturas, compras, PDFs, huellas, submissions, attempts, respuestas y eventos SIF: conservar mientras sean necesarios para obligaciones fiscales, defensa y reconstrucción de cadena. Nunca se purgan automáticamente.
- Imports originales: conservar como evidencia de procedencia según plazo fiscal aplicable y litigios abiertos.
- Contrapartes y otra PII separable: solo anonimización o crypto-shredding tras política jurídica aprobada, dry-run, permiso administrativo y auditoría.
- Logs: minimizar y redactar; revisar candidatos que excedan el plazo operativo aprobado.

`getRetentionCandidates` únicamente clasifica. No existe `delete` en `StoragePort` ni ejecutor de purga.
