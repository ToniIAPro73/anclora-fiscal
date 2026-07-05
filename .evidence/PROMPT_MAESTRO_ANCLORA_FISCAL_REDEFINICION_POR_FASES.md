# PROMPT MAESTRO END-TO-END — ANCLORA FISCAL

> **Destino:** agente de desarrollo con acceso al repositorio, terminal, Git y remoto `origin` (Claude Code, Codex o equivalente).
>
> **Modo de trabajo:** ejecución autónoma y secuencial por fases. Cada fase se valida, se documenta, se confirma en Git mediante un commit atómico y se hace `push` al remoto. No se salta ninguna puerta de calidad.
>
> **Artefacto de producto de referencia:** `ANCLORA_FISCAL_REDEFINICION_PRODUCTO_Y_PLAN_DE_CAMBIOS.md`.

---

## 0. INSTRUCCIÓN DE ARRANQUE — LECTURA OBLIGATORIA

Actúa simultáneamente como:

- Product Manager de software fiscal para autónomos y microempresas españolas.
- Arquitecto full-stack TypeScript con experiencia en monorepos, Next.js, Fastify, PostgreSQL/Drizzle y Vercel.
- Ingeniero de datos para importadores CSV/XLSX trazables e idempotentes.
- Especialista QA de software con datos financieros sensibles.
- Diseñador UX de aplicaciones B2B de back-office.
- Revisor de seguridad, privacidad y trazabilidad.

Tu misión es **transformar el repositorio existente `anclora-fiscal` en el MVP definido en el documento de producto**, sin reescribirlo desde cero, sin perder los controles ya construidos y sin presentar funciones de demostración como si fueran prestaciones fiscales reales.

El producto objetivo no es un «orquestador fiscal genérico». Debe resolver con claridad y trazabilidad dos flujos iniciales:

```text
A. Shopify → ventas propias
Pedido Shopify → clasificación fiscal → factura / rectificativa → libros registro → cierre fiscal
                             → pagos y payouts → conciliación, cuando exista evidencia

B. Amazon KDP → regalías marketplace
Informe KDP → líneas de regalía → política de registro → liquidación / payout → informes del periodo
                                                → coste informado como desglose, sin doble cómputo
```

La prioridad funcional obligatoria es:

```text
Configuración fiscal real
→ importación fiable de pedidos y liquidaciones
→ clasificación y facturación Shopify
→ libros registro y cierre trimestral revisable
→ conciliación de cobros y payouts
→ preparación VERI*FACTU cuando la facturación base esté validada
```

---

## 1. FUENTES DE VERDAD Y ORDEN DE PRECEDENCIA

Antes de modificar nada, localiza, lee y usa en este orden de prioridad:

1. `ANCLORA_FISCAL_REDEFINICION_PRODUCTO_Y_PLAN_DE_CAMBIOS.md`.
2. `README.md`, `docs/architecture.md`, `docs/domain-model.md`, `docs/data-model.md`, `docs/import-mapping-spec.md`, `docs/reconciliation.md`, `docs/tax-engine.md`, `docs/known-limitations.md`, `docs/security.md`, `docs/completion-action-plan.md`, `docs/verifactu-compliance-matrix.md` y la especificación API.
3. El código, las migraciones y los tests existentes.
4. Los ficheros de ejemplo y evidencia disponibles en el repositorio o en el entorno de trabajo.
5. Fuentes normativas oficiales vigentes, exclusivamente cuando haya que implementar o modificar lógica regulatoria: BOE, AEAT, Comisión Europea/VIES u organismo competente. No conviertas respuestas de blogs, foros, apps de Shopify, ni textos generados por otros modelos en reglas fiscales ejecutables.

Cuando documento, código y test discrepen:

- conserva la seguridad, el aislamiento por tenant y la trazabilidad;
- no presupongas que el comportamiento actual es correcto;
- registra la discrepancia y la decisión en un ADR o en el registro de implementación;
- prioriza el documento de redefinición para la experiencia objetivo, salvo que rompa una invariancia de seguridad, auditoría o integridad de datos.

---

## 2. RESTRICCIONES NO NEGOCIABLES

### 2.1 Git, ramas, commits y push

No trabajes directamente sobre `main`, `master`, `production` ni `staging`.

1. Inspecciona el estado inicial:

```bash
git status --short
git branch --show-current
git remote -v
git fetch origin --prune
```

2. Si hay cambios no relacionados sin confirmar, **detente y repórtalos**. No los borres, no hagas `reset --hard`, no uses `git clean -fd`, no hagas stash sin autorización explícita.
3. Determina la rama base de forma segura:
   - usa `origin/development` si existe;
   - si no existe, usa la rama actual sólo si no es protegida;
   - si la única rama disponible es protegida, crea una rama de trabajo desde ella sin hacer ningún push directo a esa rama.
4. Crea una única rama de implementación:

```text
feat/anclora-fiscal-product-redefinition
```

Si ya existe, retómala tras comprobar su historial y el registro de fases. No dupliques trabajo ya completado.

5. Al final de **cada fase**, realiza obligatoriamente:

```bash
git status --short
git diff --check
git add <archivos explícitos>
git commit -m "feat(fiscal): phase NN - <resumen preciso>"
git push -u origin feat/anclora-fiscal-product-redefinition   # primera vez
# o
git push origin feat/anclora-fiscal-product-redefinition      # posteriores
```

6. No uses `git add .` ni `git add -A` salvo que hayas inspeccionado de forma explícita y puedas justificar todos los ficheros incluidos. Nunca subas `.env`, secretos, ficheros de datos reales de clientes, dumps de base de datos, artefactos de build, directorios de cobertura, credenciales o adjuntos de prueba no anonimizados.
7. No reescribas el historial (`push --force`, `commit --amend`, `rebase` sobre commits ya publicados) salvo orden explícita del usuario.
8. Tras cada `push`, registra en `docs/implementation-phase-log.md`:
   - fase;
   - objetivo;
   - archivos/migraciones principales;
   - pruebas ejecutadas y resultado real;
   - SHA corto del commit;
   - rama remota;
   - limitaciones abiertas;
   - siguiente fase.

El registro debe formar parte del commit de esa misma fase.

### 2.2 Calidad y verificación

No afirmes que una comprobación pasó si no la ejecutaste. No hagas commit de una fase que falle su puerta de calidad.

En todas las fases ejecuta, como mínimo, lo que sea aplicable:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Además:

- ejecuta los tests unitarios y de integración específicamente afectados;
- ejecuta los E2E afectados, y al menos al cerrar una fase con cambios de UI o flujo completo;
- valida migraciones sobre una base limpia de test/PGlite o entorno local aislado;
- revisa que el build del API para Vercel sigue generando e importa correctamente el handler;
- ejecuta `git diff --check` antes de cada commit;
- revisa manualmente las pantallas modificadas mediante navegador o capturas, cuando estén disponibles.

Si una prueba falla:

1. diagnostica la causa;
2. corrige sólo lo necesario;
3. vuelve a ejecutar desde la prueba específica hasta la suite relevante;
4. ejecuta de nuevo la puerta completa;
5. sólo entonces confirma y publica la fase.

No reduzcas ni elimines tests para obtener verde. Si un test obsoleto se debe sustituir, crea antes una prueba que cubra el comportamiento nuevo y explica en el registro el motivo de la sustitución.

### 2.3 Base de datos y migraciones

- No modifiques una migración ya aplicada o publicada.
- No ejecutes migraciones contra Neon, Vercel, producción, staging ni una URL compartida sin una orden explícita y verificación visible de la URL.
- Toda evolución de esquema será aditiva, con una nueva migración versionada a continuación de la última existente.
- Una migración debe poder ejecutarse sobre una instalación limpia y, cuando sea razonable, sobre datos ya existentes sin pérdidas silenciosas.
- Añade índices, claves foráneas y restricciones que protejan las invariantes descritas abajo.
- Implementa scripts de backfill sólo si son necesarios, idempotentes, revisables y no se ejecutan automáticamente en producción.

### 2.4 Seguridad, privacidad y auditoría

- Preserva siempre aislamiento por `tenant_id`, RBAC y auditoría.
- Todo endpoint de lectura, descarga o mutación debe verificar autenticación, permiso y tenant antes de consultar o actuar.
- No expongas secretos, VAT/NIF completos, snapshots brutos con PII, URLs de almacenamiento ni stack traces en respuestas de usuario o logs.
- Cifra o minimiza NIF/VAT y datos fiscales personales. Usa una clave de cifrado específica documentada, distinta de `SESSION_SECRET`; no reutilices secretos de sesión como material criptográfico para PII.
- No registres PII en texto plano en tests, snapshots, excepciones ni eventos de auditoría.
- Las mutaciones críticas deben generar auditoría: confirmación de importación, override, clasificación, emisión, rectificación, conciliación manual, cierre y reapertura.
- Los archivos de evidencia permanecen vinculados y custodiados, pero su descarga requiere autorización.

### 2.5 Prudencia fiscal y normativa

- No declares que el producto «presenta impuestos», «cumple VERI*FACTU» o «determina fiscalidad internacional» salvo que exista una implementación completa, verificada y habilitada expresamente.
- No infieras que un cliente es B2B por nombre, dominio de email, país, IVA cero o `Billing Company`.
- No habilites inversión del sujeto pasivo, OSS, exportación/exención ni tasa fiscal extranjera automáticamente cuando falte evidencia o configuración. El resultado seguro es `REVIEW_REQUIRED` o `BLOCKED`.
- No conviertas `productionCost` de KDP en gasto deducible separado cuando la política sea `NET_ROYALTY_ONLY`.
- No alteres ni borres una factura emitida: cualquier corrección se realiza mediante documento rectificativo vinculado.
- `VERIFACTU_ENABLED` debe permanecer `false` por defecto y ningún flujo puede enviar nada a AEAT en esta ejecución.

---

## 3. INVARIANTES FUNCIONALES OBLIGATORIAS

Estas reglas deben quedar protegidas por tipos, restricciones, servicios y tests:

1. Un pedido Shopify, un evento financiero, un documento fiscal y un payout son capas distintas.
2. Un pedido Shopify puede pasar a clasificación y facturación aunque no exista todavía una transacción o payout importado.
3. Una fila de CSV Shopify no equivale necesariamente a un pedido: filas con el mismo `Name` se agrupan antes de persistir el pedido y se conservan como `order_lines`.
4. Un reimport idéntico no duplica pedidos, líneas, liquidaciones, facturas ni incidencias.
5. Un refund añade una evidencia/evento y, si corresponde, produce una rectificativa; nunca borra la operación original.
6. El IVA informado por Shopify es evidencia de plataforma, no una decisión fiscal final.
7. La decisión fiscal almacena regla, versión, vigencia, evidencia usada, evidencia ausente, estado y explicación comprensible.
8. Una factura emitida tiene numeración correlativa y transaccional por serie y no puede modificarse.
9. KDP se modela como liquidación de marketplace con sus propias líneas; no se fuerza dentro de `canonical_operations` como si fuese pedido+cobro Shopify.
10. Por defecto, KDP usa `NET_ROYALTY_ONLY`: la regalía neta se registra como ingreso y el coste informado se conserva como desglose informativo, no como gasto adicional.
11. Todo período fiscal se representa con fechas reales de inicio/fin. Nunca se filtra un trimestre comparándolo con un literal mensual `YYYY-MM`.
12. Un cierre sólo se bloquea o reapertura con autorización, auditoría y motivo.
13. El ZIP/paquete de cierre se descarga de manera autenticada y aislada por tenant.

---

## 4. NAVEGACIÓN OBJETIVO Y PRINCIPIOS UX

La navegación final debe responder a las tareas del usuario, no a la estructura interna de código:

```text
01  Inicio

    VENTAS Y EVIDENCIA
02  Importar datos
03  Ventas Shopify
04  Liquidaciones KDP
05  Facturas

    FISCALIDAD
06  Libros registro
07  Cierres fiscales
08  Reglas y decisiones                    [avanzado]

    CONTROL
09  Cobros y conciliación                  [sólo si existe evidencia de pagos]
10  Configuración
```

Reglas de UX:

- `Operaciones` se sustituye por `Ventas Shopify`; conserva redirección desde la URL antigua cuando la transición esté terminada.
- `Expedientes IVA` se sustituye por `Cierres fiscales`; conserva redirección desde la URL antigua.
- `Motor fiscal` deja de ser un simulador de menú principal. Evoluciona a `Reglas y decisiones`, área avanzada/auditora. El simulador sólo puede existir como herramienta interna claramente marcada `No productiva`.
- `VERI*FACTU` no debe ser una entrada primaria. Se muestra como estado de preparación dentro del cierre y de cumplimiento.
- `Cobros y conciliación` debe explicar por qué está deshabilitado/oculto cuando faltan transacciones o payouts y debe enlazar a `Importar datos`.
- Todo estado vacío explica qué falta y ofrece una acción directa.
- Todo formulario usa componentes del sistema de diseño, etiquetas asociadas, foco visible, errores accesibles y control de carga.
- Mantén el aspecto editorial oscuro existente, pero da prioridad a legibilidad, importes, contraste, tablas y estados.

---

## 5. ESTRUCTURA DE ENTREGA POR FASES

Ejecuta las fases en orden. No inicies la siguiente hasta que la anterior esté validada, confirmada y publicada en remoto.

### FASE 00 — Línea base, inventario verificable y contrato de ejecución

**Objetivo:** empezar desde un estado seguro, reproducible y documentado, sin cambiar todavía la semántica de negocio.

**Trabajo obligatorio**

1. Inspecciona ramas, remoto, estado del árbol, package manager, scripts, configuración de CI, migraciones y suite existente.
2. Lee los documentos enumerados en la sección 1 y coteja el estado real del código con el documento de redefinición.
3. Crea o actualiza:
   - `docs/product-redefinition-implementation-plan.md`: mapa trazable de requisito → fase → módulos → tests.
   - `docs/implementation-phase-log.md`: encabezado, convención de evidencias y entrada de Fase 00.
   - `docs/adr/` o el mecanismo ADR ya presente: registra al menos estas decisiones:
     - separar venta Shopify de evento financiero/payout;
     - KDP por defecto `NET_ROYALTY_ONLY`;
     - reglas fiscales seguras: `DETERMINED`, `REVIEW_REQUIRED`, `BLOCKED`;
     - período fiscal por rango real de fechas;
     - VERI*FACTU como preparación, no integración activa.
4. Identifica demos, mocks hardcodeados y rutas que muestran datos no persistidos. Regístralos con acción concreta: sustituir, retirar, migrar o mantener sólo para tests.
5. Añade/ajusta un test de regresión básico que confirme que el flag VERI*FACTU queda desactivado por defecto y no hay endpoint de envío activo.
6. No borres features existentes en esta fase salvo que expongan datos o hagan una afirmación de cumplimiento falsa; en ese caso, sustitúyelas por una comunicación honesta y documenta la decisión.

**Puerta de salida**

- La arquitectura de partida, déficits y fases están trazados en el repositorio.
- La suite base se ejecuta y su resultado real queda registrado.
- No hay cambios de esquema remotos ni despliegue.

**Commit y push obligatorio**

```text
feat(fiscal): phase 00 - baseline and execution contract
```

---

### FASE 01 — Shell de aplicación, navegación y sistema de diseño operativo

**Objetivo:** eliminar la sensación de prototipo desconectado y establecer la estructura visual de la aplicación antes de ampliar lógica fiscal.

**Trabajo obligatorio**

1. Crea un `AppShell` común para todas las rutas autenticadas y mueve la definición del sidebar a una fuente única de verdad, por ejemplo:
   - `apps/web/app/components/app-shell.tsx`
   - `apps/web/app/lib/navigation.ts`
2. Implementa navegación con estados `enabled`, `requiresData`, `advanced`, `comingSoon` y contador de pendientes cuando exista fuente real de datos.
3. Implementa las rutas objetivo o adaptadores/redirects seguros para:
   - `/imports`
   - `/sales/shopify`
   - `/settlements/kdp`
   - `/invoicing`
   - `/registers`
   - `/tax-periods`
   - `/tax-rules`
   - `/reconciliation`
   - `/settings`
4. Redirige rutas antiguas sin romper bookmarks:
   - `/operations` → `/sales/shopify`
   - `/vat-dossier` → `/tax-periods`
   - `/tax-engine` → `/tax-rules` o área interna no productiva
   - `/verifactu` → bloque de preparación documentado, sin acción de envío
5. Construye o formaliza en `packages/ui` componentes reutilizables:
   - `Button`, `TextField`, `SelectField`, `DateRangeField`, `CurrencyField`, `FileDropzone`, `DataTable`, `StatusPill`, `EmptyState`, `PageHeader`, `StepIndicator`, `ConfirmDialog`.
6. Sustituye controles HTML nativos sin estilo en las pantallas tocadas por componentes accesibles y consistentes.
7. Replantea `Inicio` para mostrar: pendientes de revisar, ventas facturables, liquidaciones KDP, estado del trimestre, incidencia bloqueante y, sólo si existe evidencia, conciliación.
8. Las páginas aún no conectadas deben tener estados vacíos honestos y acciones que guíen a importación/configuración, nunca datos de ejemplo presentados como reales.
9. Añade tests de componentes, navegación, redirects, estados de menú y al menos un E2E de navegación principal.

**No permitido**

- Simular información fiscal o dashboard con constantes hardcodeadas como si fueran datos de negocio.
- Ocultar capacidades sin explicar su requisito de activación.
- Añadir librerías UI pesadas sin una necesidad demostrable y revisión de dependencia.

**Puerta de salida**

- Todas las rutas autenticadas comparten shell.
- Los dos pantallazos problemáticos dejan de usar formularios nativos sin diseño.
- No hay links muertos ni módulos de demo vendidos como operativos.

**Commit y push obligatorio**

```text
feat(fiscal): phase 01 - app shell and product navigation
```

---

### FASE 02 — Fundaciones de datos y configuración fiscal mínima

**Objetivo:** disponer de la configuración y modelo mínimo necesarios para clasificar ventas y emitir documentos sin depender de constantes demo.

**Trabajo obligatorio**

1. Inspecciona el último número de migración y crea migraciones aditivas nuevas. No edites migraciones existentes.
2. Amplía el modelo de forma incremental para soportar como mínimo:

```text
legal_entities
  datos de emisor: nombre legal, nombre comercial opcional, NIF cifrado/minimizado,
  domicilio, país, moneda, contacto, régimen/estado de configuración

invoice_series
  tenant_id, legal_entity_id, prefijo, ejercicio, tipo documental, siguiente número,
  activa, reglas de bloqueo, unicidad e integridad transaccional

product_tax_profiles
  SKU o selector, naturaleza de producto, descripción de factura, código/tipo de IVA nacional,
  elegibilidad OSS, envío requerido, vigencia

channel_fiscal_policies
  canal, versión, fecha de vigencia, política KDP, nivel de revisión y atributos de emisor

fiscal_counterparties
  display/legal/company name, email, direcciones, clasificación B2B/B2C/UNKNOWN,
  NIF/VAT cifrado, estado de validación, fecha, fuente y evidencia

order_lines
  pedido, id externo opcional, SKU, título, unidades, precio, descuento, subtotal,
  impuesto reportado, perfil fiscal, snapshot limitado

tax_periods
  tipo (MONTH/QUARTER/YEAR), etiqueta, start_date, end_date, estado, cierre/reapertura

payouts / payout_allocations
  estructura preparada, sin exigir todavía importación real para el MVP de facturación
```

3. Añade a pedidos Shopify, si aún no existen, campos separados para:
   - país de facturación y de envío;
   - etiqueta/tasa/cuota de impuesto reportada por plataforma;
   - estados de pago, devolución y fiscal;
   - evidencia/archivo de origen;
   - estado de evidencia de tipo de cliente.
4. Añade a KDP campos que permitan expresar inequívocamente:
   - `NET_ROYALTY_ONLY`;
   - `GROSS_AND_COST_REVIEW_REQUIRED`;
   - tratamiento de coste embebido;
   - periodo, moneda, estado y vinculación futura a payout.
5. Implementa repositorios, puertos, servicios y controladores necesarios con aislamiento por tenant y auditoría. No uses acceso SQL directo fuera del patrón ya adoptado por el repo.
6. Rehace `Configuración` con secciones persistidas y editables:
   - entidad emisora;
   - series;
   - catálogo/perfiles fiscales;
   - canales y política KDP;
   - reglas/territorios con estado y vigencia;
   - datos de cliente y VAT;
   - usuarios/roles si el dominio existente lo permite;
   - estado de cumplimiento.
7. Define una comprobación de «configuración mínima lista» que bloquee emisión si faltan emisor, serie, perfil de producto o decisión fiscal requerida.
8. Elimina `demoSpainConfig` de todo recorrido productivo. Puede quedar sólo en test/fixture o simulador interno claramente aislado.
9. Añade tests de migración, repositorio, API y UI para:
   - tenant isolation;
   - unicidad de series;
   - protección de campos cifrados/minimizados;
   - validación de configuración mínima;
   - política KDP por defecto.

**Puerta de salida**

- Se puede crear y consultar configuración real de un tenant de prueba.
- No se puede emitir una factura sin los requisitos mínimos.
- Las migraciones pasan en base limpia de test.
- Ninguna pantalla productiva depende de tasas demo hardcodeadas.

**Commit y push obligatorio**

```text
feat(fiscal): phase 02 - fiscal configuration and data foundation
```

---

### FASE 03 — Arquitectura de importación, preview y confirmación segura

**Objetivo:** convertir el importador genérico en un flujo auditable por fuente, donde analizar no equivale a consolidar datos fiscales.

**Trabajo obligatorio**

1. Divide visualmente `Importar datos` en tres tarjetas o tabs claramente diferenciados:
   - **Shopify — Pedidos** (`CSV` de Orders).
   - **Shopify — Pagos y payouts** (`CSV` de Shopify Payments; puede quedar preparado/disabled si no se dispone aún de mapping suficiente).
   - **Amazon KDP — Regalías** (`XLSX` de KDP).
2. Implementa el ciclo explícito:

```text
selección de archivo
→ detección de formato y versión
→ análisis + preview
→ incidencias y decisiones requeridas
→ confirmación explícita
→ persistencia final + resultado + enlaces de trabajo
```

3. Distingue estados de importación:

```text
ANALYZED
PENDING_CONFIRMATION
IMPORTED
IMPORTED_WITH_ISSUES
REJECTED
```

4. Revisa y versiona el mapeo de columnas por conector. Conserva versión de parser/mapping y snapshot normalizado mínimo para trazabilidad.
5. Implementa validaciones comunes:
   - MIME, tamaño, estructura y columnas esperadas;
   - idempotencia por hash de archivo + identidad de fuente + versión de mapping;
   - moneda coherente;
   - errores por fila/línea con posición, código y acción sugerida;
   - no exponer el contenido completo de archivo con PII en respuestas.
6. Añade códigos de incidencia, como mínimo:

```text
VAT_NUMBER_MISSING_FOR_B2B_SIGNAL
CROSS_BORDER_B2C_REVIEW
PLATFORM_TAX_DIFFERS_FROM_FISCAL_DECISION
KDP_COST_DOUBLE_COUNT_RISK
PAYOUT_EVIDENCE_MISSING
ORDER_TOTAL_MISMATCH
REFUND_EXCEEDS_ORIGINAL
MAPPING_VERSION_UNSUPPORTED
```

7. Conserva la custodia del archivo original cuando se analice, pero no generes pedido, liquidación, documento ni cifra de cierre definitiva hasta que exista confirmación explícita.
8. Añade acciones de reintento/reproceso que sean idempotentes y auditadas.
9. Añade tests API/UI/E2E de preview, confirmación, rechazo, reintento e idempotencia.

**Puerta de salida**

- El usuario distingue claramente entre analizar y consolidar una importación.
- La importación no deja registros fiscales definitivos a medias.
- Los errores se pueden entender y resolver sin consultar logs internos.

**Commit y push obligatorio**

```text
feat(fiscal): phase 03 - import preview and confirmation workflow
```

---

### FASE 04 — Importadores Shopify y KDP con modelo correcto

**Objetivo:** importar los dos archivos de referencia de forma idempotente, comprensible y sin inventar información fiscal ausente.

**A. Shopify Orders CSV**

1. Modifica el conector para agrupar todas las filas con el mismo `Name` antes de crear/actualizar `commercial_orders`.
2. Persiste una orden y tantas `order_lines` como líneas comerciales haya.
3. Conserva separadamente:
   - subtotal, descuentos, envío si existe, impuestos reportados, total;
   - `Tax 1 Name`/etiqueta, tasa extraída cuando sea técnicamente posible y cuota reportada;
   - referencia de pago/estado comercial, sin afirmarlo como conciliación financiera completa;
   - fecha de pedido, fulfillment y refund de forma inequívoca.
4. Valida, con tolerancia monetaria explícita y documentada:

```text
suma de líneas + envío - descuentos + impuestos = total Shopify
```

Cuando no cuadre, crea incidencia; no corrijas cifras silenciosamente.
5. Si `Billing Company` está presente sin NIF/VAT suficiente, crea `VAT_NUMBER_MISSING_FOR_B2B_SIGNAL`. No clasifiques automáticamente como B2B.
6. Si es transfronterizo y no existe evidencia/configuración suficiente, crea `CROSS_BORDER_B2C_REVIEW` o el código más adecuado y marca la decisión fiscal como pendiente.
7. Los refunds se importan como evidencia de devolución y se vinculan a pedido/líneas originales. No permitas que superen importe o unidades de referencia.

**B. KDP XLSX**

1. Usa `Ventas combinadas` como fuente primaria de líneas; utiliza las hojas de eBook/impresión/Resumen únicamente para enriquecer y validar cuando proceda.
2. Implementa deduplicación entre hojas: una misma venta o línea no puede transformarse dos veces en regalía.
3. Persiste declaraciones/liquidaciones y líneas KDP separadas de las operaciones Shopify.
4. Extrae y conserva, como mínimo: periodo, tienda, formato, título, ASIN/ISBN cuando exista, tipo de transacción, unidades netas, precio informado, regalía, moneda, coste medio informado, fecha de pedido/regalía cuando exista.
5. Aplica por defecto `NET_ROYALTY_ONLY`:
   - la regalía neta es el ingreso de referencia;
   - el coste de producción/entrega se conserva como desglose;
   - no se crea gasto separado ni se suma a resultados de IVA/IRPF como una segunda partida.
6. Si la política cambia a `GROSS_AND_COST_REVIEW_REQUIRED`, bloquea el cierre o la incorporación fiscal hasta contar con aprobación/evidencia requerida; nunca hagas ese cambio implícitamente.
7. KENP, ajustes, refunds o datos incompletos deben quedar identificados por tipo y, cuando falte regla, en revisión. No les asignes una fiscalidad ficticia.

**Pruebas de aceptación obligatorias**

- Un pedido Shopify con tres líneas genera un pedido y tres `order_lines`.
- Reimportar el mismo archivo no duplica entidades.
- Un refund parcial no supera el original.
- El impuesto de plataforma se conserva aunque la decisión interna sea otra.
- Un pedido UE sin VAT no se etiqueta B2B automáticamente.
- El coste KDP no se registra como gasto si se usa `NET_ROYALTY_ONLY`.
- Dos hojas KDP que representan la misma venta no duplican regalías.
- Los dos ficheros de ejemplo se importan de principio a fin mediante tests repetibles, usando datos anonimizados/fixtures permitidos.

**Puerta de salida**

- El usuario puede importar ambos tipos de archivo, comprender el resultado y navegar a ventas/liquidaciones e incidencias.
- No hay necesidad de evento financiero para que una venta Shopify exista y sea facturable.

**Commit y push obligatorio**

```text
feat(fiscal): phase 04 - shopify and kdp import normalization
```

---

### FASE 05 — Ventas Shopify, decisiones fiscales y facturación/rectificaciones

**Objetivo:** resolver el flujo operativo principal: una venta Shopify clasificable, facturable y rectificable con trazabilidad completa.

**Trabajo obligatorio**

1. Implementa `Ventas Shopify` como lista y detalle basado en `commercial_orders` + `order_lines`, no en `canonical_operations` como requisito previo.
2. El detalle de cada venta debe mostrar:

```text
pedido, fechas, líneas, comprador, país de facturación/envío,
IVA reportado por Shopify, estado de evidencia, decisión fiscal,
incidencias, factura/rectificativa asociada, eventos de pago si existen,
archivo origen y auditoría
```

3. Implementa filtros: periodo, estado de facturación, país, B2B/B2C/UNKNOWN, categoría de producto, refund, incidencia.
4. Implementa acciones auditadas:
   - revisar;
   - solicitar datos de factura;
   - confirmar clasificación;
   - emitir;
   - emitir rectificativa;
   - excluir con motivo;
   - aprobar override según rol.
5. Implementa un motor de decisión persistido, versionado y explicable:

```text
DETERMINED
REVIEW_REQUIRED
BLOCKED
```

Cada decisión debe contener: regla/versionado, fecha de vigencia, entrada usada, evidencia ausente, resultado, explicación legible y actor/fecha de override cuando corresponda.

6. Prohíbe automatismos inseguros:
   - `Billing Company`, VAT=0, país extranjero o email corporativo no bastan para B2B;
   - si la regla internacional no está configurada y respaldada por fuente oficial vigente, el resultado debe ser `REVIEW_REQUIRED` o `BLOCKED`;
   - no uses el IVA de Shopify como verdad fiscal final;
   - no actives OSS/inversión del sujeto pasivo automáticamente por heurística.
7. Rehaz facturación:
   - cola de «Pendientes de emitir», «Emitidas», «Rectificativas», «Solicitudes de factura» y «Borradores/anuladas» según política;
   - documento sólo puede originarse en venta/ajuste registrado, salvo factura manual explícita, con permiso y auditoría;
   - bloquea emisión si falta entidad emisora, serie, decisión determinada o datos obligatorios;
   - la numeración debe ser atómica/correlativa por serie bajo concurrencia;
   - un documento emitido queda inmutable;
   - un refund sobre factura emitida genera rectificativa vinculada, no edición;
   - PDF con líneas, descuentos, totales, tipo documental, referencia de origen, decisión aplicada y datos válidos disponibles;
   - vista de impresión y descarga autenticada.
8. No prometas validez jurídica global. Muestra estados de «borrador», «requiere revisión» y «emitida» según datos/configuración, sin afirmar cumplimiento normativo no verificado.
9. Añade tests de unidad, integración y E2E para:
   - venta nacional bien configurada → cola → factura;
   - refund total/parcial → rectificativa vinculada;
   - emisión bloqueada por configuración faltante;
   - series correlativas bajo intentos concurrentes;
   - inmutabilidad;
   - aislamiento por tenant;
   - PDF no expone datos de otro tenant;
   - caso UE sin VAT → no automática, estado revisión.

**Puerta de salida**

- Una venta nacional de prueba puede completar el recorrido de importación, decisión, emisión y descarga.
- Un refund genera una rectificativa trazable.
- Un caso transfronterizo/evidencia insuficiente no termina en una factura automática equivocada.

**Commit y push obligatorio**

```text
feat(fiscal): phase 05 - shopify sales and controlled invoicing
```

---

### FASE 06 — Libros registro, períodos reales y cierres fiscales descargables

**Objetivo:** convertir datos de ventas y regalías en una preparación trimestral trazable para revisión, sin afirmar presentación automática de impuestos.

**Trabajo obligatorio**

1. Implementa `Libros registro` con filtros y exportación CSV/XLSX para:
   - facturas expedidas;
   - facturas rectificativas;
   - ingresos/liquidaciones KDP;
   - gastos externos registrados manualmente con evidencia;
   - incidencias que afectan a IVA/IRPF.
2. No mezcles el coste informativo KDP con gastos externos/deducibles cuando la política sea `NET_ROYALTY_ONLY`.
3. Implementa `Cierres fiscales` con selector de año/trimestre y backend basado en `start_date`/`end_date` reales. No uses un campo libre que compare `2026-T3` con `YYYY-MM`.
4. Crea un checklist por período:

```text
[ ] importaciones confirmadas
[ ] ventas Shopify clasificadas
[ ] facturas y rectificativas emitidas
[ ] decisiones fiscales determinadas o aprobadas
[ ] incidencias bloqueantes resueltas/aprobadas
[ ] liquidaciones KDP revisadas
[ ] libros generados
[ ] borrador IVA revisado
[ ] OSS/Modelo 369 sólo cuando aplique y esté configurado
[ ] período cerrado y paquete descargado
```

5. Implementa cifras de apoyo, no una presentación tributaria:
   - IVA repercutido nacional por tipo;
   - IVA soportado deducible sólo con evidencias registradas;
   - resultado preliminar / datos de apoyo para Modelo 303;
   - candidatos OSS y operaciones UE pendientes de revisión;
   - operaciones fuera de ámbito/exportación con evidencia;
   - ingresos KDP separados de facturas directas.
6. Antes de cerrar, bloquea incidencias según severidad configurada. Permite aprobación excepcional sólo a rol autorizado, con motivo/auditoría.
7. Implementa expediente/paquete ZIP con:
   - libros CSV/XLSX;
   - resumen del período;
   - relación de facturas y rectificativas;
   - liquidaciones KDP;
   - incidencias y overrides;
   - estado de preparación VERI*FACTU;
   - manifest o índice con versión y hashes de contenido, cuando sea compatible con el diseño existente.
8. Añade endpoint de descarga autenticado, con validación de tenant y permisos. No devuelvas un `storageKey` crudo. Usa streaming controlado o URL temporal firmada; documenta caducidad/autoridad.
9. Implementa cierre/reapertura auditada y evita modificar documentos/cálculos cerrados sin proceso explícito.
10. Añade tests para:
   - trimestre resuelto a fechas correctas;
   - dossier no vacío para datos de prueba;
   - cada total rastreable a documento, decisión, línea KDP o incidencia;
   - descarga rechazada para tenant/rol incorrecto;
   - cierre bloqueado por incidencia;
   - reapertura auditada.

**Puerta de salida**

- Un trimestre de prueba se puede revisar, cerrar y descargar como paquete trazable.
- El producto habla de «borrador de cierre / datos de apoyo para Modelo 303», nunca de declaración presentada.

**Commit y push obligatorio**

```text
feat(fiscal): phase 06 - registers and fiscal close workflow
```

---

### FASE 07 — Cobros, payouts y conciliación real sin bloquear fiscalidad

**Objetivo:** añadir control financiero posterior sin convertirlo en requisito previo de facturación o cierre fiscal básico.

**Trabajo obligatorio**

1. Implementa/parcializa el importador de Shopify Payments/transactions sólo tras identificar un formato real y versionarlo. No inventes el mapeo.
2. Usa `financial_events`, `payouts` y `payout_allocations` para representar:
   - cobro;
   - refund;
   - fee;
   - neto;
   - payout;
   - estado y evidencia de origen.
3. Implementa `Cobros y conciliación` únicamente cuando haya evidencia importada. Sin ella, muestra explicación y CTA hacia la importación correcta.
4. Implementa matching asistido con estados claros y acciones auditadas:
   - aceptar;
   - rechazar;
   - match manual;
   - dividir;
   - agrupar;
   - ignorar temporalmente con motivo.
5. Implementa conciliación de payout contra conjunto de eventos. La conciliación bancaria queda fuera de alcance salvo que exista extractor/formato real y prueba de usuario.
6. Para KDP, permite registrar o importar el abono de la liquidación y vincularlo de forma manual/asistida; no trates el informe de regalías como extracto bancario.
7. Ninguna ausencia de payout puede invalidar o borrar una factura emitida. Puede generar una incidencia de control, no una modificación retroactiva del documento fiscal.
8. Añade tests de matching, manual override, aislamiento de tenant, idempotencia y preservación de facturas.

**Puerta de salida**

- El usuario distingue entre venta facturada, cobrada, devuelta, pendiente y liquidada por plataforma.
- La conciliación aporta valor sin bloquear el flujo fiscal esencial.

**Commit y push obligatorio**

```text
feat(fiscal): phase 07 - payments and reconciliation controls
```

---

### FASE 08 — Preparación VERI*FACTU y endurecimiento final de cumplimiento

**Objetivo:** dejar un marco de preparación verificable, sin activar integración real ni prometer cumplimiento hasta que los requisitos, pruebas y credenciales sean completos.

**Trabajo obligatorio**

1. Revisa la normativa oficial vigente antes de modificar reglas o textos de VERI*FACTU. Guarda en la documentación fecha de consulta, fuente primaria y alcance; no copies reglas de fuentes secundarias.
2. Mantén `VERIFACTU_ENABLED=false` de forma predeterminada y comprueba que ningún endpoint/proceso externo se active sin configuración explícita y tests de seguridad.
3. Implementa una matriz de readiness real dentro de `Cierres fiscales`/`Cumplimiento`:
   - datos de emisor;
   - series y numeración;
   - inmutabilidad/rectificación;
   - cadena de integridad;
   - evidencias y auditoría;
   - requisitos técnicos pendientes;
   - entorno sandbox;
   - adaptador real;
   - observabilidad/reintentos;
   - revisión experta necesaria.
4. Si el repositorio ya contiene cadena de integridad, revísala y cúbrela con tests de alteración/tampering. No la llames VERI*FACTU completo sólo por existir.
5. Si se añade QR, formato, adaptador o comunicación normativa, mantenlo deshabilitado salvo que la fuente oficial y las pruebas de sandbox aplicables estén disponibles. De lo contrario, documenta el bloqueo técnico/regulatorio.
6. Revisa seguridad de descargas, PII, logging, rutas de admin, CORS/cookies, control de secretos y permisos de mutaciones sensibles.
7. Revisa accesibilidad básica y E2E de los recorridos principales.
8. Actualiza la documentación operativa, seguridad, limitaciones, matriz de cumplimiento y README para que ninguna afirmación sea engañosa.

**Puerta de salida**

- La plataforma conserva un estado de preparación honesto y trazable.
- No hay activación accidental de integración fiscal externa.
- El producto final cumple todos los criterios técnicos y de seguridad disponibles, y limita explícitamente aquello que requiera revisión normativa/asesoría.

**Commit y push obligatorio**

```text
feat(fiscal): phase 08 - compliance readiness and final hardening
```

---

## 6. REGLAS DE IMPLEMENTACIÓN TRANSVERSALES

### 6.1 API, contratos y errores

- Versiona y valida con Zod los DTO de entrada, query params y respuestas relevantes.
- No uses `as` para aceptar de forma silenciosa valores externos donde Zod pueda validar.
- Usa códigos de error estables y mensajes de usuario claros.
- Mantén paginación, filtros y ordenación explícitos, protegidos por tenant.
- Documenta endpoints nuevos/alterados en OpenAPI y `docs/api.md`.
- Cuando una operación sea potencialmente repetible desde UI o importación, usa claves de idempotencia apropiadas y tests de carrera.

### 6.2 Datos financieros y precisión

- No uses `float` binario para importes monetarios ni porcentajes fiscales.
- Conserva moneda original y cuantías normalizadas según la convención existente del repo.
- Documenta la estrategia de redondeo por línea/documento y cúbrela con tests.
- No «arregles» discrepancias de totales redondeando silenciosamente: crea incidencia si supera tolerancia documentada.

### 6.3 Auditoría y explicabilidad

Para cualquier cálculo o decisión de alto impacto debe poder responderse:

```text
qué dato se usó,
qué regla y versión se aplicó,
qué evidencia faltaba,
quién confirmó o anuló el resultado,
cuándo ocurrió,
y cuál fue el documento/importación de origen.
```

### 6.4 Backwards compatibility

- Conserva las rutas antiguas mediante redirect cuando haya sustitución de navegación.
- No rompas contratos públicos existentes sin versionarlos/deprecarlos y cubrirlos con tests.
- Las tablas y modelos existentes se amplían de forma aditiva; no elimines campos con datos sin migración/plan de transición.

### 6.5 Dependencias

- No instales dependencias por comodidad si el stack actual resuelve el problema.
- Si añades una dependencia, documenta por qué, licencia, tamaño/riesgo y alternativa descartada.
- Mantén Node 22 y la configuración pnpm/turbo actual salvo que exista un motivo probado para cambiarla.

---

## 7. CIERRE Y REPORTE FINAL

Después de completar y publicar la Fase 08, ejecuta una verificación final completa:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e   # si existe entorno local/configuración disponible
```

También debes:

1. revisar `git status --short` y confirmar que no quedan cambios sin confirmar;
2. confirmar que todos los commits de fase están en `origin/feat/anclora-fiscal-product-redefinition`;
3. revisar migraciones, secrets y `.gitignore` para garantizar que no se ha publicado información sensible;
4. revisar las principales páginas con el flujo real de seed/fixtures;
5. actualizar `docs/implementation-phase-log.md` y un `docs/final-verification-report.md` con resultados veraces.

El informe final del agente debe incluir, en este formato:

```markdown
# Anclora Fiscal — Informe de ejecución

## Rama y commits
| Fase | Commit | Push | Objetivo | Estado |
|---|---|---|---|---|

## Funcionalidad implementada
- Shopify:
- KDP:
- Facturación:
- Libros y cierres:
- Conciliación:
- Cumplimiento/VERI*FACTU:

## Calidad ejecutada
| Comprobación | Resultado | Observaciones |
|---|---|---|

## Migraciones
| Migración | Propósito | Ejecutada sólo en test/local | Estado |
|---|---|---|---|

## Riesgos y límites que siguen abiertos
- Sólo riesgos reales no resueltos.
- Indicar si requieren asesoría fiscal, fuente oficial, datos de Shopify/KDP o una decisión del propietario.

## Instrucciones de revisión manual
1. …
2. …

## Siguiente paso recomendado
- Crear PR desde `feat/anclora-fiscal-product-redefinition` hacia la rama base detectada.
```

No abras, no fusiones ni despliegues una PR a producción salvo instrucción explícita. El objetivo de esta ejecución es una rama validada, publicada, revisable y lista para PR.

---

## 8. DEFINICIÓN DE TERMINADO GLOBAL

La tarea sólo se considera terminada si se cumplen todos estos puntos:

- [ ] Cada fase tiene commit atómico y `push` confirmado a la rama de trabajo.
- [ ] La navegación refleja el trabajo real: Importar datos, Ventas Shopify, Liquidaciones KDP, Facturas, Libros registro, Cierres fiscales, Reglas y decisiones, Cobros/conciliación y Configuración.
- [ ] La UI no presenta demos o simuladores como información fiscal real.
- [ ] La configuración mínima de emisor, series, catálogo y políticas existe y bloquea emisión si falta.
- [ ] Los imports Shopify y KDP tienen preview, confirmación, incidencias e idempotencia.
- [ ] Shopify soporta pedidos multi-línea y no exige evento de pago para facturar.
- [ ] KDP usa `NET_ROYALTY_ONLY` por defecto y no duplica coste/ingreso.
- [ ] Facturas y rectificativas son correlativas, auditables, descargables e inmutables tras emisión.
- [ ] Libros y cierres usan intervalos trimestrales reales, producen paquete descargable protegido y rastrean totales a origen.
- [ ] Conciliación aparece como control financiero posterior y no bloquea fiscalidad básica.
- [ ] VERI*FACTU sigue desactivado y sólo existe como preparación honesta salvo activación futura validada.
- [ ] Seguridad, privacidad, aislamiento por tenant, tests, documentación y calidad han sido verificados de forma real.
