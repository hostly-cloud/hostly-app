# Hostly — Roles, capabilities y Firestore Rules

Documentación de la capa de permisos operacionales (Fase 5 frontend + Fase 5B rules). Referencia para QA, soporte y futuras fases de hardening.

| Campo | Valor |
|-------|--------|
| **Última revisión** | Fase 5 / 5B / 5C / **5D–5F** — TPV refunds, `cancelledLineIds`, remove-one cancel |
| **Código frontend** | `lib/auth/hostly-capabilities.ts`, `hooks/useHostlyCapabilities.ts`, `components/auth/capability-guard.tsx` |
| **Rules** | `firestore.rules` (helpers `canRefundTpv`, `isRefundWrite`, `isCancellingOrderItemsArray`, `canChargeTpv`, `isCancellingOrderLine`) |

---

## 1. Resumen

Hostly usa **dos capas complementarias**:

| Capa | Qué hace | Seguridad real |
|------|----------|----------------|
| **Frontend (Fase 5)** | Oculta/deshabilita acciones sensibles en UI | No — UX y prevención de errores |
| **Firestore Rules (Fase 5B)** | Bloquea writes no autorizados en el backend | Sí — para paths endurecidos |

Un usuario técnico puede saltarse la UI; las rules protegen los writes críticos ya migrados.

---

## 2. Roles operacionales

Roles normalizados (`HostlyRole`) usados por la matriz de capabilities:

| Rol | Descripción operativa |
|-----|------------------------|
| **owner** | Propietario / acceso completo |
| **admin** | Administrador (mismas capabilities que owner en frontend) |
| **manager** | Encargado: TPV completo, KDS, inventario, compras, analytics |
| **waiter** | Camarero: vender, cancelar líneas enviadas, cobrar |
| **kitchen** | Cocina: solo KDS |
| **viewer** | Solo lectura analítica (analytics.view) |

### 2.1 Perfil Firebase actual (`users/{uid}`)

El perfil persiste roles canónicos (`owner`, `admin`, `manager`, `waiter`,
`kitchen`, `viewer`) o aliases históricos reconocidos. `users/{uid}` es la
autoridad y `usuarios/{uid}` debe contener el mismo tenant, email, status y un
rol crudo cuya **normalización canónica** coincida con el canónico.

Las invitaciones nuevas persisten `admin`, `manager` o `waiter`. Los perfiles e
invitaciones históricos con `staff` se interpretan como `waiter`.

### 2.3 Status obligatorio

`status` ausente, vacío, nulo o desconocido invalida el perfil en todas las
capas. Solo `active` / `enabled` autorizan operación. `inactive`, `suspended` y
`disabled` fallan cerrados.

### 2.2 Aliases legacy (normalización)

Tanto en frontend (`normalizeHostlyRole`) como en rules (`normalizedRole()`):

| Valor en perfil | Rol normalizado |
|-----------------|-----------------|
| `owner`, `propietario` | `owner` |
| `admin`, `administrator` | `admin` |
| `manager`, `gerente`, `encargado` | `manager` |
| `staff`, `operativo`, `operational`, `employee`, `empleado`, `waiter`, `camarero`, `camarera`, `staff_tpv` | `waiter` |
| `kitchen`, `cocina`, `cook` | `kitchen` |
| `viewer`, `readonly`, `read_only` | `viewer` |
| *(vacío / ausente / desconocido)* | Perfil no autorizado |

Comparación insensible a mayúsculas/minúsculas.

---

## 3. Compatibilidad legacy segura

### 3.1 `staff` → `waiter`

Los perfiles antiguos con `role: "staff"` conservan únicamente la operación de
sala: vender, cancelar líneas y cobrar. No obtienen inventario, compras,
devoluciones, unión de mesas, KDS, analítica ni administración.

### 3.2 Rol ausente o desconocido

Un rol ausente, vacío o desconocido invalida el perfil en frontend, servidor,
Firestore Rules y Storage Rules. No existe fallback con capabilities.

---

## 4. Capabilities frontend (Fase 5)

Definidas en `lib/auth/hostly-capabilities.ts` como `HostlyCapability`:

| Capability | Label UI |
|------------|----------|
| `tpv.sell` | Vender en TPV |
| `tpv.cancel_line` | Cancelar líneas |
| `tpv.discount` | Aplicar descuentos |
| `tpv.charge` | Cobrar mesas |
| `tpv.refund` | Devoluciones |
| `tpv.join_tables` | Unir/separar mesas |
| `kds.manage` | Gestionar KDS |
| `inventory.view` | Ver inventario |
| `inventory.edit` | Editar inventario |
| `purchases.view` | Ver compras |
| `purchases.manage` | Gestionar compras |
| `supplier_invoices.manage` | Registrar facturas proveedor |
| `analytics.view` | Ver analítica |
| `settings.manage` | Gestionar configuración |
| `users.manage` | Gestionar usuarios |

### 4.1 Matriz rol → capabilities

| Capability | owner | admin | manager | waiter | kitchen | viewer |
|------------|:-----:|:-----:|:-------:|:------:|:-------:|:------:|
| tpv.sell | ✓ | ✓ | ✓ | ✓ | | |
| tpv.cancel_line | ✓ | ✓ | ✓ | ✓ | | |
| tpv.discount | ✓ | ✓ | ✓ | | | |
| tpv.charge | ✓ | ✓ | ✓ | ✓ | | |
| tpv.refund | ✓ | ✓ | ✓ | | | |
| tpv.join_tables | ✓ | ✓ | ✓ | | | |
| kds.manage | ✓ | ✓ | ✓ | | ✓ | |
| inventory.view | ✓ | ✓ | ✓ | | | |
| inventory.edit | ✓ | ✓ | ✓ | | | |
| purchases.view | ✓ | ✓ | ✓ | | | |
| purchases.manage | ✓ | ✓ | ✓ | | | |
| supplier_invoices.manage | ✓ | ✓ | ✓ | | | |
| analytics.view | ✓ | ✓ | ✓ | | | ✓ |
| settings.manage | ✓ | ✓ | | | | |
| users.manage | ✓ | ✓ | | | | |

### 4.2 Integración UI (Fase 5)

| Área | Capability | Componente / hook |
|------|------------|-------------------|
| TPV cobrar | `tpv.charge` | `carta-page-content.tsx` |
| TPV cancelar línea | `tpv.cancel_line` | `carta-page-content.tsx` |
| TPV join/separar mesas | `tpv.join_tables` | `carta-page-content.tsx` |
| Inventario guardar | `inventory.edit` | `inventario-stock-section.tsx` |
| Compras crear/convertir | `purchases.manage` | `compras-inteligentes/page.tsx` |
| Facturas registrar | `supplier_invoices.manage` | `facturas-proveedor/page.tsx` |
| Configuración | `settings.manage` | `configuracion/layout.tsx` |
| Usuarios | `users.manage` | `usuarios/page.tsx` |
| Dashboard módulos | por capability | `dashboard/page.tsx` |

Mensaje UX denegado: *"No tienes permiso para esta acción"* (sin modal agresivo).

---

## 5. Frontend guard vs Firestore rules

| Aspecto | Frontend guard | Firestore rules |
|---------|----------------|-----------------|
| **Objetivo** | UX, ocultar botones | Seguridad en writes |
| **Fuente de rol** | `useAuth().role` + `normalizeHostlyRole` | `users/{uid}` o `usuarios/{uid}` → `normalizedRole()` |
| **Granularidad** | 16 capabilities | Helpers agregados (`canManageInventory`, etc.) |
| **Reads** | No bloquea | Sin cambio (sameRestaurant) |
| **Orders / payments** | Parcial (UI cobro/cancel/refund) | **Parcial (5C–5F):** `payments` create/update, `orderItems` cancel, `orders` cancel vía `cancelledLineIds` |
| **Bypass** | DevTools / API directa | Denegado en paths protegidos |

**Regla de oro:** la UI guía al usuario; las rules son la autoridad final en Firestore.

---

## 6. Firestore rules — helpers (Fase 5B)

Ubicación: `firestore.rules` (inicio del archivo, antes de `sameRestaurant`).

| Helper | Lógica |
|--------|--------|
| `userProfileData()` | Lee `users/{uid}` o fallback `usuarios/{uid}` |
| `userRole()` | Campo `role` en minúsculas |
| `normalizedRole()` | Matriz §2.2 + legacy §3 |
| `isOwnerOrAdmin()` | owner \| admin |
| `isManagerOrAbove()` | owner \| admin \| manager |
| `hasOperationalRole(name)` | Comparación exacta post-normalización |
| `canManageInventory()` | `isManagerOrAbove()` |
| `canManagePurchases()` | `isManagerOrAbove()` |
| `canManageSupplierInvoices()` | `isManagerOrAbove()` |
| `canManageSettings()` | `isOwnerOrAdmin()` |
| `canManageUsers()` | `isOwnerOrAdmin()` *(preparado, sin match activo)* |
| `canChargeTpv()` | owner/admin/manager/waiter **(activo Fase 5C en `payments` create)** |
| `canCancelTpvLine()` | owner/admin/manager/waiter **(activo 5C `orderItems` cancel + 5D `orders` cancel)** |
| `canRefundTpv()` | owner/admin/manager **(activo Fase 5D en `payments` update refund)** |
| `isCancelledLineStatus()` | Alias `cancelled` / `canceled` / `cancelado` |
| `orderItemLineQuantity()` | Lee `quantity` o `qty` |
| `isCancellingOrderLine()` | Detecta cancelación real en diff de `orderItems` |
| `isRefundWrite()` | Detecta refund/anulación en diff de `payments` **(activo Fase 5D)** |
| `isCancellingOrderItemsArray()` | Detecta cancel en `orders` cuando cambian `items[]` **y** `cancelledLineIds` **(activo 5D+5E/5F)** |
| `parseOrderCancelledLineIds()` | Helper cliente en `lib/firestore/orders.ts` (parse legacy) |
| `productCreateTouchesInventory()` | Request incluye clave `inventory` |
| `productUpdateTouchesInventory()` | Diff afecta clave `inventory` |

Tenant gate existente sin cambios: `sameRestaurant(restaurantId)` + perfiles multi-restaurante (`restaurantIds`).

---

## 7. Paths protegidos en Fase 5B

Solo **writes** endurecidos. **Reads** siguen en `sameRestaurant`.

| Path | Operación | Condición extra |
|------|-----------|-----------------|
| `restaurants/{rid}/products/{pid}` | create | Si payload incluye `inventory` → `canManageInventory()` |
| `restaurants/{rid}/products/{pid}` | update | Si diff toca `inventory` → `canManageInventory()` |
| `restaurants/{rid}/products/{pid}/stockMovements/{id}` | create | `canManageInventory()` |
| `restaurants/{rid}/purchaseOrders/{id}` | create, update | `canManagePurchases()` |
| `restaurants/{rid}/purchaseReceipts/{id}` | create, update | `canManagePurchases()` |
| `restaurants/{rid}/supplierInvoices/{id}` | create, update | `canManageSupplierInvoices()` |
| `restaurants/{rid}/config/tableGroups` | create, update | `isManagerOrAbove()` |
| `restaurants/{rid}/config/floorPlanLayouts` | create, update | `canManageSettings()` |
| `restaurants/{rid}/config/printers` | create, update | `canManageSettings()` |

### 7.1 Intencionalmente permisivos (sin cambio Fase 5B)

| Path | Motivo |
|------|--------|
| `activityLogs` | Append-only operacional (Fase 1) |
| `tablePresence` | Soft locks multi-tablet (Fase 2) |
| `activeSessions` | Sesiones/dispositivo (Fase 3) |
| Reads en todos los paths anteriores | Realtime / KDS / TPV |

---

## 7.2 Fase 5C — TPV Rules Hardening incremental

Endurecimiento **mínimo riesgo** sobre cobros y cancelaciones. Objetivo: alinear backend con capabilities frontend sin romper realtime, KDS ni flujo comanda.

### Paths endurecidos (Fase 5C)

| Path | Operación | Condición |
|------|-----------|-----------|
| `payments/{paymentId}` | **create** | `sameRestaurant()` + **`canChargeTpv()`** |
| `orderItems/{orderItemId}` | **update** | `sameRestaurant()` + tenant intacto + (**`!isCancellingOrderLine()`** OR **`canCancelTpvLine()`**) |

**Reads:** sin cambios en ambos paths.

### `payments` create → `canChargeTpv()`

Roles autorizados a crear documentos en colección raíz `payments`:

- `owner`, `admin`, `manager`, `waiter`

Roles **denegados** en create:

- `kitchen`, `viewer`, rol desconocido

Alineado con capability frontend `tpv.charge`. El write típico viene de `handleConfirmPayment` en TPV (`status: "paid"`, `type: "table_amount"`, etc.).

### `orderItems` update → `isCancellingOrderLine()`

Solo cuando el **diff del update** indica cancelación explícita se exige **`canCancelTpvLine()`**. El resto de updates conserva el comportamiento anterior (sameRestaurant).

#### Qué cuenta como cancelación

Helper `isCancellingOrderLine()` devuelve `true` si ocurre **alguna** de:

1. **Transición de status a cancelado** — de cualquier status previo no cancelado hacia `cancelled`, `canceled` o `cancelado` (estados reales del proyecto).
2. **`cancelledAt` nuevo** — el campo pasa a int cuando antes no existía o era null.
3. **Cantidad → 0** — `quantity` o `qty` baja a ≤ 0 desde un valor > 0 (p. ej. quitar la última unidad en TPV).

#### Qué NO cuenta como cancelación (KDS / TPV normal)

- `sent` → `preparing` → `ready` / `prepared` → `served`
- Updates solo de `updatedAt`, timestamps de cocina, metadata operativa
- Decremento de cantidad que **no** llega a 0
- **Create** de `orderItems` (envío comanda)

### Por qué no rompe KDS

| Flujo | Colección | ¿Gate Fase 5C? |
|-------|-----------|----------------|
| Marcar preparado / servido (KDS nuevo) | `orders.items[]` | **No** — update general de orders sin cambio |
| Cocina legacy (`/dashboard/cocina`) | `orderItems` status preparing/ready/served | **No** — no dispara `isCancellingOrderLine()` |
| Listeners realtime KDS | read `orderItems` / `orders` | **No** — reads intactos |
| Envío comanda | create `orderItems` | **No** — create sin capability |

### Qué NO se endureció todavía (Fase 5C — histórico)

> **Actualización 5D–5F:** los gaps listados abajo en `orders.items[]` y `payments` update quedaron cerrados en fases posteriores (ver §7.3).

| Path / operación | Motivo (5C) | Estado post-5F |
|------------------|-------------|----------------|
| **`orders/{id}` update** | KDS escribe `items[]` con prepared/served | **Cerrado 5D+5E+5F** — gate vía `cancelledLineIds` |
| **`payments` update** | Anulación pago parcial | **Cerrado 5D** — `isRefundWrite()` + `canRefundTpv()` |
| **`orderItems` create** | Envío a cocina debe seguir libre | Sin cambio |
| **`restaurants/{rid}/stockMovements`** | Consumos modifier/recipe en venta TPV | Sin cambio |
| **Reads globales** | Multi-tablet / offline recovery | Sin cambio |

### Gap conocido: `orders.items[]` (resuelto en 5E/5F)

Ver §7.3 — el TPV escribe `cancelledLineIds` con `arrayUnion(lineId)` en cancelaciones reales; rules detectan el diff sin analizar arrays profundos.

### `payments` update / refunds (resuelto en 5D)

Ver §7.3 — `handleCancelPartialPayment` queda protegido por `isRefundWrite()` cuando `status` pasa a `cancelled`.

---

## 7.3 Fases 5D–5F — TPV cancellations / refunds

Cierre del hardening TPV incremental: refunds en backend, trazabilidad `cancelledLineIds` en `orders`, y cobertura del flujo remove-one-unit.

### Resumen por fase

| Fase | Alcance | Código | Rules |
|------|---------|--------|-------|
| **5D** | Refunds + preparación `orders` cancel | — | `isRefundWrite()`, `canRefundTpv()`, `isCancellingOrderItemsArray()` wired |
| **5E** | Campo `cancelledLineIds` en cancel explícita | `handleCancelSentOrderLine` | Gate `orders` activo al escribir campo |
| **5F** | Mismo campo en remove-one → cancel | `handleRemoveOneUnitFromLine`, `handleRemoveOnePersistedUnit` | Cierra gap parcial 5E |

### `payments` update → `isRefundWrite()` + `canRefundTpv()`

| Path | Operación | Condición |
|------|-----------|-----------|
| `payments/{paymentId}` | **update** | `sameRestaurant()` + tenant intacto + (**`!isRefundWrite()`** OR **`canRefundTpv()`**) |

**Create** (5C) sin cambio: `canChargeTpv()`.

#### Qué cuenta como refund (`isRefundWrite()`)

Devuelve `true` si el **diff** del update incluye **alguna** señal de devolución/anulación:

1. **Transición de `status`** hacia `refunded`, `refund`, `devolucion`, `cancelled` o `canceled` (valor distinto al anterior).
2. **`refundedAt`** nuevo (int cuando antes no existía).
3. **`refundAmount` > 0**.
4. **`finalTotal`** disminuye respecto al documento anterior.
5. **`amount` negativo**.
6. **`type` / `paymentKind` = `refund`**, o **`refund: true`**.

Updates normales (p. ej. solo `updatedAt`) **no** disparan el gate.

#### Roles refund

| Rol | `canRefundTpv()` | Capability frontend |
|-----|:----------------:|---------------------|
| owner, admin, manager | ✓ | `tpv.refund` |
| waiter | ✗ | ✗ |
| kitchen, viewer | ✗ | ✗ |

Flujo real: `handleCancelPartialPayment` → update `{ status: "cancelled", updatedAt }` en pagos `split_by_items` pagados.

### `orders.cancelledLineIds` — trazabilidad sin diff profundo

Firestore rules **no** pueden comparar arrays `items[]` línea a línea sin riesgo de bloquear KDS (`prepared` / `served`). Solución: campo explícito en el documento order.

```ts
// lib/firestore/orders.ts
cancelledLineIds?: string[]  // append-only vía arrayUnion en TPV
```

#### Helper rules: `isCancellingOrderItemsArray()`

Devuelve `true` solo cuando **simultáneamente**:

1. El diff afecta **`items`**.
2. El payload incluye clave **`cancelledLineIds`**.
3. **`cancelledLineIds`** es nuevo o **distinto** al valor anterior.

Si KDS solo reescribe `items[]` sin tocar `cancelledLineIds` → **no** exige `canCancelTpvLine()`.

Regla en `orders/{orderId}` update:

```
(!isCancellingOrderItemsArray() || canCancelTpvLine())
```

### Dónde escribe el TPV (`arrayUnion`)

| Handler | Cuándo escribe `cancelledLineIds` |
|---------|-----------------------------------|
| `handleCancelSentOrderLine` | Cancelación explícita línea enviada (5E) |
| `handleRemoveOneUnitFromLine` | Solo si qty llega a 0 y línea **no** es `pending` (5F) |
| `handleRemoveOnePersistedUnit` | Idem: qty ≤ 1 en línea persistida no pending (5F) |

Patrón Firestore:

```ts
cancelledLineIds: arrayUnion(lineId)
```

- **Merge atómico** — no sustituye el array completo.
- **Sin duplicados** — re-cancelar la misma línea no duplica el id.
- **Pedidos legacy** — ausencia del campo = array vacío implícito; hidratación TPV ignora el campo (no UI).

**Decremento sin cancelación** (qty 2 → 1): update de `items[]` **sin** `cancelledLineIds` → rules no gatean.

**Línea pending local**: no se escribe `cancelledLineIds` en Firestore.

Activity log (`action: "line_cancelled"`): metadata incluye `cancelledLineIds: [lineId]` donde ya existía log (5E).

### Por qué no rompe KDS (post-5F)

| Flujo | ¿Toca `cancelledLineIds`? | ¿Gate `orders`? |
|-------|:-------------------------:|:---------------:|
| KDS prepared / served | No | No |
| Enviar comanda / persist borrador | No | No |
| Cancel TPV / remove-one → cancel | Sí (`arrayUnion`) | Sí → `canCancelTpvLine()` |
| Decremento qty > 0 | No | No |

### Deploy coordinado app + rules

| Orden recomendado | Motivo |
|-------------------|--------|
| 1. Deploy **app** (5E/5F) sin rules 5D | Seguro: campo nuevo ignorado por rules antiguas |
| 2. Deploy **rules** 5D | Gate refund + orders cancel activo |
| **Ideal staging** | App + rules en la misma ventana; re-ejecutar §15.23–15.32 |

> Si se despliegan **solo rules 5D** antes de app 5E: `isCancellingOrderItemsArray()` sigue inactivo (campo ausente) — refunds sí quedan protegidos.

### Qué sigue pendiente (post-5F)

| Item | Notas |
|------|-------|
| **Pedidos cancelados pre-5E** | Sin `cancelledLineIds` histórico; no afecta carga TPV |
| **`orderItems` en remove-one** | Rules 5C protegen cancel en diff; flujo normal alineado |
| **`payments` create con status refund** | Create sigue en `canChargeTpv()`; refund formal vía update |
| **`restaurants/{rid}/stockMovements`** | Consumos venta sin capability |
| **Roles granulares en invitaciones** | Schema `users.role` waiter/kitchen en producción |
| **Custom claims JWT** | Reducir `get()` en rules (fase futura) |

---

## 7.4 Hardening Bloque 1 — Iteración B (mutaciones TPV)

Autorización **server-side tipada** para mutaciones sensibles de comandas, KDS y pagos. El cliente operativo no puede reemplazar `orders.items[]`, escribir `orderItems` ni crear/actualizar `payments` directamente.

### Fuente canónica y proyección

| Superficie | Rol | Escritura |
|------------|-----|-----------|
| **`orders.items[]`** | Proyección server-owned | Solo Admin SDK en transacción con `orderItems` |
| **`orderItems/{id}`** | Líneas enviadas+ (KDS/cancel) | Solo Admin SDK, sincronizado con `items[]` |
| **`orders/{id}` metadata** | Cliente | Sin `items[]`, `total`, `cancelledLineIds` |
| **`payments/{id}`** | Cobros/refunds | Solo Admin SDK |

El servidor reconstruye precio, producto, modificadores y totales desde catálogo `restaurants/{rid}/products` + `modifierGroups`. El cliente envía **intención mínima**: `lineId`, `productId`, `quantity`, IDs de modificadores, `note`.

### Operaciones API (reemplazan `sync-items`)

| Endpoint | Capability | Intención |
|----------|------------|-----------|
| `POST /api/tpv/orders/create-open` | `tpv.sell` | `tableId`, `lines[]`, `markSent?` |
| `POST /api/tpv/orders/upsert-sale-lines` | `tpv.sell` | `orderId`, `lines[]`, `markSent?`, `expectedUpdatedAtMs?` |
| `POST /api/tpv/orders/cancel-lines` | `tpv.cancel_line` | `orderId`, `lineIds[]` |
| `POST /api/tpv/orders/transition-line-status` | `kds.manage` | `orderId`, `lineId`, `expectedStatus`, `nextStatus` |
| `POST /api/tpv/payments/charge` | `tpv.charge` | `orderId`, `amount`, `paymentMethod`, `type`, … |
| `POST /api/tpv/payments/refund` | `tpv.refund` | `paymentId` |

`POST /api/tpv/orders/sync-items` → **410 Gone** (deprecado).

### Rules cliente (Firestore)

| Colección | create/update cliente |
|-----------|----------------------|
| `orders` | Metadata waiter permitida; **`items[]`, `total`, `cancelledLineIds` denegados** para todos los roles |
| `orderItems` | **Denegado** (`false`) |
| `payments` | **Denegado** (`false`) |

### Riesgos abiertos (no cerrados en esta iteración)

- Descuentos de mesa en `orders` no recalculados server-side en `charge_order`.
- Split KDS con `qty > 1` (avance parcial de línea) sin operación `split_line` dedicada.
- `handleCancelPartialPayment` (cancelar split_by_items) aún sin endpoint tipado.
- Productos abiertos / precio manual sin operación diferenciada → fallo cerrado si no hay catálogo.

### Compatibilidad operativa

- TPV Carta y `persist-open-order-for-table` / `useMesaComanda` usan API para `items[]`.
- KDS (`order-items-board`, `sala-view`) sigue escribiendo `orders.items[]` con `kds.manage`.
- Cocina legacy escribe `orderItems` con transiciones KDS.
- Sala que marque servido requiere `kds.manage` según matriz (waiter no recibe el permiso).

### Gap cerrado vs pendiente

| Hallazgo | Estado Iter B |
|----------|----------------|
| Bypass `orders.items[]` waiter | **Cerrado** — rules + API |
| Create orders con privilegios | **Cerrado** — allowlist |
| Create orderItems con KDS/cancel | **Cerrado** |
| Update orderItems arbitrario | **Cerrado** — allowlists por camino |
| Create payments refund | **Cerrado** — allowlist + status/type |
| Validación profunda precio vs catálogo en rules | **No en rules** — API valida shape TPV; precio canónico catálogo queda fuera de alcance rules |

---

## 8. Paths NO protegidos aún

| Path / operación | Riesgo | Fase prevista |
|------------------|--------|---------------|
| `restaurants/{rid}/stockMovements` | Consumo modifier/recipe en venta | 5g+ |
| `purchaseDrafts` | Borradores compras | 5g+ |
| `operationStations`, `modifierGroups`, `productFamilies` | Config carta | 5g+ |
| `supplierProductAliases` | OCR aliases | 5g+ |
| `products/{productId}` (legacy root) | Catálogo legacy | Sin plan |
| `tables`, `zones`, `floorPlans` | Mapa sala | Evaluar |
| Doc padre `restaurants/{rid}` write | Metadatos restaurante | Evaluar |

> **Iteración B:** `payments` create refund y bypass `orders.items[]` waiter quedan cerrados (§7.4). La fila histórica anterior ya no aplica.

### Endurecidos TPV (referencia 5C–5F)

| Path | Operación | Gate |
|------|-----------|------|
| `payments/{id}` | **create** | `canChargeTpv()` |
| `payments/{id}` | **update** (refund) | `canRefundTpv()` si `isRefundWrite()` |
| `orderItems/{id}` | **update** (cancel) | `canCancelTpvLine()` si `isCancellingOrderLine()` |
| `orders/{id}` | **update** (cancel) | `canCancelTpvLine()` si `isCancellingOrderItemsArray()` |
| `orders/{id}` | **update** `items[]` (waiter) | **Denegado** — usar API `sync-items` |
| `orders/{id}` | **create/update** (waiter) | Allowlists §7.4 — sin `items[]` en create |
| `orderItems/{id}` | **create/update** | Allowlists cerradas §7.4 |
| `payments/{id}` | **create** | Allowlist §7.4 — sin refund preinyectado |

---

## 9. Riesgos conocidos

1. **Roles granulares no persistidos** — La mayoría de tenants solo tienen `owner`/`staff`; probar `waiter`/`kitchen` requiere editar manualmente `users/{uid}.role` en consola.
2. **Product create con `inventory` por defecto** — Crear producto en carta incluye bloque `inventory`; requiere `canManageInventory()` (manager+ OK).
3. **Ledger central `stockMovements`** — TPV sigue escribiendo consumos sin capability check; bypass de inventario vía ventas.
4. **Frontend ≠ rules en rol vacío** — Edge case teórico si perfil no hidrata y role ausente; rules tratan como owner.
5. **API routes server-side** — Admin SDK / routes Next.js no pasan por estas rules de cliente.
6. **Deploy desincronizado** — Rules 5D sin app 5E/5F: refunds protegidos pero gap `orders` persiste hasta deploy app.
7. **Pedidos legacy** — Cancelaciones anteriores a 5E sin `cancelledLineIds`; carga TPV OK; auditoría histórica incompleta en campo.
8. **Precio canónico en create orderItems** — Rules no validan precio contra catálogo; confianza en app + shape allowlist.
9. **KDS/manager `orders.items[]`** — Rules no validan profundamente cada línea del array; mitigación por rol (`kds.manage` / manager).

---

## 10. Deploy y validación de rules

### 10.1 Compilar (dry-run)

```powershell
cd c:\Users\ferba\Documents\HOSTLY\hostly-app
npx firebase deploy --only firestore:rules --dry-run
```

Esperado: `rules file firestore.rules compiled successfully` (warnings `Unused function: hasOperationalRole` / `canManageUsers` aceptables).

### 10.2 Desplegar

```powershell
firebase deploy --only firestore:rules
```

> **Deploy coordinado (5D–5F):** publicar **app** (5E/5F) y **rules** (5D) en la misma ventana de staging/producción. Ver §7.3. Sin deploy de rules, solo cambia el repo local.

### 10.3 Verificar en consola Firebase

1. [Firebase Console](https://console.firebase.google.com) → proyecto → **Firestore** → **Rules**.
2. Comprobar fecha de publicación y contenido de helpers `normalizedRole`.
3. **Rules Playground** (opcional): simular update `payments` con diff a `status: cancelled` → deny con rol `waiter`; allow con `manager`.

### 10.4 QA manual

Ver sección **§15 Roles y permisos** en `docs/hostly-qa-smoke-tests.md`:

- **5B + 5C:** §15.1–15.22
- **5D–5F:** §15.23–15.32 (refunds, `cancelledLineIds`, deploy coordinado)

---

## 11. Próximas fases recomendadas

| Fase | Alcance |
|------|---------|
| **Deploy staging** | App 5E/5F + rules 5D; ejecutar §15.23–15.32 |
| **5g** | Schema `users.role` granular + invitaciones waiter/kitchen |
| **5h** | Custom claims JWT para evitar `get()` en rules por request |
| **5i** | Endurecer `stockMovements` venta TPV; evaluar `payments` create refund |
| **5j** | `permission_denied` en activityLogs (opcional) |
| **Backfill opcional** | `cancelledLineIds` en pedidos históricos (script admin, no obligatorio) |

---

## 12. Referencias cruzadas

- QA smoke: `docs/hostly-qa-smoke-tests.md` → §15 (5B–5F)
- Release: `docs/hostly-release-checklist.md`
- Código capabilities: `lib/auth/hostly-capabilities.ts`
- Rules: `firestore.rules`
