# Hostly Architecture Guide v1

> Constitución técnica y referencia maestra de arquitectura de Hostly.

**Autoridad documental:** nivel 2. Este documento está subordinado únicamente a
`00_HOSTLY_PRODUCT_BIBLE.md`. Ante una contradicción de producto, prevalece la
Product Bible; ante una decisión técnica, esta guía es la referencia principal.

**Estado:** oficial  
**Versión:** 1.0  
**Ámbito:** aplicación Hostly, runtimes operativos, módulos de gestión y persistencia  
**Stack principal:** Next.js App Router, React, TypeScript, Tailwind, Firebase Auth, Firestore, Firebase Storage y Vercel

---

## Cómo utilizar esta guía

Este documento sirve para:

- comprender Hostly antes de modificarlo;
- decidir dónde debe vivir una nueva responsabilidad;
- evitar regresiones en TPV, KDS, inventario y pagos;
- preparar modularizaciones sin alterar comportamiento;
- reconocer compatibilidades legacy que no deben convertirse en nuevos patrones;
- orientar a desarrolladores, agentes de IA, revisores y responsables técnicos.

La guía diferencia dos conceptos:

- **Arquitectura actual:** cómo funciona realmente Hostly hoy.
- **Arquitectura objetivo:** dirección que deben seguir las mejoras futuras.

La arquitectura objetivo no autoriza migraciones, borrados o cambios de modelo. Cualquier transición requiere una misión específica, pruebas y revisión humana.

---

# 1. Filosofía de arquitectura

## 1.1 Propósito

Hostly es un SaaS operativo multi-restaurante. No es un panel administrativo genérico: participa directamente en la apertura de mesas, creación de pedidos, producción en cocina y barra, servicio, cobro, inventario y recepción de mercancía.

La arquitectura debe priorizar, en este orden:

1. Integridad de la operación.
2. Aislamiento entre restaurantes.
3. Corrección económica y de stock.
4. Disponibilidad y recuperación ante fallos.
5. Claridad para el personal.
6. Evolución segura del producto.
7. Consistencia técnica y visual.

La elegancia interna nunca justifica poner en riesgo una operación real.

## 1.2 Principios fundamentales

### Seguridad por tenant

Toda lectura, escritura, listener, API y proceso debe estar asociado a un restaurante explícito. `restaurantId` es una frontera de seguridad, no un filtro visual.

### Una única fuente de verdad por responsabilidad

Cada dato debe tener un propietario claro. Cuando conviven modelos legacy y canónicos, la convivencia debe documentarse como transición, no asumirse como diseño definitivo.

### Runtimes operativos conservadores

TPV, Cocina, Barra, Coctelería y Sala son sistemas sensibles al tiempo. Deben evolucionar mediante cambios pequeños, observables y reversibles.

### Estado cerca de su propietario

El estado debe permanecer en el nivel que coordina realmente la operación. No debe fragmentarse en hooks o contextos antes de conocer sus invariantes.

### UI separada de persistencia

Los componentes de presentación no deben construir rutas Firestore ni conocer detalles de almacenamiento. Las páginas tampoco deberían convertirse en repositorios.

### Compatibilidad explícita

Los fallbacks y puentes legacy deben estar identificados. Ningún desarrollo nuevo debe depender de ellos sin una decisión arquitectónica consciente.

### Idempotencia en procesos económicos

Pagos, consumos, reversiones y movimientos de stock deben poder reintentarse sin duplicar efectos.

### Medición antes que eliminación

Una ruta o modelo aparentemente obsoleto no se elimina hasta conocer sus consumidores, tráfico, datos y equivalencia funcional.

## 1.3 Qué nunca debe hacerse

- Confiar únicamente en permisos de UI para proteger datos.
- Resolver el tenant desde parámetros no validados.
- Permitir que el cliente eleve su rol o cambie libremente su pertenencia.
- Crear listeners operativos sin alcance temporal, estado o límite razonable.
- Reescribir TPV o KDS como parte de una limpieza visual.
- Cambiar simultáneamente UI, queries y modelo de datos.
- Mover lógica Firestore mientras se divide presentación.
- Duplicar un flujo operativo para experimentar sin una estrategia de retirada.
- Introducir una tercera variante de `restaurants/restaurantes`, `users/usuarios` o `tables/mesas`.
- Borrar compatibilidad legacy basándose únicamente en búsquedas estáticas.
- Dividir archivos gigantes sin pruebas de caracterización.
- Ocultar errores de datos sustituyéndolos silenciosamente por datos de demostración.

---

# 2. Estructura global

## 2.1 Mapa funcional

```text
Autenticación y perfil de usuario
        │
        ├── restaurantId / roles / capabilities
        │
        ▼
Dashboard
        ├── Operación
        │   ├── TPV
        │   ├── Cocina
        │   ├── Barra
        │   ├── Coctelería
        │   ├── Sala
        │   └── Reservas
        │
        ├── Catálogo
        │   ├── Productos
        │   ├── Categorías
        │   ├── Familias
        │   ├── Modificadores
        │   └── Escandallos
        │
        ├── Inventario y compras
        │   ├── Stock
        │   ├── Movimientos
        │   ├── Compras
        │   ├── Recepciones
        │   ├── Facturas
        │   └── Proveedores
        │
        ├── Gestión
        │   ├── Configuración
        │   ├── Empresa
        │   ├── Espacios y mesas
        │   ├── Estaciones
        │   ├── Impresoras
        │   └── Usuarios
        │
        └── Inteligencia
            ├── Análisis
            ├── Ventas
            ├── Métricas
            └── Reportes
```

## 2.2 Dashboard

El Dashboard es la puerta de entrada y superficie de orientación. Agrega indicadores, alertas y accesos, pero no debe convertirse en una segunda implementación de la lógica de cada módulo.

Actualmente combina fuentes centrales y almacenamiento local de compatibilidad. Su evolución debe dirigirse hacia modelos de lectura agregados, sin duplicar reglas de negocio.

## 2.3 Configuración

Configuración contiene las decisiones estructurales del restaurante:

- perfil de empresa;
- carta y catálogo;
- espacios, planos y mesas;
- estaciones operativas;
- impresión;
- usuarios e integraciones.

Los cambios de Configuración pueden afectar directamente al runtime. Por ello deben tratarse como configuración operativa, no como formularios aislados.

## 2.4 Empresa

Empresa representa el perfil raíz del restaurante. Su identidad se relaciona con:

- `AuthContext`;
- documento `restaurants/{restaurantId}`;
- nombre y logo mostrados;
- onboarding;
- copias de nombre almacenadas en perfiles de usuario.

El documento del restaurante debe ser la fuente canónica de su identidad.

## 2.5 TPV

El TPV coordina mesas, catálogo, pedido, comanda, pago e impresión. Es el runtime con mayor concentración de estado y mayor impacto económico.

El mismo contenido principal se utiliza desde la ruta Carta y desde Operación → TPV. Esta reutilización es correcta, pero el componente central mantiene demasiadas responsabilidades.

## 2.6 KDS

KDS transforma pedidos y líneas en trabajo operativo para:

- Cocina;
- Barra;
- Coctelería;
- Sala.

Cocina, Barra y Coctelería reutilizan `OrderItemsBoard` con filtros y acciones distintas. Sala mantiene una vista especializada.

## 2.7 Productos y Carta

Productos es el catálogo central. Carta añade organización comercial y operativa:

- categorías;
- familias;
- disponibilidad;
- orden;
- destino operativo;
- modificadores;
- pases;
- relación con escandallos e inventario.

La compatibilidad con catálogos antiguos sigue activa y debe considerarse transicional.

## 2.8 Inventario, Compras y Recepciones

Inventario mantiene la existencia y configuración de stock. Compras registra intención y documentación. Recepciones confirma cantidades y costes reales y puede generar movimientos de stock.

La relación esperada es:

```text
Producto
  ├── configuración de inventario
  ├── receta / escandallo
  └── movimientos
          ▲
          ├── recepción de compra
          ├── consumo de receta
          ├── consumo de modificador
          ├── ajuste
          └── reversión
```

## 2.9 Escandallos

Los escandallos conectan venta e inventario. Definen composición, coste teórico, margen y consumo esperado.

No deben mezclarse los cálculos visuales de rentabilidad con la aplicación transaccional de movimientos.

## 2.10 Reservas

Reservas relaciona fecha, hora, comensales, estado y mesa. Comparte información espacial con planos y ocupación de pedidos.

La selección de mesa reutiliza el mapa, pero el dominio de reservas debe seguir siendo propietario de las reglas de disponibilidad.

## 2.11 Análisis

Análisis consume pedidos, pagos y reservas para crear vistas derivadas. Debe ser de lectura y nunca convertirse en fuente de verdad operacional.

Los cálculos deben residir en selectores o funciones de dominio, no dentro de componentes gráficos.

## 2.12 Usuarios

Usuarios define pertenencia, rol y capacidades. Es una frontera de seguridad.

La UI puede representar permisos, pero solo Auth, procesos administrativos confiables y Firestore Rules pueden hacerlos efectivos.

---

# 3. Arquitectura por capas

## 3.1 Modelo objetivo

```text
Route
  ↓
Shell
  ↓
Feature Controller / Provider
  ↓
Presentational Components
  ↓
Feature Hooks
  ↓
Repositories / Services
  ↓
Firestore / Storage / APIs
```

No todos los módulos actuales cumplen todavía esta separación. El modelo define la dirección, no el estado completo del repositorio.

## 3.2 Route

Responsabilidades:

- declarar la entrada de navegación;
- montar providers específicos;
- obtener parámetros de ruta;
- aplicar guards de alto nivel;
- elegir shell y feature principal.

No debe:

- contener lógica de negocio extensa;
- construir múltiples queries;
- gestionar transacciones;
- duplicar un runtime existente.

## 3.3 Shell

Responsabilidades:

- viewport;
- estructura de cabecera y contenido;
- navegación común;
- slots;
- límites de scroll;
- contexto visual y operativo.

Ejemplos conceptuales:

- shell general de módulo;
- shell de Configuración;
- shell de Operación;
- shell de editor espacial.

No debe interpretar documentos Firestore.

## 3.4 Feature Controller o Provider

Es el propietario del estado coordinado de una feature.

Responsabilidades:

- ensamblar repositorios y hooks;
- mantener la máquina de estados del flujo;
- traducir acciones de UI a comandos;
- exponer un modelo estable a los componentes;
- resolver loading, error y permisos.

No debe contener grandes bloques de presentación.

## 3.5 Presentational Components

Responsabilidades:

- representar datos;
- emitir intenciones mediante callbacks;
- aplicar Design System;
- accesibilidad y UX táctil.

No deben:

- conocer rutas Firestore;
- decidir permisos reales;
- generar IDs transaccionales;
- aplicar movimientos económicos.

## 3.6 Hooks

Existen tres familias recomendadas:

### Hooks de lectura

Conectan una feature con un repositorio y modelan loading/error/data.

### Hooks de estado de interacción

Gestionan selección, filtros, modales, gestos o preferencias.

### Hooks de dominio coordinado

Orquestan un flujo delimitado, como pago o edición de inventario.

Un hook no debe ser únicamente un archivo grande trasladado. Debe tener una responsabilidad, entradas y salidas claras.

## 3.7 Repositories y Services

### Repository

Encapsula persistencia:

- rutas;
- queries;
- mapeo de documentos;
- listeners;
- paginación.

### Domain Service

Encapsula reglas:

- cálculos;
- validación;
- idempotencia;
- composición de comandos;
- transformación independiente de UI.

Los servicios de dominio no deben importar componentes ni barrels visuales.

## 3.8 Firestore

Firestore es la persistencia y canal en tiempo real. No sustituye al dominio.

Toda operación debe definir:

- tenant;
- colección;
- alcance;
- autorización;
- estrategia de error;
- coste esperado;
- consistencia e idempotencia.

---

# 4. Runtime TPV

## 4.1 Propósito

El TPV coordina la sesión de servicio de una mesa desde su selección hasta el cierre económico.

Su componente central actual es:

`app/dashboard/carta/carta-page-content.tsx`

También se monta desde:

- `/dashboard/carta`;
- `/dashboard/operacion/tpv`.

## 4.2 Flujo general

```text
Operador activo
  ↓
Mapa / selección de mesa
  ↓
Carga o creación de pedido abierto
  ↓
Catálogo y composición de líneas
  ↓
Envío de comanda
  ↓
Producción KDS
  ↓
Servicio
  ↓
Solicitud de cuenta
  ↓
Pago total o dividido
  ↓
Impresión / factura
  ↓
Cierre y liberación de mesa
```

## 4.3 Mesa

La mesa aporta:

- identidad;
- zona y plano;
- estado de ocupación;
- operador asignado;
- número de comensales;
- grupo de mesas;
- pedido activo;
- señales de reserva;
- solicitud de cuenta;
- disponibilidad de cierre.

El runtime actual utiliza el modelo nuevo `tables/tableId`. La coexistencia con `mesas/mesaId` pertenece a rutas legacy y no debe extenderse.

## 4.4 Pedido

`orders` representa la cuenta y sesión operativa de una mesa.

Puede incluir:

- `restaurantId`;
- mesa;
- estado;
- líneas embebidas;
- tiempos;
- operador;
- notas;
- solicitud de cuenta;
- datos de total y pago.

El TPV mantiene una representación local para interacción rápida y sincroniza con el documento persistido.

Invariantes:

- un pedido pertenece a un único restaurante;
- un pedido no debe cambiar de tenant;
- los estados terminales no deben reaparecer como activos;
- la hidratación no debe duplicar líneas;
- los merges de mesas deben conservar trazabilidad.

## 4.5 Líneas

Las líneas representan productos, cantidades, extras, modificadores, notas, destino y estado productivo.

Conviven dos representaciones:

- líneas embebidas en `orders.items[]`;
- documentos operativos en `orderItems`.

Esta dualidad es una compatibilidad activa. No debe eliminarse ni ampliarse sin una misión de modelo de pedidos.

## 4.6 Pagos

Los pagos se registran en `payments`. El TPV soporta:

- efectivo;
- tarjeta;
- vales;
- descuentos;
- pago dividido;
- pago por productos;
- factura;
- impresión final.

Las cantidades monetarias deben normalizarse y redondearse mediante utilidades comunes.

Invariantes:

- ningún pago debe atribuirse a otro restaurante;
- no debe duplicarse por reintento;
- total pagado y total de cuenta deben reconciliarse;
- cancelaciones y devoluciones requieren capacidades superiores;
- la mesa no se libera antes de completar el cierre válido.

## 4.7 Presencia

La presencia evita que varios operadores actúen sobre la misma mesa sin contexto.

Incluye:

- operador activo;
- heartbeat;
- asignación de mesa;
- indicadores visuales;
- sesiones activas.

La presencia es una ayuda de coordinación, no un sustituto de transacciones o reglas de seguridad.

## 4.8 Reservas

El TPV escucha las reservas del día para:

- mostrar presión de reserva;
- identificar la próxima ocupación;
- priorizar visualmente mesas;
- evitar decisiones operativas ciegas.

La información de reserva complementa la ocupación; no debe reemplazar el estado real del pedido.

## 4.9 Listeners

El TPV escucha, directa o indirectamente:

- reservas del día;
- mesas;
- zonas;
- planos;
- pedidos;
- pedido seleccionado;
- pagos;
- modificadores;
- estaciones;
- configuración de impresión;
- presencia.

Reglas:

- cada listener necesita `restaurantId`;
- debe tener un alcance operativo;
- debe limpiarse al desmontar o cambiar de tenant;
- no debe duplicarse por rerenders;
- los listeners históricos deben limitarse;
- los errores no deben confundirse con estados vacíos.

## 4.10 Eventos

El TPV consume o emite eventos para:

- mesas listas para cerrar;
- limpieza de una mesa cerrada;
- merge de pedidos de grupos;
- cambios de stock.

Estos eventos son contratos globales y deben tratarse como APIs internas.

## 4.11 Dirección futura

```text
TpvRoute
└── TpvRuntimeProvider
    ├── TpvShell
    ├── TpvTableMap
    ├── TpvCatalog
    ├── TpvOrderPanel
    ├── TpvCourseFlow
    ├── TpvPaymentFlow
    ├── TpvPrintFlow
    └── TpvDialogs
```

La división se realizará de fuera hacia dentro: presentación, helpers, estado y, por último, persistencia.

---

# 5. Runtime KDS

## 5.1 Propósito

KDS traduce líneas vendidas en trabajo de producción y servicio.

## 5.2 Módulos

### Cocina

Utiliza `KitchenView` y `OrderItemsBoard`. Añade:

- filtro de estación;
- métricas;
- rail de tickets;
- panel de preparados;
- archivo de servidos;
- agrupación por pase.

### Barra

Reutiliza `OrderItemsBoard` filtrando bebidas y estaciones de barra.

### Coctelería

Reutiliza el mismo tablero con el scope de coctelería.

### Sala

Presenta líneas preparadas agrupadas por mesa y permite completar el servicio. También calcula qué mesas están listas para cerrar.

## 5.3 Pedidos y líneas

El KDS actual obtiene pedidos de `orders` y transforma sus líneas embebidas en un modelo de tablero.

Las rutas legacy pueden escuchar `orderItems` directamente. Esta convivencia no debe tomarse como patrón para nuevas pantallas.

## 5.4 Estados

Estados operativos conceptuales:

```text
pendiente local
  ↓
sent
  ↓
waiting_march (si requiere pase)
  ↓
prepared / ready
  ↓
served
```

Los estados terminales del pedido incluyen variantes como:

- `closed`;
- `paid`;
- `cancelled`;
- `canceled`;
- `merged`.

Toda clasificación debe centralizarse gradualmente para evitar diferencias entre TPV, Cocina y Sala.

## 5.5 Flujo

```text
TPV crea o actualiza pedido
  ↓
TPV envía líneas
  ↓
KDS clasifica por destino y estación
  ↓
Producción prepara
  ↓
Sala recibe líneas listas
  ↓
Sala sirve
  ↓
TPV puede cerrar cuando no quedan líneas pendientes
```

## 5.6 Riesgos

- Un único tablero afecta Cocina, Barra y Coctelería.
- Las mutaciones actualizan arrays embebidos.
- Existen normalizadores duplicados.
- Los listeners amplios crecen con el histórico.
- Los eventos globales ocultan dependencias.
- Cocina legacy mantiene otra implementación.

## 5.7 Dirección futura

```text
KdsModule
├── useKdsOrders
├── useKdsBoardModel
├── useKdsActions
├── KdsTicketRail
├── KdsColumn
├── KdsTicket
└── KdsLine
```

La normalización pura debe separarse antes que las acciones Firestore.

---

# 6. Inventario

## 6.1 Modelo conceptual

```text
Producto
├── datos comerciales
├── configuración de inventario
├── receta
└── movimientos de stock
```

## 6.2 Productos

El producto central vive bajo el restaurante y puede contener:

- disponibilidad comercial;
- familia y categoría;
- destino operativo;
- configuración de inventario;
- receta;
- imagen;
- modificadores.

El módulo de Productos actúa como punto de edición principal, mientras Inventario presenta una vista especializada.

## 6.3 Recetas y escandallos

Una receta conecta el producto vendido con ingredientes o productos inventariables.

El escandallo calcula:

- coste teórico;
- margen;
- composición;
- estado de completitud.

La aplicación real del consumo pertenece al ledger de movimientos, no a la UI del escandallo.

## 6.4 Movimientos

`stockMovements` es el ledger central.

Orígenes:

- consumo de receta;
- consumo de modificador;
- recepción de compra;
- ajuste;
- reversión.

Propiedades arquitectónicas:

- IDs deterministas cuando sea posible;
- idempotencia;
- trazabilidad de origen;
- compatibilidad de unidades;
- stock anterior y posterior verificables;
- reversión explícita, nunca borrado silencioso.

## 6.5 Recepciones

Una recepción:

1. parte de una compra o documento;
2. confirma cantidades y costes;
3. concilia proveedor y producto;
4. registra incidencias;
5. aplica movimientos;
6. deja trazabilidad.

La UI puede preparar borradores, pero la aplicación de stock debe ser transaccional.

## 6.6 Stock

El stock actual es una proyección derivada de movimientos aplicados.

No debe actualizarse sin registrar el origen correspondiente. Los fallos no deben sustituirse silenciosamente por datos mock en contextos operativos.

## 6.7 Consumos y reversiones

El consumo debe asociarse a una línea o acción concreta. Si una línea se cancela, la reversión debe:

- identificar el consumo original;
- evitar duplicados;
- conservar la auditoría;
- respetar unidades;
- pertenecer al mismo tenant.

---

# 7. Firestore

## 7.1 Principio multi-tenant

`restaurantId` delimita el acceso lógico a los datos.

Patrones actuales:

```text
Colección top-level + restaurantId
orders/{orderId}
payments/{paymentId}
tables/{tableId}
reservations/{reservationId}

Subcolección bajo restaurante
restaurants/{restaurantId}/products/{productId}
restaurants/{restaurantId}/stockMovements/{movementId}
```

Ambos patrones son válidos si las reglas y queries verifican tenant de forma explícita.

## 7.2 Colecciones y subcolecciones principales

### Identidad

- `users`
- `usuarios` — espejo legacy
- `restaurant_invites`

### Restaurante

- `restaurants`
- `restaurantes` — raíz legacy utilizada todavía por partes de Carta

### Operación

- `orders`
- `orderItems`
- `payments`
- `vouchers`
- `tables`
- `mesas` — modelo legacy
- `zones`
- `floorPlans`
- `reservations`

### Catálogo

- `restaurants/{restaurantId}/products`
- `restaurants/{restaurantId}/productFamilies`
- `restaurants/{restaurantId}/modifierGroups`
- `restaurants/{restaurantId}/operationStations`
- `restaurants/{restaurantId}/productionStations`
- subcolecciones legacy de Carta bajo `restaurantes`

### Inventario y compras

- `restaurants/{restaurantId}/stockMovements`
- `restaurants/{restaurantId}/inventoryReceipts`
- `restaurants/{restaurantId}/purchaseOrders`
- `restaurants/{restaurantId}/purchaseReceipts`
- `restaurants/{restaurantId}/purchaseDrafts`
- `restaurants/{restaurantId}/supplierInvoices`
- `restaurants/{restaurantId}/supplierProductAliases`

### Configuración y soporte operativo

- `restaurants/{restaurantId}/config/*`
- `restaurants/{restaurantId}/printJobs`
- `restaurants/{restaurantId}/activityLogs`
- `restaurants/{restaurantId}/tablePresence`
- `restaurants/{restaurantId}/activeSessions`
- snapshots y layouts de planos.

## 7.3 Usuarios y roles

`users/{uid}` es la referencia preferente. `usuarios/{uid}` existe como mirror de compatibilidad.

Los campos sensibles incluyen:

- `restaurantId`;
- `restaurantIds`;
- `role`;
- identidad y nombre visible.

Regla permanente: el cliente no debe poder elevar su rol ni asociarse libremente a otro restaurante.

## 7.4 `restaurants` y `restaurantes`

`restaurants` es la raíz canónica para perfil, catálogo central, inventario y configuración moderna.

`restaurantes` sigue siendo utilizada por APIs y colecciones legacy de Carta.

No se debe:

- añadir nuevos dominios bajo `restaurantes`;
- borrar la raíz legacy sin migración;
- asumir que ambas raíces contienen exactamente los mismos datos.

## 7.5 Pedidos

`orders` contiene el pedido y líneas embebidas utilizadas por TPV y KDS moderno.

Debe consultarse siempre con tenant y un alcance operativo. Los listeners de todo el histórico son una deuda de coste y escalabilidad.

## 7.6 OrderItems

`orderItems` mantiene líneas operativas independientes para compatibilidad y rutas legacy.

No debe declararse obsoleta hasta completar la auditoría de consumidores.

## 7.7 Payments

`payments` contiene cobros y operaciones relacionadas.

Requiere:

- tenant;
- capacidad de cobro;
- capacidad superior para devolución;
- inmutabilidad del tenant;
- reconciliación con pedido.

## 7.8 Índices y queries

Toda query compuesta debe tener su índice documentado.

Un fallback por índice ausente puede preservar funcionalidad, pero suele:

- leer más documentos;
- ordenar en cliente;
- ocultar degradación;
- aumentar coste.

Los fallbacks deben ser observables y temporales.

## 7.9 Rules

Firestore Rules constituyen la barrera real.

Las reglas deben validar:

- autenticación;
- tenant actual;
- tenant inmutable;
- capability;
- campos que pueden cambiar;
- operaciones especiales como cobros, devoluciones y cancelaciones.

La protección de una ruta React nunca sustituye a Rules.

---

# 8. Eventos globales

Los eventos globales existentes son APIs internas. Deben conservar nombre y payload hasta que una misión específica los sustituya.

| Evento | Emisor principal | Receptor principal | Objetivo | Riesgo |
|---|---|---|---|---|
| `tablesReadyToClose:update` | Sala/KDS | Wrappers de Carta y TPV | Publicar mesas sin líneas operativas pendientes | Payload no tipado y dependencia invisible |
| `tablesReadyToClose:clear` | TPV al cerrar o limpiar mesa | Wrappers de Carta y TPV | Retirar una mesa del conjunto de cierre | Puede dejar estado visual obsoleto si no se procesa |
| `kds:station-status` | `OrderItemsBoard` y Sala | Indicadores de Operación | Informar actividad y estado de estaciones | Varios emisores pueden divergir |
| Evento de merge de pedidos de grupo | Servicio de merge de mesas | TPV | Invalidar o rehidratar pedidos tras unir mesas | Contrato sensible a IDs y orden temporal |
| `STOCK_CHANGED_EVENT` | Recepciones y flujos de stock | Dashboard y consumidores locales | Refrescar proyecciones locales de stock | Bus global sin confirmación de persistencia |
| `PLATOS_CHANGED_EVENT` | Persistencia legacy de platos | Productos y paneles legacy | Sincronizar catálogo local antiguo | Mantiene acoplamiento con `localStorage` |
| `CARTA_CATEGORIAS_CHANGED_EVENT` | Store local de categorías | Productos | Refrescar jerarquía de Carta | Compatibilidad local, no fuente canónica |

## Reglas para eventos

- Definir propietario.
- Documentar payload.
- No reutilizar el mismo nombre con otra forma.
- Limpiar listeners al desmontar.
- No utilizar eventos globales para nuevos flujos si props, contexto o repositorio resuelven la relación.
- No sustituir un evento existente durante una modularización visual.

---

# 9. Dependencias delicadas

## 9.1 `EditableFloorMap`

Consumidores:

- configuración de mesas;
- TPV;
- selector de mesa de Reservas.

Riesgos:

- contrato de props extenso;
- coordenadas y transformaciones;
- gestos táctiles;
- controles imperativos;
- selección y edición;
- diferencias entre modo operativo y modo editor.

No cambiar simultáneamente API, coordenadas y gestos.

## 9.2 `OrderItemsBoard`

Consumidores:

- Cocina;
- Barra;
- Coctelería.

Riesgos:

- listener compartido;
- normalización de pedido;
- mutación de arrays embebidos;
- agrupación por pase;
- prioridades y SLA;
- acciones distintas según estación.

Toda modificación requiere validar los tres módulos.

## 9.3 Productos

Productos conecta:

- Carta;
- categorías;
- familias;
- estaciones;
- modificadores;
- recetas;
- inventario;
- imágenes;
- migración legacy.

Un cambio en tipos o mappers puede afectar TPV, KDS e inventario.

## 9.4 TPV

Es la dependencia más delicada por impacto económico y operativo. Combina datos, tiempo real, navegación, interacción y persistencia.

## 9.5 Stock

El ledger y el stock actual deben mantenerse reconciliados. Un error puede permanecer oculto hasta inventario físico o cierre económico.

## 9.6 AuthContext y scope del restaurante

Muchos módulos dependen de:

- usuario;
- `restaurantId`;
- rol;
- estado `ready`.

Ningún listener debe iniciarse antes de que auth y tenant estén resueltos.

## 9.7 Ciclos de imports conocidos

Áreas con ciclos detectados:

- builders y barrel de Análisis;
- productos, escritura central, ordenación y estación operativa;
- configuración operacional de categorías;
- utilidades visuales de escandallos;
- tipos de snapshots de Análisis;
- curso y liberación de líneas de comanda.

Los barrels internos son una causa relevante. Dentro de una feature deben preferirse imports directos.

---

# 10. Componentes gigantes

## 10.1 TPV — `carta-page-content.tsx`

**Responsabilidad actual:** runtime completo de sala, pedido y cobro.  
**Riesgo:** máximo.  
**No tocar todavía:** ownership del pedido, orden de efectos, pagos, persistencia y listeners.  
**División futura:** shell, mapa, catálogo, comanda, pases, pagos, impresión y diálogos.  
**Orden:** helpers puros → presentación → controladores locales → estado → repositories.

## 10.2 Configuración de mesas — `config/mesas/page.tsx`

**Responsabilidad actual:** editor gráfico y persistencia de planos.  
**Riesgo:** geometría, historial y batch de guardado.  
**No tocar todavía:** sistema de coordenadas, undo/redo y transacción de guardado.  
**División futura:** toolbar, rail, canvas, selección, inspectores, historial y persistencia.  
**Orden:** chrome visual → inspectores → hooks de selección/historial → persistencia.

## 10.3 Productos — `productos-management-page.tsx`

**Responsabilidad actual:** listado, edición, relaciones de catálogo y operaciones masivas.  
**Riesgo:** sincronización central/legacy y formulario con muchas dependencias.  
**No tocar todavía:** guardado, borrado, publicación y migración.  
**División futura:** lista, filtros, bulk actions, editor por secciones y flujos de borrado.  
**Orden:** secciones visuales → helpers del draft → controlador de formulario → repository.

## 10.4 KDS — `order-items-board.tsx`

**Responsabilidad actual:** snapshot, modelo, acciones y presentación del tablero.  
**Riesgo:** afecta tres estaciones y muta pedidos activos.  
**No tocar todavía:** acciones Firestore y transición de estados.  
**División futura:** normalizador, board model, actions, columnas, tickets y líneas.  
**Orden:** normalización pura → presentación → acciones.

## 10.5 Recepciones — `recepciones/page.tsx`

**Responsabilidad actual:** listado, conciliación, drawer y aplicación de stock.  
**Riesgo:** mezcla persistencia local y central.  
**No tocar todavía:** aplicación de stock y validación final.  
**División futura:** resumen, filtros, lista, drawer y workflow.  
**Orden:** bloques del drawer → lista → hook de workflow.

## 10.6 Mapa — `EditableFloorMap.tsx`

**Responsabilidad actual:** motor espacial reutilizable.  
**Riesgo:** contrato público y matemáticas de viewport.  
**No tocar todavía:** transformaciones y API completa.  
**División futura:** viewport, capas, gestos, selección y coordenadas.  
**Orden:** funciones puras → capas visuales → hooks de interacción.

## 10.7 Movimientos — `stock-movements.ts`

**Responsabilidad actual:** ledger, consumos, reversiones, recepciones y consultas.  
**Riesgo:** consistencia económica e idempotencia.  
**No tocar todavía:** IDs, transacciones y reversiones.  
**División futura:** IDs, unidades, consumos, recepciones, reversiones, aplicación y queries.  
**Orden:** tipos/helpers → queries → comandos, siempre con pruebas.

## 10.8 Productos Firestore — `products.ts`

**Responsabilidad actual:** legacy, catálogo central, inventario, recetas y listeners.  
**Riesgo:** ciclo de imports y consumidores numerosos.  
**No tocar todavía:** contratos exportados y fallbacks.  
**División futura:** tipos, mappers, repositorios legacy/central/inventario y listeners.  
**Orden:** tipos → mappers → adapters compatibles → repositorios.

## 10.9 Inventario — `inventario-stock-section.tsx`

**Responsabilidad actual:** lista, filtros, drafts, inspector y movimientos.  
**Riesgo:** cambios sin guardar y fallback mock.  
**No tocar todavía:** guardado y reconciliación de movimientos.  
**División futura:** filtros, lista, inspector, editor y movimientos.  
**Orden:** presentación → estado de draft → datos.

## 10.10 Cocina legacy — `dashboard/cocina/page.tsx`

**Responsabilidad actual:** runtime KDS independiente.  
**Riesgo:** no está claro si es compatibilidad o ruta productiva.  
**No tocar todavía:** cualquier modularización extensa.  
**División futura:** solo si se confirma su continuidad.  
**Orden:** medir uso → comparar funcionalidad → conservar o retirar.

---

# 11. Modularización futura

## Fase 0 — Caracterización

- Inventariar flujos.
- Documentar invariantes.
- Identificar propietarios de estado.
- Capturar queries, eventos y efectos.
- Crear pruebas de humo y caracterización.

## Fase 1 — Dependencias y ciclos

- Evitar barrels internos.
- Extraer tipos sin dependencias.
- Romper ciclos pequeños.
- Documentar eventos globales.

## Fase 2 — Presentación

- Extraer secciones puramente visuales.
- Mantener estado y callbacks en el padre.
- No cambiar Firestore.
- No cambiar modelos.

## Fase 3 — Helpers puros

- Formateo.
- Normalización.
- Cálculos.
- Clasificación.
- Transformaciones deterministas.

Todos deben ser probables mediante entradas y salidas.

## Fase 4 — Estado de interacción

- Selección.
- Filtros.
- Modales.
- Historial visual.
- Preferencias.

No mover todavía la persistencia.

## Fase 5 — Controladores de feature

- Definir ownership.
- Agrupar comandos.
- Exponer modelos estables.
- Reducir prop drilling cuando exista evidencia.

## Fase 6 — Repositories

- Encapsular rutas y queries.
- Separar listeners y comandos.
- Mantener adapters compatibles.
- Añadir observabilidad.

## Fase 7 — Optimización Firestore

- Acotar listeners.
- Revisar índices.
- Paginar históricos.
- Verificar costes.

Esta fase debe ser independiente de la modularización visual.

## Fase 8 — Retirada legacy

- Medir uso.
- Migrar datos.
- Mantener compatibilidad temporal.
- Retirar lectores.
- Retirar escritores.
- Eliminar rutas únicamente al final.

---

# 12. Reglas permanentes

1. Nunca dividir estado antes de caracterizar el flujo.
2. Nunca mover Firestore junto con UI en la misma misión.
3. Nunca reescribir TPV como parte de una limpieza.
4. Nunca cambiar listeners durante modularización visual.
5. Primero presentación.
6. Después helpers puros.
7. Después estado.
8. Después persistencia.
9. Nunca confiar en UI para autorización.
10. Toda operación debe conservar `restaurantId`.
11. El tenant no puede cambiar durante un update.
12. Los procesos de stock y pago deben ser idempotentes.
13. Los errores de lectura no equivalen a “sin datos”.
14. Todo fallback legacy debe estar documentado.
15. No crear nuevas dependencias sobre modelos legacy.
16. Los barrels no deben utilizarse dentro de su propia feature.
17. Todo evento global es un contrato.
18. Todo listener debe tener cleanup y alcance.
19. Una extracción debe mantener el mismo comportamiento observable.
20. Una misión debe tener una única dimensión principal de cambio.

---

# 13. Checklist antes de cualquier refactor

## Alcance

- [ ] ¿Está definido el comportamiento que debe permanecer idéntico?
- [ ] ¿Se conoce el propietario actual del estado?
- [ ] ¿Se han identificado todos los consumidores?
- [ ] ¿Se han identificado rutas legacy relacionadas?
- [ ] ¿El cambio se limita a una responsabilidad?

## Datos y seguridad

- [ ] ¿Se conserva `restaurantId`?
- [ ] ¿Se mantienen roles y capabilities?
- [ ] ¿No cambian Rules, modelos o queries accidentalmente?
- [ ] ¿No se convierte un error en estado vacío?

## React

- [ ] ¿Se conserva el orden de efectos relevante?
- [ ] ¿Se mantienen dependencias de callbacks y memos?
- [ ] ¿No se duplican providers?
- [ ] ¿No se crean dos fuentes de verdad?
- [ ] ¿Los listeners se limpian?

## Compatibilidad

- [ ] ¿Los exports públicos permanecen compatibles?
- [ ] ¿Los eventos mantienen nombre y payload?
- [ ] ¿Los deep links siguen funcionando?
- [ ] ¿Responsive y UX táctil siguen equivalentes?

## Validación

- [ ] TypeScript.
- [ ] Build.
- [ ] `git diff --check`.
- [ ] Pruebas de caracterización.
- [ ] Smoke test de rutas afectadas.
- [ ] Revisión humana proporcional al riesgo.

---

# 14. Checklist antes de tocar TPV

- [ ] Probar apertura de mesa.
- [ ] Probar mesa con pedido existente.
- [ ] Probar grupo de mesas.
- [ ] Añadir producto simple.
- [ ] Añadir producto con modificadores.
- [ ] Editar cantidad y nota.
- [ ] Enviar comanda.
- [ ] Marchar primeros, segundos y postres.
- [ ] Cancelar línea pendiente.
- [ ] Cancelar línea enviada con permisos válidos.
- [ ] Compensar producto.
- [ ] Solicitar cuenta.
- [ ] Dividir por partes iguales.
- [ ] Dividir por productos.
- [ ] Cobrar en efectivo.
- [ ] Cobrar con tarjeta.
- [ ] Cobrar con vale.
- [ ] Aplicar descuento.
- [ ] Emitir factura.
- [ ] Imprimir preticket y ticket.
- [ ] Cerrar mesa.
- [ ] Confirmar que no se duplican pagos ni líneas.
- [ ] Confirmar recuperación tras recarga.
- [ ] Confirmar comportamiento offline/inestable.
- [ ] Validar presencia de operador.
- [ ] Validar reservas y presión de mesa.
- [ ] Validar móvil y tablet.
- [ ] No cambiar queries y UI en la misma misión.

---

# 15. Checklist antes de tocar Firestore

- [ ] Identificar colección y ruta exacta.
- [ ] Confirmar si es canónica o legacy.
- [ ] Identificar todos los lectores.
- [ ] Identificar todos los escritores.
- [ ] Confirmar `restaurantId`.
- [ ] Confirmar tenant inmutable.
- [ ] Confirmar rol/capability.
- [ ] Revisar Rules locales y desplegadas.
- [ ] Determinar índice necesario.
- [ ] Estimar documentos leídos y frecuencia.
- [ ] Definir límite, fecha o estado del listener.
- [ ] Definir comportamiento ante error.
- [ ] Verificar cleanup.
- [ ] Verificar idempotencia.
- [ ] Verificar transacción o batch cuando corresponda.
- [ ] Revisar compatibilidad `restaurants/restaurantes`.
- [ ] Revisar compatibilidad `users/usuarios`.
- [ ] Revisar compatibilidad `tables/mesas`.
- [ ] Revisar `orders.items[]/orderItems`.
- [ ] Probar con al menos dos tenants.
- [ ] Probar roles distintos.
- [ ] No desplegar Rules sin emulador y revisión humana.

---

# 16. Checklist antes de tocar Inventario

- [ ] Identificar producto e identidad central.
- [ ] Confirmar unidad de inventario.
- [ ] Confirmar unidad de compra.
- [ ] Verificar conversiones.
- [ ] Identificar movimiento origen.
- [ ] Confirmar ID idempotente.
- [ ] Verificar stock anterior y posterior.
- [ ] Probar recepción parcial.
- [ ] Probar consumo de receta.
- [ ] Probar consumo de modificadores.
- [ ] Probar cancelación y reversión.
- [ ] Probar reintento.
- [ ] Confirmar que no se duplica el movimiento.
- [ ] Confirmar mismo tenant en producto y movimiento.
- [ ] Revisar fallbacks legacy.
- [ ] No sustituir errores por mocks en producción.
- [ ] Comparar ledger y stock actual.
- [ ] Revisar impacto en escandallos.
- [ ] Revisar timeline.
- [ ] Revisión humana obligatoria si cambia una transacción.

---

# 17. Checklist antes de tocar KDS

- [ ] Validar Cocina.
- [ ] Validar Barra.
- [ ] Validar Coctelería.
- [ ] Validar Sala.
- [ ] Confirmar filtros por estación.
- [ ] Confirmar destino de cada línea.
- [ ] Confirmar agrupación por mesa.
- [ ] Confirmar agrupación por pase.
- [ ] Confirmar urgencia y SLA.
- [ ] Probar `sent → prepared`.
- [ ] Probar `prepared → served`.
- [ ] Probar líneas `waiting_march`.
- [ ] Probar cantidades divididas.
- [ ] Probar extras y notas.
- [ ] Probar líneas canceladas.
- [ ] Confirmar que pedidos terminales no aparecen.
- [ ] Confirmar que el update conserva las demás líneas.
- [ ] Confirmar mesas listas para cerrar.
- [ ] Confirmar eventos de estado de estación.
- [ ] Confirmar sonido y feedback.
- [ ] Confirmar cleanup del listener.
- [ ] Validar pantalla táctil.
- [ ] Comparar con rutas legacy si siguen activas.

---

# 18. Próximas épicas

## Prioridad 0 — Seguridad multi-tenant

Objetivo:

- proteger pertenencia y roles;
- endurecer capabilities;
- verificar Rules desplegadas;
- añadir pruebas multi-tenant.

No debe mezclarse con modularización.

## Prioridad 1 — Red de seguridad TPV

Objetivo:

- mapa contractual;
- pruebas de caracterización;
- smoke tests repetibles;
- inventario de eventos y listeners.

## Prioridad 2 — Coste y alcance de listeners

Objetivo:

- limitar pedidos y pagos históricos;
- definir ventanas operativas;
- revisar índices;
- medir lecturas.

## Prioridad 3 — Modularización TPV, fase exterior

Objetivo:

- extraer presentación y helpers puros;
- mantener estado y persistencia intactos.

## Prioridad 4 — Editor de espacios

Objetivo:

- separar chrome e inspectores;
- caracterizar geometría;
- mantener guardado transaccional.

## Prioridad 5 — Productos

Objetivo:

- dividir editor por dominios;
- estabilizar draft y mappers;
- conservar sincronización y publicación.

## Prioridad 6 — KDS

Objetivo:

- centralizar normalización;
- separar modelo derivado de presentación;
- mantener acciones Firestore.

## Prioridad 7 — Inventario y Recepciones

Objetivo:

- separar lista, inspector y drawer;
- probar ledger y reversiones;
- dividir repositories solo después.

## Prioridad 8 — Ciclos y límites de dominio

Objetivo:

- romper ciclos conocidos;
- reducir barrels internos;
- aislar tipos y helpers puros.

## Prioridad 9 — Consolidación legacy

Objetivo:

- auditar tráfico;
- definir canónicos;
- migrar progresivamente;
- retirar rutas y modelos únicamente con evidencia.

---

# Apéndice A — Orden seguro de trabajo

```text
Comprender
  ↓
Caracterizar
  ↓
Probar
  ↓
Extraer presentación
  ↓
Extraer helpers puros
  ↓
Definir ownership del estado
  ↓
Extraer controladores
  ↓
Separar repositories
  ↓
Optimizar Firestore
  ↓
Retirar legacy
```

# Apéndice B — Glosario

**Tenant:** restaurante o conjunto de restaurantes al que pertenece un dato.  
**Scope:** alcance de una lectura, operación o vista.  
**Runtime operativo:** pantalla que participa en servicio en tiempo real.  
**KDS:** Kitchen Display System; sistema de producción y salida.  
**Repository:** capa que encapsula persistencia y queries.  
**Domain service:** lógica de negocio independiente de UI.  
**Feature controller:** propietario del estado coordinado de un módulo.  
**Listener:** suscripción en tiempo real a Firestore.  
**Ledger:** registro inmutable o trazable de movimientos.  
**Idempotencia:** capacidad de repetir una operación sin duplicar su efecto.  
**Legacy:** compatibilidad anterior todavía activa; no significa automáticamente código muerto.  
**Caracterización:** pruebas y documentación que capturan el comportamiento actual antes de cambiar estructura.

# Apéndice C — Regla de decisión

Ante cualquier duda:

1. preservar operación;
2. preservar tenant;
3. preservar dinero y stock;
4. preservar contratos;
5. reducir el alcance;
6. documentar la incertidumbre;
7. posponer el cambio antes que asumir.

Esta guía debe actualizarse cuando cambie un límite arquitectónico, un modelo canónico, un evento global o una regla permanente. Los cambios puramente visuales o locales no requieren modificarla.
