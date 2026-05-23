# Hostly Stock Flow

Flujo operativo TPV → ledger central → stock actual. Complementa la referencia técnica en [hostly-stock-ledger.md](./hostly-stock-ledger.md).

---

## Flujo TPV → stock

El descuento ocurre al **enviar comanda a cocina/barra**, no al cobrar.

```
Venta TPV (sendLinesToComanda)
  │
  ├─► createStockMovementsForModifierConsumption()
  │     └─► modifier_sale (ledger central, applied: false)
  │
  ├─► createStockMovementsForRecipeConsumption()
  │     └─► recipe_sale (ledger central, applied: false)
  │
  └─► applyCreatedStockMovements()
        └─► inventory.currentStock actualizado (por movimiento aplicado)
```

Cancelación de línea elegible (`handleCancelSentOrderLine`):

```
Cancelar línea (status sent / preparing)
  │
  ├─► createStockReversalMovementsForModifierConsumption()
  │     └─► modifier_sale_reversal (+quantityDelta)
  │
  ├─► createStockReversalMovementsForRecipeConsumption()
  │     └─► recipe_sale_reversal (+quantityDelta)
  │
  └─► applyCreatedStockMovements() (incluido en los helpers de reversión)
```

---

## Modifier pipeline

**Ejemplo:** producto vendido **Law** con modificador **Tónica** (1 ud por unidad vendida).

Al enviar 1× Law + Tónica:

| Campo | Valor |
|-------|-------|
| `source` | `modifier_sale` |
| `productId` | ID de Tónica (inventario) |
| `quantityDelta` | `-1` (× cantidad de línea) |
| `unit` | `ud` |
| `saleProductName` | Law |
| `modifierOptionName` | Tónica |

---

## Recipe pipeline

**Ejemplo:** **Law** con escandallo base habilitado en `products/{id}.recipe` (Ginebra 50 ml / unidad).

Al enviar 1× Law:

| Campo | Valor |
|-------|-------|
| `source` | `recipe_sale` |
| `productId` | ID de Ginebra |
| `quantityDelta` | `-50` (× cantidad de línea) |
| `unit` | `ml` |
| `saleProductName` | Law |

Requisitos:

- `recipe.enabled === true` en el producto vendido (catálogo central).
- Ingredientes normalizados con `productId`, `quantity` y `unit`.
- Auto-consumo evitado: si un ingrediente es el mismo `productId` que el vendido, se omite.

---

## Gin tonic completo

Venta **Law + Tónica** (1 unidad): escandallo base + modificador generan **dos movimientos independientes** con IDs distintos.

```
Law + Tónica (enviar comanda)
  │
  ├─ recipe_sale
  │    └─ Ginebra  -50 ml   (por Law)
  │
  └─ modifier_sale
       └─ Tónica   -1 ud    (por Law · Tónica)
```

Cancelación elegible invierte ambos:

```
  ├─ recipe_sale_reversal      → Ginebra  +50 ml
  └─ modifier_sale_reversal    → Tónica   +1 ud
```

---

## Cancelación

```
                    ┌─ sent ────────────────┐
                    │                       │
Cancelar línea ─────┼─ preparing ───────────┼─► reversal modifier + recipe
                    │                       │         + apply stock
                    └─ pending* ────────────┘
                    
                    ┌─ prepared ──► sin reversión stock
                    │
                    └─ served ────► sin reversión stock
```

\* **`pending`:** el código lo trata como elegible por compatibilidad (`isOrderLineEligibleForStockReversal`), pero en operación normal el consumo se dispara al pasar a enviado; la reversión usa el estado **antes** de cancelar (`statusBeforeCancel`).

Condiciones adicionales para crear reversal:

- Debe existir el movimiento original en el ledger central.
- El original debe tener `applied === true`.
- El documento de reversal no debe existir ya (idempotencia).

---

## Estados de línea y reversión stock

| Estado línea | Consumo al enviar | Reversión stock al cancelar |
|--------------|-------------------|----------------------------|
| `pending` | No (aún no enviada) | Sí* (código; caso borde) |
| `sent` | Sí (si se envía en este paso) | Sí |
| `preparing` | Sí | Sí |
| `prepared` | Sí (ya consumido) | **No** |
| `served` | Sí | **No** |
| `cancelled` | No | N/A |

La comanda puede cancelarse en UI en algunos estados `prepared`, pero **no se devuelve stock** automáticamente.

---

## Ledger dual

Hostly mantiene dos rutas de movimientos de stock:

| Ledger | Path | Origen típico | UI Inventario |
|--------|------|---------------|---------------|
| **Legacy** | `restaurants/{rid}/products/{productId}/stockMovements` | Recepciones, ajustes manuales al guardar ficha inventario | Sección “Movimientos antiguos” |
| **Central** | `restaurants/{rid}/stockMovements` | TPV: modifier/recipe sale y reversiones | Sección principal “Movimientos de stock” |

```
                    ┌── products/{id}/stockMovements  (legacy)
Panel inventario ───┤
                    └── restaurants/{rid}/stockMovements  (central, TPV)
```

**Stock actual único:** `products/{id}.inventory.currentStock` refleja apply de ambos mundos solo en la medida en que cada flujo escriba ahí. Hoy el apply automático del TPV actúa sobre el ledger **central**; el panel legacy escribe movimiento + stock en su propio flujo.

---

## Timeline operacional por producto

Ruta: `/dashboard/inventario/productos/{productId}/timeline`

Capa de **agregación en cliente** (no nueva colección Firestore). Unifica el historial operativo visible de un producto en una sola vista cronológica, en tiempo real, sin modificar writers de stock, TPV ni facturas.

**Accesos desde UI:**

| Origen | Cómo llegar |
|--------|-------------|
| Inventario → inspector producto | Enlace **Ver timeline** (bloque “Movimientos de stock”) |
| Compras inteligentes | Columna **Timeline** por fila de producto |
| Facturas proveedor | Enlace **Timeline** en cada línea de factura registrada |

Helper de ruta: `productTimelineHref(productId)` en `lib/inventory/product-timeline.ts`.

### Qué eventos muestra

Cada fila es un `ProductTimelineEvent` normalizado (`type`, `timestamp`, `title`, `subtitle`, `delta`, stock/coste antes/después, enlaces contexto).

| Tipo | Origen típico | Ejemplo en UI |
|------|---------------|---------------|
| `recipe_consumption` | `stockMovements` · `source: recipe_sale` | “Law vendido” · Δ −50 ml |
| `modifier_consumption` | `stockMovements` · `source: modifier_sale` | “Gin tonic vendido” · Δ −1 ud |
| `stock_reversal` | `modifier_sale_reversal` / `recipe_sale_reversal` | “Reversión · Law” |
| `stock_in` | `purchase_receipt`, recepciones, ajustes positivos | “+32 ud recibidas” |
| `stock_out` | Ajustes negativos / salidas no clasificadas | Δ negativo |
| `purchase_order_created` | `purchaseOrders` (línea del producto) | “Pedido creado · 24 ud” |
| `purchase_order_received` | `purchaseOrders` · `partially_received` / `received` | “Pedido recibido” / “Recepción parcial” |
| `cost_updated` | `supplierInvoices` · `status: recorded` | “Coste actualizado 0,55 → 0,62 €/ud” |
| `low_stock` | **Derivado** (ver abajo) | “Stock bajo detectado” |
| `out_of_stock` | **Derivado** (ver abajo) | “Sin stock detectado” |

También incluye movimientos **legacy** (`products/{id}/stockMovements`) como eventos compatibles cuando existen.

### De dónde salen los datos

```
buildProductTimelineEvents()  (lib/inventory/product-timeline.ts)
  │
  ├─► restaurants/{rid}/stockMovements          (filtrado productId en query)
  ├─► restaurants/{rid}/products/{id}/stockMovements   (legacy, subcolección)
  ├─► restaurants/{rid}/supplierInvoices          (filtrado por productId en líneas, cliente)
  ├─► restaurants/{rid}/purchaseOrders            (filtrado por productId en líneas, cliente)
  └─► Alertas derivadas                           (cálculo en memoria, no Firestore)
```

Reutiliza mappers y KPIs de:

- `lib/firestore/stock-movements.ts` — lectura ledger central
- `lib/inventory/purchase-intelligence.ts` — consumo 14 días (`aggregateConsumptionFromStockMovements`)
- `lib/inventory/stock-status.ts` — estado actual bajo/sin stock
- Tipos de pedidos y facturas existentes (sin duplicar writers)

### Listeners en la página timeline

Solo activos **mientras** el usuario está en la ruta timeline (no listeners globales nuevos):

| Listener | Alcance | Límite documentado |
|----------|---------|-------------------|
| `listenProductsForInventory` | Catálogo inventario (metadata + stock/coste actual) | Todos los productos del restaurante |
| `listenCentralStockMovementsForProduct` | Ledger central por `productId` | **50** movimientos (máx. hard cap del helper) |
| `listenLatestStockMovements` | Legacy subcolección producto | **20** movimientos |
| `listenSupplierInvoices` | Facturas del restaurante | **100** más recientes (`updatedAt`) |
| `listenPurchaseOrders` | Pedidos del restaurante | **100** más recientes (`updatedAt`) |

Facturas y pedidos se escuchan a nivel restaurante y se **filtran en cliente** por `productId` en líneas. La agregación y filtros (consumo / compras / costes / alertas / reversión + rango fechas) son **puros `useMemo`** — no escriben Firestore.

### Qué NO es persistente todavía

| Elemento | Comportamiento |
|----------|----------------|
| **Alertas `low_stock` / `out_of_stock` históricas** | Inferidas al cruzar `stockBefore` / `stockAfter` de movimientos con `inventory.minStock`; **no** hay colección `stockAlerts` |
| **Alerta “Stock bajo/sin stock actual”** | Evento sintético con timestamp ~`Date.now()` según estado en vivo del producto |
| **Timeline unificado** | Vista agregada; los documentos fuente siguen siendo movimientos, facturas y pedidos |
| **KPI “Ventas relacionadas”** | Cuenta eventos `recipe_consumption` + `modifier_consumption` en la ventana cargada, no ventas TPV totales históricas |

Los movimientos TPV, recepciones, facturas y pedidos **sí** son persistentes en sus colecciones originales; lo no persistente es la **capa de alertas derivadas** y el **documento timeline** como tal (no existe).

### Límites conocidos

1. **Historial truncado:** solo entran los últimos **50** movimientos centrales + **20** legacy + **100** facturas/pedidos del restaurante (luego filtro por producto). Eventos antiguos fuera de esa ventana **no aparecen**.
2. **Pedidos/facturas sin línea del producto:** no generan eventos aunque el documento exista.
3. **`cost_updated`:** solo facturas `recorded` con `previousUnitCost` o `updatedInventoryUnitCost` en la línea.
4. **Facturas/pedidos en timeline:** el listener sigue en **100** docs restaurante; eventos fuera de ventana no aparecen en timeline (pero deep-link puede resolver el documento destino — ver sección siguiente).
5. **`listenProductsForInventory`:** carga todo el catálogo inventario para resolver ficha del producto — coste de lectura proporcional al número de productos.

Smoke tests timeline base: [hostly-qa-smoke-tests.md §12](./hostly-qa-smoke-tests.md#12-timeline-producto--auditoría-inventario) · deep-links y export: [§13](./hostly-qa-smoke-tests.md#13-timeline-deep-links-y-export-auditoría).

---

## Deep-links y exportación del Timeline

Capa de **navegación contextual** desde el timeline hacia pantallas operativas, con **highlight** visual y **fetch puntual** cuando el documento destino no está en la ventana reciente del listener. Complementa la agregación de `buildProductTimelineEvents()` sin modificar writers de stock, TPV ni facturas.

Helpers de rutas e IDs (`lib/inventory/product-timeline.ts`):

| Destino | URL | Query / params | ID DOM highlight |
|---------|-----|----------------|------------------|
| Factura proveedor | `/dashboard/inventario/facturas-proveedor` | `?invoiceId={id}` | `hostly-highlight-invoice-{id}` |
| Pedido compra | `/dashboard/inventario/pedidos-compra/{purchaseOrderId}` | — | — |
| Recepción concreta | `/dashboard/inventario/pedidos-compra/{purchaseOrderId}` | `?receiptId={id}` | `hostly-highlight-receipt-{id}` |
| TPV / línea comanda | `/dashboard/operacion/tpv` | `?orderId={id}&lineId={id}` | `hostly-highlight-order-line-{lineId}` |

Enlaces generados por `buildProductTimelineContextLinks()` en el panel lateral del timeline (labels: **Factura**, **Pedido**, **Recepción**, **TPV**).

### Highlight contextual

Implementación: `lib/ui/scroll-and-highlight.ts`

```
scheduleScrollAndHighlightById(elementId)
  │
  ├─► scrollIntoView (smooth, center)
  ├─► añade clase CSS .hostly-context-highlight  (~2 s)
  └─► reintentos si el nodo aún no está en DOM (listas async / fetch puntual)
```

La clase está definida en `app/globals.css`. Se aplica en facturas, recepciones y líneas TPV al resolver el deep-link.

### Fetch puntual fuera de ventana

Cuando el ID enlazado **no** está en la lista ya cargada, la pantalla destino hace un `getDoc` puntual (no paginación general):

| Pantalla | Listener habitual | Fetch puntual | Comportamiento |
|----------|-------------------|---------------|----------------|
| Facturas proveedor | **100** facturas (`updatedAt`) | `getSupplierInvoiceById()` | Inserta temporalmente en `displayInvoices` + banner azul + highlight |
| Recepciones (detalle pedido) | Listener por `purchaseOrderId` | `getPurchaseReceiptById()` | Inserta en `displayReceipts` si `receipt.purchaseOrderId` coincide + banner + highlight |
| TPV | Comandas activas / mesa | `getDoc(orders/{orderId})` | **No** rehace flujo TPV; carga contexto mínimo o aviso |

Banner facturas/recepciones (`DeepLinkOutOfWindowNotice`):

> *Documento enlazado cargado fuera de la ventana reciente*

Avisos TPV (`DeepLinkContextNotice`, estilo gris discreto):

| Situación | Mensaje |
|-----------|---------|
| Comanda inexistente | *Comanda no encontrada* |
| Comanda `paid` / `closed` | *Comanda no está activa* |
| `lineId` no en comanda cargada | *Línea enlazada no encontrada en esta comanda* |

La inserción temporal **no persiste** en Firestore: al recargar, el documento desaparece de la lista si sigue fuera del límite del listener.

### Export CSV

Helper: `exportProductTimelineCsv()` en `lib/inventory/product-timeline-export.ts` · botón en cabecera timeline.

- Separador `;` · codificación UTF-8 con BOM · descarga `hostly-timeline-{producto}-{fecha}.csv`
- Metadatos en cabecera: producto, `productId`, filtro activo, rango fechas, timestamp exportación
- Filas: eventos **después** de aplicar filtro tipo + rango fechas (`filteredEvents`)
- Columnas: timestamp, eventType, title, subtitle, delta, unit, stockBefore/After, supplierName, purchaseOrderId, invoiceId, orderId, severity

### Export PDF

Helper: `exportProductTimelinePdf()` · abre HTML en ventana nueva y dispara `window.print()` (sin dependencias PDF externas).

- Cabecera con KPIs del producto (stock, consumo 14d, costes, ventas relacionadas, alertas)
- Tabla de eventos filtrados (mismo subconjunto que CSV)
- Footer con aviso de alcance

### Límites de export

| Límite | Detalle |
|--------|---------|
| **Solo eventos cargados** | Exporta `filteredEvents` derivados de movimientos/facturas/pedidos **ya en memoria** (listener + páginas “Cargar más”) |
| **Filtros respetados** | Tipo (Todos / Consumo / Compras / …) y rango fechas se aplican antes del export |
| **No es histórico completo** | Facturas/pedidos fuera de ventana **100** no generan filas en timeline ni en export |
| **“Cargar más”** | Paginación solo de movimientos centrales; cada página extra entra en export posterior |
| **Aviso UI** | *Exporta los eventos cargados actualmente (filtros aplicados).* |

### Límites de deep-link

| Límite | Comportamiento |
|--------|----------------|
| **Factura/recepción fuera de ventana** | Fetch puntual + banner + highlight (si existe y permisos OK) |
| **Documento no encontrado** | Sin fila ni highlight; facturas/recepciones **sin aviso explícito** |
| **`receiptId` de otro pedido** | Fetch OK pero **no** se inserta (validación `purchaseOrderId`) |
| **TPV comanda cerrada** | Aviso *Comanda no está activa*; comanda vacía; **sin** reconstrucción histórica |
| **TPV `lineId` inválido** | Aviso discreto; comanda visible si está activa |
| **Permisos Firestore** | `getDoc` fallido → sin documento ni aviso (fallo silencioso) |
| **Inserción temporal** | Desaparece al recargar si sigue fuera del listener |

### Paginación “Cargar más” (movimientos)

En timeline (`/dashboard/inventario/productos/{productId}/timeline`):

```
liveMovements (listener 50)
  + pagedMovements (fetchCentralStockMovementsForProductPage)
  → mergeCentralStockMovementsDeduped
  → buildProductTimelineEvents
```

Botón **Cargar más** en `ProductTimelinePaginationBar`. No sustituye paginación general de facturas ni pedidos.

---

### Cómo interpretar alertas derivadas

Las alertas **no** son notificaciones push ni documentos auditables independientes. Se generan así:

```
Por cada movimiento central con stockAfter conocido (orden cronológico):
  │
  ├─ Si stockAfter ≤ 0 y (stockBefore > 0 o null)
  │     └─► evento out_of_stock  (severity: danger)
  │
  └─ Si minStock > 0 y 0 < stockAfter ≤ minStock
        y (stockBefore > minStock o null)
        └─► evento low_stock  (severity: warning)

Además, si el producto está hoy en estado resolveStockStatus → low | out:
  └─► un evento sintético “Stock bajo/sin stock actual” (fuente stock_status)
```

**Interpretación operativa:**

- Una alerta histórica indica **el cruce de umbral en ese movimiento**, no necesariamente que el producto siga en ese estado después.
- Puede haber **varias** alertas del mismo tipo si el stock oscila (venta → bajo → recepción → bajo otra vez).
- El KPI “Alertas” cuenta eventos `low_stock` + `out_of_stock` en la ventana cargada (incluye la sintética actual).
- Para auditoría legal/contable, usar documentos fuente (`movementId`, `invoiceId`, `purchaseOrderId`) del panel lateral — no la alerta derivada sola.

---

## Qué NO hace todavía

- Conversiones automáticas entre unidades (`ml` ↔ `l`, `g` ↔ `kg`).
- Alertas ni bloqueo por stock mínimo (`inventory.minStock` es informativo en ficha).
- Merma automática ligada a KDS o cierre.
- Coste dinámico / valoración de inventario en tiempo real.
- Snapshots históricos de definición de receta o modificadores en el movimiento.
- Worker offline / cola diferida de apply con reintentos.
- Auditoría avanzada (aprobaciones, firma, export contable).
- Unificación total del ledger (legacy + central en una sola colección).
- Consumo al **cobrar** (solo al **enviar** comanda).

---

## Próximas fases (roadmap sugerido)

1. **Conversiones de unidades** — apply tolerante o normalización previa.
2. **Stock mínimo** — avisos operativos y opcional bloqueo TPV.
3. **Mermas** — nuevo `source` en ledger central + flujo KDS/cierre.
4. **Coste dinámico** — recalcular valor inventario desde movimientos y recepciones.
5. **Analytics inventario** — agregados por periodo, producto, estación.
6. **Timeline producto** — paginación general facturas/pedidos; deep-link a OCR concreto; export contable avanzado (deep-links, highlight, fetch puntual, export CSV/PDF y paginación movimientos ya disponibles — ver [Deep-links y exportación del Timeline](#deep-links-y-exportación-del-timeline)).
7. **Unificación ledger** — migrar legacy → central; un solo listener.
8. **Offline / locks / retries** — apply robusto ante red intermitente en sala.

---

## Validación manual rápida

1. Configurar **Law** con escandallo (Ginebra 50 ml) y modificador **Tónica** (-1 ud).
2. TPV → enviar comanda → comprobar ledger central y `currentStock`.
3. Inventario → Tónica / Ginebra → “Movimientos de stock” en tiempo real.
4. Cancelar línea en `sent` o `preparing` → reversiones visibles y stock restaurado.
5. Cancelar en `prepared` → línea cancelada **sin** reversal de stock.

Checklist de release: [hostly-release-checklist.md](./hostly-release-checklist.md).
