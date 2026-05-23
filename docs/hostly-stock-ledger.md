# Hostly Stock Ledger

Documentación del ledger central de movimientos de stock operativo en Hostly. Describe el comportamiento **actual** del pipeline TPV → inventario (modifiers, escandallo base, apply y reversión).

Complemento operativo: [hostly-stock-flow.md](./hostly-stock-flow.md).

---

## Objetivo del ledger central

El ledger central es el registro **append-only** de todo consumo y reversión de stock originado en operación (TPV/comanda).

| Principio | Comportamiento actual |
|-----------|----------------------|
| **Source of truth operativo** | El stock disponible en tiempo real vive en `products/{productId}.inventory.currentStock`. El ledger no sustituye ese valor: lo **actualiza** vía apply. |
| **Append-only** | Los movimientos se crean con `setDoc`; no se editan salvo campos de apply (`applied`, `stockBefore`, `stockAfter`, `applyError`). |
| **Trazabilidad total** | Cada delta queda ligado a `orderId`, `lineId`, producto vendido e ingrediente/modifier consumido. |
| **Idempotencia** | IDs deterministas + skip en create/apply evitan doble descuento en reenvíos o cancelaciones repetidas. |
| **Realtime** | Firestore `onSnapshot` permite reflejar movimientos en Inventario/Stock (`listenCentralStockMovementsForProduct`). |

**Momento del descuento:** al **enviar comanda** (`sendLinesToComanda`), no al cobrar.

---

## Path Firestore

```
restaurants/{restaurantId}/stockMovements/{movementId}
```

- **`movementId`**: ID del documento (determinista; ver Idempotencia).
- **`restaurantId`**: tenant; validado en lectura/apply (`assertSameRestaurantDoc`).

Implementación: `lib/firestore/stock-movements.ts`.

---

## Estructura base

Campos presentes o previstos según el `source`. Los de apply se rellenan tras `applyStockMovementToCurrentStock`.

| Campo | Descripción |
|-------|-------------|
| `movementId` | ID del documento (= clave de idempotencia en la práctica). |
| `source` | Origen semántico del movimiento (`modifier_sale`, `recipe_sale`, …). |
| `type` | Duplicado operativo de `source` en los flujos TPV actuales. |
| `quantityDelta` | Variación de stock. Negativo = salida; positivo = entrada/reversión. |
| `unit` | Unidad del movimiento (`ud`, `ml`, `l`, `kg`, `g`, …). |
| `productId` | Producto de inventario afectado (catálogo central). |
| `productName` | Nombre desnormalizado del producto de inventario. |
| `orderId` | Comanda Firestore. |
| `lineId` | Línea de comanda. |
| `saleProductId` | Producto vendido en carta (ej. Gin Tonic / Law). |
| `saleProductName` | Nombre del producto vendido. |
| `modifierGroupId` | Solo `modifier_*`: grupo del modificador. |
| `modifierOptionId` | Solo `modifier_*`: opción del modificador. |
| `modifierOptionName` | Solo `modifier_*`: etiqueta de la opción (ej. Tónica). |
| `idempotencyKey` | Copia del `movementId` determinista. |
| `applied` | `false` al crear; `true` tras apply exitoso. |
| `appliedAt` | Timestamp server al aplicar. |
| `stockBefore` | `currentStock` leído en la transacción de apply. |
| `stockAfter` | `stockBefore + quantityDelta` tras apply exitoso. |
| `reversalOfMovementId` | Solo reversiones: ID del movimiento original consumido. |
| `applyError` | Error de apply (unidad incompatible, producto no encontrado, …). |
| `createdAt` | Timestamp server al crear el movimiento. |
| `createdBy` | UID del usuario autenticado (opcional). |

---

## Sources actuales (TPV → ledger central)

| Source | Significado |
|--------|-------------|
| `modifier_sale` | Consumo de inventario por opción de modificador al enviar comanda. |
| `modifier_sale_reversal` | Devolución de stock al cancelar línea elegible; referencia al `modifier_sale` original. |
| `recipe_sale` | Consumo de ingredientes del escandallo base (`product.recipe`) al enviar comanda. |
| `recipe_sale_reversal` | Devolución de stock al cancelar línea elegible; referencia al `recipe_sale` original. |

> **Nota:** El tipo `STOCK_MOVEMENT_SOURCES` también declara `inventory_receipt` y `manual_adjustment` para evolución del ledger. Hoy esas operaciones siguen escribiendo principalmente en el **ledger legacy** bajo `products/{id}/stockMovements` (recepciones y ajustes desde el panel de inventario).

---

## Idempotencia

### IDs deterministas

El **document ID** es la clave de idempotencia.

**Modifier (consumo):**

```
{orderId}_{lineId}_{inventoryProductId}_{modifierOptionId}_modifier
```

**Modifier (reversión):**

```
{orderId}_{lineId}_{inventoryProductId}_{modifierOptionId}_modifier_reversal
```

**Recipe (consumo):**

```
{orderId}_{lineId}_{ingredientProductId}_recipe
```

**Recipe (reversión):**

```
{orderId}_{lineId}_{ingredientProductId}_recipe_reversal
```

Partes sanitizadas con `sanitizeMovementIdPart` (caracteres no alfanuméricos → `_`).

### Reglas de skip

| Fase | Condición | Efecto |
|------|-----------|--------|
| **Create** | Documento ya existe | `skipped += 1`; no se sobrescribe. |
| **Apply** | `applied === true` | `status: "skipped"`; no se vuelve a tocar `currentStock`. |
| **Reversión create** | Reversal ya existe | Skip. |
| **Reversión create** | Original no existe o `applied !== true` | No se crea reversal (`skippedNoOriginal`). |

### Escenarios seguros

- **Reenvío de comanda:** mismo `orderId` + mismas líneas → mismos IDs → create skip + apply skip.
- **Cancelación repetida:** reversal ID fijo → segundo intento skip en create.
- **Comanda enviada aunque falle inventario:** errores de ledger/apply se registran en consola; la comanda **no se bloquea**.

---

## Apply pipeline

Secuencia real tras enviar comanda o cancelar línea elegible:

```
1. createStockMovementsFor*()     → append movimiento(s) con applied: false
2. applyCreatedStockMovements()   → serie de apply por movementId
3. applyStockMovementToCurrentStock() → runTransaction Firestore
4. inventory.currentStock         → stockBefore + quantityDelta
5. movement                         → applied: true, stockBefore, stockAfter, appliedAt
```

Detalle de la transacción (`applyStockMovementToCurrentStock`):

1. Lee movimiento; si `applied === true` → skip.
2. Valida `productId`, `quantityDelta`, existencia del producto.
3. Comprueba compatibilidad de unidades (`isMovementUnitCompatibleWithProduct`).
4. Si incompatible → escribe `applyError` en el movimiento; **no** actualiza stock.
5. Si OK → actualiza `products/{productId}.inventory.currentStock` y marca movimiento aplicado.

Los helpers de reversión (`createStockReversalMovementsFor*`) invocan `applyCreatedStockMovements` al final si hay IDs pendientes.

---

## Riesgos conocidos

| Riesgo | Impacto |
|--------|---------|
| **Stock negativo permitido** | Apply no impone mínimo 0; `currentStock` puede quedar negativo si el consumo supera el stock. |
| **Unidades incompatibles** | Si la unidad del movimiento no coincide con `inventory.unit` del producto, apply falla con `applyError` (ej. `unit_incompatible:movement=ml,product=ud`). El movimiento queda en ledger sin aplicar. |
| **`prepared` / `served` no revierten** | Cancelar una línea ya preparada o servida no genera reversal de stock (regla conservadora). |
| **Ledger dual en paralelo** | Recepciones/ajustes manuales → legacy `products/{id}/stockMovements`. TPV → ledger central. Inventario muestra ambos (central primero, legacy como “Movimientos antiguos”). |
| **Sin snapshot histórico de recipe/modifiers** | El ledger guarda nombres desnormalizados al momento del movimiento, pero no congela la definición completa del modificador/receta si cambian después. |
| **Apply en serie** | `applyCreatedStockMovements` procesa IDs secuencialmente; alta concurrencia en el mismo producto depende de transacciones Firestore. |
| **Errores no bloquean TPV** | Fallos de inventario son `console.warn`; operación de sala continúa. |

---

## Índices Firestore

Consulta de Inventario/Stock por producto:

```
collection: restaurants/{restaurantId}/stockMovements
where productId == {productId}
orderBy createdAt desc
limit 50
```

Índice compuesto requerido (definido en `firestore.indexes.json`):

| Campo | Orden |
|-------|-------|
| `productId` | ASC |
| `createdAt` | DESC |

Despliegue:

```bash
firebase deploy --only firestore:indexes
```

**Fallback:** si el índice no está desplegado, `listenCentralStockMovementsForProduct` reintenta sin `orderBy`, ordena en cliente y limita lecturas (hasta 100 docs). Funcional pero menos eficiente.

---

## Referencias de código

| Módulo | Responsabilidad |
|--------|-----------------|
| `lib/firestore/stock-movements.ts` | Create, apply, reversal, listener UI |
| `lib/inventory/stock-movement-types.ts` | Tipos y sources |
| `lib/recipes/product-recipe-helpers.ts` | Consumo de escandallo base |
| `lib/modifiers/modifier-inventory-consumption.ts` | Consumo por modificador |
| `app/dashboard/carta/carta-page-content.tsx` | Integración en envío/cancelación de comanda |
| `app/dashboard/inventario/inventario-stock-section.tsx` | Visualización central + legacy |
