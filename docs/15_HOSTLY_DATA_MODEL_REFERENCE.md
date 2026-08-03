# Hostly — Referencia del Modelo de Datos

> Contrato oficial del modelo de datos de Hostly: entidades, relaciones, estados, persistencia e integridad.

**Estado:** oficial  
**Versión:** 1.0  
**Autoridad documental:** nivel 2 (contrato de datos)  
**Ámbito:** entidades de negocio, persistencia Firestore, estados, invariantes y evolución del schema  
**Subordinado a:** `00_HOSTLY_PRODUCT_BIBLE.md`, `11_HOSTLY_ENGINEERING_CONSTITUTION.md`  
**Relacionado con:** `01_HOSTLY_ARCHITECTURE_GUIDE.md`, `14_HOSTLY_MODULES_REFERENCE.md`, `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md`

---

# 1. Objetivo

## 1.1 Qué representa el modelo de datos

El modelo de datos de Hostly describe **qué existe en el negocio de un restaurante**, cómo se relacionan las piezas y qué reglas gobiernan su persistencia. No es un diagrama de pantallas ni de carpetas de código: es la **capa semántica** que conecta operación en vivo (mesas, pedidos, cocina), catálogo, inventario, compras, identidad y inteligencia aplicada.

Cada entidad documentada aquí responde a cuatro preguntas:

1. **Para qué existe** en el restaurante.
2. **Con qué otras entidades se relaciona**.
3. **Quién es propietario** de la verdad (Firestore, proyección derivada o dato efímero).
4. **Cómo evoluciona** desde su creación hasta su cierre o archivo.

## 1.2 Por qué es un contrato de largo plazo

Hostly opera con clientes reales, datos históricos y compatibilidad legacy. Un cambio de schema sin contrato produce:

- cobros duplicados o stock incoherente;
- fugas entre restaurantes;
- KDS y TPV desincronizados;
- analítica que contradice la operación.

Este documento es el **contrato de largo plazo** porque:

- fija la semántica que APIs, Rules, migraciones e IA deben respetar;
- distingue entidades canónicas, proyecciones y datos transitorios;
- documenta estados y transiciones permitidas;
- define invariantes que no pueden romperse sin decisión explícita en `04_HOSTLY_DECISIONS_LOG.md`;
- guía extensiones futuras (CRM, notificaciones, multi-ubicación) sin redefinir el núcleo operativo.

**Regla:** si el código y este documento divergen, el código describe la realidad actual; este documento describe el **contrato objetivo** y las excepciones legacy documentadas. Cualquier divergencia persistente debe resolverse con migración o actualización controlada del contrato.

---

# 2. Principios

## 2.1 Multi-tenant

Hostly es SaaS multi-restaurante. Ningún dato operativo existe “globalmente”: pertenece a un **tenant** (`restaurantId`). Queries, listeners, APIs server-side y procesos IA deben filtrar y validar tenant de forma explícita.

## 2.2 `restaurantId` obligatorio

Todo documento operativo persistente debe incluir `restaurantId` (o vivir bajo `restaurants/{restaurantId}/…`). Excepciones legacy (`restaurantes`, `mesas`) se tratan como **transición congelada**, no como patrón para datos nuevos.

El `restaurantId` de un documento existente es **inmutable** salvo migración administrativa auditada.

## 2.3 Compatibilidad hacia atrás

Conviven modelos canónicos y legacy:

| Par canónico / legacy | Regla |
| --- | --- |
| `restaurants` / `restaurantes` | Canónico: `restaurants`; legacy solo lectura/escritura controlada |
| `users` / `usuarios` | Canónico: `users`; mirror legacy |
| `tables` / `mesas` | Canónico: `tables` |
| Líneas en `orders.items[]` / colección `orderItems` | Coexistencia hasta auditoría de consumidores |
| `role: staff` → operacional `manager` | Normalización permanente hasta migración de perfiles |

Los parsers y servicios deben **aceptar datos antiguos** y **emitir datos canónicos** en escrituras nuevas.

## 2.4 Evolución sin romper datos

Ampliar el modelo sigue este orden:

1. Añadir campos **opcionales** con defaults seguros en lectura.
2. Backfill controlado (script o migración por tenant).
3. Consumidores nuevos leen el campo; consumidores viejos ignoran.
4. Endurecer validación solo cuando no queden documentos sin el campo.
5. Registrar la decisión en `04_HOSTLY_DECISIONS_LOG.md`.

Prohibido: renombrar campos operativos, cambiar semántica de estados o eliminar colecciones sin equivalencia probada.

## 2.5 Idempotencia

Operaciones económicas y de stock deben poder reintentarse sin efecto duplicado:

- **Pagos:** claves de idempotencia por intento de cobro.
- **Movimientos de stock:** `idempotencyKey` determinista por origen (línea de venta, recepción, modificador).
- **Activity log / auditoría:** `idempotencyKey` opcional para no duplicar eventos.
- **Print jobs:** `idempotencyKey` por línea y estación.

La proyección de stock (`currentStock` en producto) nunca sustituye al ledger de movimientos como fuente de verdad transaccional.

---

# 3. Entidades principales

Documentación **conceptual** (sin código). Para cada entidad: propósito, relaciones, propietario del dato y ciclo de vida.

> **Convención de propietario:** *Canónico Firestore* = fuente de verdad persistida; *Proyección* = derivado recalculable; *Runtime* = existe solo en sesión/dispositivo; *Legacy* = persistido pero en vía de retirada; *Planificado* = contrato futuro, no implementado íntegramente.

---

## 3.1 Restaurant

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Identidad y configuración raíz del negocio: nombre, moneda, zona horaria, onboarding, logo. |
| **Relaciones** | Padre de catálogo, inventario, config; referenciado por User, Order, Table y todas las entidades tenant. |
| **Propietario** | Canónico Firestore: `restaurants/{restaurantId}`. Legacy: `restaurantes/{id}` (Carta antigua). |
| **Ciclo de vida** | Creado en registro/onboarding → configurado → operativo → evoluciona sin borrado en operación normal. |

---

## 3.2 User

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Identidad autenticada (Firebase Auth) vinculada a uno o más restaurantes; nombre visible y pertenencia. |
| **Relaciones** | Pertenece a Restaurant; tiene Role; actúa en Order, Payment, ActivityLog; invita a otros User. |
| **Propietario** | Canónico Firestore: `users/{uid}`. Legacy: `usuarios/{uid}`. Auth: Firebase Authentication. |
| **Ciclo de vida** | Registro → vinculación a restaurante (owner o invitado) → activo → desactivación lógica (sin borrado destructivo de historial). |

Campos sensibles: `restaurantId`, `restaurantIds`, `role`, `restaurantName` (denormalizado). El cliente no puede modificarlos libremente.

---

## 3.3 Role

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Capacidad operativa del usuario: qué acciones puede intentar (TPV, KDS, inventario, cobro, etc.). |
| **Relaciones** | Atributo derivado de User; materializado en matriz de **capabilities** (`owner`, `admin`, `manager`, `waiter`, `kitchen`, `viewer`). |
| **Propietario** | Campo `role` en User + normalización (`staff` → `manager`); enforcement real en Firestore Rules y `hostly-capabilities`. |
| **Ciclo de vida** | Asignado en invitación o cambio administrativo → normalizado en cada lectura → auditado vía ActivityLog (`role_changed`). |

Role no es hoy un documento Firestore independiente; es **valor persistido + reglas derivadas**.

---

## 3.4 Product

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Ítem vendible y/o inventariable: precio, categoría, estación, modificadores, imagen, flags operativos. |
| **Relaciones** | Pertenece a Category, MenuFamily, ProductFamily; referenciado por OrderItem, Recipe, Ingredient, PurchaseOrder, StockMovement. |
| **Propietario** | Canónico: `restaurants/{restaurantId}/products/{productId}`. Legacy: subcolecciones bajo `restaurantes`. |
| **Ciclo de vida** | Creado (manual o IA) → activo/inactivo en carta → vendido en pedidos → posible baja lógica (`active: false`) sin borrar historial. |

Subestructuras embebidas: `inventory` (config stock), `recipe` (escandallo).

---

## 3.5 Category

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Agrupación comercial y de navegación en TPV/carta: orden, tipo (food/drink/general), comportamiento operativo. |
| **Relaciones** | Agrupa Product; vinculada a MenuFamily y ProductFamily; puede tener ModifierGroups por defecto. |
| **Propietario** | Configuración de carta bajo restaurante; parte legacy en stores locales (`CARTA_CATEGORIAS_CHANGED_EVENT`) — **no canónico**. |
| **Ciclo de vida** | Creada → ordenada → activa/inactiva → productos referencian `categoryId` (denormalización de nombre opcional). |

---

## 3.6 MenuFamily

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Familia de **menú/carta** (p. ej. Platos, Bebidas): agrupa categorías, define pase por defecto, estación sugerida y reglas de marcha. |
| **Relaciones** | Padre de Category; sugiere routing a ProductionStation; distinta de ProductFamily (clasificación analítica/inventario). |
| **Propietario** | Configuración carta (`CartaFamilia`); persistencia mixta central/legacy según ruta de configuración. |
| **Ciclo de vida** | Definida en configuración → categorías asignadas → afecta defaults de productos nuevos → desactivación sin romper referencias históricas. |

---

## 3.7 Modifier

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Grupo de opciones sobre un producto (formato, mixer, extra) con delta de precio y, opcionalmente, consumo de inventario. |
| **Relaciones** | Asignado a Product o Category; seleccionado en OrderItem; puede generar StockMovement (`modifier_sale`). |
| **Propietario** | Canónico: `restaurants/{restaurantId}/modifierGroups/{groupId}` con opciones embebidas. |
| **Ciclo de vida** | Creado → activo → usado en ventas → desactivación (`active: false`) preservando historial en pedidos. |

---

## 3.8 Recipe

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Escandallo del producto vendido: composición, coste teórico, habilitación de consumo automático en venta. |
| **Relaciones** | Embebido en Product; compuesto por Ingredient; dispara StockMovement (`recipe_sale`) al vender. |
| **Propietario** | Campo `recipe` dentro de ProductDocument (canónico central). |
| **Ciclo de vida** | Definido/actualizado en configuración → aplicado en venta → reversión en cancelación de línea. |

La UI de rentabilidad **calcula**; el ledger **aplica** consumos.

---

## 3.9 Ingredient

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Componente de una Recipe: referencia a producto inventariable, cantidad y unidad consumida por unidad vendida. |
| **Relaciones** | Hijo de Recipe; apunta a Product (como insumo); origen de líneas en StockMovement. |
| **Propietario** | Embebido en `recipe.ingredients[]` del Product; no es documento raíz independiente. |
| **Ciclo de vida** | Añadido a receta → validado contra catálogo → consumido/revertido transaccionalmente con la venta. |

---

## 3.10 InventoryItem

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Proyección de existencia y configuración de stock de un producto inventariable: unidad, mínimos, costes, proveedor sugerido. |
| **Relaciones** | Subestructura de Product; actualizada por StockMovement; referenciada en PurchaseOrder y SupplierInvoice. |
| **Propietario** | **Configuración:** campo `inventory` en Product. **Cantidad actual:** proyección derivada de `stockMovements` (con fallback legacy/localStorage en transición). |
| **Ciclo de vida** | Habilitado en producto → movimientos entran/salen → umbrales disparan sugerencias de compra → ajustes manuales auditados. |

---

## 3.11 Supplier

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Identidad de proveedor para compras, recepciones y facturas; matching OCR y aliases. |
| **Relaciones** | Referenciado en PurchaseOrder, SupplierInvoice, Product.inventory.supplierName, SupplierProductAlias. |
| **Propietario** | Hoy: catálogo canónico **local** (`CanonicalSupplier`) + nombres denormalizados en documentos de compra. Aliases: `supplierProductAliases`. **Planificado:** colección Firestore dedicada. |
| **Ciclo de vida** | Resuelto por nombre en compra → conciliado en recepción/factura → alias aprendido para futuras importaciones OCR. |

---

## 3.12 PurchaseOrder

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Intención formal de compra a proveedor: líneas, cantidades, coste estimado, estado de recepción. |
| **Relaciones** | Originado desde PurchaseDraft; genera PurchaseReceipt y StockMovement; vinculado a Supplier y Product. |
| **Propietario** | Canónico: `restaurants/{restaurantId}/purchaseOrders/{id}`. |
| **Ciclo de vida** | `draft` → `ordered` → recepción parcial/total → `received` o `cancelled`. |

---

## 3.13 Reservation

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Compromiso de servicio futuro: fecha, hora, comensales, mesa opcional, notas. |
| **Relaciones** | Referencia Table, Zone, FloorPlan; datos de Customer embebidos; puede influir en estado `reserved` de mesa. |
| **Propietario** | Canónico: `reservations/{id}` con `restaurantId`. |
| **Ciclo de vida** | `booked` → `seated` → `completed` \| `no_show` \| `cancelled`. |

---

## 3.14 Customer

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Identidad del comensal para reservas y, en el futuro, historial y fidelización. |
| **Relaciones** | Hoy embebido en Reservation; futuro: Order, campañas, Analítica. |
| **Propietario** | **Actual:** campos `customerName`, `customerPhone` en Reservation. **Planificado:** entidad `customers/{id}` canónica. |
| **Ciclo de vida** | Registro en reserva → actualización de contacto → (futuro) vinculación a visitas y pedidos. |

---

## 3.15 Table

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Unidad espacial operativa: mesa, tumbona, cama, etc., con capacidad, posición en plano y estado de ocupación. |
| **Relaciones** | Pertenece a FloorPlan y Zone; ancla Order; referenciada en Reservation y Payment; puede unirse en grupos. |
| **Propietario** | Canónico: `tables/{id}` con `restaurantId`. Legacy: `mesas`. |
| **Ciclo de vida** | Creada en editor → `free` \| `occupied` \| `reserved` → pedidos abiertos → cierre → libre. |

---

## 3.16 Zone

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Región dentro de un plano (terraza, salón, exterior) para organización visual y operativa. |
| **Relaciones** | Pertenece a FloorPlan; agrupa Table; referenciada en Reservation. |
| **Propietario** | Canónico: `zones/{id}` con `restaurantId`. |
| **Ciclo de vida** | Definida en configuración → mesas asignadas → editable con snapshots de plano. |

---

## 3.17 FloorPlan

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Plano operativo del restaurante: dimensiones, plano por defecto, activación en TPV. |
| **Relaciones** | Contiene Zone y Table; usado en TPV, Reservas y editor espacial; snapshots para historial de layout. |
| **Propietario** | Canónico: `floorPlans/{id}`; snapshots en subcolección/config del restaurante. |
| **Ciclo de vida** | Creado → marcado default opcional → activo/inactivo → versionado por snapshots en cambios mayores. |

---

## 3.18 Order

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Sesión de consumo en mesa (o equivalente): líneas, totales, estado de cobro, mesa, cancelaciones. |
| **Relaciones** | Contiene OrderItem; genera Payment, KitchenTicket (vista), PrintJob, StockMovement; vinculado a Table. |
| **Propietario** | Canónico: `orders/{id}` con `restaurantId` y `items[]` embebidos. |
| **Ciclo de vida** | Creado abierto → líneas añadidas/enviadas → cobro parcial/total → `paid`/`closed`; cancelaciones registradas en `cancelledLineIds`. |

---

## 3.19 OrderItem

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Línea vendida: producto, cantidad, precio, modificadores, estado de producción, timestamps KDS. |
| **Relaciones** | Hijo de Order; fuente de KitchenTicket, PrintJob, Payment (split), StockMovement. |
| **Propietario** | **Primario:** embebido en `orders.items[]`. **Compatibilidad:** colección `orderItems/{id}` para rutas KDS/legacy. |
| **Ciclo de vida** | `pending` → enviada (`sent`) → producción KDS → servida o `cancelled`; estados de producción **monotónicos** (no retroceden por write del cliente). |

---

## 3.20 Payment

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Registro inmutable de cobro: importe, método, propina, descuento, vinculación a pedido/mesa. |
| **Relaciones** | Referencia Order; puede usar Voucher; alimenta Analítica y ActivityLog. |
| **Propietario** | Canónico: `payments/{id}` con `restaurantId`. |
| **Ciclo de vida** | Creado en cobro → (opcional) actualización de reembolso/anulación autorizada → no se borra. |

---

## 3.21 KitchenTicket

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | **Vista operativa** de una o más OrderItem en estación de producción (cocina, barra, coctelería). No es factura ni pedido completo. |
| **Relaciones** | Proyección de OrderItem filtrada por estación; actualiza estados KDS; señala mesa lista vía eventos de sala. |
| **Propietario** | **Runtime / proyección:** no persiste como colección raíz; estado vive en líneas de Order (+ `orderItems` legacy). |
| **Ciclo de vida** | Aparece al enviar línea → progresa en KDS → `prepared`/`served` o cancelada; desaparece de cola activa al completarse. |

---

## 3.22 AIImportJob

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Trabajo de importación inteligente: extracción OCR/IA, borrador revisable, publicación a catálogo u otros dominios. |
| **Relaciones** | Referencia archivos en Storage; produce Product, Category; evoluciona hacia AI Engine multi-módulo. |
| **Propietario** | Canónico actual: `restaurants/{restaurantId}/menuImportDrafts/{id}` (`MenuImportDraft`). Jobs server-side efímeros en runtime API. |
| **Ciclo de vida** | `draft` → `analyzing` → `ready` \| `failed` → revisión humana → `published` \| `partially_published`. |

En documentación futura del AI Engine, **AIImportJob** es el nombre de contrato; **MenuImportDraft** es la implementación actual de Fase 1 (carta).

---

## 3.23 Notification

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Aviso dirigido a usuario o estación: mesa lista, impresión fallida, stock bajo, invitación pendiente. |
| **Relaciones** | Referencia User, Order, Table, PrintJob, Product (umbrales). |
| **Propietario** | **Planificado:** colección `notifications` o canal push. **Hoy:** señales ad hoc (eventos globales, badges UI, print job status) sin entidad unificada. |
| **Ciclo de vida** | Emitida → leída/descartada → expira (TTL) sin afectar verdad operativa. |

---

## 3.24 AuditEvent

| Aspecto | Descripción |
| --- | --- |
| **Propósito** | Trazabilidad append-only de acciones relevantes: pedidos, cobros, stock, compras, sesiones, roles. |
| **Relaciones** | Referencia entidad origen (`entityType`, `entityId`); actor User; metadata acotada. |
| **Propietario** | Canónico: `restaurants/{restaurantId}/activityLogs/{id}` (`ActivityLogDocument`). |
| **Ciclo de vida** | Append-only en evento → consulta histórica → retención según política (sin mutación ni borrado en operación normal). |

---

# 4. Relaciones

## 4.1 Grafo principal

```text
Restaurant
  ├── User (role, capabilities)
  ├── FloorPlan
  │     └── Zone
  │           └── Table
  ├── Product ──┬── Category
  │             ├── MenuFamily (vía Category)
  │             ├── ProductFamily (denorm)
  │             ├── ModifierGroup
  │             ├── Recipe → Ingredient → Product (insumo)
  │             └── inventory (InventoryItem config)
  ├── PurchaseOrder → PurchaseReceipt → StockMovement
  ├── Supplier (resolución + aliases)
  ├── Reservation → Customer (embebido)
  ├── Order → OrderItem → Payment
  │                  ├── KitchenTicket (vista KDS)
  │                  ├── PrintJob
  │                  └── StockMovement
  ├── AIImportJob → Product / Category
  └── AuditEvent (referencia cualquier entidad)
```

## 4.2 Relaciones operativas críticas

| Desde | Hacia | Cardinalidad | Naturaleza |
| --- | --- | --- | --- |
| Table | Order | 1 : N (temporal) | Una mesa puede tener pedido abierto; merge de grupo une pedidos |
| Order | OrderItem | 1 : N | Líneas embebidas; identificador estable por línea |
| OrderItem | StockMovement | 1 : N | Consumo/reversión por receta o modificador |
| PurchaseOrder | StockMovement | 1 : N | Entrada por recepción |
| Product | StockMovement | 1 : N | Ledger por producto inventariable |
| Reservation | Table | N : 1 | Opcional; mesa puede cambiar |
| User | AuditEvent | 1 : N | Actor en eventos |
| Payment | Order | N : 1 | Cobros parciales posibles |

## 4.3 Denormalización aceptada

Hostly denormaliza a propósito para rendimiento operativo:

- nombres de mesa, plano, zona en Reservation y Order;
- nombres de categoría/familia en Product;
- totales en Order y Payment.

**Regla:** la denormalización es **caché de lectura**; la entidad referenciada sigue siendo propietaria. Cambios históricos no reescriben pedidos cerrados.

---

# 5. Estados

## 5.1 Order

Hostly distingue **estado de cobro** y **estado operativo/flujo**:

### Estado de cobro (`OrderBillStatus`)

| Estado | Significado |
| --- | --- |
| `open` | Pedido activo; admite líneas y cobro pendiente |
| `paid` | Cobrado; pendiente de cierre administrativo |
| `closed` | Cierre contable completado |

### Estado operativo de mesa

Pedidos con estado activo para ocupación incluyen variantes de **abierto** (`open`, `sent`, etc.). Consultas de mesa libre/ocupada usan conjunto de estados activos, no solo el bill status.

### Cancelaciones

`cancelledLineIds[]` en Order registra líneas canceladas para rules TPV y reversión de stock.

---

## 5.2 OrderItem / producción (KDS)

Estados de línea (`ProductionLineStatus`) — **monotónicos**:

```text
pending → sent → preparing → prepared → served
                ↘ cancelled (terminal)
```

| Estado | Significado |
| --- | --- |
| `pending` | En TPV, no enviada a producción |
| `sent` | Enviada a estación |
| `preparing` | En preparación |
| `prepared` | Lista para servir / pase |
| `served` | Servida al cliente |
| `cancelled` | Anulada; terminal |

**Invariante:** un write del cliente no puede **retroceder** el rank de producción; solo KDS/autoridad superior avanza estados.

---

## 5.3 KitchenTicket

No tiene schema propio: hereda el estado de OrderItem filtrado por estación (`kitchen`, `bar`, `cocktail`). En UI, una “tarjeta KDS” agrupa líneas por mesa, pase o tiempo.

---

## 5.4 Reservation

| Estado | Significado |
| --- | --- |
| `booked` | Confirmada |
| `seated` | Cliente sentado |
| `completed` | Servicio completado |
| `no_show` | No presentado |
| `cancelled` | Cancelada |

---

## 5.5 Table

| Estado | Significado |
| --- | --- |
| `free` | Disponible |
| `occupied` | Con servicio activo |
| `reserved` | Comprometida por reserva |

Legacy `libre`/`ocupada` se normalizan en lectura.

---

## 5.6 PurchaseOrder

| Estado | Significado |
| --- | --- |
| `draft` | Borrador editable |
| `ordered` | Enviado al proveedor |
| `partially_received` | Recepción parcial |
| `received` | Totalmente recibido |
| `cancelled` | Anulado |

Transiciones derivadas también de suma de `receivedQuantity` por línea.

---

## 5.7 SupplierInvoice

| Estado | Significado |
| --- | --- |
| `draft` | En edición |
| `recorded` | Registrada; costes aplicados |

---

## 5.8 AIImportJob (MenuImportDraft)

| Estado | Significado |
| --- | --- |
| `draft` | Creado; pendiente de análisis |
| `analyzing` | Extracción en curso |
| `ready` | Preview disponible para revisión |
| `failed` | Error de pipeline |
| `partially_published` | Publicación parcial confirmada |
| `published` | Publicación completada |

---

## 5.9 Payment

No hay enum único expuesto en contrato público; semántica operativa:

- **create:** cobro autorizado (`canChargeTpv`);
- **update con reembolso:** mutación autorizada (`canRefundTpv`);
- campos relevantes: `paymentMethod` (`cash`, `card`, `mixed`, `voucher`), `received`, `tip`, `discountTotal`;
- documentos **no se eliminan**.

---

## 5.10 PrintJob

| Estado | Significado |
| --- | --- |
| `pending` | En cola |
| `printed` | Impreso OK |
| `failed` | Fallo; reintentos |
| `cancelled` | Cancelado |

---

## 5.11 StockMovement

No es estado de negocio sino **registro aplicado**:

- `applied: true|false` + `applyError`;
- `source`: `recipe_sale`, `recipe_sale_reversal`, `modifier_sale`, `modifier_sale_reversal`, `purchase_receipt`, `inventory_receipt`, `manual_adjustment`;
- identificado por `idempotencyKey`.

---

# 6. Persistencia

## 6.1 Qué vive en Firestore (canónico operativo)

### Identidad y tenant

| Colección / ruta | Entidades |
| --- | --- |
| `restaurants/{restaurantId}` | Restaurant |
| `users/{uid}`, `usuarios/{uid}` | User |
| `restaurant_invites` | Invitaciones |

### Operación (top-level + `restaurantId`)

| Colección | Entidades |
| --- | --- |
| `orders` | Order (+ OrderItem embebidos) |
| `orderItems` | OrderItem (compatibilidad KDS) |
| `payments` | Payment |
| `vouchers` | Vales (extensión de cobro) |
| `tables` | Table |
| `zones` | Zone |
| `floorPlans` | FloorPlan |
| `reservations` | Reservation (+ Customer embebido) |

### Catálogo e inventario (subcolección bajo restaurante)

| Ruta | Entidades |
| --- | --- |
| `…/products` | Product, Recipe, Ingredient, InventoryItem (config) |
| `…/productFamilies` | ProductFamily |
| `…/modifierGroups` | Modifier |
| `…/operationStations`, `…/productionStations` | Estaciones |
| `…/stockMovements` | Ledger de stock |
| `…/purchaseOrders`, `…/purchaseReceipts`, `…/purchaseDrafts` | Compras |
| `…/supplierInvoices`, `…/supplierProductAliases` | Facturas y matching |
| `…/menuImportDrafts` | AIImportJob |
| `…/config/*` | Category, MenuFamily, impresoras, etc. |
| `…/printJobs` | Cola de impresión |
| `…/activityLogs` | AuditEvent |
| `…/tablePresence`, `…/activeSessions` | Presencia operativa |

### Storage (Firebase Storage)

- Logos: `restaurant-logos/{restaurantId}/…`
- Importación IA: rutas de menú/factura por tenant
- Imágenes de producto

### Legacy (Firestore, vía de retirada)

- `restaurantes/*` — carta y productos antiguos
- `mesas/*` — mesas antiguas
- Modelo español `compras`/`movimientosStock` bajo `restaurantes` (híbrido con ledger central)

---

## 6.2 Qué datos son temporales

| Dato | Dónde vive | TTL / destino |
| --- | --- | --- |
| Borrador TPV no persistido | Memoria cliente | Descartado al navegar o persistido en Order |
| Preview IA pre-publicación | MenuImportDraft + Storage | Conservado hasta publish o abandono |
| Jobs API server-side | Runtime proceso | No Firestore; logs opcionales |
| Eventos globales (`kds:`, `tablesReadyToClose:`) | Bus en memoria | Solo coordinación UI; no fuente de verdad |
| Preferencias UI (filtros, layout local) | localStorage | No operativos; ver §6.3 |
| Asistente de salas (draft) | React state | No Firestore hasta publicación futura |
| Shadow AI eval | Logs / scripts | No operativo |

---

## 6.3 Qué datos pueden reconstruirse

| Proyección | Fuente de reconstrucción |
| --- | --- |
| Stock actual (`inventory.currentStock`) | Suma de `stockMovements` aplicados |
| Ocupación de mesa | Pedidos abiertos + `tablePresence` + reservas activas |
| Totales de cierre / Analítica | Agregación de `payments` + `orders` |
| KitchenTicket (cola KDS) | Líneas de pedidos en estados operativos filtradas |
| Coste teórico escandallo | Recipe + costes de ingredientes |
| Dashboard KPIs | Lecturas agregadas; no persistir como verdad |

**Regla:** si una proyección diverge del ledger o de pagos, **gana el ledger/pagos**; la proyección se recalcula.

---

# 7. Reglas de integridad

Contratos que **nunca deben romperse** sin migración explícita.

## 7.1 Tenant y seguridad

1. Todo documento operativo lleva `restaurantId` verificable en Rules.
2. `restaurantId` inmutable en updates de documentos existentes.
3. El cliente no eleva `role` ni cambia `restaurantId` arbitrariamente.
4. Cobros y reembolsos exigen capabilities reflejadas en Rules.

## 7.2 Pedidos y cobros

5. Un Payment pertenece al mismo tenant que su Order.
6. Payments no se borran; reembolsos son updates auditables.
7. `cancelledLineIds` y cancelación KDS deben alinearse con reversión de stock.
8. Estados de producción de línea son monotónicos (§5.2).

## 7.3 Inventario

9. Todo cambio de existencia tiene StockMovement con origen trazable.
10. Consumos y reversiones usan `idempotencyKey` determinista.
11. No aplicar stock sin registrar movimiento (salvo migración batch auditada).
12. Unidades normalizadas (`kg`, `g`, `l`, `ml`, `ud`, etc.) en movimientos.

## 7.4 Catálogo

13. Product es propietario de recipe e inventory config.
14. Borrado físico de productos con historial operativo prohibido; usar `active: false`.
15. Publicación IA solo tras preview y acción humana autorizada.

## 7.5 Espacio y reservas

16. Table referenciada en Reservation debe pertenecer al mismo tenant y plano coherente.
17. Merge/unión de mesas invalida pedidos vía contrato de evento, no silenciosamente.

## 7.6 Auditoría

18. AuditEvent es append-only; metadata acotada (tamaño y profundidad).
19. Idempotencia opcional en logs para evitar duplicados en reintentos.

## 7.7 Compatibilidad

20. Parsers aceptan legacy; escrituras nuevas emiten shape canónico.
21. No introducir tercera raíz de tenant, usuarios o mesas.

---

# 8. Evolución

## 8.1 Añadir campos

- Opcionales primero; default en lectura (`parse*` / `normalize*`).
- Documentar en este contrato y en `04_HOSTLY_DECISIONS_LOG.md` si afecta operación.

## 8.2 Añadir entidades

Ejemplo: **Customer** como colección propia.

1. Definir schema y relación con Reservation (FK `customerId` opcional).
2. Backfill desde reservas existentes (script por tenant).
3. Dual-write temporal: reserva sigue llevando nombre/teléfono denormalizado.
4. UI migra a entidad Customer.
5. Endurecer cuando cobertura > umbral acordado.

## 8.3 Migrar legacy → canónico

Patrón strangler:

1. Inventariar consumidores de `restaurantes`, `mesas`, `orderItems`.
2. Dual-read con preferencia canónica.
3. Dual-write solo en rutas nuevas.
4. Medir tráfico legacy.
5. Cutover por tenant con rollback planificado.

## 8.4 AI Engine y nuevos dominios

Nuevo dominio (p. ej. importación de escandallos) añade:

- adapter de extracción;
- publisher a entidad existente (Product.recipe);
- estados de job alineados con AIImportJob;
- **sin** duplicar pipeline ni colecciones paralelas de catálogo.

## 8.5 Versionado

Campos recomendados en jobs y publicaciones futuras:

- `schemaVersion` en documentos complejos;
- `pipelineVersion` en AIImportJob;
- trazabilidad en AuditEvent metadata.

---

# 9. Riesgos

## 9.1 Divergencia dual Order / orderItems

**Riesgo:** KDS y TPV leen rutas distintas; estados desalineados.  
**Mitigación:** merge monotónico al persistir; misión de convergencia documentada; tests de caracterización por línea.

## 9.2 Stock: ledger vs. `currentStock` vs. localStorage

**Riesgo:** tres fuentes de verdad en transición.  
**Mitigación:** declarar ledger canónico; recalcular proyección; prohibir nuevo negocio en localStorage; evento `STOCK_CHANGED` solo como refresco UI.

## 9.3 Denormalización obsoleta

**Riesgo:** nombres de mesa/producto desactualizados en pedidos antiguos confunden soporte.  
**Mitigación:** aceptado en histórico; pedidos abiertos rehidratan desde catálogo cuando sea seguro.

## 9.4 Idempotencia incompleta en cobros

**Riesgo:** doble tap en cobro genera dos payments.  
**Mitigación:** claves de idempotencia en UI; transacciones; rules que rechacen duplicados detectables.

## 9.5 Listeners sin límite

**Riesgo:** coste Firestore y datos stale en Analítica/TPV.  
**Mitigación:** queries acotadas por fecha/estado; agregaciones server-side planificadas; no listeners de histórico completo.

## 9.6 IA escribiendo sin revisión

**Riesgo:** catálogo corrupto o precios erróneos.  
**Mitigación:** preview obligatorio; publish explícito; trazas OCR → ítem; límites de coste.

## 9.7 Eventos globales no tipados

**Riesgo:** regresiones invisibles entre Sala, KDS y TPV.  
**Mitigación:** contrato tipado en misión dedicada; no nuevos eventos stringly-typed.

## 9.8 Supplier sin colección canónica

**Riesgo:** mismos proveedor con nombres distintos; OCR inconsistente.  
**Mitigación:** aliases + matching; evolución a entidad Supplier en Firestore con IDs estables.

---

# 10. Conclusión

Este documento fija el **contrato semántico** de Hostly: qué entidades existen, cómo se relacionan, qué estados son válidos, dónde persiste la verdad y qué reglas protegen la operación real.

Servirá como referencia para:

- **Producto y arquitectura** — decisiones de nuevos módulos sin duplicar modelos (`14_HOSTLY_MODULES_REFERENCE.md`).
- **Ingeniería** — implementación, Rules, migraciones y modularización (`01`, `11`).
- **IA** — publishers y jobs alineados con AI Engine (`13`).
- **QA y soporte** — estados esperados y fuentes de verdad ante incidencias.
- **Evolución** — extensiones (Customer, Notification, Supplier canónico) sin romper TPV, pagos ni ledger.

Ante duda en implementación: **primero este contrato**, luego código; si el código legacy contradice el contrato, tratar como deuda con plan de migración, no como diseño deseado.

---

## Entrega del documento

### Estructura creada

| Sección | Contenido |
| --- | --- |
| **1. Objetivo** | Representación del modelo y naturaleza de contrato de largo plazo |
| **2. Principios** | Multi-tenant, `restaurantId`, compatibilidad, evolución, idempotencia |
| **3. Entidades** | 24 entidades solicitadas (incl. Role, Ingredient, InventoryItem, KitchenTicket como conceptos derivados/embebidos) |
| **4. Relaciones** | Grafo principal, tabla de cardinalidades, denormalización |
| **5. Estados** | Order, OrderItem/KDS, Reservation, Table, PurchaseOrder, AIImportJob, Payment, PrintJob, StockMovement |
| **6. Persistencia** | Firestore canónico, legacy, temporal, reconstruible |
| **7. Integridad** | 21 reglas de contrato |
| **8. Evolución** | Campos, entidades, migración, AI Engine, versionado |
| **9. Riesgos** | 8 riesgos de consistencia con mitigaciones |
| **10. Conclusión** | Uso transversal del documento |

### Relación con la documentación canónica existente

| Documento | Relación |
| --- | --- |
| `00_HOSTLY_PRODUCT_BIBLE.md` | Principios de producto (simplicidad, humano en IA) acotan el modelo |
| `11_HOSTLY_ENGINEERING_CONSTITUTION.md` | Autoridad en *cómo* implementar este contrato |
| `01_HOSTLY_ARCHITECTURE_GUIDE.md` | Detalle técnico Firestore §7; este doc es la **capa semántica** |
| `14_HOSTLY_MODULES_REFERENCE.md` | Mapa funcional → este doc define **entidades y estados** por módulo |
| `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md` | AIImportJob y pipeline alineados con §3.22 y §5.8 |
| `04_HOSTLY_DECISIONS_LOG.md` | Destino de decisiones que cambien schema o invariantes |
| `hostly-stock-ledger.md`, `hostly-roles-permissions.md`, `hostly-catalog-migration.md` | Profundizan dominios referenciados aquí |

**Jerarquía:** nivel 2 (contrato de datos), subordinado a Product Bible (00) y Constitución Técnica (11). Complementa `14` (módulos) sin sustituirlo.

### Documento recomendado a continuación

**`docs/16_HOSTLY_FIRESTORE_RULES_REFERENCE.md`** — mapa explícito entidad → path → reglas de lectura/escritura → capability requerida, alineado con este contrato y `hostly-roles-permissions.md`. Cierra la brecha entre modelo semántico y enforcement real.

Alternativa si la prioridad es IA: **`docs/16_HOSTLY_AI_ENGINE_PHASE1_SPEC.md`** — especificación de implementación del pipeline de importación con schemas de job, publish y trazabilidad referenciados a §3.22.

---

*Última revisión: junio 2026 · Hostly Data Model Reference v1.0*
