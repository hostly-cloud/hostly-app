# Hostly — Facturas proveedor con OCR

Documentación del flujo **upload → OCR/Vision → OpenAI schema → matching → revisión manual → registro confirmado**.

Ruta principal: `/dashboard/inventario/facturas-proveedor/nueva`  
Listado: `/dashboard/inventario/facturas-proveedor`

> **Alcance:** costes reales de inventario (`inventory.unitCost`). **No** mueve stock, **no** contabilidad, **no** pagos, **no** AEAT.

---

## Flujo end-to-end

```
Usuario sube JPG / PNG / WebP / PDF (máx. 12 MB)
  │
  ├─► POST /api/supplier-invoices/extract
  │     ├─► uploadSupplierInvoiceFile → Firebase Storage
  │     └─► extractSupplierInvoiceWithVision()
  │           ├─► OCR bruto (PDF embebido / Vision / PDF OCR)
  │           ├─► OpenAI JSON schema → ExtractedSupplierInvoiceDraft
  │           └─► (fallback) mockExtractSupplierInvoice si falla
  │
  ├─► enrichExtractedDraftWithProductMatches() (cliente)
  │     ├─► aliases aprendidos (supplierProductAliases)
  │     └─► heurística nombre ↔ inventario
  │
  ├─► Revisión operativa (UI)
  │     ├─► KPIs, estados IA, bulk actions, teclado
  │     ├─► Incluir / excluir líneas
  │     ├─► Enlazar producto Hostly, corregir cantidad/unidad/coste
  │     ├─► Aplicar a líneas similares
  │     └─► Aprendizaje alias en sesión + Firestore (al confirmar producto)
  │
  └─► Registro manual confirmado (modal)
        ├─► createSupplierInvoice() → status: draft
        ├─► recordSupplierInvoice() → status: recorded
        ├─► inventory.unitCost actualizado por línea válida
        ├─► learnSupplierProductAliasesFromLines()
        └─► Histórico factura inmutable (líneas con previousUnitCost / updatedInventoryUnitCost)
```

**Principio operativo:** la factura **nunca** se registra sola. El usuario debe pulsar **Registrar factura** y confirmar en modal.

---

## Modos de extracción

| `extractionMeta.source` | Cuándo | Qué ocurre |
|-------------------------|--------|------------|
| **`vision_ai`** | OCR + OpenAI OK | Pipeline real. Badge UI: *Vision + IA* |
| **`mock_fallback`** | Error OCR, OpenAI, OCR vacío, sin líneas | Datos ficticios deterministas por nombre de archivo. Badge: *Mock fallback* |
| **`demo`** | Botón *Usar factura demo* (solo no-producción) | Borrador SVG local sin subida a Storage. Badge: *Demo QA* |

### Demo QA

- Habilitado solo si `NODE_ENV !== "production"` (`isSupplierInvoiceDemoEnabled()`).
- Genera factura ficticia (Tónica, Coca-Cola, Red Bull, Ginebra…) con número `DEMO-F-*`.
- **En producción el botón no aparece.**

### Mock fallback

- Se activa automáticamente cuando falla Vision, OpenAI o la validación del borrador.
- El archivo **sí** se sube a Storage; solo la extracción usa mock.
- Revisar warnings OCR en UI antes de registrar.

---

## Variables de entorno

| Variable | Obligatoria | Uso |
|----------|-------------|-----|
| **`OPENAI_API_KEY`** | Sí (pipeline real) | Estructuración JSON del OCR vía Chat Completions |
| **`HOSTLY_OPENAI_MODEL`** | No | Modelo OpenAI. Default: `gpt-4o-mini` |
| **`GOOGLE_APPLICATION_CREDENTIALS`** | Sí (OCR imagen/PDF escaneado) | Ruta al JSON de service account para `@google-cloud/vision` |

También necesario (como resto de Hostly Admin):

- Firebase Admin (`FIREBASE_PROJECT_ID` + credenciales **o** `GOOGLE_APPLICATION_CREDENTIALS` con `project_id`)
- Storage Admin para subida de facturas

**Vision:** si no hay credenciales válidas, OCR de imagen falla → `mock_fallback`.

**OpenAI:** si falta `OPENAI_API_KEY`, la estructuración falla → `mock_fallback`.

---

## OCR y estructuración IA

### OCR (servidor)

Archivo: `lib/server/supplier-invoices/extract-supplier-invoice-with-ai.ts`

1. **PDF con texto embebido** → extracción directa (sin Vision).
2. **PDF escaneado** → OCR por páginas (`ocrPdfBuffer`).
3. **Imagen** → Google Vision (`ocrImageBuffer`).

### OpenAI schema

- Respuesta **JSON estricto** (`supplier_invoice_extraction`).
- Campos cabecera: `supplierName`, `invoiceNumber`, `invoiceDate`.
- Líneas: `rawText`, `detectedName`, `quantity`, `unit`, `unitPrice`, `totalPrice`.
- Reglas prompt: **no inventar** líneas ni precios; campos ilegibles → `null`.

Salida normalizada: `ExtractedSupplierInvoiceDraft` con líneas `status: unmatched`.

---

## Matching de productos

Archivo: `lib/inventory/invoice-product-matching.ts`

Orden de resolución por línea:

1. **Alias aprendido** (`findSupplierProductAliasMatch`) — texto OCR normalizado contra `supplierProductAliases`.
2. **Heurística** (`findInventoryProductMatch`) — similitud de tokens, inclusión, Jaccard.

Umbrales:

| Confidence | Estado línea |
|------------|--------------|
| ≥ 0.75 | `matched` → UI: *Coincidencia alta* |
| 0.45 – 0.74 | `ambiguous` |
| < 0.45 | `unmatched` |

> Detalle completo del aprendizaje y gestión operacional en [Aliases aprendidos](#aliases-aprendidos).

---

## Aliases aprendidos

Los **aliases OCR** son la memoria operativa de Hostly: enlaces persistentes entre un texto de factura proveedor y un producto de inventario Hostly.

**Colección Firestore:** `restaurants/{restaurantId}/supplierProductAliases/{aliasId}`  
**Gestión UI:** `/dashboard/inventario/aliases-proveedor` (tab *Aliases OCR* en hub Inventario)

### Qué es `supplierProductAliases`

Cada documento representa **una clave OCR normalizada** → **un producto Hostly**. El `aliasId` se deriva del `normalizedText` (slug). Hostly usa esta colección **antes** de la heurística de nombres al extraer/revisar facturas.

| Campo | Descripción |
|-------|-------------|
| `rawText` | Texto OCR tal como apareció en la factura (ej. `TONICA SCHW`) |
| `normalizedText` | Clave de búsqueda (minúsculas, sin acentos, tokens normalizados) |
| `inventoryProductId` / `inventoryProductName` | Producto Hostly enlazado |
| `supplierName` | Proveedor opcional (contexto) |
| `usageCount` | Contador de reutilizaciones |
| `active` | Si participa en matching. **Default: `true`** |
| `deletedAt` | Timestamp soft delete. **`null` = no eliminado** |
| `createdAt` / `updatedAt` / `lastUsedAt` | Trazabilidad temporal |
| `learnedFromInvoiceId` | Factura origen (si se aprendió al registrar) |
| `matchSource` | `auto` (aprendido automáticamente) o `manual` (corregido en panel) |

### Cuándo se crea un alias

Un alias **nuevo** se crea cuando:

1. **Revisión OCR** — el usuario enlaza manualmente un producto Hostly a una línea (`learnSupplierProductAlias`).
2. **Registro de factura** — tras confirmar registro, `learnSupplierProductAliasesFromLines()` persiste aliases de todas las líneas incluidas válidas.

Si ya existe un doc con el mismo `normalizedText`, **no se duplica**: se actualiza el existente.

### Cuándo se actualiza `usageCount`

`usageCount` incrementa (+1) cada vez que Hostly **reaplica** el alias via `learnSupplierProductAlias`, es decir:

- Al enlazar producto en revisión OCR.
- Al registrar factura (por cada línea incluida con producto y texto OCR).

También se puede **resetear a 0** desde el panel de gestión (operación manual de auditoría).

Además, en cada reaprendizaje se actualizan `updatedAt` y `lastUsedAt`.

### Qué significa `active`

| Valor | Efecto |
|-------|--------|
| `true` (default) | El alias entra en candidatos de matching OCR |
| `false` | El alias **no** se usa para futuros matches automáticos |

Desactivar es reversible desde el panel (*Activar*). **No borra** el documento ni altera facturas ya registradas.

### Qué significa `deletedAt`

**Eliminar** en la UI es **soft delete**, no borrado físico (Firestore rules: `allow delete: if false`):

```
active = false
deletedAt = Date.now()
```

Un alias con `deletedAt` > 0 queda excluido del matching igual que uno inactivo. El documento permanece para auditoría.

Reactivar limpia `deletedAt` y pone `active: true`. Reaprender el mismo texto OCR en revisión también puede reactivar el alias.

### Cómo afecta al matching

Flujo en `enrichExtractedDraftWithProductMatches()`:

1. Se cargan aliases del tenant via `listenSupplierProductAliases`.
2. `mapSupplierProductAliasesToMatchCandidates()` filtra solo aliases **activos y no eliminados** (`isSupplierProductAliasActiveForMatching`).
3. `findSupplierProductAliasMatch()` compara `normalizedText` de la línea OCR contra esa lista.
4. Si no hay alias → heurística por nombre de producto.

**Prioridad:** alias aprendido **siempre** gana sobre heurística cuando hay coincidencia exacta de `normalizedText`.

### Por qué desactivar no rompe facturas históricas

Los aliases influyen solo en **futuras extracciones/revisiones OCR**. Una factura ya registrada (`supplierInvoices` con `status: recorded`) es un snapshot inmutable:

- Sus líneas guardan el producto enlazado en el momento del registro.
- `inventory.unitCost` ya aplicado no se revierte al desactivar un alias.
- Desactivar/eliminar solo evita que **próximas facturas** auto-enlacen con ese texto OCR.

### Qué pasa si el alias es incorrecto

Si Hostly aprendió `COCA COLA ZERO` → producto equivocado:

1. **Futuras facturas** con ese texto OCR se auto-enlazarán mal (pill *Aprendido*).
2. El usuario puede corregir **línea a línea** en revisión OCR antes de registrar.
3. La corrección duradera se hace en el **panel de aliases**.

Riesgo: si no se corrige, el error se repite en cada factura del mismo proveedor.

### Cómo corregirlo desde `/dashboard/inventario/aliases-proveedor`

| Acción | Cuándo usarla |
|--------|---------------|
| **Editar producto enlazado** | Alias correcto en texto OCR pero producto Hostly mal asignado. Requiere confirmación: *“Cambiar este alias afectará futuros matches automáticos.”* Marca `matchSource: manual`. |
| **Desactivar** | Pausar auto-match sin borrar historial del doc |
| **Eliminar (soft delete)** | Retirar alias del matching de forma permanente (auditoría conservada) |
| **Reactivar** | Volver a usar un alias desactivado |
| **Reset contador** | Auditoría de uso; no afecta matching |
| **Bulk actions** | Operaciones masivas sobre selección múltiple |
| **Panel similares** | Detectar aliases OCR parecidos (`normalizeSupplierProductText` + confidence) para limpiar duplicados |

Atajos del panel: ↑↓ navegar · Espacio seleccionar · Ctrl/Cmd+F buscar · Escape cerrar panel.

---

## Revisión manual (UI)

Ruta: `/dashboard/inventario/facturas-proveedor/nueva`

### Validación antes de registrar

Solo líneas **incluidas** y válidas entran al registro:

- Producto Hostly enlazado
- Cantidad > 0
- Unidad reconocida
- Precio unitario o total > 0

Líneas excluidas (checkbox *Incluir*) no bloquean el registro.

### Estados IA (pills)

| Estado UI | Significado |
|-----------|-------------|
| Aprendido | Match vía alias Firestore |
| Coincidencia alta | Match heurístico automático |
| Revisado manualmente | Usuario cambió el producto |
| Pendiente | Falta dato o revisión |
| Sin producto | Sin `matchedInventoryProductId` |
| Excluida | Línea desmarcada de inclusión |
| Lista | Válida para registro |

No se muestran porcentajes técnicos de confidence al usuario.

### Atajos operativos

- ↑↓ — navegar filas incluidas
- Tab — producto → cantidad → unidad → coste
- Enter — confirmar / avanzar campo
- Escape — cerrar modal registro
- Ctrl/Cmd + Enter — abrir modal *Registrar factura*

---

## Registro de factura

### Paso 1: `createSupplierInvoice`

- Crea documento en `restaurants/{restaurantId}/supplierInvoices/{invoiceId}`.
- `status: "draft"`.
- Líneas sanitizadas desde borrador revisado (`buildSupplierInvoiceInputFromExtractedDraft`).

### Paso 2: `recordSupplierInvoice`

Transacción Firestore:

1. Comprueba que la factura existe y no está ya `recorded`.
2. Por cada línea: `buildInventoryCostPatchFromSupplierInvoiceLine`.
3. Actualiza `products/{productId}.inventory`:
   - `inventory.unitCost`
   - `inventory.unitCostUnit`
   - `inventory.purchaseCost`, `purchaseQuantity`, `purchaseUnit`
4. Marca factura `status: "recorded"`.
5. Enriquece líneas con `previousUnitCost` y `updatedInventoryUnitCost`.

Archivos clave:

- `lib/firestore/supplier-invoices.ts`
- `lib/inventory/supplier-invoice-cost.ts`

### Efecto en costes

| Qué cambia | Qué NO cambia |
|------------|---------------|
| `inventory.unitCost` futuro del producto | Ventas / márgenes **históricos** ya cerrados |
| Compras inteligentes, escandallos futuros | `currentStock` (ledger de stock) |
| Márgenes de **nuevas** ventas TPV | Contabilidad, pagos, AEAT |

El coste se calcula desde coste real recibido (`realTotalCost` / cantidad) con conversión de unidades compatible.

---

## Qué NO hace este módulo

| No hace | Detalle |
|---------|---------|
| Auto-registrar | Siempre requiere confirmación explícita en modal |
| Mover stock | No crea movimientos en ledger ni altera `currentStock` |
| Contabilidad | No asientos, no IVA deducible formal |
| Pagos | No marca factura como pagada ni integra banco |
| AEAT / Verifactu | Fuera de alcance |
| Re-OCR automático | Tras extracción, correcciones son manuales |

Para stock físico usar **pedidos de compra / recepciones** (flujo aparte).

---

## Riesgos operativos y mitigación

| Riesgo | Impacto | Mitigación QA |
|--------|---------|---------------|
| **OCR vacío** | `mock_fallback` o borrador sin líneas | Revisar badge extracción; reintentar con mejor scan |
| **Líneas mal partidas** | Cantidades/precios incorrectos | Revisión manual línea a línea; excluir líneas dudosas |
| **Producto sin match** | Línea bloquea registro | Enlazar manualmente; crear alias implícito al confirmar |
| **Alias incorrecto** | Match automático erróneo en futuras facturas | Revisar pill *Aprendido*; corregir en `/dashboard/inventario/aliases-proveedor` |
| **Alias duplicado semántico** | Varios textos OCR → mismo producto | Panel *Coincidencias similares*; bulk desactivar |
| **`unitCost` alterado** | Coste futuro de inventario cambia | Confirmar en modal; comprobar producto/unidad compatibles |
| **Ventas antiguas** | Percepción de “recalcular histórico” | Documentar: solo afecta ventas **posteriores** al registro |

---

## QA manual recomendado

Checklist detallado en [hostly-qa-smoke-tests.md §10](./hostly-qa-smoke-tests.md#10-facturas-proveedor-ocr) (OCR) y [§11](./hostly-qa-smoke-tests.md#11-aliases-ocr-proveedor) (gestión aliases).

Resumen:

1. **Demo** — cargar factura demo; validar KPIs y estados.
2. **OCR real** — subir JPG/PDF proveedor; comprobar `vision_ai` o warnings.
3. **Corrección manual** — enlazar producto, ajustar cantidad/unidad/coste.
4. **Alias aprendido** — repetir texto OCR en otra línea; ver match automático.
5. **Registro** — modal → `recorded` en listado.
6. **`unitCost`** — verificar actualización en producto inventario.
7. **Histórico ventas** — confirmar márgenes de tickets antiguos intactos.

---

## Referencias de código

| Área | Archivo |
|------|---------|
| API extract | `app/api/supplier-invoices/extract/route.ts` |
| Pipeline Vision + OpenAI | `lib/server/supplier-invoices/extract-supplier-invoice-with-ai.ts` |
| Matching | `lib/inventory/invoice-product-matching.ts` |
| Aliases Firestore | `lib/firestore/supplier-product-aliases.ts` |
| Gestión aliases UI | `app/dashboard/inventario/aliases-proveedor/page.tsx` |
| Mapper registro | `lib/inventory/extracted-invoice-to-supplier-invoice.ts` |
| Coste inventario | `lib/inventory/supplier-invoice-cost.ts` |
| CRUD facturas | `lib/firestore/supplier-invoices.ts` |
| UI revisión | `app/dashboard/inventario/facturas-proveedor/nueva/page.tsx` |
| Demo QA | `lib/inventory/supplier-invoice-demo.ts` |

**Relacionado:** [hostly-stock-flow.md](./hostly-stock-flow.md), [hostly-stock-ledger.md](./hostly-stock-ledger.md), [hostly-qa-smoke-tests.md](./hostly-qa-smoke-tests.md)
