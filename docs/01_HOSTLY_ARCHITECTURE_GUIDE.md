# Hostly Architecture Guide v1

> Referencia maestra de arquitectura de Hostly.

**Autoridad documental:** nivel 3. Este documento estÃ¡ subordinado a
`00_HOSTLY_PRODUCT_BIBLE.md` y a `11_HOSTLY_ENGINEERING_CONSTITUTION.md`.
Ante una contradicciÃ³n de producto, prevalece la Product Bible; ante una
decisiÃ³n de ingenierÃ­a o implementaciÃ³n, prevalece la ConstituciÃ³n TÃ©cnica.

> **Nota para implementaciÃ³n:** toda decisiÃ³n de cÃ³digo, Firebase, Git, calidad
> o evoluciÃ³n tÃ©cnica debe respetar `docs/11_HOSTLY_ENGINEERING_CONSTITUTION.md`.
> Esta guÃ­a desarrolla el estado actual y objetivo de la arquitectura; no sustituye
> la ConstituciÃ³n TÃ©cnica.
>
> **Referencias maestras relacionadas:** `12_HOSTLY_RELEASE_PLAYBOOK.md` (releases),
> `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md` (IA), `14_HOSTLY_MODULES_REFERENCE.md` (mÃ³dulos),
> `15_HOSTLY_DATA_MODEL_REFERENCE.md` (modelo de datos).

**Estado:** oficial
**VersiÃ³n:** 1.0
**Ãmbito:** aplicaciÃ³n Hostly, runtimes operativos, mÃ³dulos de gestiÃ³n y persistencia
**Stack principal:** Next.js App Router, React, TypeScript, Tailwind, Firebase Auth, Firestore, Firebase Storage y Vercel

---

## CÃ³mo utilizar esta guÃ­a

Este documento sirve para:

- comprender Hostly antes de modificarlo;
- decidir dÃ³nde debe vivir una nueva responsabilidad;
- evitar regresiones en TPV, KDS, inventario y pagos;
- preparar modularizaciones sin alterar comportamiento;
- reconocer compatibilidades legacy que no deben convertirse en nuevos patrones;
- orientar a desarrolladores, agentes de IA, revisores y responsables tÃ©cnicos.

La guÃ­a diferencia dos conceptos:

- **Arquitectura actual:** cÃ³mo funciona realmente Hostly hoy.
- **Arquitectura objetivo:** direcciÃ³n que deben seguir las mejoras futuras.

La arquitectura objetivo no autoriza migraciones, borrados o cambios de modelo. Cualquier transiciÃ³n requiere una misiÃ³n especÃ­fica, pruebas y revisiÃ³n humana.

---

# 1. FilosofÃ­a de arquitectura

## 1.1 PropÃ³sito

Hostly es un SaaS operativo multi-restaurante. No es un panel administrativo genÃ©rico: participa directamente en la apertura de mesas, creaciÃ³n de pedidos, producciÃ³n en cocina y barra, servicio, cobro, inventario y recepciÃ³n de mercancÃ­a.

La arquitectura debe priorizar, en este orden:

1. Integridad de la operaciÃ³n.
2. Aislamiento entre restaurantes.
3. CorrecciÃ³n econÃ³mica y de stock.
4. Disponibilidad y recuperaciÃ³n ante fallos.
5. Claridad para el personal.
6. EvoluciÃ³n segura del producto.
7. Consistencia tÃ©cnica y visual.

La elegancia interna nunca justifica poner en riesgo una operaciÃ³n real.

## 1.2 Principios fundamentales

### Seguridad por tenant

Toda lectura, escritura, listener, API y proceso debe estar asociado a un restaurante explÃ­cito. `restaurantId` es una frontera de seguridad, no un filtro visual.

### Una Ãºnica fuente de verdad por responsabilidad

Cada dato debe tener un propietario claro. Cuando conviven modelos legacy y canÃ³nicos, la convivencia debe documentarse como transiciÃ³n, no asumirse como diseÃ±o definitivo.

### Runtimes operativos conservadores

TPV, Cocina, Barra, CoctelerÃ­a y Sala son sistemas sensibles al tiempo. Deben evolucionar mediante cambios pequeÃ±os, observables y reversibles.

### Estado cerca de su propietario

El estado debe permanecer en el nivel que coordina realmente la operaciÃ³n. No debe fragmentarse en hooks o contextos antes de conocer sus invariantes.

### UI separada de persistencia

Los componentes de presentaciÃ³n no deben construir rutas Firestore ni conocer detalles de almacenamiento. Las pÃ¡ginas tampoco deberÃ­an convertirse en repositorios.

### Compatibilidad explÃ­cita

Los fallbacks y puentes legacy deben estar identificados. NingÃºn desarrollo nuevo debe depender de ellos sin una decisiÃ³n arquitectÃ³nica consciente.

### Idempotencia en procesos econÃ³micos

Pagos, consumos, reversiones y movimientos de stock deben poder reintentarse sin duplicar efectos.

### MediciÃ³n antes que eliminaciÃ³n

Una ruta o modelo aparentemente obsoleto no se elimina hasta conocer sus consumidores, trÃ¡fico, datos y equivalencia funcional.

## 1.3 QuÃ© nunca debe hacerse

- Confiar Ãºnicamente en permisos de UI para proteger datos.
- Resolver el tenant desde parÃ¡metros no validados.
- Permitir que el cliente eleve su rol o cambie libremente su pertenencia.
- Crear listeners operativos sin alcance temporal, estado o lÃ­mite razonable.
- Reescribir TPV o KDS como parte de una limpieza visual.
- Cambiar simultÃ¡neamente UI, queries y modelo de datos.
- Mover lÃ³gica Firestore mientras se divide presentaciÃ³n.
- Duplicar un flujo operativo para experimentar sin una estrategia de retirada.
- Introducir una tercera variante de `restaurants/restaurantes`, `users/usuarios` o `tables/mesas`.
- Borrar compatibilidad legacy basÃ¡ndose Ãºnicamente en bÃºsquedas estÃ¡ticas.
- Dividir archivos gigantes sin pruebas de caracterizaciÃ³n.
- Ocultar errores de datos sustituyÃ©ndolos silenciosamente por datos de demostraciÃ³n.

---

# 2. Estructura global

## 2.1 Mapa funcional

```text
AutenticaciÃ³n y perfil de usuario
        â”‚
        â”œâ”€â”€ restaurantId / roles / capabilities
        â”‚
        â–¼
Dashboard
        â”œâ”€â”€ OperaciÃ³n
        â”‚   â”œâ”€â”€ TPV
        â”‚   â”œâ”€â”€ Cocina
        â”‚   â”œâ”€â”€ Barra
        â”‚   â”œâ”€â”€ CoctelerÃ­a
        â”‚   â”œâ”€â”€ Sala
        â”‚   â””â”€â”€ Reservas
        â”‚
        â”œâ”€â”€ CatÃ¡logo
        â”‚   â”œâ”€â”€ Productos
        â”‚   â”œâ”€â”€ CategorÃ­as
        â”‚   â”œâ”€â”€ Familias
        â”‚   â”œâ”€â”€ Modificadores
        â”‚   â””â”€â”€ Escandallos
        â”‚
        â”œâ”€â”€ Inventario y compras
        â”‚   â”œâ”€â”€ Stock
        â”‚   â”œâ”€â”€ Movimientos
        â”‚   â”œâ”€â”€ Compras
        â”‚   â”œâ”€â”€ Recepciones
        â”‚   â”œâ”€â”€ Facturas
        â”‚   â””â”€â”€ Proveedores
        â”‚
        â”œâ”€â”€ GestiÃ³n
        â”‚   â”œâ”€â”€ ConfiguraciÃ³n
        â”‚   â”œâ”€â”€ Empresa
        â”‚   â”œâ”€â”€ Espacios y mesas
        â”‚   â”œâ”€â”€ Estaciones
        â”‚   â”œâ”€â”€ Impresoras
        â”‚   â””â”€â”€ Usuarios
        â”‚
        â””â”€â”€ Inteligencia
            â”œâ”€â”€ AnÃ¡lisis
            â”œâ”€â”€ Ventas
            â”œâ”€â”€ MÃ©tricas
            â””â”€â”€ Reportes
```

## 2.2 Dashboard

El Dashboard es la puerta de entrada y superficie de orientaciÃ³n. Agrega indicadores, alertas y accesos, pero no debe convertirse en una segunda implementaciÃ³n de la lÃ³gica de cada mÃ³dulo.

Actualmente combina fuentes centrales y almacenamiento local de compatibilidad. Su evoluciÃ³n debe dirigirse hacia modelos de lectura agregados, sin duplicar reglas de negocio.

## 2.3 ConfiguraciÃ³n

ConfiguraciÃ³n contiene las decisiones estructurales del restaurante:

- perfil de empresa;
- carta y catÃ¡logo;
- espacios, planos y mesas;
- estaciones operativas;
- impresiÃ³n;
- usuarios e integraciones.

Los cambios de ConfiguraciÃ³n pueden afectar directamente al runtime. Por ello deben tratarse como configuraciÃ³n operativa, no como formularios aislados.

## 2.4 Empresa

Empresa representa el perfil raÃ­z del restaurante. Su identidad se relaciona con:

- `AuthContext`;
- documento `restaurants/{restaurantId}`;
- nombre y logo mostrados;
- onboarding;
- copias de nombre almacenadas en perfiles de usuario.

El documento del restaurante debe ser la fuente canÃ³nica de su identidad.

## 2.5 TPV

El TPV coordina mesas, catÃ¡logo, pedido, comanda, pago e impresiÃ³n. Es el runtime con mayor concentraciÃ³n de estado y mayor impacto econÃ³mico.

El mismo contenido principal se utiliza desde la ruta Carta y desde OperaciÃ³n â†’ TPV. Esta reutilizaciÃ³n es correcta, pero el componente central mantiene demasiadas responsabilidades.

## 2.6 KDS

KDS transforma pedidos y lÃ­neas en trabajo operativo para:

- Cocina;
- Barra;
- CoctelerÃ­a;
- Sala.

Cocina, Barra y CoctelerÃ­a reutilizan `OrderItemsBoard` con filtros y acciones distintas. Sala mantiene una vista especializada.

## 2.7 Productos y Carta

Productos es el catÃ¡logo central. Carta aÃ±ade organizaciÃ³n comercial y operativa:

- categorÃ­as;
- familias;
- disponibilidad;
- orden;
- destino operativo;
- modificadores;
- pases;
- relaciÃ³n con escandallos e inventario.

La compatibilidad con catÃ¡logos antiguos sigue activa y debe considerarse transicional.

## 2.8 Inventario, Compras y Recepciones

Inventario mantiene la existencia y configuraciÃ³n de stock. Compras registra intenciÃ³n y documentaciÃ³n. Recepciones confirma cantidades y costes reales y puede generar movimientos de stock.

La relaciÃ³n esperada es:

```text
Producto
  â”œâ”€â”€ configuraciÃ³n de inventario
  â”œâ”€â”€ receta / escandallo
  â””â”€â”€ movimientos
          â–²
          â”œâ”€â”€ recepciÃ³n de compra
          â”œâ”€â”€ consumo de receta
          â”œâ”€â”€ consumo de modificador
          â”œâ”€â”€ ajuste
          â””â”€â”€ reversiÃ³n
```

## 2.9 Escandallos

Los escandallos conectan venta e inventario. Definen composiciÃ³n, coste teÃ³rico, margen y consumo esperado.

No deben mezclarse los cÃ¡lculos visuales de rentabilidad con la aplicaciÃ³n transaccional de movimientos.

## 2.10 Reservas

Reservas relaciona fecha, hora, comensales, estado y mesa. Comparte informaciÃ³n espacial con planos y ocupaciÃ³n de pedidos.

La selecciÃ³n de mesa reutiliza el mapa, pero el dominio de reservas debe seguir siendo propietario de las reglas de disponibilidad.

## 2.11 AnÃ¡lisis

AnÃ¡lisis consume pedidos, pagos y reservas para crear vistas derivadas. Debe ser de lectura y nunca convertirse en fuente de verdad operacional.

Los cÃ¡lculos deben residir en selectores o funciones de dominio, no dentro de componentes grÃ¡ficos.

## 2.12 Usuarios

Usuarios define pertenencia, rol y capacidades. Es una frontera de seguridad.

La UI puede representar permisos, pero solo Auth, procesos administrativos confiables y Firestore Rules pueden hacerlos efectivos.

---

# 3. Arquitectura por capas

## 3.1 Modelo objetivo

```text
Route
  â†“
Shell
  â†“
Feature Controller / Provider
  â†“
Presentational Components
  â†“
Feature Hooks
  â†“
Repositories / Services
  â†“
Firestore / Storage / APIs
```

No todos los mÃ³dulos actuales cumplen todavÃ­a esta separaciÃ³n. El modelo define la direcciÃ³n, no el estado completo del repositorio.

## 3.2 Route

Responsabilidades:

- declarar la entrada de navegaciÃ³n;
- montar providers especÃ­ficos;
- obtener parÃ¡metros de ruta;
- aplicar guards de alto nivel;
- elegir shell y feature principal.

No debe:

- contener lÃ³gica de negocio extensa;
- construir mÃºltiples queries;
- gestionar transacciones;
- duplicar un runtime existente.

## 3.3 Shell

Responsabilidades:

- viewport;
- estructura de cabecera y contenido;
- navegaciÃ³n comÃºn;
- slots;
- lÃ­mites de scroll;
- contexto visual y operativo.

Ejemplos conceptuales:

- shell general de mÃ³dulo;
- shell de ConfiguraciÃ³n;
- shell de OperaciÃ³n;
- shell de editor espacial.

No debe interpretar documentos Firestore.

## 3.4 Feature Controller o Provider

Es el propietario del estado coordinado de una feature.

Responsabilidades:

- ensamblar repositorios y hooks;
- mantener la mÃ¡quina de estados del flujo;
- traducir acciones de UI a comandos;
- exponer un modelo estable a los componentes;
- resolver loading, error y permisos.

No debe contener grandes bloques de presentaciÃ³n.

## 3.5 Presentational Components

Responsabilidades:

- representar datos;
- emitir intenciones mediante callbacks;
- aplicar Design System;
- accesibilidad y UX tÃ¡ctil.

No deben:

- conocer rutas Firestore;
- decidir permisos reales;
- generar IDs transaccionales;
- aplicar movimientos econÃ³micos.

## 3.6 Hooks

Existen tres familias recomendadas:

### Hooks de lectura

Conectan una feature con un repositorio y modelan loading/error/data.

### Hooks de estado de interacciÃ³n

Gestionan selecciÃ³n, filtros, modales, gestos o preferencias.

### Hooks de dominio coordinado

Orquestan un flujo delimitado, como pago o ediciÃ³n de inventario.

Un hook no debe ser Ãºnicamente un archivo grande trasladado. Debe tener una responsabilidad, entradas y salidas claras.

## 3.7 Repositories y Services

### Repository

Encapsula persistencia:

- rutas;
- queries;
- mapeo de documentos;
- listeners;
- paginaciÃ³n.

### Domain Service

Encapsula reglas:

- cÃ¡lculos;
- validaciÃ³n;
- idempotencia;
- composiciÃ³n de comandos;
- transformaciÃ³n independiente de UI.

Los servicios de dominio no deben importar componentes ni barrels visuales.

## 3.8 Firestore

Firestore es la persistencia y canal en tiempo real. No sustituye al dominio.

Toda operaciÃ³n debe definir:

- tenant;
- colecciÃ³n;
- alcance;
- autorizaciÃ³n;
- estrategia de error;
- coste esperado;
- consistencia e idempotencia.

---

# 4. Runtime TPV

## 4.1 PropÃ³sito

El TPV coordina la sesiÃ³n de servicio de una mesa desde su selecciÃ³n hasta el cierre econÃ³mico.

Su componente central actual es:

`app/dashboard/carta/carta-page-content.tsx`

TambiÃ©n se monta desde:

- `/dashboard/carta`;
- `/dashboard/operacion/tpv`.

## 4.2 Flujo general

```text
Operador activo
  â†“
Mapa / selecciÃ³n de mesa
  â†“
Carga o creaciÃ³n de pedido abierto
  â†“
CatÃ¡logo y composiciÃ³n de lÃ­neas
  â†“
EnvÃ­o de comanda
  â†“
ProducciÃ³n KDS
  â†“
Servicio
  â†“
Solicitud de cuenta
  â†“
Pago total o dividido
  â†“
ImpresiÃ³n / factura
  â†“
Cierre y liberaciÃ³n de mesa
```

## 4.3 Mesa

La mesa aporta:

- identidad;
- zona y plano;
- estado de ocupaciÃ³n;
- operador asignado;
- nÃºmero de comensales;
- grupo de mesas;
- pedido activo;
- seÃ±ales de reserva;
- solicitud de cuenta;
- disponibilidad de cierre.

El runtime actual utiliza el modelo nuevo `tables/tableId`. La coexistencia con `mesas/mesaId` pertenece a rutas legacy y no debe extenderse.

## 4.4 Pedido

`orders` representa la cuenta y sesiÃ³n operativa de una mesa.

Puede incluir:

- `restaurantId`;
- mesa;
- estado;
- lÃ­neas embebidas;
- tiempos;
- operador;
- notas;
- solicitud de cuenta;
- datos de total y pago.

El TPV mantiene una representaciÃ³n local para interacciÃ³n rÃ¡pida y sincroniza con el documento persistido.

Invariantes:

- un pedido pertenece a un Ãºnico restaurante;
- un pedido no debe cambiar de tenant;
- los estados terminales no deben reaparecer como activos;
- la hidrataciÃ³n no debe duplicar lÃ­neas;
- los merges de mesas deben conservar trazabilidad.

## 4.5 LÃ­neas

Las lÃ­neas representan productos, cantidades, extras, modificadores, notas, destino y estado productivo.

Conviven dos representaciones:

- lÃ­neas embebidas en `orders.items[]`;
- documentos operativos en `orderItems`.

Esta dualidad es una compatibilidad activa. No debe eliminarse ni ampliarse sin una misiÃ³n de modelo de pedidos.

## 4.6 Pagos

Los pagos se registran en `payments`. El TPV soporta:

- efectivo;
- tarjeta;
- vales;
- descuentos;
- pago dividido;
- pago por productos;
- factura;
- impresiÃ³n final.

Las cantidades monetarias deben normalizarse y redondearse mediante utilidades comunes.

Invariantes:

- ningÃºn pago debe atribuirse a otro restaurante;
- no debe duplicarse por reintento;
- total pagado y total de cuenta deben reconciliarse;
- cancelaciones y devoluciones requieren capacidades superiores;
- la mesa no se libera antes de completar el cierre vÃ¡lido.

## 4.7 Presencia

La presencia evita que varios operadores actÃºen sobre la misma mesa sin contexto.

Incluye:

- operador activo;
- heartbeat;
- asignaciÃ³n de mesa;
- indicadores visuales;
- sesiones activas.

La presencia es una ayuda de coordinaciÃ³n, no un sustituto de transacciones o reglas de seguridad.

## 4.8 Reservas

El TPV escucha las reservas del dÃ­a para:

- mostrar presiÃ³n de reserva;
- identificar la prÃ³xima ocupaciÃ³n;
- priorizar visualmente mesas;
- evitar decisiones operativas ciegas.

La informaciÃ³n de reserva complementa la ocupaciÃ³n; no debe reemplazar el estado real del pedido.

## 4.9 Listeners

El TPV escucha, directa o indirectamente:

- reservas del dÃ­a;
- mesas;
- zonas;
- planos;
- pedidos;
- pedido seleccionado;
- pagos;
- modificadores;
- estaciones;
- configuraciÃ³n de impresiÃ³n;
- presencia.

Reglas:

- cada listener necesita `restaurantId`;
- debe tener un alcance operativo;
- debe limpiarse al desmontar o cambiar de tenant;
- no debe duplicarse por rerenders;
- los listeners histÃ³ricos deben limitarse;
- los errores no deben confundirse con estados vacÃ­os.

## 4.10 Eventos

El TPV consume o emite eventos para:

- mesas listas para cerrar;
- limpieza de una mesa cerrada;
- merge de pedidos de grupos;
- cambios de stock.

Estos eventos son contratos globales y deben tratarse como APIs internas.

## 4.11 DirecciÃ³n futura

```text
TpvRoute
â””â”€â”€ TpvRuntimeProvider
    â”œâ”€â”€ TpvShell
    â”œâ”€â”€ TpvTableMap
    â”œâ”€â”€ TpvCatalog
    â”œâ”€â”€ TpvOrderPanel
    â”œâ”€â”€ TpvCourseFlow
    â”œâ”€â”€ TpvPaymentFlow
    â”œâ”€â”€ TpvPrintFlow
    â””â”€â”€ TpvDialogs
```

La divisiÃ³n se realizarÃ¡ de fuera hacia dentro: presentaciÃ³n, helpers, estado y, por Ãºltimo, persistencia.

---

# 5. Runtime KDS

## 5.1 PropÃ³sito

KDS traduce lÃ­neas vendidas en trabajo de producciÃ³n y servicio.

## 5.2 MÃ³dulos

### Cocina

Utiliza `KitchenView` y `OrderItemsBoard`. AÃ±ade:

- filtro de estaciÃ³n;
- mÃ©tricas;
- rail de tickets;
- panel de preparados;
- archivo de servidos;
- agrupaciÃ³n por pase.

### Barra

Reutiliza `OrderItemsBoard` filtrando bebidas y estaciones de barra.

### CoctelerÃ­a

Reutiliza el mismo tablero con el scope de coctelerÃ­a.

### Sala

Presenta lÃ­neas preparadas agrupadas por mesa y permite completar el servicio. TambiÃ©n calcula quÃ© mesas estÃ¡n listas para cerrar.

## 5.3 Pedidos y lÃ­neas

El KDS actual obtiene pedidos de `orders` y transforma sus lÃ­neas embebidas en un modelo de tablero.

Las rutas legacy pueden escuchar `orderItems` directamente. Esta convivencia no debe tomarse como patrÃ³n para nuevas pantallas.

## 5.4 Estados

Estados operativos conceptuales:

```text
pendiente local
  â†“
sent
  â†“
waiting_march (si requiere pase)
  â†“
prepared / ready
  â†“
served
```

Los estados terminales del pedido incluyen variantes como:

- `closed`;
- `paid`;
- `cancelled`;
- `canceled`;
- `merged`.

Toda clasificaciÃ³n debe centralizarse gradualmente para evitar diferencias entre TPV, Cocina y Sala.

## 5.5 Flujo

```text
TPV crea o actualiza pedido
  â†“
TPV envÃ­a lÃ­neas
  â†“
KDS clasifica por destino y estaciÃ³n
  â†“
ProducciÃ³n prepara
  â†“
Sala recibe lÃ­neas listas
  â†“
Sala sirve
  â†“
TPV puede cerrar cuando no quedan lÃ­neas pendientes
```

## 5.6 Riesgos

- Un Ãºnico tablero afecta Cocina, Barra y CoctelerÃ­a.
- Las mutaciones actualizan arrays embebidos.
- Existen normalizadores duplicados.
- Los listeners amplios crecen con el histÃ³rico.
- Los eventos globales ocultan dependencias.
- Cocina legacy mantiene otra implementaciÃ³n.

## 5.7 DirecciÃ³n futura

```text
KdsModule
â”œâ”€â”€ useKdsOrders
â”œâ”€â”€ useKdsBoardModel
â”œâ”€â”€ useKdsActions
â”œâ”€â”€ KdsTicketRail
â”œâ”€â”€ KdsColumn
â”œâ”€â”€ KdsTicket
â””â”€â”€ KdsLine
```

La normalizaciÃ³n pura debe separarse antes que las acciones Firestore.

---

# 6. Inventario

## 6.1 Modelo conceptual

```text
Producto
â”œâ”€â”€ datos comerciales
â”œâ”€â”€ configuraciÃ³n de inventario
â”œâ”€â”€ receta
â””â”€â”€ movimientos de stock
```

## 6.2 Productos

El producto central vive bajo el restaurante y puede contener:

- disponibilidad comercial;
- familia y categorÃ­a;
- destino operativo;
- configuraciÃ³n de inventario;
- receta;
- imagen;
- modificadores.

El mÃ³dulo de Productos actÃºa como punto de ediciÃ³n principal, mientras Inventario presenta una vista especializada.

## 6.3 Recetas y escandallos

Una receta conecta el producto vendido con ingredientes o productos inventariables.

El escandallo calcula:

- coste teÃ³rico;
- margen;
- composiciÃ³n;
- estado de completitud.

La aplicaciÃ³n real del consumo pertenece al ledger de movimientos, no a la UI del escandallo.

## 6.4 Movimientos

`stockMovements` es el ledger central.

OrÃ­genes:

- consumo de receta;
- consumo de modificador;
- recepciÃ³n de compra;
- ajuste;
- reversiÃ³n.

Propiedades arquitectÃ³nicas:

- IDs deterministas cuando sea posible;
- idempotencia;
- trazabilidad de origen;
- compatibilidad de unidades;
- stock anterior y posterior verificables;
- reversiÃ³n explÃ­cita, nunca borrado silencioso.

## 6.5 Recepciones

Una recepciÃ³n:

1. parte de una compra o documento;
2. confirma cantidades y costes;
3. concilia proveedor y producto;
4. registra incidencias;
5. aplica movimientos;
6. deja trazabilidad.

La UI puede preparar borradores, pero la aplicaciÃ³n de stock debe ser transaccional.

## 6.6 Stock

El stock actual es una proyecciÃ³n derivada de movimientos aplicados.

No debe actualizarse sin registrar el origen correspondiente. Los fallos no deben sustituirse silenciosamente por datos mock en contextos operativos.

## 6.7 Consumos y reversiones

El consumo debe asociarse a una lÃ­nea o acciÃ³n concreta. Si una lÃ­nea se cancela, la reversiÃ³n debe:

- identificar el consumo original;
- evitar duplicados;
- conservar la auditorÃ­a;
- respetar unidades;
- pertenecer al mismo tenant.

---

# 7. Firestore

## 7.1 Principio multi-tenant

`restaurantId` delimita el acceso lÃ³gico a los datos.

Patrones actuales:

```text
ColecciÃ³n top-level + restaurantId
orders/{orderId}
payments/{paymentId}
tables/{tableId}
reservations/{reservationId}

SubcolecciÃ³n bajo restaurante
restaurants/{restaurantId}/products/{productId}
restaurants/{restaurantId}/stockMovements/{movementId}
```

Ambos patrones son vÃ¡lidos si las reglas y queries verifican tenant de forma explÃ­cita.

## 7.2 Colecciones y subcolecciones principales

### Identidad

- `users`
- `usuarios` â€” espejo legacy
- `restaurant_invites`

### Restaurante

- `restaurants`
- `restaurantes` â€” raÃ­z legacy utilizada todavÃ­a por partes de Carta

### OperaciÃ³n

- `orders`
- `orderItems`
- `payments`
- `vouchers`
- `tables`
- `mesas` â€” modelo legacy
- `zones`
- `floorPlans`
- `reservations`

### CatÃ¡logo

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

### ConfiguraciÃ³n y soporte operativo

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

`restaurants` es la raÃ­z canÃ³nica para perfil, catÃ¡logo central, inventario y configuraciÃ³n moderna.

`restaurantes` sigue siendo utilizada por APIs y colecciones legacy de Carta.

No se debe:

- aÃ±adir nuevos dominios bajo `restaurantes`;
- borrar la raÃ­z legacy sin migraciÃ³n;
- asumir que ambas raÃ­ces contienen exactamente los mismos datos.

## 7.5 Pedidos

`orders` contiene el pedido y lÃ­neas embebidas utilizadas por TPV y KDS moderno.

Debe consultarse siempre con tenant y un alcance operativo. Los listeners de todo el histÃ³rico son una deuda de coste y escalabilidad.

## 7.6 OrderItems

`orderItems` mantiene lÃ­neas operativas independientes para compatibilidad y rutas legacy.

No debe declararse obsoleta hasta completar la auditorÃ­a de consumidores.

## 7.7 Payments

`payments` contiene cobros y operaciones relacionadas.

Requiere:

- tenant;
- capacidad de cobro;
- capacidad superior para devoluciÃ³n;
- inmutabilidad del tenant;
- reconciliaciÃ³n con pedido.

## 7.8 Ãndices y queries

Toda query compuesta debe tener su Ã­ndice documentado.

Un fallback por Ã­ndice ausente puede preservar funcionalidad, pero suele:

- leer mÃ¡s documentos;
- ordenar en cliente;
- ocultar degradaciÃ³n;
- aumentar coste.

Los fallbacks deben ser observables y temporales.

## 7.9 Rules

Firestore Rules constituyen la barrera real.

Las reglas deben validar:

- autenticaciÃ³n;
- tenant actual;
- tenant inmutable;
- capability;
- campos que pueden cambiar;
- operaciones especiales como cobros, devoluciones y cancelaciones.

La protecciÃ³n de una ruta React nunca sustituye a Rules.

---

# 8. Eventos globales

Los eventos globales existentes son APIs internas. Deben conservar nombre y payload hasta que una misiÃ³n especÃ­fica los sustituya.

| Evento | Emisor principal | Receptor principal | Objetivo | Riesgo |
|---|---|---|---|---|
| `tablesReadyToClose:update` | Sala/KDS | Wrappers de Carta y TPV | Publicar mesas sin lÃ­neas operativas pendientes | Payload no tipado y dependencia invisible |
| `tablesReadyToClose:clear` | TPV al cerrar o limpiar mesa | Wrappers de Carta y TPV | Retirar una mesa del conjunto de cierre | Puede dejar estado visual obsoleto si no se procesa |
| `kds:station-status` | `OrderItemsBoard` y Sala | Indicadores de OperaciÃ³n | Informar actividad y estado de estaciones | Varios emisores pueden divergir |
| Evento de merge de pedidos de grupo | Servicio de merge de mesas | TPV | Invalidar o rehidratar pedidos tras unir mesas | Contrato sensible a IDs y orden temporal |
| `STOCK_CHANGED_EVENT` | Recepciones y flujos de stock | Dashboard y consumidores locales | Refrescar proyecciones locales de stock | Bus global sin confirmaciÃ³n de persistencia |
| `PLATOS_CHANGED_EVENT` | Persistencia legacy de platos | Productos y paneles legacy | Sincronizar catÃ¡logo local antiguo | Mantiene acoplamiento con `localStorage` |
| `CARTA_CATEGORIAS_CHANGED_EVENT` | Store local de categorÃ­as | Productos | Refrescar jerarquÃ­a de Carta | Compatibilidad local, no fuente canÃ³nica |

## Reglas para eventos

- Definir propietario.
- Documentar payload.
- No reutilizar el mismo nombre con otra forma.
- Limpiar listeners al desmontar.
- No utilizar eventos globales para nuevos flujos si props, contexto o repositorio resuelven la relaciÃ³n.
- No sustituir un evento existente durante una modularizaciÃ³n visual.

---

# 9. Dependencias delicadas

## 9.1 `EditableFloorMap`

Consumidores:

- configuraciÃ³n de mesas;
- TPV;
- selector de mesa de Reservas.

Riesgos:

- contrato de props extenso;
- coordenadas y transformaciones;
- gestos tÃ¡ctiles;
- controles imperativos;
- selecciÃ³n y ediciÃ³n;
- diferencias entre modo operativo y modo editor.

No cambiar simultÃ¡neamente API, coordenadas y gestos.

## 9.2 `OrderItemsBoard`

Consumidores:

- Cocina;
- Barra;
- CoctelerÃ­a.

Riesgos:

- listener compartido;
- normalizaciÃ³n de pedido;
- mutaciÃ³n de arrays embebidos;
- agrupaciÃ³n por pase;
- prioridades y SLA;
- acciones distintas segÃºn estaciÃ³n.

Toda modificaciÃ³n requiere validar los tres mÃ³dulos.

## 9.3 Productos

Productos conecta:

- Carta;
- categorÃ­as;
- familias;
- estaciones;
- modificadores;
- recetas;
- inventario;
- imÃ¡genes;
- migraciÃ³n legacy.

Un cambio en tipos o mappers puede afectar TPV, KDS e inventario.

## 9.4 TPV

Es la dependencia mÃ¡s delicada por impacto econÃ³mico y operativo. Combina datos, tiempo real, navegaciÃ³n, interacciÃ³n y persistencia.

## 9.5 Stock

El ledger y el stock actual deben mantenerse reconciliados. Un error puede permanecer oculto hasta inventario fÃ­sico o cierre econÃ³mico.

## 9.6 AuthContext y scope del restaurante

Muchos mÃ³dulos dependen de:

- usuario;
- `restaurantId`;
- rol;
- estado `ready`.

NingÃºn listener debe iniciarse antes de que auth y tenant estÃ©n resueltos.

## 9.7 Ciclos de imports conocidos

Ãreas con ciclos detectados:

- builders y barrel de AnÃ¡lisis;
- productos, escritura central, ordenaciÃ³n y estaciÃ³n operativa;
- configuraciÃ³n operacional de categorÃ­as;
- utilidades visuales de escandallos;
- tipos de snapshots de AnÃ¡lisis;
- curso y liberaciÃ³n de lÃ­neas de comanda.

Los barrels internos son una causa relevante. Dentro de una feature deben preferirse imports directos.

---

# 10. Componentes gigantes

## 10.1 TPV â€” `carta-page-content.tsx`

**Responsabilidad actual:** runtime completo de sala, pedido y cobro.
**Riesgo:** mÃ¡ximo.
**No tocar todavÃ­a:** ownership del pedido, orden de efectos, pagos, persistencia y listeners.
**DivisiÃ³n futura:** shell, mapa, catÃ¡logo, comanda, pases, pagos, impresiÃ³n y diÃ¡logos.
**Orden:** helpers puros â†’ presentaciÃ³n â†’ controladores locales â†’ estado â†’ repositories.

## 10.2 ConfiguraciÃ³n de mesas â€” `config/mesas/page.tsx`

**Responsabilidad actual:** editor grÃ¡fico y persistencia de planos.
**Riesgo:** geometrÃ­a, historial y batch de guardado.
**No tocar todavÃ­a:** sistema de coordenadas, undo/redo y transacciÃ³n de guardado.
**DivisiÃ³n futura:** toolbar, rail, canvas, selecciÃ³n, inspectores, historial y persistencia.
**Orden:** chrome visual â†’ inspectores â†’ hooks de selecciÃ³n/historial â†’ persistencia.

## 10.3 Productos â€” `productos-management-page.tsx`

**Responsabilidad actual:** listado, ediciÃ³n, relaciones de catÃ¡logo y operaciones masivas.
**Riesgo:** sincronizaciÃ³n central/legacy y formulario con muchas dependencias.
**No tocar todavÃ­a:** guardado, borrado, publicaciÃ³n y migraciÃ³n.
**DivisiÃ³n futura:** lista, filtros, bulk actions, editor por secciones y flujos de borrado.
**Orden:** secciones visuales â†’ helpers del draft â†’ controlador de formulario â†’ repository.

## 10.4 KDS â€” `order-items-board.tsx`

**Responsabilidad actual:** snapshot, modelo, acciones y presentaciÃ³n del tablero.
**Riesgo:** afecta tres estaciones y muta pedidos activos.
**No tocar todavÃ­a:** acciones Firestore y transiciÃ³n de estados.
**DivisiÃ³n futura:** normalizador, board model, actions, columnas, tickets y lÃ­neas.
**Orden:** normalizaciÃ³n pura â†’ presentaciÃ³n â†’ acciones.

## 10.5 Recepciones â€” `recepciones/page.tsx`

**Responsabilidad actual:** listado, conciliaciÃ³n, drawer y aplicaciÃ³n de stock.
**Riesgo:** mezcla persistencia local y central.
**No tocar todavÃ­a:** aplicaciÃ³n de stock y validaciÃ³n final.
**DivisiÃ³n futura:** resumen, filtros, lista, drawer y workflow.
**Orden:** bloques del drawer â†’ lista â†’ hook de workflow.

## 10.6 Mapa â€” `EditableFloorMap.tsx`

**Responsabilidad actual:** motor espacial reutilizable.
**Riesgo:** contrato pÃºblico y matemÃ¡ticas de viewport.
**No tocar todavÃ­a:** transformaciones y API completa.
**DivisiÃ³n futura:** viewport, capas, gestos, selecciÃ³n y coordenadas.
**Orden:** funciones puras â†’ capas visuales â†’ hooks de interacciÃ³n.

## 10.7 Movimientos â€” `stock-movements.ts`

**Responsabilidad actual:** ledger, consumos, reversiones, recepciones y consultas.
**Riesgo:** consistencia econÃ³mica e idempotencia.
**No tocar todavÃ­a:** IDs, transacciones y reversiones.
**DivisiÃ³n futura:** IDs, unidades, consumos, recepciones, reversiones, aplicaciÃ³n y queries.
**Orden:** tipos/helpers â†’ queries â†’ comandos, siempre con pruebas.

## 10.8 Productos Firestore â€” `products.ts`

**Responsabilidad actual:** legacy, catÃ¡logo central, inventario, recetas y listeners.
**Riesgo:** ciclo de imports y consumidores numerosos.
**No tocar todavÃ­a:** contratos exportados y fallbacks.
**DivisiÃ³n futura:** tipos, mappers, repositorios legacy/central/inventario y listeners.
**Orden:** tipos â†’ mappers â†’ adapters compatibles â†’ repositorios.

## 10.9 Inventario â€” `inventario-stock-section.tsx`

**Responsabilidad actual:** lista, filtros, drafts, inspector y movimientos.
**Riesgo:** cambios sin guardar y fallback mock.
**No tocar todavÃ­a:** guardado y reconciliaciÃ³n de movimientos.
**DivisiÃ³n futura:** filtros, lista, inspector, editor y movimientos.
**Orden:** presentaciÃ³n â†’ estado de draft â†’ datos.

## 10.10 Cocina legacy â€” `dashboard/cocina/page.tsx`

**Responsabilidad actual:** runtime KDS independiente.
**Riesgo:** no estÃ¡ claro si es compatibilidad o ruta productiva.
**No tocar todavÃ­a:** cualquier modularizaciÃ³n extensa.
**DivisiÃ³n futura:** solo si se confirma su continuidad.
**Orden:** medir uso â†’ comparar funcionalidad â†’ conservar o retirar.

---

# 11. ModularizaciÃ³n futura

## Fase 0 â€” CaracterizaciÃ³n

- Inventariar flujos.
- Documentar invariantes.
- Identificar propietarios de estado.
- Capturar queries, eventos y efectos.
- Crear pruebas de humo y caracterizaciÃ³n.

## Fase 1 â€” Dependencias y ciclos

- Evitar barrels internos.
- Extraer tipos sin dependencias.
- Romper ciclos pequeÃ±os.
- Documentar eventos globales.

## Fase 2 â€” PresentaciÃ³n

- Extraer secciones puramente visuales.
- Mantener estado y callbacks en el padre.
- No cambiar Firestore.
- No cambiar modelos.

## Fase 3 â€” Helpers puros

- Formateo.
- NormalizaciÃ³n.
- CÃ¡lculos.
- ClasificaciÃ³n.
- Transformaciones deterministas.

Todos deben ser probables mediante entradas y salidas.

## Fase 4 â€” Estado de interacciÃ³n

- SelecciÃ³n.
- Filtros.
- Modales.
- Historial visual.
- Preferencias.

No mover todavÃ­a la persistencia.

## Fase 5 â€” Controladores de feature

- Definir ownership.
- Agrupar comandos.
- Exponer modelos estables.
- Reducir prop drilling cuando exista evidencia.

## Fase 6 â€” Repositories

- Encapsular rutas y queries.
- Separar listeners y comandos.
- Mantener adapters compatibles.
- AÃ±adir observabilidad.

## Fase 7 â€” OptimizaciÃ³n Firestore

- Acotar listeners.
- Revisar Ã­ndices.
- Paginar histÃ³ricos.
- Verificar costes.

Esta fase debe ser independiente de la modularizaciÃ³n visual.

## Fase 8 â€” Retirada legacy

- Medir uso.
- Migrar datos.
- Mantener compatibilidad temporal.
- Retirar lectores.
- Retirar escritores.
- Eliminar rutas Ãºnicamente al final.

---

# 12. Reglas permanentes

1. Nunca dividir estado antes de caracterizar el flujo.
2. Nunca mover Firestore junto con UI en la misma misiÃ³n.
3. Nunca reescribir TPV como parte de una limpieza.
4. Nunca cambiar listeners durante modularizaciÃ³n visual.
5. Primero presentaciÃ³n.
6. DespuÃ©s helpers puros.
7. DespuÃ©s estado.
8. DespuÃ©s persistencia.
9. Nunca confiar en UI para autorizaciÃ³n.
10. Toda operaciÃ³n debe conservar `restaurantId`.
11. El tenant no puede cambiar durante un update.
12. Los procesos de stock y pago deben ser idempotentes.
13. Los errores de lectura no equivalen a â€œsin datosâ€.
14. Todo fallback legacy debe estar documentado.
15. No crear nuevas dependencias sobre modelos legacy.
16. Los barrels no deben utilizarse dentro de su propia feature.
17. Todo evento global es un contrato.
18. Todo listener debe tener cleanup y alcance.
19. Una extracciÃ³n debe mantener el mismo comportamiento observable.
20. Una misiÃ³n debe tener una Ãºnica dimensiÃ³n principal de cambio.

---

# 13. Checklist antes de cualquier refactor

## Alcance

- [ ] Â¿EstÃ¡ definido el comportamiento que debe permanecer idÃ©ntico?
- [ ] Â¿Se conoce el propietario actual del estado?
- [ ] Â¿Se han identificado todos los consumidores?
- [ ] Â¿Se han identificado rutas legacy relacionadas?
- [ ] Â¿El cambio se limita a una responsabilidad?

## Datos y seguridad

- [ ] Â¿Se conserva `restaurantId`?
- [ ] Â¿Se mantienen roles y capabilities?
- [ ] Â¿No cambian Rules, modelos o queries accidentalmente?
- [ ] Â¿No se convierte un error en estado vacÃ­o?

## React

- [ ] Â¿Se conserva el orden de efectos relevante?
- [ ] Â¿Se mantienen dependencias de callbacks y memos?
- [ ] Â¿No se duplican providers?
- [ ] Â¿No se crean dos fuentes de verdad?
- [ ] Â¿Los listeners se limpian?

## Compatibilidad

- [ ] Â¿Los exports pÃºblicos permanecen compatibles?
- [ ] Â¿Los eventos mantienen nombre y payload?
- [ ] Â¿Los deep links siguen funcionando?
- [ ] Â¿Responsive y UX tÃ¡ctil siguen equivalentes?

## ValidaciÃ³n

- [ ] TypeScript.
- [ ] Build.
- [ ] `git diff --check`.
- [ ] Pruebas de caracterizaciÃ³n.
- [ ] Smoke test de rutas afectadas.
- [ ] RevisiÃ³n humana proporcional al riesgo.

---

# 14. Checklist antes de tocar TPV

- [ ] Probar apertura de mesa.
- [ ] Probar mesa con pedido existente.
- [ ] Probar grupo de mesas.
- [ ] AÃ±adir producto simple.
- [ ] AÃ±adir producto con modificadores.
- [ ] Editar cantidad y nota.
- [ ] Enviar comanda.
- [ ] Marchar primeros, segundos y postres.
- [ ] Cancelar lÃ­nea pendiente.
- [ ] Cancelar lÃ­nea enviada con permisos vÃ¡lidos.
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
- [ ] Confirmar que no se duplican pagos ni lÃ­neas.
- [ ] Confirmar recuperaciÃ³n tras recarga.
- [ ] Confirmar comportamiento offline/inestable.
- [ ] Validar presencia de operador.
- [ ] Validar reservas y presiÃ³n de mesa.
- [ ] Validar mÃ³vil y tablet.
- [ ] No cambiar queries y UI en la misma misiÃ³n.

---

# 15. Checklist antes de tocar Firestore

- [ ] Identificar colecciÃ³n y ruta exacta.
- [ ] Confirmar si es canÃ³nica o legacy.
- [ ] Identificar todos los lectores.
- [ ] Identificar todos los escritores.
- [ ] Confirmar `restaurantId`.
- [ ] Confirmar tenant inmutable.
- [ ] Confirmar rol/capability.
- [ ] Revisar Rules locales y desplegadas.
- [ ] Determinar Ã­ndice necesario.
- [ ] Estimar documentos leÃ­dos y frecuencia.
- [ ] Definir lÃ­mite, fecha o estado del listener.
- [ ] Definir comportamiento ante error.
- [ ] Verificar cleanup.
- [ ] Verificar idempotencia.
- [ ] Verificar transacciÃ³n o batch cuando corresponda.
- [ ] Revisar compatibilidad `restaurants/restaurantes`.
- [ ] Revisar compatibilidad `users/usuarios`.
- [ ] Revisar compatibilidad `tables/mesas`.
- [ ] Revisar `orders.items[]/orderItems`.
- [ ] Probar con al menos dos tenants.
- [ ] Probar roles distintos.
- [ ] No desplegar Rules sin emulador y revisiÃ³n humana.

---

# 16. Checklist antes de tocar Inventario

- [ ] Identificar producto e identidad central.
- [ ] Confirmar unidad de inventario.
- [ ] Confirmar unidad de compra.
- [ ] Verificar conversiones.
- [ ] Identificar movimiento origen.
- [ ] Confirmar ID idempotente.
- [ ] Verificar stock anterior y posterior.
- [ ] Probar recepciÃ³n parcial.
- [ ] Probar consumo de receta.
- [ ] Probar consumo de modificadores.
- [ ] Probar cancelaciÃ³n y reversiÃ³n.
- [ ] Probar reintento.
- [ ] Confirmar que no se duplica el movimiento.
- [ ] Confirmar mismo tenant en producto y movimiento.
- [ ] Revisar fallbacks legacy.
- [ ] No sustituir errores por mocks en producciÃ³n.
- [ ] Comparar ledger y stock actual.
- [ ] Revisar impacto en escandallos.
- [ ] Revisar timeline.
- [ ] RevisiÃ³n humana obligatoria si cambia una transacciÃ³n.

---

# 17. Checklist antes de tocar KDS

- [ ] Validar Cocina.
- [ ] Validar Barra.
- [ ] Validar CoctelerÃ­a.
- [ ] Validar Sala.
- [ ] Confirmar filtros por estaciÃ³n.
- [ ] Confirmar destino de cada lÃ­nea.
- [ ] Confirmar agrupaciÃ³n por mesa.
- [ ] Confirmar agrupaciÃ³n por pase.
- [ ] Confirmar urgencia y SLA.
- [ ] Probar `sent â†’ prepared`.
- [ ] Probar `prepared â†’ served`.
- [ ] Probar lÃ­neas `waiting_march`.
- [ ] Probar cantidades divididas.
- [ ] Probar extras y notas.
- [ ] Probar lÃ­neas canceladas.
- [ ] Confirmar que pedidos terminales no aparecen.
- [ ] Confirmar que el update conserva las demÃ¡s lÃ­neas.
- [ ] Confirmar mesas listas para cerrar.
- [ ] Confirmar eventos de estado de estaciÃ³n.
- [ ] Confirmar sonido y feedback.
- [ ] Confirmar cleanup del listener.
- [ ] Validar pantalla tÃ¡ctil.
- [ ] Comparar con rutas legacy si siguen activas.

---

# 18. PrÃ³ximas Ã©picas

## Prioridad 0 â€” Seguridad multi-tenant

Objetivo:

- proteger pertenencia y roles;
- endurecer capabilities;
- verificar Rules desplegadas;
- aÃ±adir pruebas multi-tenant.

No debe mezclarse con modularizaciÃ³n.

## Prioridad 1 â€” Red de seguridad TPV

Objetivo:

- mapa contractual;
- pruebas de caracterizaciÃ³n;
- smoke tests repetibles;
- inventario de eventos y listeners.

## Prioridad 2 â€” Coste y alcance de listeners

Objetivo:

- limitar pedidos y pagos histÃ³ricos;
- definir ventanas operativas;
- revisar Ã­ndices;
- medir lecturas.

## Prioridad 3 â€” ModularizaciÃ³n TPV, fase exterior

Objetivo:

- extraer presentaciÃ³n y helpers puros;
- mantener estado y persistencia intactos.

## Prioridad 4 â€” Editor de espacios

Objetivo:

- separar chrome e inspectores;
- caracterizar geometrÃ­a;
- mantener guardado transaccional.

## Prioridad 5 â€” Productos

Objetivo:

- dividir editor por dominios;
- estabilizar draft y mappers;
- conservar sincronizaciÃ³n y publicaciÃ³n.

## Prioridad 6 â€” KDS

Objetivo:

- centralizar normalizaciÃ³n;
- separar modelo derivado de presentaciÃ³n;
- mantener acciones Firestore.

## Prioridad 7 â€” Inventario y Recepciones

Objetivo:

- separar lista, inspector y drawer;
- probar ledger y reversiones;
- dividir repositories solo despuÃ©s.

## Prioridad 8 â€” Ciclos y lÃ­mites de dominio

Objetivo:

- romper ciclos conocidos;
- reducir barrels internos;
- aislar tipos y helpers puros.

## Prioridad 9 â€” ConsolidaciÃ³n legacy

Objetivo:

- auditar trÃ¡fico;
- definir canÃ³nicos;
- migrar progresivamente;
- retirar rutas y modelos Ãºnicamente con evidencia.

---

# ApÃ©ndice A â€” Orden seguro de trabajo

```text
Comprender
  â†“
Caracterizar
  â†“
Probar
  â†“
Extraer presentaciÃ³n
  â†“
Extraer helpers puros
  â†“
Definir ownership del estado
  â†“
Extraer controladores
  â†“
Separar repositories
  â†“
Optimizar Firestore
  â†“
Retirar legacy
```

# ApÃ©ndice B â€” Glosario

**Tenant:** restaurante o conjunto de restaurantes al que pertenece un dato.
**Scope:** alcance de una lectura, operaciÃ³n o vista.
**Runtime operativo:** pantalla que participa en servicio en tiempo real.
**KDS:** Kitchen Display System; sistema de producciÃ³n y salida.
**Repository:** capa que encapsula persistencia y queries.
**Domain service:** lÃ³gica de negocio independiente de UI.
**Feature controller:** propietario del estado coordinado de un mÃ³dulo.
**Listener:** suscripciÃ³n en tiempo real a Firestore.
**Ledger:** registro inmutable o trazable de movimientos.
**Idempotencia:** capacidad de repetir una operaciÃ³n sin duplicar su efecto.
**Legacy:** compatibilidad anterior todavÃ­a activa; no significa automÃ¡ticamente cÃ³digo muerto.
**CaracterizaciÃ³n:** pruebas y documentaciÃ³n que capturan el comportamiento actual antes de cambiar estructura.

# ApÃ©ndice C â€” Regla de decisiÃ³n

Ante cualquier duda:

1. preservar operaciÃ³n;
2. preservar tenant;
3. preservar dinero y stock;
4. preservar contratos;
5. reducir el alcance;
6. documentar la incertidumbre;
7. posponer el cambio antes que asumir.

Esta guÃ­a debe actualizarse cuando cambie un lÃ­mite arquitectÃ³nico, un modelo canÃ³nico, un evento global o una regla permanente. Los cambios puramente visuales o locales no requieren modificarla.
