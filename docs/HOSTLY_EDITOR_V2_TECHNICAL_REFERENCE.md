# Hostly Editor V2 Technical Reference

> Referencia tecnica oficial del Editor Sala V2.

**Estado:** oficial para arquitectura actual del Editor V2  
**Ambito:** `dashboard/configuracion/espacios/editor-v2`, documento local V2, canvas, fases, sistemas de interaccion, historial y borradores  
**Autoridad:** subordinado a `00_HOSTLY_PRODUCT_BIBLE.md`, `01_HOSTLY_ARCHITECTURE_GUIDE.md` y `09_HOSTLY_PATTERNS.md`  
**Ultima revision:** 2026-07-04  

---

## Proposito

Este documento describe el estado real del Editor Sala V2 en el codigo actual. Es la referencia para nuevas iteraciones del editor. No describe el Editor Legacy salvo cuando es necesario para explicar compatibilidad o limites de migracion.

El Editor V2 todavia no es la fuente operativa que consume TPV/Sala en produccion. El V2 trabaja sobre un documento de editor y borradores locales/persistidos de editor. La publicacion hacia los contratos legacy de `floorPlans`, `tables` y `zones` sigue pendiente.

---

## 1. Arquitectura General

El Editor V2 organiza la configuracion de un mapa operativo por fases visibles:

```text
Base
  |
  v
Terreno
  |
  v
Estructura
  |
  v
Operacion
```

Internamente existe tambien la fase `espacios`, etiquetada como `Mapas`, que permite crear y seleccionar el mapa/espacio activo. Las fases visibles de edicion del lienzo son `base`, `terreno`, `estructura` y `operacion`.

### 1.1 Mapas / Espacios

`SalaEspacio` es la unidad de trabajo del Editor V2. Representa un mapa operativo del restaurante, por ejemplo sala, terraza, zona VIP, piscina o barra.

Responsabilidades actuales:

- Crear espacios en memoria del documento V2.
- Seleccionar el espacio activo.
- Mantener `restaurantId`, `name`, `tipo`, `color`, `sortOrder`, `visible`, `active`.
- Mantener puentes opcionales de migracion `legacyFloorPlanId` y `legacyZoneId`.
- Contener `base`, que define dimensiones, escala, suelo y grid del mapa.

Limitaciones actuales:

- No publica cambios a `floorPlans`, `tables` ni `zones`.
- No sustituye el editor legacy en produccion.
- No implementa ordenacion avanzada ni migracion completa desde legacy como flujo de usuario final.

### 1.2 Base

La fase Base define la fundacion del mapa. Su modelo vive en `SalaEspacioBase`.

Responsabilidades actuales:

- Normalizar dimensiones del mapa.
- Definir unidad logica `metros`.
- Definir escala `pixelsPerUnit`.
- Definir orientacion en grados.
- Definir suelo base (`neutral`, `tile`, `wood`, `stone`, `grass`, `sand`, `water`).
- Definir grid (`visible`, `size`).
- Derivar estado de base: `pendiente`, `incompleta`, `lista`.
- Renderizar vista previa del mapa y sus capas de contexto.

Limitaciones actuales:

- No hay edicion visual completa de forma irregular.
- `shapeType` solo soporta `rectangular`.
- No hay herramientas de dibujo de contorno.
- No hay rotacion real del mapa aplicada al viewport.

### 1.3 Terreno

La fase Terreno gestiona superficies/materiales independientes dentro del mapa.

Responsabilidades actuales:

- Crear superficies mediante drag sobre el canvas.
- Seleccionar superficies.
- Mover superficies.
- Redimensionar superficies con cuatro handles.
- Aplicar grid snap.
- Aplicar Smart Snap en movimiento y resize.
- Mostrar guias de Smart Snap.
- Registrar historial de create/move/resize/delete.
- Normalizar superficies en documentos cargados.

Limitaciones actuales:

- No hay inspector de propiedades de superficies.
- No hay bloqueo funcional aunque el modelo incluye `locked`.
- No hay capas manuales ni z-order editable.
- No hay rotacion de superficies.
- No hay operaciones booleanas ni union de superficies.

### 1.4 Estructura

La fase Estructura contiene dos familias tecnicas distintas:

1. Elementos dependientes de muro.
2. Objetos estructurales libres, independientes del muro.

Responsabilidades actuales:

- Dibujar muros como segmentos locales.
- Colocar puertas y cristales como attachments anclados a muros.
- Crear columnas cuadradas, columnas circulares y separadores fijos como `SalaStructuralElement`.
- Seleccionar objetos estructurales libres.
- Mover y redimensionar objetos estructurales libres.
- Aplicar Smart Snap entre objetos estructurales libres.
- Eliminar seleccion mediante Context Action Bar.
- Registrar historial de muros, wall attachments y objetos estructurales libres.

Limitaciones actuales:

- Barras, jardineras, escenarios, decoracion y `separator` legacy siguen como herramientas no disponibles o placeholders.
- Columnas y separadores no tienen inspector.
- No hay rotacion, bloqueo funcional, capas ni propiedades avanzadas.
- Muros y attachments no usan Smart Snap.
- Puertas/cristales son dependientes de muro; no son `structuralElements` libres.

### 1.5 Operacion

La fase Operacion gestiona instancias operativas colocadas en el mapa.

Responsabilidades actuales:

- Seleccionar una herramienta operativa del catalogo.
- Colocar instancias sobre el canvas.
- Nombrar instancias automaticamente.
- Seleccionar instancias.
- Mover instancias.
- Redimensionar instancias con handles.
- Duplicar instancias.
- Eliminar instancias mediante Context Action Bar.
- Registrar historial de create/move/resize/delete/duplicate.
- Aplicar Smart Snap solo al movimiento de instancias `TABLE` contra otras `TABLE`.

Limitaciones actuales:

- Smart Snap no se aplica a resize operativo.
- Smart Snap no se aplica a tipos operativos distintos de `TABLE`.
- La persistencia hacia runtime TPV/Sala no esta implementada.
- No hay inspector operativo completo.
- No hay rotacion ni bloqueo funcional.

---

## 2. Canvas Unificado

El Editor V2 usa un canvas unificado por espacio activo. El componente orquestador es `SalaEditorWorkspaceCanvas`.

### 2.1 Orden de render

El orden visual del canvas es:

```text
Base
  |
  v
Terreno
  |
  v
Estructura
  |
  v
Operacion
```

La fase activa decide que capa es editable. Las demas capas se renderizan como contexto en modo lectura cuando procede.

### 2.2 Capas por fase

En fase Base:

- Base es la capa principal.
- Terreno se renderiza como contexto si existen superficies.
- Estructura se renderiza como contexto si existen muros, attachments u objetos estructurales.
- Operacion se renderiza como contexto si existen instancias operativas.
- Las capas de contexto son read-only.

En fase Terreno:

- Terreno es editable.
- Estructura se renderiza como contexto read-only.
- Operacion se renderiza como contexto read-only.
- Base se muestra como fondo del frame.

En fase Estructura:

- Estructura es editable.
- Terreno se renderiza como contexto read-only.
- Operacion se renderiza como contexto read-only.
- Base se muestra como fondo del frame.

En fase Operacion:

- Operacion es editable.
- Terreno se renderiza como contexto read-only.
- Estructura se renderiza como contexto read-only.
- Base se muestra como fondo del frame.

### 2.3 Componentes principales

- `SalaEditorWorkspaceCanvas`: decide que workspace renderizar por fase.
- `SalaEspacioCanvasFrame`: frame comun del mapa.
- `SalaBaseWorkspace`: workspace de Base.
- `SalaTerrenoWorkspace`: workspace editable de Terreno.
- `SalaEstructuraWorkspace`: workspace editable de Estructura.
- `SalaOperacionWorkspace`: workspace editable de Operacion.
- `SalaSurfaceObjectsLayer`: capa de superficies.
- `SalaWallCanvas`: capa de muros y attachments de muro.
- `SalaStructureObjectsLayer`: capa de columnas y separadores libres.
- `SalaOperationalInstancesLayer`: capa de instancias operativas.

### 2.4 Coordenadas

El editor usa coordenadas logicas de canvas. La escala visual se resuelve mediante:

- `coordinateScale`
- `displayPixelsPerUnit`
- `unscaleEditorPoint`
- `clientToStagePoint`
- `useCanvasViewport`

El viewport no debe duplicarse en cada sistema. Las capas convierten eventos de puntero a coordenadas logicas y delegan actualizaciones al estado del documento.

---

## 3. Surface System

### 3.1 Modelo

El modelo vive en `lib/sala-editor/surface/surface-object.ts`.

`SurfaceObject` contiene:

- `id`
- `espacioId`
- `material`
- `x`
- `y`
- `width`
- `height`
- `visible`
- `locked`

`SurfaceMaterialKind` soporta:

- `wood`
- `stone`
- `grass`
- `sand`
- `water`
- `deck`
- `carpet`
- `tile`
- `custom`

`SurfaceObjectDraft` es `SurfaceObject` sin `id`.

### 3.2 Creacion

La creacion ocurre en `SalaTerrenoWorkspace`.

Flujo actual:

1. El usuario selecciona un material de superficie.
2. El canvas de Terreno recibe pointer down sobre el fondo, no sobre una superficie existente.
3. Se guarda `creationPointerIdRef` para vincular el draft al puntero que lo inicio.
4. Se crea un `SurfaceCreationDraft` con `origin`, `current` y `rect`.
5. Pointer move actualiza el rectangulo del draft.
6. Pointer up confirma si el rectangulo es usable.
7. Se llama a `onSurfaceObjectCreate`.
8. `useSalaEditorDocument` crea el objeto mediante `createSurfaceObject`.
9. Se registra `surface.create`.

Guardas actuales:

- No crea superficie si el evento nace en un hijo del hit-area.
- No crea superficie si hay draft, movimiento o resize activo.
- No completa draft si el `pointerId` no coincide con el puntero que inicio la creacion.
- ESC cancela el draft.

### 3.3 Seleccion

La seleccion de superficie se guarda en `selectedSurfaceObjectId`.

Al seleccionar una superficie:

- Se limpia seleccion de structural elements.
- La superficie seleccionada muestra estado visual unificado.
- Aparecen handles de resize.
- La Context Action Bar puede ofrecer eliminar superficie.

### 3.4 Movimiento

El movimiento se implementa con `SurfaceMoveSession`.

Flujo actual:

1. Pointer down sobre superficie.
2. Se captura el puntero.
3. Se guarda origen del puntero y objeto original.
4. Al superar movimiento minimo se activa sesion.
5. Se inicia transaccion de historial.
6. Se calcula delta logico.
7. `translateSurfaceObject` aplica grid snap.
8. `resolveSmartSnap` aplica Smart Snap contra otras superficies visibles.
9. `onSurfaceObjectUpdate` actualiza el documento.
10. Pointer up confirma y registra `surface.move`.
11. Pointer cancel o ESC revierte a origen y descarta transaccion.

### 3.5 Resize

El resize usa cuatro handles:

- `nw`
- `ne`
- `sw`
- `se`

Flujo actual:

1. Pointer down sobre handle.
2. Se guarda objeto original, origen del puntero y handle.
3. Al superar movimiento minimo se activa sesion.
4. Se inicia transaccion de historial.
5. `resizeSurfaceObject` calcula nuevo rectangulo con grid snap.
6. `getSurfaceResizeActiveEdges` define bordes activos para Smart Snap.
7. `snapRectToPeers` ajusta el rectangulo.
8. Se actualiza documento.
9. Pointer up confirma y registra `surface.resize`.
10. Pointer cancel o ESC revierte y descarta transaccion.

### 3.6 Historial

Acciones de superficies:

- `surface.create`
- `surface.move`
- `surface.resize`
- `surface.delete`

`create` y `delete` se registran como commits directos. `move` y `resize` usan transacciones para poder cancelar o confirmar.

### 3.7 Smart Snap

Terreno convierte cada `SurfaceObject` a `SnapRect`.

Peers:

- Otras superficies del mismo espacio.
- Solo superficies visibles.
- Excluye el objeto que se esta moviendo o redimensionando.

Durante resize se pasa `activeEdges` para que el motor ajuste el borde que se esta manipulando.

### 3.8 Drafts

Los drafts de creacion son estado temporal de UI:

- No se guardan en `SalaEditorDocument`.
- No se persisten.
- No generan historial hasta que se confirma una superficie usable.

### 3.9 Normalizacion

`normalizeSurfaceObjects`:

- Descarta entradas no objeto.
- Descarta arrays.
- Requiere `id` string no vacio.
- Requiere `espacioId` valido.
- Requiere material reconocido.
- Requiere `x`, `y`, `width`, `height` finitos.
- Requiere dimensiones positivas.
- Normaliza `visible` a `true` salvo `false`.
- Normaliza `locked` a `true` solo si es exactamente `true`.

### 3.10 Persistencia local

Las superficies forman parte de `SalaEditorDocument.surfaceObjects`.

El documento se guarda como borrador mediante `saveSalaEditorDraft` cuando la persistencia de drafts esta habilitada y el documento cambia. Este guardado no publica al runtime TPV/Sala.

### 3.11 Limitaciones actuales

- `locked` existe en modelo pero no bloquea la interaccion.
- No hay inspector de material, nombre, z-index o visibilidad.
- No hay rotacion.
- No hay multi-seleccion.
- No hay union/division de superficies.
- No hay constraints de colision con estructura u operacion.

---

## 4. Structure System

El Structure System se divide en familias.

### 4.1 Familias actuales

Familia de muros:

- Modelo: `SalaWallSegment`.
- Render/interaccion: `SalaWallCanvas`.
- Herramienta disponible: `wall`.
- Interaccion: dibujo de segmento, seleccion, movimiento/resize segun sistema de wall drawing.
- Historial: `wall.create`, `wall.move`, `wall.resize`, `wall.delete`, `wall.duplicate`.

Familia de attachments de muro:

- Modelo: `SalaWallAttachment`.
- Render/interaccion: `SalaWallCanvas`.
- Herramientas disponibles desde toolbox: `door`, `glass`.
- Interaccion: colocacion sobre muro mediante `wallId` y `positionRatio`; movimiento sobre el muro; eliminacion.
- Historial: `wallAttachment.create`, `wallAttachment.move`, `wallAttachment.delete`.

Familia de objetos estructurales libres:

- Modelo: `SalaStructuralElement`.
- Render/interaccion: `SalaStructureObjectsLayer`.
- Herramientas disponibles: `squareColumn`, `roundColumn`, `divider`.
- Interaccion: click para crear, seleccion, movimiento, resize con cuatro handles, ESC, Context Action Bar.
- Historial: `structural.create`, `structural.move`, `structural.resize`, `structural.delete`.
- Smart Snap: activo en movimiento y resize contra otros objetos estructurales libres.

### 4.2 Muros

`SalaWallSegment` contiene:

- `id`
- `espacioId`
- `x1`
- `y1`
- `x2`
- `y2`
- `metadata`

Los muros viven en `SalaEditorDocument.walls`. No son `SalaStructuralElement`.

La herramienta `wall` esta disponible. En fase Estructura, si la herramienta activa es `wall`, el canvas de muros recibe handlers de pointer.

Pendiente:

- Persistencia final/publicacion.
- Inspector completo.
- Smart Snap.
- Rotacion como concepto separado no aplica actualmente porque son segmentos.
- Constraints avanzados.

### 4.3 Puertas

Las puertas actuales son attachments de muro.

Modelo:

- `SalaWallAttachment` con `kind: "door"` para puerta simple desde toolbox.
- Tambien existen kinds tipados para `double-door`, `sliding-door`, `opening`, `arch`, etc., pero no todas estan disponibles como herramientas reales.

Interaccion:

- Se colocan sobre un muro.
- Se resuelven por `wallId` y `positionRatio`.
- Usan constraints de attachment para validar posicion/tamano en muro.
- Se pueden seleccionar y eliminar desde Context Action Bar.

Historial:

- `wallAttachment.create`
- `wallAttachment.move`
- `wallAttachment.delete`

Pendiente:

- Puerta doble real.
- Puerta corredera real.
- Inspector.
- Propiedades de apertura/sentido.
- Smart Snap.
- Publicacion.

### 4.4 Cristales

Los cristales actuales son attachments de muro.

Modelo:

- `SalaWallAttachment` con `kind: "glass"`.

Interaccion:

- Se colocan sobre un muro.
- Se resuelven por `wallId` y `positionRatio`.
- Se pueden seleccionar y eliminar desde Context Action Bar.

Historial:

- `wallAttachment.create`
- `wallAttachment.move`
- `wallAttachment.delete`

Pendiente:

- Cristal corredero.
- Mampara.
- Inspector.
- Propiedades visuales/materiales.
- Smart Snap.
- Publicacion.

### 4.5 Columnas y pilares

Columnas/pilares pertenecen a la familia de objetos estructurales libres.

Tipos actuales:

- `squareColumn`: columna cuadrada.
- `roundColumn`: columna circular.

Modelo:

- `SalaStructuralElement`.
- `kind` igual a `squareColumn` o `roundColumn`.
- `x`, `y`, `width`, `height`.
- `locked`, `config`, `metadata`, `createdAt`, `updatedAt` opcionales.

Tamanos por defecto:

- `squareColumn`: `48 x 48`.
- `roundColumn`: `48 x 48`.

Interaccion:

- Click en canvas con herramienta activa crea la columna centrada en el punto.
- Drag del cuerpo mueve.
- Cuatro handles redimensionan.
- ESC cancela move/resize o limpia seleccion.
- Context Action Bar elimina.
- Smart Snap al mover y redimensionar contra otros objetos estructurales libres.

Historial:

- `structural.create`
- `structural.move`
- `structural.resize`
- `structural.delete`

Pendiente:

- Inspector.
- Bloqueo funcional.
- Rotacion.
- Duplicar.
- Orden/capas.
- Publicacion.

### 4.6 Separadores

Hay dos conceptos tipados:

- `divider`: separador fijo nuevo, libre e implementado.
- `separator`: tipo historico/placeholder en `SalaStructuralElementKind`, no disponible actualmente como herramienta real.

`divider` pertenece a la familia de objetos estructurales libres.

Modelo:

- `SalaStructuralElement` con `kind: "divider"`.

Tamano por defecto:

- `128 x 24`.

Interaccion:

- Click para crear.
- Drag para mover.
- Resize por handles.
- ESC.
- Context Action Bar.
- Smart Snap contra otros objetos estructurales libres.

Historial:

- `structural.create`
- `structural.move`
- `structural.resize`
- `structural.delete`

Pendiente:

- Inspector.
- Materiales/altura/opacidad.
- Rotacion.
- Bloqueo funcional.
- Publicacion.

### 4.7 Herramientas estructurales no implementadas

Existen en tipos/toolbox/catalogo como no disponibles o placeholders:

- `bar`
- `planter`
- `separator`
- `stage`
- `decoration`

No deben documentarse como funcionalidad real. Solo estan tipadas o presentes para compatibilidad/catalogo futuro.

---

## 5. Operational System

### 5.1 Modelo

El sistema operativo usa instancias OSE:

- `OperationalElementInstance`
- `OperationalElementType`
- metadata de tamano visual
- posicion en coordenadas logicas
- estado/capacidad/nombre segun tipo

Las instancias viven en `SalaEditorDocument.operationalElementInstances`.

### 5.2 Catalogo

El catalogo operativo V2 define elementos disponibles para colocacion. El documento actual no debe asumir que todos los tipos tienen la misma semantica que una mesa real de TPV. La publicacion hacia runtime esta pendiente.

### 5.3 Creacion

En fase Operacion:

1. El usuario selecciona un elemento operativo.
2. Pointer down sobre el canvas resuelve punto logico.
3. Se calcula posicion.
4. Para colocacion se usa `snapOperationalCenterPosition`.
5. `placeOperationalElementAt` crea instancia mediante `buildOperationalElementInstance`.
6. Se registra `operational.create`.

### 5.4 Seleccion

La seleccion se guarda como `selectedOperationalElementInstanceId`.

Al seleccionar instancia:

- Se limpia seleccion estructural libre.
- El canvas muestra estado seleccionado.
- Aparecen handles de resize.
- La Context Action Bar puede eliminar.

### 5.5 Movimiento

El movimiento lo coordina `useOperationalElementDragging`.

Flujo:

- Pointer down en cuerpo de instancia.
- Se distingue tap de drag mediante umbral interno del hook.
- Se inicia transaccion de historial al comenzar drag.
- Se actualiza posicion.
- Si la instancia es `TABLE`, se aplica Smart Snap contra otras `TABLE`.
- Pointer up confirma `operational.move`.
- Cancel descarta transaccion.

### 5.6 Resize

El resize lo coordina `useOperationalElementResizing`.

Flujo:

- Pointer down sobre corner/handle.
- Se guarda tamano inicial y posicion inicial.
- Se actualiza metadata de tamano visual mediante `resizeOperationalElementInstance`.
- Se confirma con `operational.resize`.
- Cancel descarta.

Smart Snap no se aplica al resize operativo en el estado actual.

### 5.7 Smart Snap

Smart Snap operativo actual:

- Solo aplica al movimiento de instancias cuyo `elementType` es `TABLE`.
- Solo usa otras instancias `TABLE` como peers.
- Convierte instancia a `SnapRect` usando `getOperationalInstanceCanvasSize`.
- Convierte `SnapRect` resultante de vuelta a `OperationalElementPosition`.
- Renderiza guias mediante `SalaSmartSnapGuidesLayer`.

No aplica a:

- resize operativo;
- tipos operativos no `TABLE`;
- duplicado;
- colocacion inicial salvo el snap operacional existente de centro, que no es el Smart Snap Engine generico.

### 5.8 Context Action Bar

La Context Action Bar soporta target `operational`.

Accion real:

- eliminar instancia.

Acciones mostradas como proximamente:

- duplicar;
- bloquear;
- traer delante;
- enviar detras.

La duplicacion operativa existe en codigo como accion/historial, pero no es el flujo principal de la Context Action Bar en el estado actual.

### 5.9 Implementado

- Crear instancias.
- Seleccionar.
- Mover.
- Resize.
- Duplicar.
- Eliminar.
- Historial.
- Smart Snap para movimiento de `TABLE`.
- Tool hints y cursores.

### 5.10 Falta

- Publicacion a TPV/Sala.
- Inspector completo.
- Rotacion.
- Bloqueo funcional.
- Smart Snap para resize.
- Smart Snap para otros tipos operativos.
- Constraints operativas por estructura o superficie.
- Estados operativos reales conectados al runtime.

---

# Visual Assets Architecture

## Objetivo

Visual Assets es la arquitectura canonica para representar recursos visuales complejos del Editor V2 sin mezclar apariencia con comportamiento.

Su objetivo es separar completamente:

- modelo;
- interaccion;
- render;
- apariencia visual.

Un mismo objeto del editor podra cambiar completamente de aspecto sin modificar su comportamiento. Una superficie podra pasar de un rectangulo plano a una textura de madera sin cambiar su modelo de superficie. Una mesa podra usar una representacion realista sin cambiar su logica operativa. Un muro podra renderizarse con otra apariencia sin dejar de ser un muro.

Visual Assets no renderiza nada por si mismo en el estado actual. Define el contrato que futuras capas de render usaran para asociar recursos visuales independientes a objetos existentes del editor.

## Filosofia

Un muro sigue siendo un muro. Una mesa sigue siendo una mesa. Una superficie sigue siendo una superficie.

Visual Assets solo describe como se representa visualmente un objeto. Nunca cambia:

- la logica de negocio;
- la geometria canonica;
- la seleccion;
- el movimiento;
- el resize;
- Smart Snap;
- historial;
- persistencia operativa;
- permisos;
- estado TPV.

El comportamiento nunca debe depender del aspecto visual. Si un elemento parece madera, piedra, agua, sofa o iluminacion, esa apariencia no debe modificar como se selecciona, mueve, redimensiona, publica o valida.

## Arquitectura

El modulo vive en `lib/sala-editor/visual-assets`.

### VisualAsset

`VisualAsset` representa una descripcion visual independiente.

Campos:

- `id`: identificador interno del asset visual.
- `type`: tipo general del recurso visual.
- `category`: categoria funcional/visual.
- `assetKey`: clave estable para localizar una definicion visual.
- `variant`: variante opcional del asset.
- `scale`: escala visual del recurso.
- `rotation`: rotacion visual del recurso.
- `opacity`: opacidad visual normalizada.
- `visualZIndex`: orden visual relativo para futuras capas de render.
- `renderMode`: modo de render previsto.
- `aiFlags`: flags semanticos para futuras capacidades de IA.

`VisualAsset` no contiene logica. No decide si un objeto se puede mover, borrar, publicar, cobrar o bloquear.

### VisualAssetAssignment

`VisualAssetAssignment` describe una asociacion entre un asset visual y un target del editor.

Responsabilidades:

- identificar el target mediante `family` e `id`;
- asociar un `VisualAsset` a ese target;
- permitir que futuras capas sepan que recurso visual corresponde a un objeto sin modificar el modelo del objeto.

Familias de target previstas:

- `surface`;
- `wall`;
- `wallAttachment`;
- `structuralElement`;
- `operationalInstance`;
- `spaceBase`.

Esta asociacion no esta integrada en Documento V2 persistido en el estado actual.

### VisualAssetCatalog

`VisualAssetCatalog` es el catalogo de definiciones visuales disponibles para futuras iteraciones.

Responsabilidades:

- declarar `assetKey` conocidos;
- agruparlos por tipo y categoria;
- definir etiquetas y descripciones;
- declarar variantes disponibles;
- declarar defaults de escala, rotacion, opacidad, z-index visual y modo de render;
- declarar flags semanticos para IA futura.

El catalogo no contiene imagenes, SVGs, texturas binarias ni componentes de render. Solo contiene definiciones.

### assetKey

`assetKey` es la clave estable del recurso visual.

Ejemplos de formato:

- `surface.wood.default`
- `surface.stone.default`
- `water.pool.default`
- `vegetation.palm.default`
- `structure.bar.default`

La clave debe ser estable aunque cambie el archivo, proveedor o implementacion de render en el futuro.

### variant

`variant` permite elegir una variante de un asset sin cambiar de `assetKey`.

Ejemplos futuros:

- madera `oak`, `walnut`, `deck`;
- piedra `light`, `dark`, `irregular`;
- palmera `short`, `tall`, `wide`.

### scale

`scale` describe escala visual. No modifica el tamano logico ni la geometria canonica del objeto.

### rotation

`rotation` describe rotacion visual del asset. No sustituye la rotacion funcional de un objeto si esa rotacion existe en el modelo del sistema correspondiente.

### opacity

`opacity` describe transparencia visual. No cambia disponibilidad, seleccion, permisos ni logica operativa.

### visualZIndex

`visualZIndex` prepara orden visual relativo para futuras capas realistas. No debe confundirse con jerarquia de interaccion ni ownership de datos.

### renderMode

`renderMode` describe como una futura capa podria pintar el recurso:

- `fill`;
- `tile`;
- `cover`;
- `contain`;
- `stamp`;
- `pattern`.

El modo de render no existe como comportamiento visual activo en el canvas actual.

### aiFlags

`aiFlags` prepara integracion futura con IA.

Campos:

- `suggestable`: el asset puede ser sugerido.
- `replaceable`: el asset puede ser sustituido con confirmacion humana.
- `generatable`: el asset podria generarse por pipeline futura.
- `semanticTags`: etiquetas semanticas para busqueda o asistente.

La IA nunca debe publicar, migrar, sustituir o confirmar cambios visuales sin confirmacion humana.

## Relacion con el Editor

Visual Assets sera compartido por:

- Terreno;
- Estructura;
- Operacion;
- Decoracion;
- IA.

Terreno podra asociar texturas/materiales a superficies. Estructura podra asociar recursos visuales a muros, puertas, cristales, columnas, pilares, separadores o barras. Operacion podra asociar representaciones visuales a mesas, sofas, hamacas u otros elementos operativos. Decoracion podra representar objetos ambientales sin convertirlos en mesas cobrables. IA podra sugerir assets visuales, pero no alterar comportamiento ni publicar sin confirmacion.

Visual Assets no debe modificar Surface System, Structure System ni Operation System. Es una capa de descripcion visual desacoplada.

## Casos de Uso Futuros

Ejemplos previstos, no implementados como render activo:

- madera;
- piedra;
- cesped;
- arena;
- baldosas;
- hormigon;
- agua;
- piscina;
- arbol;
- palmera;
- olivo;
- jardinera;
- roca;
- fuente;
- barra;
- sofa;
- iluminacion.

Estos ejemplos son claves semanticas y casos de uso para futuras iteraciones. No implican que existan texturas, imagenes, render realista, herramientas nuevas ni integracion en canvas.

## Principios

- El comportamiento nunca depende del aspecto visual.
- El aspecto visual puede cambiar sin modificar el modelo.
- Los assets nunca contienen logica.
- El render debe permanecer desacoplado.
- Las texturas, iconos o imagenes complejas no deben incrustarse dentro de Surface System, Structure System u Operation System.
- Toda representacion visual compleja debe pasar por Visual Assets.
- Visual Assets no sustituye Smart Snap, historial, seleccion, interaccion ni persistencia.
- Visual Assets no convierte decoracion en operacion.

---

## 6. Smart Snap Engine

### 6.1 Arquitectura

El Smart Snap Engine vive en `lib/sala-editor/snap`.

Es un motor comun y agnostico del tipo de objeto. No conoce superficies, mesas, columnas ni separadores. Trabaja con rectangulos genericos.

API principal:

- `snapRectToPeers(moving, peers, options)`

Tipos principales:

- `SnapRect`
- `SnapGuide`
- `SnapEngineOptions`
- `SnapEngineResult`
- `SnapResizableEdges`

### 6.2 SnapRect

`SnapRect` representa cualquier objeto rectangular:

- `id`
- `x`
- `y`
- `width`
- `height`

Cada sistema adapta su modelo a `SnapRect`.

Adaptadores actuales:

- Surface: `SurfaceObject` -> `SnapRect`.
- Operacion: `OperationalElementInstance` -> `SnapRect`.
- Estructura libre: `SalaStructuralElement` -> `SnapRect`.

### 6.3 SnapGuide

`SnapGuide` describe una guia visual:

- `axis`: `x` o `y`.
- `position`: posicion logica.
- `from`: inicio logico de la guia.
- `to`: fin logico de la guia.
- `kind`: `edge`, `corner` o `center`.

Las guias se renderizan con `SalaSmartSnapGuidesLayer`.

### 6.4 SNAP_DISTANCE_PX

`SNAP_DISTANCE_PX` es la distancia base del motor. Las capas que trabajan con `coordinateScale` ajustan el threshold dividiendo por la escala para mantener una sensacion visual consistente.

### 6.5 Motor comun

El motor:

- Calcula anchors de borde y centro.
- Compara anchors del objeto activo contra peers.
- Elige el mejor candidato por eje.
- Devuelve rectangulo ajustado.
- Devuelve guias visuales.
- Soporta `activeEdges` para resize.

### 6.6 Sistemas que reutilizan Smart Snap

Terreno:

- movimiento de superficies;
- resize de superficies;
- peers: otras superficies visibles.

Estructura libre:

- movimiento de `squareColumn`, `roundColumn`, `divider`;
- resize de `squareColumn`, `roundColumn`, `divider`;
- peers: otros objetos estructurales libres.

Operacion:

- movimiento de `TABLE`;
- peers: otras `TABLE`.

### 6.7 Sistemas que todavia no usan Smart Snap

- Muros.
- Wall attachments: puertas y cristales.
- Resize operativo.
- Movimiento operativo de tipos distintos de `TABLE`.
- Colocacion inicial operativa, que usa `snapOperationalCenterPosition`, no el Smart Snap Engine generico.
- Base.
- Inspector.

---

## 7. Selection System

### 7.1 Objeto seleccionado

El editor mantiene seleccion por familia:

- `selectedSurfaceObjectId`
- `selectedStructuralElementId`
- `selectedOperationalElementInstanceId`
- `selectedWallId`
- `selectedWallAttachmentId`

Las selecciones se limpian de forma cruzada cuando el usuario entra en otra familia para evitar targets ambiguos.

### 7.2 Estados visuales

Los objetos editables usan estados:

- idle;
- selected;
- dragging;
- resizing;
- readonly.

La capa read-only renderiza objetos como contexto sin interaccion.

### 7.3 Handles

Sistemas con handles de resize actuales:

- superficies;
- structural elements libres;
- instancias operativas.

Handles de superficies y estructura libre:

- `nw`
- `ne`
- `sw`
- `se`

### 7.4 Context Action Bar

La Context Action Bar recibe un target unico:

- `surface`
- `wall`
- `door`
- `glass`
- `structural`
- `operational`

Accion real comun:

- eliminar el objeto seleccionado.

Acciones no activas:

- duplicar;
- bloquear;
- traer delante;
- enviar detras.

### 7.5 ESC

ESC tiene comportamiento local por sistema:

- En superficies: cancela draft, move o resize; o limpia seleccion.
- En estructura libre: cancela move o resize; o limpia seleccion.
- En muros: cancela dibujo/edicion segun `useSalaWallDrawing`.
- En operacion: los hooks de drag/resize exponen cancelaciones usadas al cambiar espacio, undo/redo o cancelar sesion.

### 7.6 Deseleccion

La deseleccion ocurre al:

- seleccionar otro objeto de otra familia;
- cambiar de fase;
- cambiar de espacio;
- cancelar con ESC donde esta implementado;
- borrar el objeto seleccionado.

---

## 8. Tool Hint System

### 8.1 Catalogo

El sistema vive en `lib/sala-editor/ux/editor-tool-hints.ts`.

Define:

- `EditorToolCursor`
- `EditorToolHintState`
- `EditorToolHintProfile`
- `ResolvedEditorToolHint`

### 8.2 Estados

Estados soportados:

- `idle`
- `drawing`
- `dragging`
- `resizing`
- `blocked`

### 8.3 Cursores

El resolver devuelve cursor segun estado:

- idle usa el cursor de la herramienta.
- dragging usa `grabbing`.
- resizing usa `nwse-resize`.
- blocked usa `not-allowed`.

### 8.4 Ayudas

Cada perfil puede definir:

- `idleHint`
- `drawingHint`
- `draggingHint`
- `resizingHint`
- `blockedHint`

Si falta un texto de estado, el sistema vuelve a `idleHint`.

### 8.5 Catalogos actuales

Estructura:

- `wall`
- `door`
- `glass`
- `squareColumn`
- `roundColumn`
- `divider`
- `bar`
- `stage`
- `decoration`
- `planter`
- `separator`

Superficies:

- Se genera un perfil desde material activo.

Operacion:

- Se genera un perfil desde el item operativo activo.

### 8.6 Render

El componente visual es `SalaEditorCanvasToolHint`.

Se usa en:

- muros/attachments;
- Terreno;
- Estructura libre;
- Operacion.

---

## 9. Historial

El historial usa `SalaEditorHistoryActionKind`.

Acciones soportadas actualmente:

Operacion:

- `operational.create`
- `operational.move`
- `operational.resize`
- `operational.delete`
- `operational.duplicate`

Muros:

- `wall.create`
- `wall.move`
- `wall.resize`
- `wall.delete`
- `wall.duplicate`

Attachments de muro:

- `wallAttachment.create`
- `wallAttachment.move`
- `wallAttachment.delete`

Superficies:

- `surface.create`
- `surface.move`
- `surface.resize`
- `surface.delete`

Estructura libre:

- `structural.create`
- `structural.move`
- `structural.resize`
- `structural.delete`

Espacios y navegacion:

- `espacio.create`
- `espacio.update`
- `history.navigation`

### 9.1 Commits directos

Se usan commits directos para acciones discretas:

- crear;
- borrar;
- duplicar;
- crear espacio.

### 9.2 Transacciones

Se usan transacciones para interacciones continuas:

- move;
- resize;
- edicion de muro;
- movimiento de wall attachment.

La transaccion se inicia al comenzar interaccion real y se confirma o descarta al finalizar.

### 9.3 Undo/Redo

Undo/redo:

- descarta transacciones abiertas;
- cancela drag/resize/dibujo activo;
- limpia guias de Smart Snap operativas;
- restaura snapshot completo de documento.

---

## 10. Documento V2

### 10.1 Estructura

`SalaEditorDocument` contiene:

- `version`
- `restaurantId`
- `espacios`
- `walls`
- `wallAttachments`
- `surfaceObjects`
- `structuralElements`
- `operationalElements`
- `operationalElementInstances`
- `navigation`
- `updatedAt`

Version actual:

- `SALA_EDITOR_DOCUMENT_VERSION = 1`

### 10.2 Compatibilidad

El documento V2 no sustituye aun los modelos Firestore de produccion.

Compatibilidad actual:

- `SalaEspacio` conserva `legacyFloorPlanId` y `legacyZoneId` como puentes.
- El documento se normaliza al cargar drafts.
- `wallAttachments` se filtran por muros validos.
- `surfaceObjects` se filtran por espacios validos.
- `structuralElements` se filtran por espacios validos.
- Base se normaliza aunque falte o este parcial.

### 10.3 Normalizacion

`normalizeSalaEditorDocument`:

- Normaliza `espacios` con `withNormalizedSalaEspacioBase`.
- Normaliza `surfaceObjects`.
- Normaliza `structuralElements`.
- Normaliza `wallAttachments`.

`normalizeSalaStructuralElements`:

- Requiere objeto plano.
- Requiere `id`.
- Requiere `espacioId` valido.
- Requiere `kind` reconocido.
- Requiere geometria finita y positiva.
- Clona `config` y `metadata` si son objetos planos.
- Conserva `rotation`, `locked`, `createdAt`, `updatedAt` si son validos.

### 10.4 Persistencia

El V2 usa `saveSalaEditorDraft` y `loadSalaEditorDraft`.

Ruta de draft:

- `restaurants/{restaurantId}/salaEditorMaps/draft`

El borrador contiene:

- `id: "draft"`
- `restaurantId`
- `state: "draft"`
- `schemaVersion`
- `document`
- `updatedAt`
- `updatedBy` opcional

La persistencia de drafts:

- requiere Firebase configurado;
- valida `restaurantId`;
- valida version de documento;
- valida estructura minima;
- normaliza documento antes de devolverlo;
- elimina campos `undefined` antes de guardar.

### 10.5 Drafts antiguos

Los drafts sin `wallAttachments`, `surfaceObjects` o `structuralElements` siguen cargando porque esos arrays son opcionales en el parser y se normalizan a array vacio.

Esto protege documentos anteriores a Surface System y Structure Family Pass 1.

---

## 11. Que Esta Implementado

- Fase interna `Mapas` para crear/seleccionar espacios.
- Fases visibles `Base`, `Terreno`, `Estructura`, `Operacion`.
- Canvas unificado por capas.
- Render contextual read-only de capas no activas.
- `SalaEspacio` con base opcional.
- Normalizacion de base.
- Vista de Base con dimensiones, unidad y estado.
- Surface System con crear, seleccionar, mover, resize, eliminar, historial y Smart Snap.
- Structure System de muros con dibujo local y seleccion.
- Wall attachments para puerta y cristal sobre muro.
- Structure objects libres: columna cuadrada, columna circular y separador fijo.
- Smart Snap para superficies en move/resize.
- Smart Snap para structure objects libres en move/resize.
- Smart Snap para movimiento de mesas `TABLE`.
- Operational System con crear, seleccionar, mover, resize, duplicar, eliminar e historial.
- Context Action Bar para targets de superficie, muro, puerta, cristal, estructura libre y operacion.
- Tool Hint System compartido para cursores y ayudas.
- Historial unico con undo/redo sobre snapshots.
- Persistencia de borrador V2 en `salaEditorMaps/draft`.
- Normalizacion de drafts antiguos para arrays opcionales.
- Arquitectura Visual Assets como contrato independiente para apariencia visual futura, sin render activo ni integracion en Documento V2 persistido.

---

## 12. Que Queda Pendiente

### Terreno

- Inspector de superficie.
- Bloqueo funcional.
- Rotacion.
- Orden/capas.
- Multi-seleccion.
- Constraints con estructura y operacion.
- Persistencia/publicacion operativa final.

### Estructura

- Inspector de muros, puertas, cristales, columnas y separadores.
- Smart Snap para muros y wall attachments.
- Barras reales.
- Jardineras reales.
- Separador legacy `separator` o decision de retirada.
- Escenarios/decoracion reales.
- Rotacion de objetos libres.
- Bloqueo funcional.
- Duplicar desde UI contextual.
- Orden/capas.
- Publicacion.

### Operacion

- Publicacion a TPV/Sala.
- Inspector operativo completo.
- Smart Snap para resize.
- Smart Snap para tipos no `TABLE`.
- Rotacion.
- Bloqueo funcional.
- Estados operativos conectados al runtime.
- Validacion de que elementos no operativos no se convierten en mesas cobrables.

### Editor

- Contrato de publicacion V2 -> legacy o contrato canonico nuevo.
- Adaptador completo legacy -> V2.
- Adaptador V2 -> runtime.
- Fixture de migracion.
- Tests de caracterizacion.
- Telemetria de uso y errores.
- Estrategia de retirada del legacy.

### Viewport

- Zoom.
- Fit.
- Pan.
- Gestos touch/trackpad completos.
- Reglas de interaccion entre pan y drag.

### Inspector

- Inspector completo por familia.
- Propiedades editables por tipo.
- Validaciones por campo.
- Integracion con historial.

### Decoracion

- Integracion real con Visual Assets.
- Familias decorativas reales.
- Criterio de que es estructura, decoracion u operacion.
- Evitar que decoracion se publique como mesa cobrable.

### IA

- Asistente V2 que genere `SalaEditorDocument`.
- Importacion asistida desde legacy.
- Sugerencias revisables.
- Sugerencias de Visual Assets con confirmacion humana.
- Confirmacion humana obligatoria antes de publicar.

---

## Invariantes del Editor V2

- No romper compatibilidad de drafts antiguos.
- No romper `SalaEditorDocument`.
- No publicar a Firestore runtime sin contrato explicito.
- No duplicar motores de interaccion si existe un motor comun.
- Mantener canvas unificado por capas.
- Mantener Smart Snap como motor compartido.
- Mantener historial unico.
- Mantener Visual Assets como unica arquitectura para representacion visual compleja.
- Mantener separacion entre UI, documento, adaptadores y persistencia.
- Mantener `restaurantId` como frontera obligatoria en persistencia.
- No introducir logica Firestore dentro de componentes visuales.
- No mezclar elementos decorativos con mesas operativas.
- No incrustar texturas, iconos o imagenes complejas dentro de Surface System, Structure System u Operation System.
- No hacer depender comportamiento, seleccion, Smart Snap, historial o persistencia del asset visual.
- No documentar placeholders como funcionalidades reales.
- No crear una tercera fuente de verdad para mapas/mesas sin decision arquitectonica.
- No romper TPV, KDS, Carta, Firestore ni runtime de produccion al iterar el Editor V2.
- No convertir compatibilidad legacy en arquitectura nueva.
- No cambiar simultaneamente UI, persistencia y modelo operativo en una misma iteracion.

