# Hostly — Referencia de Módulos

> Mapa oficial de todos los módulos de Hostly: propósito, usuarios, datos, dependencias y evolución.

**Estado:** oficial  
**Versión:** 1.0  
**Autoridad documental:** nivel 2 (referencia de producto y arquitectura funcional)  
**Ámbito:** módulos operativos, de catálogo, inventario, inteligencia y administración  
**Subordinado a:** `00_HOSTLY_PRODUCT_BIBLE.md`, `11_HOSTLY_ENGINEERING_CONSTITUTION.md`  
**Relacionado con:** `01_HOSTLY_ARCHITECTURE_GUIDE.md`, `03_HOSTLY_ROADMAP.md`, `05_HOSTLY_STATE_AUDIT.md`, `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md`

---

# 1. Visión general del producto

## 1.1 Qué es Hostly

Hostly es un **SaaS B2B multi-restaurante** que actúa como **sistema operativo inteligente para la hostelería**. Conecta en una sola experiencia la configuración del negocio, la venta en sala, la producción en cocina y barra, las reservas, los cobros, el inventario, las compras y la inteligencia aplicada.

No es un TPV aislado, ni un ERP genérico, ni un software de cocina desconectado. La unidad de diseño es el **servicio completo del restaurante**, no la pantalla individual.

La frontera de seguridad y datos es **`restaurantId`**: todo módulo opera dentro de un tenant explícito.

## 1.2 División por grandes áreas funcionales

| Área | Módulos incluidos | Rol en el producto |
| --- | --- | --- |
| **Operación en vivo** | TPV, Cocina (KDS), Barra, Sala, Reservas | Ritmo del servicio: comandar, producir, servir, reservar |
| **Catálogo comercial** | Carta, Productos, Categorías, Familias, Modificadores, Escandallos | Qué se vende, cómo se organiza y cuánto cuesta producir |
| **Abastecimiento** | Inventario, Compras, Proveedores | Existencias, pedidos, recepciones y costes de compra |
| **Relación con el cliente** | Clientes, Reservas | Identidad del comensal y planificación de aforo |
| **Plataforma y gobierno** | Configuración, Usuarios y permisos | Estructura del restaurante, espacios, estaciones, integraciones |
| **Inteligencia** | IA, Analítica | Importación asistida, sugerencias, métricas y mejora continua |

```text
                    ┌─────────────────────────────────┐
                    │     Configuración + Usuarios    │
                    │  (empresa, espacios, estaciones)│
                    └───────────────┬─────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   ┌───────────┐              ┌─────────────┐            ┌────────────┐
   │  Catálogo │              │ Inventario  │            │     IA     │
   │  + Carta  │◄────────────►│ + Compras   │◄──────────►│ + Analítica│
   └─────┬─────┘              │ + Proveed.  │            └────────────┘
         │                    └──────┬──────┘
         │                           │
         ▼                           ▼
   ┌─────────────────────────────────────────┐
   │              TPV (runtime central)       │
   │  pedidos · cobros · mesas · comandas    │
   └───────────────┬─────────────────────────┘
                   │
     ┌─────────────┼─────────────┬─────────────┐
     ▼             ▼             ▼             ▼
  Cocina        Barra          Sala       Reservas
  (KDS)         (KDS)          (KDS)      + Clientes
```

---

# 2. Módulos actuales

Para cada módulo: **propósito**, **usuario principal**, **dependencias**, **datos principales** y **relación con otros módulos**.

---

## 2.1 TPV

| Campo | Descripción |
| --- | --- |
| **Propósito** | Coordinar la sesión operativa de una mesa: selección, comanda, envío a producción, cobro, cierre e impresión. Es el runtime con mayor impacto económico. |
| **Usuario principal** | Camarero, encargado de sala (`waiter`, `manager`). |
| **Dependencias** | Mesas y planos, Productos/Carta, Modificadores, Estaciones operativas, KDS, Pagos, Impresoras, Usuarios y permisos. |
| **Datos principales** | `orders`, `payments`, `tables`, `orderItems` (compat.), líneas embebidas en pedidos, `tablePresence`, `activeSessions`, `printJobs`. |
| **Relación con otros módulos** | Consume catálogo; emite trabajo a Cocina/Barra/Sala; dispara consumos de inventario vía escandallos; alimenta Analítica; comparte componente con Carta (`carta-page-content.tsx`). |

**Rutas:** `/dashboard/carta`, `/dashboard/operacion/tpv`.

---

## 2.2 Carta

| Campo | Descripción |
| --- | --- |
| **Propósito** | Superficie operativa y comercial del catálogo en servicio: organización visible, disponibilidad, orden, destinos de producción (pases/estaciones) y acceso rápido a venta. |
| **Usuario principal** | Camarero, encargado. |
| **Dependencias** | Productos, Categorías, Familias, Modificadores, Configuración de estaciones, TPV (mismo runtime). |
| **Datos principales** | Proyección del catálogo operativo; subcolecciones bajo `restaurants/{restaurantId}` y compatibilidad legacy bajo `restaurantes`; preferencias locales de categorías (transitorio). |
| **Relación con otros módulos** | Es la capa de **presentación operativa** del catálogo dentro del TPV; no sustituye a Productos como fuente canónica. |

**Nota:** Carta y TPV comparten el mismo componente central. La diferencia es de **contexto de navegación**, no de lógica duplicada.

---

## 2.3 Productos

| Campo | Descripción |
| --- | --- |
| **Propósito** | Catálogo central de ítems vendibles e inventariables: precios, unidades, destinos, flags operativos y vínculo con recetas. |
| **Usuario principal** | Propietario, administrador, encargado (`owner`, `admin`, `manager`). |
| **Dependencias** | Categorías, Familias, Modificadores, Escandallos, Inventario, Configuración. |
| **Datos principales** | `restaurants/{restaurantId}/products/{productId}`; compatibilidad con catálogos legacy y eventos locales (`PLATOS_CHANGED_EVENT`). |
| **Relación con otros módulos** | Alimenta TPV/Carta; define insumos de Escandallos; base de matching en Compras y aliases de proveedor. |

**Rutas:** `/dashboard/productos`, `/dashboard/configuracion/carta/productos`.

---

## 2.4 Categorías

| Campo | Descripción |
| --- | --- |
| **Propósito** | Agrupación comercial y de navegación del catálogo (orden, visibilidad, jerarquía en TPV). |
| **Usuario principal** | Propietario, administrador, encargado. |
| **Dependencias** | Productos, Carta. |
| **Datos principales** | Configuración de carta bajo `restaurants/{restaurantId}/config/*`; stores locales legacy para categorías (transitorio). |
| **Relación con otros módulos** | Organiza Productos en TPV/Carta; no define costes ni stock por sí sola. |

**Rutas:** `/dashboard/configuracion/carta/categorias`.

---

## 2.5 Familias

| Campo | Descripción |
| --- | --- |
| **Propósito** | Clasificación operativa y analítica de productos (familias de carta, familias de producto inventariable). |
| **Usuario principal** | Propietario, administrador, encargado. |
| **Dependencias** | Productos, Escandallos, Analítica. |
| **Datos principales** | `restaurants/{restaurantId}/productFamilies`; familias de carta en configuración. |
| **Relación con otros módulos** | Agrupa Productos para reporting, escandallos y reglas de negocio; distinto de Categorías (comercial vs. clasificación). |

**Rutas:** `/dashboard/configuracion/carta/familias`, `/dashboard/configuracion/familias-producto`.

---

## 2.6 Modificadores

| Campo | Descripción |
| --- | --- |
| **Propósito** | Grupos de opciones sobre un producto (extras, variantes, suplementos) con impacto en precio, producción y, opcionalmente, consumo de stock. |
| **Usuario principal** | Propietario, administrador, encargado. |
| **Dependencias** | Productos, Escandallos, Inventario, TPV. |
| **Datos principales** | `restaurants/{restaurantId}/modifierGroups`. |
| **Relación con otros módulos** | Se seleccionan en TPV; pueden generar movimientos de inventario adicionales vía escandallo/modificador. |

**Rutas:** `/dashboard/configuracion/modificadores`, `/dashboard/configuracion/carta/modificadores`.

---

## 2.7 Escandallos

| Campo | Descripción |
| --- | --- |
| **Propósito** | Definir composición, coste teórico, margen y consumo esperado de un producto vendido (receta / BOM). Conecta venta con inventario. |
| **Usuario principal** | Propietario, administrador, encargado. |
| **Dependencias** | Productos, Familias, Inventario, TPV (consumo en venta). |
| **Datos principales** | Recetas asociadas a productos; cálculos de coste; referencia a ingredientes inventariables. |
| **Relación con otros módulos** | Alimenta márgenes en Analítica; dispara `stockMovements` en venta/cancelación; no debe confundirse con la UI de rentabilidad y el ledger transaccional. |

**Rutas:** `/dashboard/escandallos`, `/dashboard/configuracion/carta/escandallos`.

---

## 2.8 Inventario

| Campo | Descripción |
| --- | --- |
| **Propósito** | Existencia, configuración de stock, movimientos, mermas, recepciones y trazabilidad de consumos. |
| **Usuario principal** | Encargado, propietario (`manager`, `owner`). |
| **Dependencias** | Productos, Escandallos, Compras, Proveedores, TPV (consumos). |
| **Datos principales** | `stockMovements`, `inventoryReceipts`, configuración por producto; proyección de stock derivada de movimientos; coexistencia con localStorage legacy (transitorio). |
| **Relación con otros módulos** | Recibe entradas de Compras/Recepciones; sale por consumos de TPV y ajustes; informa Dashboard y Analítica. |

**Rutas:** `/dashboard/inventario`, `/dashboard/stock`, `/dashboard/mermas`, `/dashboard/recepciones`.

---

## 2.9 Compras

| Campo | Descripción |
| --- | --- |
| **Propósito** | Registrar intención de compra, pedidos a proveedor, borradores, recepciones y conciliación con facturas. |
| **Usuario principal** | Encargado, propietario. |
| **Dependencias** | Productos, Proveedores, Inventario, IA (OCR facturas). |
| **Datos principales** | `purchaseOrders`, `purchaseReceipts`, `purchaseDrafts`, `supplierInvoices`, `supplierProductAliases`. |
| **Relación con otros módulos** | Confirmada una recepción, genera movimientos de Inventario; usa aliases para matching OCR → producto/proveedor. |

**Rutas:** `/dashboard/compras`, `/dashboard/inventario/pedidos-compra`, `/dashboard/inventario/facturas-proveedor`, `/dashboard/inventario/compras-inteligentes`.

---

## 2.10 Proveedores

| Campo | Descripción |
| --- | --- |
| **Propósito** | Identidad y resolución de proveedores en compras, recepciones y facturas; matching y sugerencias en OCR. |
| **Usuario principal** | Encargado, propietario. |
| **Dependencias** | Compras, Inventario, IA (facturas). |
| **Datos principales** | Catálogo canónico en `lib/suppliers` (`CanonicalSupplier`); aliases en `supplierProductAliases`; datos embebidos en documentos de compra/factura. |
| **Relación con otros módulos** | No es aún un CRM de proveedores completo; opera como **capa de resolución y matching** dentro del flujo de Compras. |

**Rutas:** integrado en Compras, Recepciones, `/dashboard/inventario/aliases-proveedor`.

---

## 2.11 Cocina (KDS)

| Campo | Descripción |
| --- | --- |
| **Propósito** | Kitchen Display System: transformar líneas de pedido en trabajo de producción con estados, pases, SLA, métricas y gestos táctiles. |
| **Usuario principal** | Personal de cocina (`kitchen`, `manager`). |
| **Dependencias** | Pedidos (`orders`), Estaciones de producción, Productos (destino/pase), TPV. |
| **Datos principales** | Líneas operativas en `orders`; estados KDS; eventos `kds:station-status`. |
| **Relación con otros módulos** | Recibe de TPV; coordina con Barra y Sala vía `OrderItemsBoard`; emite señales de mesa lista para cierre (`tablesReadyToClose`). |

**Rutas:** `/dashboard/operacion/cocina`, `/dashboard/cocina` (legacy).

**Nota:** Coctelería reutiliza el mismo patrón KDS con filtros distintos; se trata como estación operativa hermana de Barra.

---

## 2.12 Barra

| Campo | Descripción |
| --- | --- |
| **Propósito** | KDS especializado en bebidas y preparación de barra: mismas líneas de pedido, filtros y acciones adaptadas al ritmo de bar. |
| **Usuario principal** | Personal de barra, encargado. |
| **Dependencias** | Cocina (KDS), Pedidos, Estaciones operativas, Productos (destino barra). |
| **Datos principales** | Mismas colecciones que KDS; filtrado por estación/destino. |
| **Relación con otros módulos** | Paralelo a Cocina; comparte `OrderItemsBoard`; participa en señales de servicio y cierre de mesa. |

**Rutas:** `/dashboard/operacion/barra`.

---

## 2.13 Sala

| Campo | Descripción |
| --- | --- |
| **Propósito** | Vista operativa de servicio en sala: seguimiento de platos listos, pases, coordinación con cocina/barra y apoyo al cierre de mesas. |
| **Usuario principal** | Camarero jefe, encargado de sala. |
| **Dependencias** | KDS (Cocina/Barra), Pedidos, Mesas, TPV. |
| **Datos principales** | Líneas en estados de servicio; eventos `tablesReadyToClose:update/clear`. |
| **Relación con otros módulos** | Puente entre producción y TPV; informa qué mesas pueden cerrarse sin pendientes operativos. |

**Rutas:** `/dashboard/operacion/sala`, `/dashboard/sala`.

---

## 2.14 Reservas

| Campo | Descripción |
| --- | --- |
| **Propósito** | Gestionar reservas por fecha, hora, comensales, estado y mesa; integrar aforo con planos operativos. |
| **Usuario principal** | Host/encargado, recepción. |
| **Dependencias** | Mesas, Planos (`floorPlans`, `zones`), Clientes (datos embebidos), TPV (ocupación). |
| **Datos principales** | `reservations` (top-level + `restaurantId`): `customerName`, `customerPhone`, `partySize`, `status`, `tableId`, `floorPlanId`, etc. |
| **Relación con otros módulos** | Comparte mapa con Configuración de espacios; alimenta Analítica; datos de cliente aún no desacoplados en módulo CRM propio. |

**Rutas:** `/dashboard/operacion/reservas`.

---

## 2.15 Clientes

| Campo | Descripción |
| --- | --- |
| **Propósito** | Identificar y retener información del comensal para reservas y, en el futuro, fidelización y CRM. |
| **Usuario principal** | Host, encargado, propietario. |
| **Dependencias** | Reservas; futuro: TPV, Analítica. |
| **Datos principales** | Hoy: **datos embebidos** en `reservations` (`customerName`, `customerPhone`). No existe aún colección `customers` canónica independiente. |
| **Relación con otros módulos** | Funcionalmente acoplado a Reservas; evolución planificada hacia entidad propia reutilizable en TPV y campañas. |

**Estado:** capacidad **parcial** — cubierto por Reservas, sin módulo CRM autónomo.

---

## 2.16 Configuración

| Campo | Descripción |
| --- | --- |
| **Propósito** | Decisiones estructurales del restaurante que afectan al runtime: empresa, espacios, mesas, zonas, estaciones, impresoras, integraciones y accesos al catálogo. |
| **Usuario principal** | Propietario, administrador. |
| **Dependencias** | Usuarios y permisos, Firestore `restaurants/{restaurantId}`, Storage (logo). |
| **Datos principales** | `restaurants/{restaurantId}`, `config/*`, `floorPlans`, `zones`, `tables`, `operationStations`, `productionStations`, impresoras, integraciones. |
| **Relación con otros módulos** | Todo módulo operativo depende de Configuración; cambios aquí pueden impactar TPV, KDS y Reservas en tiempo real. |

**Rutas:** `/dashboard/configuracion/*` (empresa, espacios/mesas, estaciones, impresoras, carta, empleados, integraciones).

**Subáreas relevantes:**

| Subárea | Impacto |
| --- | --- |
| Empresa | Identidad, onboarding, logo |
| Espacios y mesas | Planos, mesas, asistente de salas (local, no persistido aún) |
| Estaciones | Destinos KDS y routing de comandas |
| Impresoras | Cola de impresión operativa |
| Integraciones | Conectores externos |

---

## 2.17 IA

| Campo | Descripción |
| --- | --- |
| **Propósito** | Reducir trabajo manual en onboarding y back-office: importación de carta, OCR de facturas, matching, enriquecimiento y validación asistida. |
| **Usuario principal** | Propietario, administrador, encargado (siempre con revisión humana). |
| **Dependencias** | Carta, Productos, Compras, Proveedores, Firebase Storage, APIs server-side. |
| **Datos principales** | Jobs de importación, borradores, trazas OCR, aliases aprendidos, confianza y warnings; ver `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md`. |
| **Relación con otros módulos** | Propone datos; **no escribe** en Firestore operativo sin confirmación humana; evoluciona hacia AI Engine unificado. |

**Rutas:** `/dashboard/configuracion/carta/importacion`, `ia-importacion`, `/dashboard/validacion-inteligente`.

**Precursor en código:** `lib/server/menu-imports/`.

---

## 2.18 Analítica

| Campo | Descripción |
| --- | --- |
| **Propósito** | Vistas derivadas de ventas, operación, compras y reservas para decisiones de negocio. Solo lectura; nunca fuente de verdad operacional. |
| **Usuario principal** | Propietario, administrador, encargado, viewer analítico. |
| **Dependencias** | Pedidos, Pagos, Reservas, Inventario, Compras, Productos/Familias. |
| **Datos principales** | Agregaciones calculadas en cliente o selectores; consumo de `orders`, `payments`, movimientos y compras. |
| **Relación con otros módulos** | Lee de todos los dominios transaccionales; no debe escribir ni corregir datos operativos. |

**Rutas:** `/dashboard/analisis`, `/dashboard/analisis/ventas`, `/dashboard/metrics`, `/dashboard/reportes`.

**Estado:** funcional con consolidación visual y de modelo de lectura pendiente.

---

## 2.19 Usuarios y permisos

| Campo | Descripción |
| --- | --- |
| **Propósito** | Pertenencia al restaurante, roles, capabilities y barrera real de autorización. |
| **Usuario principal** | Propietario, administrador. |
| **Dependencias** | Firebase Auth, `users`/`usuarios`, Firestore Rules, invitaciones. |
| **Datos principales** | `users/{uid}`, `usuarios/{uid}` (legacy), `restaurant_invites`; roles `owner`, `admin`, `manager`, `waiter`, `kitchen`, `viewer`. |
| **Relación con otros módulos** | Transversal: cada módulo expone acciones filtradas por capabilities; la seguridad real está en Rules, no solo en UI. |

**Rutas:** `/dashboard/usuarios`, `/dashboard/empleados`, `/dashboard/invitaciones`.

**Referencia detallada:** `docs/hostly-roles-permissions.md`.

---

# 3. Relaciones entre módulos

## 3.1 Flujo operativo principal (servicio en vivo)

```text
Configuración (mesas, estaciones)
        │
        ▼
Reservas ──► asignación de mesa ──► TPV abre pedido
        │                                    │
        │                                    ├──► líneas + modificadores
        │                                    │
        │                                    ▼
        │                          Cocina / Barra / Sala (KDS)
        │                                    │
        │                                    ├──► estados, pases, SLA
        │                                    │
        │                                    ▼
        └──────────────────────────► Servicio + cobro (payments)
                                              │
                                              ▼
                                        Cierre de mesa
                                              │
                                              ▼
                                        Analítica (lectura)
```

## 3.2 Flujo catálogo → venta → coste

```text
Productos ◄── Categorías, Familias, Modificadores
    │
    ├──► Carta / TPV (venta)
    │
    └──► Escandallos (receta, coste teórico)
              │
              └──► Inventario (consumo en venta / reversión en cancelación)
```

## 3.3 Flujo abastecimiento

```text
Proveedores ──► Compras (pedido / borrador)
                    │
                    ├──► IA (OCR factura, matching)
                    │
                    ▼
              Recepciones
                    │
                    ▼
              stockMovements ──► proyección de stock
                    │
                    └──► Escandallos / Analítica (coste real vs. teórico)
```

## 3.4 Flujo inteligencia

```text
Entrada (PDF, foto, QR, texto)
        │
        ▼
AI Engine (extract → normalize → validate → preview)
        │
        ├──► Carta / Productos (publish revisado)
        ├──► Compras / Facturas (publish revisado)
        └──► Aliases proveedor (aprendizaje)
```

## 3.5 Eventos globales relevantes

| Evento | De → A | Función |
| --- | --- | --- |
| `tablesReadyToClose:update/clear` | Sala/KDS → TPV | Mesas listas para cierre |
| `kds:station-status` | KDS → Operación | Estado de estaciones |
| `STOCK_CHANGED_EVENT` | Inventario → Dashboard | Refrescar proyecciones locales |
| Merge de pedidos de grupo | Mesas → TPV | Rehidratación tras unir mesas |

Estos eventos son **APIs internas frágiles**; no deben multiplicarse sin contrato tipado.

---

# 4. Dependencias críticas

Módulos cuya ruptura de compatibilidad afecta a muchos consumidores. **No deben cambiar modelo, IDs o semántica sin migración, pruebas y entrada en `04_HOSTLY_DECISIONS_LOG.md`.**

| Módulo / contrato | Por qué es crítico | Consumidores directos |
| --- | --- | --- |
| **TPV + Pedidos (`orders`)** | Corazón económico y operativo | KDS, Pagos, Inventario, Analítica, Impresión |
| **Pagos (`payments`)** | Dinero real; idempotencia obligatoria | TPV, Analítica, cierre |
| **Mesas y planos (`tables`, `floorPlans`)** | Sincronización espacial | TPV, Reservas, KDS, Configuración |
| **Productos (`restaurants/.../products`)** | Fuente de catálogo canónica | TPV, Carta, Escandallos, Compras, IA |
| **Escandallos / consumos** | Puente venta ↔ stock | Inventario, márgenes |
| **`stockMovements` (ledger)** | Verdad de existencias | Inventario, Dashboard, Analítica |
| **Usuarios + Rules** | Frontera multi-tenant | Todos los módulos |
| **`restaurantId` como tenant** | Aislamiento de datos | Auth, Firestore, Storage, APIs |
| **Eventos globales KDS/cierre** | Coordinación invisible entre runtimes | TPV, Sala, wrappers de Carta |

### Compatibilidades legacy que no deben romperse sin plan

| Par legacy | Riesgo si se rompe |
| --- | --- |
| `restaurants` / `restaurantes` | Catálogo y APIs legacy de Carta |
| `users` / `usuarios` | Perfiles e invitaciones antiguas |
| `tables` / `mesas` | Planos y TPV en restaurantes migrados parcialmente |
| `orders` embebido vs. `orderItems` | KDS y rutas históricas |
| `role: staff` → `manager` | Acceso operativo de personal existente |
| localStorage en catálogo/stock | Restaurantes en transición |

---

# 5. Roadmap funcional

Clasificación por estado real observado (junio 2026), alineada con `03_HOSTLY_ROADMAP.md` y `05_HOSTLY_STATE_AUDIT.md`.

## 5.1 Completado

Funcional en producción de código con flujos operativos demostrables.

| Módulo | Capacidades completadas |
| --- | --- |
| **TPV** | Mesas, comanda, cobro, cierre, impresión, grupo de mesas |
| **Carta / Productos** | Catálogo central, gestión de productos, compatibilidad legacy |
| **Categorías / Familias / Modificadores** | CRUD, orden, configuración operativa |
| **Escandallos** | Recetas, coste teórico, vínculo con productos |
| **Cocina (KDS)** | Estados, pases, SLA, métricas, gestos |
| **Barra / Sala** | KDS especializado, señales de servicio |
| **Reservas** | CRUD, estados, selector de mesa/mapa |
| **Configuración** | Empresa, estaciones, impresoras, espacios (editor) |
| **Usuarios y permisos** | Roles, capabilities frontend, rules en paths críticos |
| **IA (Fase 1)** | Importación carta, OCR facturas, preview + publish revisado |
| **Inventario / Compras (base)** | Movimientos, pedidos, recepciones, facturas proveedor |
| **Analítica (base)** | Ventas, reportes, métricas operativas |

## 5.2 En desarrollo

Existe código activo pero con deuda, consolidación pendiente o alcance parcial.

| Módulo | Trabajo en curso |
| --- | --- |
| **TPV / Carta** | Modularización del megacomponente; polish UX |
| **Configuración (espacios)** | Asistente de salas en estado local; editor de planos |
| **Inventario** | Unificación ledger vs. localStorage legacy |
| **Compras / Proveedores** | Consolidación aliases, compras inteligentes |
| **IA** | Generalización hacia AI Engine (`13`) |
| **Analítica** | Migración visual al Design System |
| **Reservas** | Consolidación visual y pruebas operativas |
| **Design System** | Pantallas legacy pendientes (Login, Reservas, Análisis…) |

## 5.3 Planificado

Definido en roadmap o arquitectura; implementación no dominante aún.

| Módulo | Objetivo planificado |
| --- | --- |
| **Clientes** | Entidad `customers` desacoplada de reservas |
| **IA / AI Engine** | Pipeline unificado multi-módulo con adapters |
| **Inventario** | Fuente canónica única de stock declarada oficialmente |
| **Configuración** | Publicación asistida de planos con revisión humana |
| **Analítica** | Agregaciones server-side sin listeners costosos |
| **Usuarios** | Roles granulares en perfil sin depender de normalización legacy |
| **Seguridad** | APIs con tenant resuelto en servidor en todos los endpoints |

## 5.4 Futuro

Dirección de producto a medio plazo; sin compromiso de implementación inmediata.

| Área | Visión futura |
| --- | --- |
| **Clientes** | CRM, historial, preferencias, fidelización |
| **IA** | Voz, Excel, APIs externas; sugerencias proactivas en operación |
| **Multi-ubicación** | Varios locales por cuenta sin romper tenant |
| **Integraciones** | Contabilidad, delivery, pagos externos |
| **Coctelería / estaciones custom** | Routing avanzado por tipo de servicio |
| **Automatización compras** | Propuestas de pedido según consumo y stock mínimo |

---

# 6. Invariantes

Reglas de producto y arquitectura que **nunca deben romperse** sin decisión explícita documentada.

## 6.1 Multi-tenant y seguridad

1. Toda lectura, escritura, listener y API debe estar acotada a un **`restaurantId` verificado**.
2. El cliente **no puede** elevar su rol ni cambiar su pertenencia a restaurante.
3. La UI de permisos **no sustituye** Firestore Rules en operaciones sensibles (cobros, devoluciones, cancelaciones).

## 6.2 Operación en vivo

4. TPV, KDS y cobros deben ser **conservadores**: cambios pequeños, reversibles y probados en hora punta.
5. Un cobro no puede quedar **ambiguo** ni duplicarse por reintentos (idempotencia).
6. Cancelar una línea debe **revertir consumos** de inventario asociados sin duplicar movimientos.

## 6.3 Datos y fuentes de verdad

7. Cada dato tiene **un propietario canónico**; Analítica y Dashboard solo leen.
8. El stock actual es **proyección de movimientos**, no un campo editable sin trazabilidad.
9. La IA **propone**; el humano **dispone** antes de persistir datos económicos o de stock.
10. No crear **terceras variantes** de raíces (`restaurants/restaurantes`, `users/usuarios`, `tables/mesas`).

## 6.4 Compatibilidad y evolución

11. No eliminar rutas legacy sin **auditoría de consumidores, datos y migración**.
12. No reescribir megacomponentes (TPV, editor mesas) como parte de una limpieza cosmética.
13. No mezclar en una misma misión: **UI + queries + modelo de datos**.
14. No persistir **datos operativos de negocio** en localStorage (solo preferencias UI).

## 6.5 Experiencia

15. Hostly debe funcionar en **hora punta**: táctil, un paso principal visible, recuperación ante fallos de red.
16. Lenguaje de **restaurante**, no de modelo técnico, en superficies operativas.

---

# 7. Prioridades de evolución

Orden recomendado para seguir desarrollando Hostly sin comprometer operación. Alineado con `03_HOSTLY_ROADMAP.md`.

| Prioridad | Foco | Módulos impactados | Justificación |
| ---: | --- | --- | --- |
| **1** | Hardening precomercial | TPV, KDS, Pagos, Auth | Bloquea clientes reales |
| **2** | Seguridad multi-tenant | Usuarios, todas las APIs | Riesgo de fuga entre restaurantes |
| **3** | Fuente canónica de datos | Inventario, Catálogo, Firestore | Elimina divergencia legacy/localStorage |
| **4** | Idempotencia económica | TPV, Pagos, Inventario | Integridad de dinero y stock |
| **5** | Modularización segura | TPV, Productos, KDS | Reduce riesgo del megacomponente |
| **6** | AI Engine Fase 1 | IA, Carta, Compras | Escala onboarding sin duplicar pipelines |
| **7** | Consolidación inventario/compras | Compras, Proveedores, Escandallos | Historia única de coste y existencias |
| **8** | TPV/KDS en campo | Cocina, Barra, Sala, TPV | Validación con personal real |
| **9** | Configuración espacial | Configuración, Reservas | Publicar planos con revisión humana |
| **10** | Clientes + CRM ligero | Clientes, Reservas | Valor post-reserva |
| **11** | Analítica consolidada | Analítica | Decisiones sin coste de listeners |
| **12** | Design System en legacy | Reservas, Analítica, Login | Coherencia sin tocar runtimes |
| **13** | Multi-restaurante avanzado | Plataforma completa | Escalado comercial |

**Regla de ejecución:** no iniciar prioridades 6+ si existen riesgos críticos abiertos en 1–4 sin propietario y criterio de cierre.

---

# Apéndice A — Mapa de rutas por módulo

| Módulo | Rutas principales |
| --- | --- |
| TPV / Carta | `/dashboard/carta`, `/dashboard/operacion/tpv` |
| Productos | `/dashboard/productos`, `/dashboard/configuracion/carta/productos` |
| Categorías | `/dashboard/configuracion/carta/categorias` |
| Familias | `/dashboard/configuracion/carta/familias`, `/dashboard/configuracion/familias-producto` |
| Modificadores | `/dashboard/configuracion/modificadores` |
| Escandallos | `/dashboard/escandallos` |
| Inventario | `/dashboard/inventario`, `/dashboard/stock`, `/dashboard/mermas` |
| Compras | `/dashboard/compras`, `/dashboard/inventario/pedidos-compra` |
| Proveedores | integrado en compras/recepciones/aliases |
| Cocina | `/dashboard/operacion/cocina` |
| Barra | `/dashboard/operacion/barra` |
| Sala | `/dashboard/operacion/sala` |
| Reservas | `/dashboard/operacion/reservas` |
| Configuración | `/dashboard/configuracion/*` |
| IA | `/dashboard/configuracion/carta/importacion`, `/dashboard/validacion-inteligente` |
| Analítica | `/dashboard/analisis`, `/dashboard/reportes`, `/dashboard/metrics` |
| Usuarios | `/dashboard/usuarios`, `/dashboard/invitaciones` |

---

# Apéndice B — Colecciones Firestore por dominio

| Dominio | Colecciones / subcolecciones |
| --- | --- |
| Operación | `orders`, `orderItems`, `payments`, `tables`, `zones`, `floorPlans`, `reservations` |
| Catálogo | `restaurants/{id}/products`, `productFamilies`, `modifierGroups`, `operationStations`, `productionStations` |
| Inventario / compras | `stockMovements`, `inventoryReceipts`, `purchaseOrders`, `purchaseReceipts`, `purchaseDrafts`, `supplierInvoices`, `supplierProductAliases` |
| Config / soporte | `restaurants/{id}/config/*`, `printJobs`, `activityLogs`, `tablePresence`, `activeSessions` |
| Identidad | `users`, `usuarios`, `restaurant_invites`, `restaurants` |

Detalle completo en `01_HOSTLY_ARCHITECTURE_GUIDE.md` §7.

---

## Entrega del documento

### Estructura creada

Este archivo define **7 secciones principales** más **2 apéndices**:

1. Visión general del producto  
2. Módulos actuales (19 módulos solicitados)  
3. Relaciones entre módulos  
4. Dependencias críticas  
5. Roadmap funcional (Completado / En desarrollo / Planificado / Futuro)  
6. Invariantes  
7. Prioridades de evolución  
- Apéndice A: mapa de rutas  
- Apéndice B: colecciones Firestore  

### Relación con la documentación existente

| Documento | Relación |
| --- | --- |
| `00_HOSTLY_PRODUCT_BIBLE.md` | Este doc **desarrolla** la visión de producto en mapa modular ejecutable |
| `01_HOSTLY_ARCHITECTURE_GUIDE.md` | Complementa con **detalle técnico** (capas, Firestore, TPV/KDS); este doc es la **vista funcional** |
| `03_HOSTLY_ROADMAP.md` | Las prioridades de §7 y estados de §5 **derivan** del roadmap |
| `05_HOSTLY_STATE_AUDIT.md` | Los estados Completado/En desarrollo **reflejan** la auditoría de junio 2026 |
| `06_HOSTLY_AI_GUIDELINES.md` | Reglas de trabajo IA; §2.17 enlaza con `13` |
| `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md` | Arquitectura del motor IA referenciada en módulo IA |
| `hostly-roles-permissions.md` | Detalle de capabilities para Usuarios y permisos |
| `hostly-stock-flow.md`, `hostly-stock-ledger.md` | Profundizan Inventario y movimientos |
| `hostly-supplier-invoices-ocr.md` | Profundiza Compras + IA |

**Jerarquía:** subordinado a Product Bible (00) y Constitución Técnica (11). En caso de conflicto sobre *qué* construir, prevalece 00; sobre *cómo* implementar, prevalece 11.

### Documento recomendado a continuación

**`docs/15_HOSTLY_DATA_MODEL_REFERENCE.md`** — referencia canónica del modelo de datos por entidad (pedido, línea, movimiento, reserva, producto), con campos, estados, transiciones e idempotencia. Completaría este mapa de módulos con el **contrato de datos** que hoy está disperso entre Architecture Guide, reglas Firestore y docs de dominio (`hostly-stock-ledger`, roles, catálogo).

Alternativa si la prioridad inmediata es IA: **`docs/15_HOSTLY_AI_ENGINE_PHASE1_SPEC.md`** (especificación de implementación de Fase 1, sugerida al cierre de `13`).

---

*Última revisión: junio 2026 · Hostly Modules Reference v1.0*
