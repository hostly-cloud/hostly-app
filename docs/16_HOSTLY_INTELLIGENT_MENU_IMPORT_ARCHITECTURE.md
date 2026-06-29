# Hostly — Arquitectura de importación inteligente de carta

> **Estado:** objetivo / preparación (sin IA conectada)  
> **Versión:** 0.1  
> **Ámbito:** carta → borrador → revisión → publicación  
> **No sustituye** el pipeline actual en `lib/server/menu-imports/` hasta migración explícita.

---

## 1. Qué resuelve

Un único pipeline para importar cartas desde:

| Entrada | Resolución previa |
|---------|-------------------|
| **Foto** | Archivo imagen en Storage |
| **PDF** | Archivo PDF en Storage |
| **QR** | URL embebida → tratar como URL |
| **URL** | Fetch remoto (HTML/PDF/imagen) |
| **Texto pegado** | String directo (sin OCR) |

Todas las entradas convergen en **`MenuImportPipelineContext`** y recorren las mismas etapas lógicas.

---

## 2. Estructura de carpetas (objetivo)

```
lib/carta/intelligent-import/
├── index.ts                          # API pública del módulo (tipos + ports)
├── types/
│   ├── source.types.ts               # Entrada y fuente resuelta
│   ├── pipeline.types.ts             # Contexto, etapas, resultado
│   ├── extraction.types.ts           # Salida bruta post-OCR/fetch
│   ├── normalized.types.ts           # Carta canónica intermedia
│   └── hostly-product.types.ts       # Candidatos producto Hostly
├── ports/
│   ├── source-resolver.port.ts       # QR/URL/archivo → ResolvedSource
│   ├── text-extractor.port.ts        # ← OCR / PDF text / HTML text
│   ├── structure-extractor.port.ts   # ← OpenAI / Gemini / Claude / heurística
│   ├── normalizer.port.ts            # ← normalización de nombres, precios, secciones
│   ├── validator.port.ts             # ← reglas + cruce OCR
│   └── hostly-mapper.port.ts         # ← transformación a productos Hostly
├── pipeline/
│   ├── menu-import-pipeline.port.ts  # Orquestador (contrato)
│   └── stages.ts                     # Enum + orden de etapas
└── sources/
    └── source-kind.ts                # Metadatos por tipo de entrada (sin lógica)

lib/server/menu-imports/               # Pipeline ACTUAL (legacy operativo)
app/api/menu-imports/                 # APIs actuales (sin cambiar en esta fase)
app/dashboard/.../importacion/        # UI actual (sin cambiar en esta fase)
```

**Regla:** la UI y las APIs existentes siguen llamando al pipeline legacy. El módulo `intelligent-import` es el **contrato objetivo** para la migración incremental.

---

## 3. Flujo completo (cronológico)

```
[Usuario]
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ 0. INGEST          Recibe MenuImportJobInput                 │
│    (foto/pdf/qr/url/text + restaurantId + cartaType)       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. RESOLVE_SOURCE  SourceResolverPort                       │
│    QR → URL │ archivo → buffer/path │ text → inline         │
│    Salida: ResolvedMenuImportSource                         │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. EXTRACT_TEXT    TextExtractorPort  ★ OCR / fetch / paste │
│    Salida: MenuImportExtractionResult (rawText, layout?)    │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. EXTRACT_STRUCTURE StructureExtractorPort ★ LLM / parser  │
│    Salida: StructuredMenuExtraction (sections + items raw)  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. NORMALIZE       MenuImportNormalizerPort                 │
│    Precios, secciones, encoding, duplicados obvios          │
│    Salida: NormalizedMenuImport                             │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. VALIDATE        MenuImportValidatorPort                   │
│    Reglas negocio + cruce OCR + límites tenant              │
│    Salida: ValidatedMenuImport (+ warnings / blockers)      │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. MAP_TO_HOSTLY   HostlyMenuMapperPort                     │
│    Candidatos producto/categoría/estación Hostly            │
│    Salida: HostlyMenuImportCandidates                       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. REVIEW (UI)     Wizard existente — fuera de este módulo  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. PUBLISH         publish-menu-import-draft.ts (legacy)    │
└─────────────────────────────────────────────────────────────┘
```

★ = puntos de extensión para proveedores externos (ver §6–8).

---

## 4. Servicios (roles)

| Servicio (port) | Responsabilidad | Implementación futura |
|-----------------|-----------------|------------------------|
| `MenuImportPipeline` | Orquesta etapas, trazabilidad, errores | `DefaultMenuImportPipeline` (server) |
| `MenuImportSourceResolver` | Unifica QR/URL/archivo/texto | Reutilizar `fetch-remote-menu-url`, Storage |
| `MenuImportTextExtractor` | Texto bruto + layout opcional | `vision-ocr`, `pdf-parse`, paste |
| `MenuImportStructureExtractor` | Items/secciones estructurados | OpenAI, Gemini, Claude, `parse-menu-text` |
| `MenuImportNormalizer` | Formato canónico intermedio | `normalize-menu-import-section`, v2 |
| `MenuImportValidator` | Calidad y seguridad | `validate-items-against-ocr`, reglas carta |
| `HostlyMenuMapper` | Modelo producto Hostly | `menu-import-draft-mapper`, publish eval |

---

## 5. Puntos de extensión

### 5.1 OCR (`TextExtractorPort`)

- **Cuándo:** etapa `EXTRACT_TEXT`, tras `RESOLVE_SOURCE`.
- **Entrada:** `ResolvedMenuImportSource` (bytes, mime, url).
- **Salida:** `rawText`, opcional `layoutLines`, `pageSize`.
- **Proveedores previstos:**
  - Google Vision (actual en `vision-ocr.ts`)
  - PDF embebido (`pdf-parse`)
  - HTML visible (`fetch-remote-menu-url`)
  - Texto pegado (bypass OCR, copia directa)

### 5.2 OpenAI / LLM estructurado (`StructureExtractorPort`)

- **Cuándo:** etapa `EXTRACT_STRUCTURE`, con `rawText` (+ layout opcional).
- **Entrada:** `MenuImportExtractionResult` + `cartaType` + contexto tenant.
- **Salida:** `StructuredMenuExtraction` (JSON validado).
- **Proveedores previstos:**
  - OpenAI (`enrich-menu-items-with-ai`, `ai-import-v2`)
  - Anthropic Claude (adapter futuro)
  - Google Gemini (adapter futuro)
  - Parser heurístico (`parse-menu-text`) como **fallback determinista**

### 5.3 Otros modelos

Mismo port `StructureExtractorPort`. El orquestador elige implementación por:

```ts
providerId: "openai" | "anthropic" | "google" | "heuristic"
```

Shadow mode (como `ai-import-v2`) compara proveedores sin afectar el draft.

### 5.4 Validación (`ValidatorPort`)

- **Cuándo:** tras `NORMALIZE`, antes de `MAP_TO_HOSTLY`.
- **Qué valida:**
  - Nombre/precio obligatorios donde aplique
  - Item sustentado en OCR (`validate-items-against-ocr`)
  - Límites (`menu-import-limits`)
  - Duplicados y categorías inexistentes
- **Salida:** `ValidatedMenuImport` con `blockers` vs `warnings`.

### 5.5 Normalización (`NormalizerPort`)

- **Cuándo:** tras estructura, antes de validación.
- **Qué normaliza:**
  - Secciones y jerarquía
  - Precios (€, comas, rangos)
  - Encoding y ruido OCR (`normalizeMenuImportOcrText`)
  - IDs estables por item

### 5.6 Transformación a productos Hostly (`HostlyMenuMapperPort`)

- **Cuándo:** tras validación, antes de UI/publish.
- **Qué produce:**
  - `HostlyMenuProductCandidate[]`
  - Mapeo estación, categoría sugerida, flags alérgenos
  - Compatible con `ImportedMenuDraft` / Firestore draft (en migración)

---

## 6. Tipos canónicos (capas)

| Capa | Tipo | Mutabilidad |
|------|------|-------------|
| Entrada | `MenuImportJobInput` | Inmutable |
| Fuente | `ResolvedMenuImportSource` | Inmutable |
| Extracción | `MenuImportExtractionResult` | Inmutable |
| Estructura | `StructuredMenuExtraction` | Inmutable |
| Normalizado | `NormalizedMenuImport` | Inmutable |
| Validado | `ValidatedMenuImport` | Inmutable |
| Hostly | `HostlyMenuImportCandidates` | Inmutable |

Cada etapa recibe contexto acumulado: `MenuImportPipelineContext`.

---

## 7. Relación con el código actual

| Objetivo (nuevo módulo) | Legacy (operativo hoy) |
|-------------------------|-------------------------|
| `TextExtractorPort` | `extract-menu-text.ts`, `vision-ocr.ts` |
| `StructureExtractorPort` | `parse-menu-text.ts`, `enrich-menu-items-with-ai.ts`, `ai-import-v2/` |
| `NormalizerPort` | `normalize-menu-import-section.ts`, `normalizeMenuImportOcrText` |
| `ValidatorPort` | `validate-items-against-ocr.ts`, `evaluate-import-item-for-publish.ts` |
| `HostlyMenuMapperPort` | `menu-import-draft-mapper.ts`, `publish-menu-import-draft.ts` |
| Orquestador | `process-menu-import-draft.ts` |

**Migración recomendada:** adapter legacy por port, sin big-bang.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Duplicar pipeline | Ports + doc; legacy sigue siendo source of truth |
| Fugas de tenant | `restaurantId` obligatorio en `MenuImportJobInput` |
| IA no determinista | Fallback heurístico + validación OCR |
| Coste API | Límites por restaurante, shadow mode, caché por hash de fuente |
| Tipos divergentes UI/ server | `HostlyMenuImportCandidates` alineado con `ImportedMenuDraft` en migración |

---

## 9. Próximos pasos (fuera de esta fase)

1. Implementar `DefaultMenuImportPipeline` con adapters al legacy.
2. Conectar un `StructureExtractorPort` (OpenAI) detrás del port.
3. Feature flag por restaurante: pipeline v3 vs legacy.
4. Tests de contrato por port (corpus en `test-corpus/`).
