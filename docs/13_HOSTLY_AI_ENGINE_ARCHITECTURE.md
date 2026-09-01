# Hostly AI Engine — Architecture

> Diseño de alto nivel del motor de inteligencia artificial de Hostly. Documento de arquitectura; **no es especificación de implementación**.

**Estado:** borrador arquitectónico oficial
**Versión:** 0.1
**Autoridad documental:** nivel 2 (IA / plataforma)
**Ámbito:** pipeline de importación, enriquecimiento, validación y aprendizaje multi-módulo
**Subordinado a:** `00_HOSTLY_PRODUCT_BIBLE.md`, `11_HOSTLY_ENGINEERING_CONSTITUTION.md`
**Relacionado con:** `06_HOSTLY_AI_GUIDELINES.md`, importación de carta existente (`lib/server/menu-imports/`)

---

# 1. Visión

## 1.1 Qué es Hostly AI Engine

**Hostly AI Engine** es la plataforma interna que convierte entradas heterogéneas — PDFs, fotos, QR, texto y, en el futuro, hojas de cálculo, documentos, webs, APIs y voz — en **datos operativos estructurados** listos para revisión humana y persistencia en Hostly.

No es un chatbot pegado a cada pantalla. Es un **motor compartido** con:

- un pipeline único;
- contratos de dominio por módulo (Carta, Inventario, Compras…);
- validación humana obligatoria antes de escribir en Firestore;
- trazabilidad de origen a destino;
- aislamiento estricto por `restaurantId`.

## 1.2 Por qué será el núcleo de la IA de Hostly

Hoy existen capacidades IA **dispersas** (importación de carta, OCR, enriquecimiento puntual, evaluación shadow). Sin un motor común, cada módulo repetiría:

- subida de archivos;
- extracción;
- prompts ad hoc;
- estados de job;
- preview y publish;
- auditoría.

Centralizar en **AI Engine** permite:

- una sola forma de pensar “importar / sugerir / validar / publicar”;
- reutilizar OCR, reglas, validadores y UX de preview;
- medir calidad y coste de IA de forma unificada;
- evolucionar proveedores (OCR, LLM) sin rehacer Carta, Inventario o Compras.

## 1.3 Qué problemas resuelve

| Problema actual | Cómo lo resuelve el motor |
| --- | --- |
| Onboarding lento (carta, productos, proveedores) | Importación guiada con preview en minutos |
| Trabajo manual repetitivo | Extracción + sugerencias + reglas de negocio |
| IA duplicada por módulo | Pipeline y modelos conceptuales compartidos |
| Miedo a “la IA inventa datos” | Validación humana + trazabilidad OCR → ítem |
| Multi-tenant frágil | Todo job acotado a `restaurantId` y rules |
| Imposible mejorar sin romper | Versionado de pipeline, prompts y publicadores |

**Precursor en código actual:** el pipeline de `menu-imports` (OCR → parse → enrich → validate → publish) es la **semilla funcional** de Fase 1; el AI Engine lo **generaliza**, no lo reemplaza de golpe.

---

# 2. Objetivos

| Objetivo | Métrica / criterio de éxito |
| --- | --- |
| **Onboarding en menos de 10 minutos** | Restaurante nuevo: carta base importada, revisada y publicada en una sesión guiada |
| **Reducir trabajo manual** | ≥ 70 % de ítems aceptados sin edición profunda (objetivo por dominio, medido) |
| **Reutilización por todos los módulos** | Nuevo dominio añade *adapter* + *publisher*, no un pipeline nuevo |
| **Arquitectura extensible** | Nuevas entradas (Excel, voz) y salidas (escandallos) sin cambiar el núcleo del pipeline |

Objetivos **no** incluidos en v1 del motor:

- automatización sin supervisión humana en datos económicos o de stock;
- IA conversacional generalista sustituyendo TPV/KDS;
- entrenamiento de modelos propietarios.

---

# 3. Principios

### Una sola plataforma

Un **AI Engine Core** con contratos estables. Los módulos de producto consumen capacidades, no implementan pipelines paralelos.

### Múltiples entradas

Mismo pipeline conceptual; **extractors** intercambiables por MIME, origen (upload, QR, URL) o API.

### Múltiples salidas

Mismo flujo hasta validación; **publishers** específicos por dominio (producto, categoría, línea de compra, ingrediente de escandallo).

### Validación humana antes de guardar

Ningún write masivo a Firestore operativo sin **preview explícito** y acción confirmada por usuario autorizado. La IA propone; el restaurante dispone.

### Trazabilidad

Cada ítem normalizado debe poder responder: *¿de qué documento, línea OCR o regla proviene?* Logs de pipeline, versiones de prompt y decisiones de usuario conservadas para auditoría.

### Multi-restaurante

Todo `ImportJob`, archivo en Storage y resultado publicado lleva `restaurantId`. Rules y Admin SDK validan tenant en cada fase. Nunca mezclar corpus de aprendizaje entre restaurantes sin anonimización explícita y opt-in.

---

# 4. Entradas soportadas

## 4.1 Fase 1 (MVP del motor)

| Entrada | Casos de uso | Notas |
| --- | --- | --- |
| **PDF** | Carta impresa, lista de precios | Texto embebido + OCR fallback |
| **Imagen** | Foto de carta, pizarra, captura | OCR + layout visual |
| **QR** | Menú online, PDF enlazado | Resolución URL → fetch → PDF/imagen/HTML |
| **Texto** | Pegado manual, WhatsApp, nota | Parser directo sin OCR |

## 4.2 Fase futura

| Entrada | Casos de uso |
| --- | --- |
| **Excel** | Catálogo proveedor, inventario inicial |
| **Word** | Fichas técnicas, recetas documentadas |
| **Web** | Scraping controlado de carta pública |
| **APIs** | Integraciones POS, proveedores, Glovo-style |
| **Voz** | Dictado de pedido a proveedor, notas de sala (exploratorio) |

Cada entrada se registra como `DocumentSourceType` en el modelo conceptual; el core del pipeline no cambia.

---

# 5. Pipeline conceptual

```text
Entrada → Extracción → Normalización → Clasificación → Enriquecimiento IA
       → Validación → Preview → Persistencia → Aprendizaje
```

## 5.1 Entrada

- Recepción del artefacto (upload, QR resolve, paste).
- Validación de tamaño, tipo MIME, límites por tenant.
- Almacenamiento temporal en Firebase Storage bajo path tenant.
- Creación de `ImportJob` en estado `received`.

**Salida de fase:** `Document` + referencia Storage + metadatos (`restaurantId`, `domain`, `sourceType`).

## 5.2 Extracción

- Selección de **extractor** según tipo: PDF text, OCR imagen, OCR PDF, fetch URL.
- Producción de **raw payload**: texto plano, líneas con layout, tablas detectadas, imágenes recortadas.
- Timeouts, reintentos y diagnóstico de fallo (ilegible, vacío, corrupto).

**Salida de fase:** `ExtractionResult` (texto, layout, confidence, warnings).

## 5.3 Normalización

- Limpieza de encoding, saltos de línea, ruido (teléfonos, IVA, legal).
- Segmentación en bloques: secciones, filas, pares nombre–precio.
- Unificación de unidades (€, kg, L) y formatos numéricos EU.

**Salida de fase:** lista de `NormalizedItem` candidatos con campos crudos tipados.

## 5.4 Clasificación

- Asignación de **dominio semántico** dentro del módulo: producto venta, categoría, ingrediente, línea compra, proveedor…
- Uso combinado de **reglas** (regex, heurísticas Hostly) y **LLM ligero** cuando las reglas no bastan.
- Detección de duplicados contra catálogo existente del restaurante.

**Salida de fase:** `ClassifiedItem` con `entityType`, `targetModule`, `confidence`.

## 5.5 Enriquecimiento IA

- LLM **opcional y acotado**: completar categoría, `station`, alérgenos sugeridos, descripción — siempre anclado a evidencia OCR.
- Prompts versionados por dominio; temperatura baja; salida JSON validada por schema.
- Flag `needsReview` cuando evidencia insuficiente.

**Salida de fase:** `EnrichedItem` + `Suggestion[]` (cambios propuestos no aplicados).

## 5.6 Validación

- Capa **determinista**: reglas de negocio Hostly (precio > 0, nombre no vacío, categoría no descriptiva genérica).
- Validación **contra OCR**: el nombre publicado debe ser compatible con texto fuente (patrón ya usado en carta).
- Validación **contra destino**: ¿existe categoría? ¿conflicto SKU? ¿permiso rol?

**Salida de fase:** `ValidationReport` por ítem y global; ítems `blocked` | `review` | `ready`.

## 5.7 Preview

- Agregación en vista de revisión humana (UI futura; contrato de datos aquí).
- Diff contra catálogo actual: crear / actualizar / omitir / fusionar.
- Warnings operativos (KDS station, duplicados, precios atípicos).

**Salida de fase:** `ImportPreview` listo para interacción usuario.

## 5.8 Persistencia

- Solo tras **acción explícita** del usuario (publicar seleccionados, merge aprobado).
- **Publisher** de dominio ejecuta writes idempotentes en Firestore.
- Job pasa a `published` | `partially_published` | `failed` con detalle por ítem.

**Salida de fase:** `ImportResult` con IDs creados/actualizados.

## 5.9 Aprendizaje

- Registro de aceptaciones, rechazos y ediciones manuales post-preview.
- Métricas agregadas por dominio (no reentrenamiento automático en v1).
- Corpus anonimizado opt-in para mejorar parsers (futuro).
- Ajuste de reglas y umbrales documentado en `04_DECISIONS_LOG`.

**Salida de fase:** `LearningEvent[]` — alimenta calidad, no escribe en operación sin revisión.

---

# 6. Módulos reutilizadores

El motor expone **Domain Adapters**. Cada módulo implementa:

| Pieza | Responsabilidad |
| --- | --- |
| `DomainProfile` | Tipos de entidad, campos obligatorios, reglas |
| `ClassifierHints` | Señales para clasificación |
| `EnrichmentPolicy` | Qué puede inferir la IA vs prohibido |
| `Publisher` | Writes Firestore idempotentes |
| `PreviewMapper` | Cómo mostrar diff en UI |

## 6.1 Carta (Fase 1 — referencia)

- Entrada: PDF/imagen/QR/texto de menú.
- Salida: productos de venta + secciones.
- Precursor: pipeline `menu-imports` actual.

## 6.2 Productos

- Reutiliza extracción carta o Excel futuro.
- Publica en `restaurants/{id}/products` con `source: central`.
- Valida duplicados, station, preparationArea.

## 6.3 Categorías

- Extraídas como secciones del documento o sugeridas por IA.
- Publisher crea/mapea categorías carta antes de productos.

## 6.4 Familias

- Clasificación secundaria (bebida, vino, postre) desde reglas + LLM.
- Enlaza con familias Hostly existentes (`load-hostly-product-families`).

## 6.5 Escandallos (Fase 2)

- Entrada: recetas Word/PDF, Excel ingredientes.
- Salida: BOM, cantidades, unidades, coste teórico.
- Validación estricta: unidades convertibles, ingredientes existentes o propuestos.

## 6.6 Inventario (Fase 2)

- Entrada: Excel inventario inicial, foto albarán.
- Salida: stock inicial, ubicaciones, unidades.
- Requiere confirmación por impacto económico.

## 6.7 Compras (Fase 3)

- Entrada: PDF factura proveedor, Excel pedido.
- Salida: líneas de compra, matching producto proveedor.
- Idempotencia crítica (no duplicar recepciones).

## 6.8 Proveedores (Fase 2)

- Entrada: CSV/Excel contactos, factura (NIF, nombre).
- Salida: ficha proveedor, alias, condiciones.

## 6.9 Recetas

- Subdominio escandallo + enriquecimiento IA de pasos (futuro).
- IA nunca sustituye validación de alérgenos legales sin revisión.

## 6.10 Reservas (futuro)

- Entrada: email/texto de solicitud reserva.
- Salida: borrador reserva + sugerencia mesa.
- Alto riesgo UX; fase tardía.

```text
                    ┌─────────────────┐
                    │  AI Engine Core │
                    │    (pipeline)   │
                    └────────┬────────┘
         ┌──────────┼──────────┼──────────┐
         ▼          ▼          ▼          ▼
     Carta    Inventario   Compras   Reservas
   Publisher   Publisher  Publisher  Publisher
```

---

# 7. Modelo conceptual

> Objetos lógicos — **sin código**. Nombres orientativos para implementación futura.

## 7.1 Documento y job

| Objeto | Descripción |
| --- | --- |
| **Document** | Artefacto fuente (archivo o texto) con hash, MIME, tamaño, Storage path |
| **DocumentSourceType** | `pdf` \| `image` \| `qr` \| `text` \| `excel` \| … |
| **ImportJob** | Unidad de trabajo async; estados: `received` → `extracting` → … → `published` / `failed` / `cancelled` |
| **ImportDomain** | `carta` \| `productos` \| `inventario` \| `compras` \| … |
| **PipelineVersion** | Versión semver del pipeline + extractors + prompts usados |

## 7.2 Extracción y normalización

| Objeto | Descripción |
| --- | --- |
| **ExtractionResult** | Texto OCR, layout lines, tablas, metadata OCR |
| **ExtractedItem** | Bloque crudo detectado (línea, fila tabla, párrafo) |
| **NormalizedItem** | Campos tipados pre-clasificación (nombre, precio, unidad, sección…) |
| **LayoutLine** | Texto + bbox + orden lectura (herencia layout carta) |

## 7.3 Clasificación y enriquecimiento

| Objeto | Descripción |
| --- | --- |
| **ClassifiedItem** | NormalizedItem + `entityType` + `targetCollection` |
| **Suggestion** | Propuesta IA o regla: campo, valor anterior, valor sugerido, razón, evidencia |
| **EnrichmentBundle** | Conjunto de suggestions aplicables a un ítem |
| **ConfidenceScore** | 0–1 por campo y global; umbrales configurables por dominio |

## 7.4 Validación y preview

| Objeto | Descripción |
| --- | --- |
| **Validation** | Resultado regla individual: `pass` \| `warn` \| `block` + código |
| **ValidationReport** | Agregado por ítem y job |
| **ImportPreview** | Snapshot listo para UI: ítems, diffs, acciones disponibles |
| **PreviewAction** | `create` \| `update` \| `skip` \| `merge` por ítem |
| **UserDecision** | Aceptación/edición/rechazo por ítem en preview |

## 7.5 Resultado y aprendizaje

| Objeto | Descripción |
| --- | --- |
| **ImportResult** | Resumen post-publish: counts, IDs, errores |
| **PublishedRecord** | Trazabilidad ítem publicado → job → línea OCR |
| **LearningEvent** | Evento anonimizable: regla fallida, corrección usuario, parser miss |
| **AuditEntry** | Quién, cuándo, qué job, qué cambió en Firestore |

## 7.6 Relaciones (simplificado)

```text
ImportJob 1──1 Document
ImportJob 1──* ExtractedItem
ExtractedItem *──1 NormalizedItem (evolución)
NormalizedItem 1──1 ClassifiedItem
ClassifiedItem 1──* Suggestion
ClassifiedItem 1──1 ValidationReport
ImportJob 1──1 ImportPreview
ImportPreview 1──* UserDecision
ImportJob 1──1 ImportResult
ImportResult 1──* PublishedRecord
ImportJob 1──* LearningEvent
```

---

# 8. Interacción con IA

## 8.1 OCR

- **Rol:** verdad primaria de lo visible; ancla anti-alucinación.
- **Uso:** imágenes, PDFs escaneados, layout comercial.
- **No sustituye:** reglas de negocio ni permisos.

## 8.2 LLM

- **Rol:** estructurar, clasificar, completar campos **solo con evidencia**; redactar sugerencias.
- **Uso:** enriquecimiento, clasificación ambigua, mapeo categoría/familia.
- **Restricciones:** JSON schema, temperatura baja, prompts versionados, timeout, cost cap por job.

## 8.3 Reglas

- **Rol:** determinismo, bajo coste, cumplimiento Hostly (stations, categorías prohibidas, formatos EU).
- **Ejemplos:** parser precio `12,50`, detección sección PIZZAS, filtro legal boilerplate.
- **Prioridad:** reglas > LLM cuando hay conflicto en campos críticos (precio, nombre).

## 8.4 Validaciones

- Capa híbrida: reglas + fuzzy match OCR + constraints Firestore (destino existe).
- Separadas de enriquecimiento: **validar no es generar**.

## 8.5 Prompts

- Almacenados como **plantillas versionadas** (`PromptTemplate`), no strings inline dispersos.
- Variables: dominio, OCR snippet, schema salida, idioma, políticas Hostly.
- Cada job registra `promptVersion` en auditoría.
- **No elegir proveedor en este documento:** abstracción `LLMProvider` con adaptadores (OpenAI, Anthropic, Google, Azure…).

```text
         ┌──────────┐
         │   OCR    │──evidencia──┐
         └──────────┘             │
         ┌──────────┐             ▼
         │  Reglas  │──────► Validación final
         └──────────┘             ▲
         ┌──────────┐             │
         │   LLM    │──sugerencias┘
         └──────────┘
```

---

# 9. Firestore

> Diseño conceptual de persistencia. **No implementar aún.**

## 9.1 Qué debería persistirse (duradero)

Bajo `restaurants/{restaurantId}/…` o colección top-level con `restaurantId`:

| Entidad | Retención | Motivo |
| --- | --- | --- |
| **ImportJob** | 90–365 días | Auditoría, reintentos, soporte |
| **ImportResult** | Largo | Trazabilidad publicación |
| **PublishedRecord** | Largo | Enlace producto ↔ origen |
| **AuditEntry** | Largo | Compliance, debug |
| **UserDecision** snapshot | Asociado al job | Reproducir qué aceptó el usuario |
| **PromptTemplate** refs | Global config | Versionado (puede vivir en código + metadata) |

Campos mínimos job: `restaurantId`, `createdBy`, `domain`, `status`, `pipelineVersion`, `documentRef`, timestamps, `errorCode`.

## 9.2 Qué debería ser temporal

| Dato | Dónde | TTL |
| --- | --- | --- |
| Archivo fuente raw | Storage `restaurants/{id}/ai-imports/{jobId}/…` | 30–90 días |
| OCR intermedio grande | Storage o subdoc blob | 30 días |
| Preview drafts no publicados | Firestore draft / session | 7–30 días |
| Logs diagnóstico verbose | Cloud Logging / Storage debug | 14–30 días |
| Cache LLM idempotente | Memoria / Redis futuro | horas |

## 9.3 Qué no persistir

- Prompts completos con PII innecesaria en logs públicos.
- Corpus OCR de un restaurante en bucket compartido sin anonimizar.
- Resultados LLM crudos sin job asociado y TTL.

## 9.4 Índices previstos

- `ImportJob` por `restaurantId` + `createdAt` desc
- `ImportJob` por `restaurantId` + `status`
- `PublishedRecord` por `restaurantId` + `targetEntityId`

---

# 10. Seguridad

## 10.1 Privacidad

- Datos de carta/recetas son **propiedad del restaurante**.
- Minimizar envío a LLM: solo snippets necesarios, no documentos completos si basta OCR text.
- Política de retención y borrado bajo solicitud del tenant (futuro GDPR operativo).
- No usar datos de un tenant para sugerir a otro sin anonimización y base legal.

## 10.2 Trazabilidad

- Cadena: `Document` → `ExtractedItem` → `UserDecision` → `PublishedRecord`.
- Logs con `jobId`, `restaurantId`, `userId`, fases, duración, coste IA estimado.
- Versiones: pipeline, prompt, parser, publisher.

## 10.3 Auditoría

- Quién publicó, cuándo, cuántos ítems, qué reglas bloquearon.
- Acceso solo `sameRestaurant` + rol (`settings.manage`, dominio específico).
- Storage Rules: paths `restaurants/{restaurantId}/ai-imports/…` con misma semántica que imports actuales.

## 10.4 Roles

| Acción | Rol mínimo |
| --- | --- |
| Crear job / subir documento | owner / staff con permiso dominio |
| Publicar a operación | owner / staff autorizado |
| Ver jobs de otro tenant | prohibido |

---

# 11. Escalabilidad

## 11.1 Evolución sin romper compatibilidad

- **PipelineVersion** en cada job; workers soportan N y N-1.
- Extractors y publishers registrados en **plugin registry** interno.
- Schemas JSON de salida LLM versionados; migración forward-only.
- Feature flags por tenant (`aiEngine.carta.v2`) para rollout gradual.

## 11.2 Carga y coste

- Jobs **async** para extracción/enriquecimiento pesados (cola futura: Cloud Tasks / Pub/Sub).
- Límites por tenant: jobs/día, MB/día, tokens LLM/día.
- OCR local vs cloud según tamaño; paginación PDF.

## 11.3 Multi-región (futuro)

- Firestore `eur3` actual; Storage alineado.
- LLM calls con región EU preferente cuando el proveedor lo permita.

## 11.4 Observabilidad

- Métricas: tasa éxito, tiempo por fase, coste/job, % ítems `needsReview`.
- Alertas: spike fallos OCR, quota LLM, jobs atascados.

---

# 12. Roadmap

## 12.1 Fase 1 — Fundación (Carta)

**Entradas:** PDF, Imagen, QR, Texto

**Entregables arquitectónicos:**

- AI Engine Core (contratos + orquestador)
- Refactor progresivo desde `menu-imports` → adapter `carta`
- Modelo `ImportJob` unificado
- Preview + publish humano (paridad funcional actual mejorada)
- Métricas básicas y auditoría

**Criterio de salida:** import carta en < 10 min con trazabilidad completa.

## 12.2 Fase 2 — Operaciones backoffice

**Dominios:** Escandallos, Inventario, Proveedores

**Entradas nuevas:** Excel, Word (limitado)

**Entregables:**

- Adapters + publishers por dominio
- Reglas de validación económica/stock
- Matching duplicados cross-módulo

## 12.3 Fase 3 — Inteligencia operativa

**Capacidades:**

- IA conversacional contextual (“¿qué productos subieron de precio?”) — **asistente**, no autopilot
- Optimización sugerida (par levels, carta rotation)
- Compras inteligentes (sugerencia pedido según consumo)

**Entradas:** APIs proveedor, voz (POC)

**Prerequisito:** Fases 1–2 estables + learning loop maduro.

```text
2026 H1 ──► Fase 1 (Carta / PDF·IMG·QR·TXT)
2026 H2 ──► Fase 2 (Escandallos · Inventario · Proveedores)
2027+   ──► Fase 3 (Conversacional · Optimización · Compras IA)
```

---

## 12.4 Enriquecimiento visual de productos

La imagen generada es una **propuesta**, no una fuente operativa autónoma:

- se genera en servidor mediante Vercel AI Gateway, con trazabilidad por usuario y función;
- usa el nombre, la categoría y la descripción actual del formulario como contexto;
- se limita a platos genéricos y excluye marcas, envases, vinos y bebidas comerciales;
- se guarda inmediatamente en Firebase Storage bajo el tenant y queda `pending`;
- requiere aprobación humana para quedar protegida y nunca sustituye una imagen manual o aprobada;
- conserva modelo, proveedor, fecha y coste devuelto por el Gateway cuando está disponible.

El modelo por defecto debe priorizar coste controlado y puede cambiarse mediante
`HOSTLY_AI_IMAGE_MODEL`, siempre usando un identificador vigente del Gateway.

---

# 13. Riesgos

## 13.1 Riesgos técnicos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Alucinaciones LLM en nombres/precios | Alto | OCR anchor, validación, needsReview |
| Coste IA descontrolado | Medio | Límites tenant, cache, reglas first |
| Pipeline monolítico | Alto | Core + adapters desde día 1 |
| Jobs atascados / timeouts | Medio | Async queue, estados, reintento idempotente |
| Migración desde menu-imports | Medio | Strangler pattern; no big bang |

## 13.2 Riesgos de producto

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Usuario confía ciegamente | Alto | Copy claro, preview obligatorio |
| Onboarding < 10 min no alcanzable | Medio | Medir funnel; simplificar pasos |
| IA percibida como “magia negra” | Medio | Trazabilidad visible, evidencia OCR |

## 13.3 Riesgos de UX

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Preview abrumador | Alto | Agrupación, filtros review, bulk actions |
| Demasiados pasos | Medio | Unificar flujo asistente Hostly |
| Errores ilegibles | Medio | Mensajes operativos, no códigos técnicos |

---

# 14. Decisiones abiertas

**No cerrar aún** — requieren POC, legal o producto:

1. **Proveedor(es) LLM** y política multi-proveedor vs single vendor.
2. **Cola async:** Cloud Tasks vs Firebase Functions gen 2 vs servicio dedicado.
3. **Ubicación canonical jobs:** subcolección `restaurants/{id}/importJobs` vs top-level `importJobs` + `restaurantId`.
4. **Retención exacta** Storage OCR y coste vs compliance.
5. **Learning loop:** ¿solo métricas internas o feedback explícito usuario (“¿útil?”)?
6. **QR → web scraping:** límites legales y robots.txt.
7. **Excel Fase 2:** schema discovery automático vs plantilla Hostly obligatoria.
8. **Voz:** scope real en hostelería vs gimmick.
9. **Precio IA:** incluido en plan vs add-on metered.
10. **Offline / edge OCR** para locales con mala conectividad.
11. **Unificación** `/api/ai/import-menu` legacy vs `/api/ai-engine/jobs` nuevo.
12. **Idiomas:** pipeline monolingüe ES vs multi-idioma desde Fase 1.

Registrar decisiones cerradas en `04_HOSTLY_DECISIONS_LOG.md`.

---

# 15. Conclusión

Hostly no compite en “tener IA en el marketing”. Compite en **eliminar trabajo real** del restaurante con **confianza**.

El **Hostly AI Engine** convierte la IA dispersa de hoy en una **plataforma**:

- un pipeline;
- una auditoría;
- una promesa: *nada entra en operación sin que el restaurante lo vea y lo apruebe*.

Eso acelera onboarding (< 10 minutos), reduce errores de carga manual y prepara escandallos, inventario y compras sobre la misma base — sin rehacer el producto cada vez.

La ventaja competitiva no es el modelo de lenguaje. Es la **combinación** de:

- operación hostelería real (Product Bible + Operations Guide);
- multi-tenant seguro;
- preview humano;
- trazabilidad OCR → plato en TPV;
- velocidad táctil en todo el flujo.

El precursor ya existe en la importación de carta. Este documento define cómo crecer de un **feature** a un **motor** — implementable por fases, sin decisiones que obliguen a reescribirlo en seis meses.

---

## Mantenimiento

Actualizar cuando:

- se cierre una decisión abierta (§14);
- se complete una fase del roadmap;
- cambie stack IA o persistencia;
- un incidente revele hueco arquitectónico.

**Propietario sugerido:** Principal AI Architect + Chief Software Architect.

**Última revisión:** 2026-06-26 · v0.1
