# HOSTLY_EDITOR_V2_TPV_PUBLICATION_CONTRACT

> Contrato tecnico-funcional vigente para conectar Documento V2, Publisher, entidades legacy compatibles y TPV.

**Estado:** contrato tecnico vigente
**Ambito:** Documento V2, Editor V2, Publisher, `floorPlans`, `tables`, `zones`, TPV, renderer readonly y compatibilidad legacy
**Regla central:** Documento V2 es la fuente visual canonica; TPV es el modo operacion y nunca toma estados operativos desde el editor.
**Relacion documental:** complementa `HOSTLY_SOURCE_OF_TRUTH.md`, `HOSTLY_DOMAIN_MAP.md` y la documentacion tecnica del Editor V2. No sustituye Firestore Rules ni el codigo del Publisher.

---

## 1. Decision Principal

Hostly consolida el sistema espacial como una cadena unica:

```text
Documento V2
  -> Publisher
  -> floorPlans / tables / zones
  -> TPV
```

La decision actual no es que el TPV sea un sistema separado ni que legacy sea la fuente visual principal.

La decision actual es:

- `Documento V2` manda sobre la representacion visual editable del restaurante.
- Editor V2 es el modo edicion.
- TPV es el modo operacion.
- Publisher traduce el Documento V2 hacia entidades compatibles con la operacion legacy.
- `floorPlans`, `tables` y `zones` siguen existiendo como compatibilidad, identidad operativa y puente con TPV.
- El TPV puede usar el draft V2 como fuente visual readonly cuando existe contrato seguro.
- La operacion real sigue viviendo en TPV/Mesas/Comandas/Pagos/Reservas/KDS, no en el Documento V2.
- `EditableFloorMap` sigue siendo capa operativa y fallback seguro, no una fuente visual canonica cuando hay paridad V2 valida.

---

## 2. Que Es Canonico, Que Es Compatibilidad Y Que Es Runtime

### Canonico Visual

Es canonico para visual:

- `SalaEditorDocument` en `restaurants/{restaurantId}/salaEditorMaps/draft`.
- Espacios V2.
- Geometria del plano.
- Zonas V2.
- Muros, superficies, estructura, paisajismo y decorativos.
- Instancias operativas visuales.
- Rotacion, tamano, forma y posicion visual.

Esto gobierna como debe verse el restaurante cuando Editor V2 y TPV tienen paridad.

### Compatibilidad Legacy

Es compatibilidad:

- `floorPlans`.
- `tables`.
- `zones`.
- IDs `legacy*`.
- Campos de layout legacy que TPV necesita para operar o hacer fallback.
- `EditableFloorMap` cuando no hay contrato visual V2 seguro.

Compatibilidad no significa fuente visual principal. Significa puente estable para no romper TPV, pedidos, pagos, reservas, KDS ni restaurantes existentes.

### Runtime Operativo

Es runtime operativo:

- estado de mesa;
- ocupacion;
- comanda;
- pagos;
- reservas activas;
- KDS;
- ordenes;
- cierre de mesa;
- asignacion de camarero;
- cualquier estado de servicio activo.

Editor V2 no debe inventar, derivar ni sobrescribir runtime operativo.

---

## 3. Donde Vive Cada Cosa

### En Documento V2 / Draft

Vive en draft:

- espacios V2;
- orden, nombre y visibilidad de espacios;
- `legacyFloorPlanId` como puente hacia `floorPlans`;
- zonas V2 y metadata de `legacyZoneId` si existe;
- instancias operativas visuales;
- `legacyTableId` si la instancia esta enlazada a una mesa operativa;
- geometria, rotacion, forma, capacidad visual y capas;
- decorativos, estructura, muros, superficies y paisajismo;
- navegacion y seleccion del editor.

El draft puede autosalvarse. Autosalvar no equivale a publicar.

### En `floorPlans`

Vive en `floorPlans`:

- identidad legacy del plano operativo;
- `restaurantId`;
- nombre compatible con TPV;
- dimensiones publicadas si aplica;
- visibilidad/actividad compatible;
- puente con espacios V2 mediante `legacyFloorPlanId`.

Un `floorPlan` no debe decidir ocupacion, pagos, comandas ni reservas.

### En `tables`

Vive en `tables`:

- identidad operativa estable de mesa;
- `restaurantId`;
- nombre/numero;
- capacidad;
- `floorPlanId`;
- geometria compatible publicada;
- estado operativo preservado;
- metadata de origen V2 cuando procede;
- `source: "editor-v2"` cuando la entidad fue generada/publicada por Editor V2;
- `editorV2ElementId` y `editorV2InstanceId` para trazabilidad.

`tables/{id}` sigue siendo la identidad que usan TPV, orders, payments, reservas, KDS y cierre.

### En `zones`

Vive en `zones`:

- identidad compatible de zona;
- `restaurantId`;
- `floorPlanId`;
- nombre;
- geometria compatible;
- metadata de origen V2 cuando procede.

Las zonas pueden ayudar a leer la sala, pero no son ocupacion ni reserva por si mismas.

---

## 4. IDs Y Campos De Puente

### `legacyFloorPlanId`

Vincula un espacio V2 con un `floorPlan` legacy/operativo.

Reglas:

- debe pertenecer al mismo `restaurantId`;
- no debe inferirse si hay ambiguedad;
- un espacio sin `legacyFloorPlanId` puede existir en el Editor, pero no debe publicarse como plano operativo sin resolucion;
- varios espacios compartiendo un mismo `floorPlan` es un caso inseguro salvo contrato explicito.

### `legacyTableId`

Vincula una instancia operativa V2 con una mesa `tables/{id}`.

Reglas:

- si existe, Publisher actualiza campos visuales permitidos de esa mesa;
- no debe cambiar el id operativo;
- no debe pisar campos runtime;
- si se elimina en duplicacion, la copia queda sin vinculo operativo hasta publicar o enlazar.

### `legacyZoneId`

Vincula una zona V2 con una zona `zones/{id}`.

Si no existe y el Publisher puede generar una zona segura, puede usar id determinista `v2-zone-*`.

### `editorV2ElementId`

Identifica el elemento o fuente visual V2 que origino una entidad publicada.

Se usa para trazabilidad, auditoria y evitar reusar entidades ajenas.

### `editorV2InstanceId`

Identifica la instancia operativa V2 concreta que origino una mesa publicada.

Es obligatorio para distinguir mesas generadas desde V2 y evitar colisiones entre ids deterministas, duplicados o entidades de otro origen.

### `source: "editor-v2"`

Marca entidades publicadas/generadas desde Editor V2.

No convierte esas entidades en fuente visual canonica. Solo indica origen y ayuda a idempotencia/fallback.

### `v2-table-*`

Id determinista para mesas operativas nuevas creadas desde instancias V2 sin `legacyTableId`.

Reglas:

- debe derivarse de un id estable de instancia V2;
- debe validarse contra conflictos existentes;
- si ya existe y pertenece a la misma instancia V2, se puede reutilizar;
- si existe pero pertenece a otra instancia u origen, es conflicto;
- debe persistirse despues como `legacyTableId` en el draft para futuras publicaciones.

### `v2-map-*`

Id determinista para elementos visuales/decorativos publicados en estructuras compatibles legacy cuando sea necesario.

No representa una mesa operativa.

### `v2-zone-*`

Id determinista para zonas V2 publicadas en `zones` cuando no hay `legacyZoneId` previo.

---

## 5. Casos De Publicacion

### Mesa V2 Existente

Caso: instancia V2 con `metadata.legacyTableId`.

Publisher debe:

- comprobar que `tables/{legacyTableId}` existe;
- comprobar `restaurantId`;
- comprobar que el `floorPlanId` resuelto es seguro;
- actualizar solo campos visuales/configurables permitidos;
- preservar estado operativo, pagos, comandas, reservas, asignaciones y cierre;
- mantener idempotencia.

### Mesa V2 Nueva

Caso: instancia V2 de tipo mesa sin `legacyTableId`.

Publisher puede:

- generar `v2-table-*`;
- validar nombre/capacidad/plano;
- detectar duplicados por identidad operativa dentro del mismo `floorPlan`;
- crear o reutilizar la mesa si pertenece a la misma instancia V2;
- escribir `source: "editor-v2"`, `editorV2ElementId` y `editorV2InstanceId`;
- devolver el enlace para persistir `legacyTableId` en el draft.

No debe crear mesas si:

- falta nombre valido;
- no hay `floorPlan` seguro;
- existe conflicto con otra mesa activa del mismo plano;
- el documento existente pertenece a otro `restaurantId`;
- el id generado ya pertenece a otra instancia.

### Mesa Duplicada

Caso: se duplica una mesa o espacio en Editor V2.

La copia no debe heredar:

- `legacyTableId`;
- ids de runtime;
- orden activa;
- reserva;
- pagos;
- asignaciones operativas.

La copia puede publicarse despues como mesa nueva si supera validaciones y recibe `v2-table-*`.

### FloorPlan Inseguro

Un `floorPlan` es inseguro si:

- no pertenece al `restaurantId`;
- falta;
- esta ambiguamente compartido;
- no esta en el conjunto seguro resuelto para el espacio;
- se deduce desde una mesa que no puede probar ownership correcto.

Publisher debe saltar o bloquear la escritura afectada y reportar motivo.

### Mismatch De `restaurantId`

Cualquier mismatch de `restaurantId` debe impedir escritura.

No se permite corregirlo silenciosamente desde UI ni Publisher.

### Mesa Sin Vinculo

Una mesa sin `legacyTableId` no se ignora automaticamente si el contrato de mesas nuevas esta activo.

Debe evaluarse como mesa nueva:

- crear/reusar con `v2-table-*` si es seguro;
- saltar con razon explicita si no lo es.

### Fallback Legacy

Fallback legacy se usa cuando:

- no hay Documento V2 usable;
- no hay espacio V2 enlazado al `floorPlan` actual;
- no hay paridad visual/hitbox segura para una mesa;
- falla la publicacion;
- hay conflicto de identidad;
- el TPV necesita preservar operacion durante una inconsistencia.

Fallback significa mostrar y operar con la ruta legacy existente. No significa borrar V2.

### Idempotencia

Publicar dos veces el mismo Documento V2 no debe duplicar mesas, zonas ni decorativos generados.

La idempotencia depende de:

- ids deterministas;
- `editorV2ElementId`;
- `editorV2InstanceId`;
- `source: "editor-v2"`;
- deteccion de conflictos;
- preservacion de `legacyTableId` posterior.

### Publicacion Parcial

No debe afirmarse atomicidad completa si no existe.

La publicacion puede tener escrituras por lotes o pasos diferenciados. Por eso debe devolver:

- escritos correctos;
- elementos saltados;
- warnings;
- conflictos;
- enlaces nuevos que deben persistirse en draft;
- auditoria suficiente para explicar que ocurrio.

Si una escritura parcial deja entidades publicadas y otras saltadas, el sistema debe hacerlo visible y no ocultarlo como exito total.

### Persistencia Posterior De `legacyTableId`

Cuando Publisher crea o reutiliza una mesa `v2-table-*`, debe devolver el enlace para que el workspace actualice el draft:

```text
instance.metadata.legacyTableId = legacyTableIdAfter
```

Ese paso es necesario para que futuras publicaciones sean estables e idempotentes.

### No Hard Delete

Publisher no debe hacer hard delete de mesas operativas por cambios visuales.

La retirada debe ser segura:

- desactivacion controlada;
- proteccion ante servicio activo;
- auditoria;
- posibilidad de fallback;
- nunca borrar historia.

### Desactivacion Segura

Una mesa legacy no presente en la publicacion V2 solo puede desactivarse si es seguro:

- mismo `restaurantId`;
- sin orden activa;
- sin pagos pendientes;
- sin reserva activa relevante;
- sin relacion operativa que pueda romper servicio.

Si hay duda, se conserva activa o se reporta como warning.

---

## 6. Contrato Del Renderer TPV

### Fuente Visual

Cuando existe contrato V2 seguro, el TPV usa el draft V2 como fuente visual readonly para el plano seleccionado.

El espacio V2 se resuelve por `legacyFloorPlanId` contra el `floorPlan` activo del TPV.

### `SalaEditorReadonlyMap`

`SalaEditorReadonlyMap` renderiza capas V2 en modo readonly:

- zonas;
- superficies;
- muros;
- estructura;
- paisajismo;
- decorativos;
- elementos operativos visuales segun modo.

Debe ser no interactivo y no capturar eventos de operacion.

### `SalaOperationalElementVisual`

`SalaOperationalElementVisual` proporciona la representacion visual V2 de mesas y otros elementos operativos.

En TPV, su visual puede recibir estado operativo desde la capa TPV, pero no decide ese estado.

### Capa Operativa

TPV mantiene la capa operativa para:

- clicks;
- seleccion de mesa;
- apertura de comanda;
- estados;
- pagos;
- acciones runtime;
- fallback.

### `ElementCard` Invisible Solo Con Paridad

`ElementCard` puede quedar invisible/interaccion-only solo cuando existe match seguro entre mesa legacy y visual V2.

Si no hay match seguro, debe seguir visible como fallback.

### Hitbox Seguro

La hitbox operativa debe corresponder al visual visible.

La paridad requiere:

- misma mesa operativa;
- geometria compatible;
- transform/rotacion coherentes;
- escala y origen alineados;
- ausencia de ambiguedad entre instancias.

Si la paridad no se puede garantizar, se usa fallback visible legacy.

### Viewport Plan-Based

El viewport del TPV debe basarse en el plano completo (`planWidth`/`planHeight` o contrato equivalente), no solo en mesas visibles.

Esto evita que zonas, decorativos o espacios sin mesas queden fuera de encuadre y mantiene escala estable entre Editor V2 y TPV.

---

## 7. Zonas Y Decorativos Readonly

Zonas y decorativos pueden mostrarse en TPV como contexto visual readonly.

Reglas:

- no capturan interaccion operativa;
- no deciden ocupacion;
- no alteran pedidos, pagos ni reservas;
- ayudan a orientarse;
- deben mantener jerarquia visual: operacion > espacio > ambiente.

---

## 8. Lo Que No Declara Este Contrato

Este contrato no declara:

- eliminacion total de legacy;
- eliminacion de `EditableFloorMap`;
- atomicidad global de publicacion;
- colaboracion realtime;
- que todas las funciones futuras esten implementadas;
- que TPV edite Documento V2;
- que Publisher sea fuente visual canonica;
- que una mesa visual sea automaticamente una mesa operativa sin validacion.

---

## 9. Reglas Sagradas

- `restaurantId` es frontera obligatoria en todo paso.
- Editor V2 edita visual; TPV opera servicio.
- Documento V2 es visual canonico; runtime operativo no vive en Documento V2.
- Publisher traduce, valida y preserva compatibilidad.
- `tables/{id}` sigue siendo identidad operativa para servicio.
- Legacy sigue como fallback seguro mientras existan restaurantes o casos sin paridad V2.
- No hard delete por cambios visuales.
- Si hay duda, se conserva operacion.
- Si hay conflicto, se reporta; no se inventa solucion silenciosa.

---

## 10. Decision Final

Hostly debe cerrar Editor V2 y TPV como una sola experiencia espacial:

```text
Editor V2 construye el restaurante.
Documento V2 conserva la verdad visual.
Publisher sincroniza compatibilidad operativa.
TPV opera el servicio usando visual V2 cuando es seguro.
Legacy protege fallback y continuidad.
```

La meta no es borrar legacy de golpe.

La meta es que, para el restaurante, el espacio que configura y el espacio que usa durante el servicio sean el mismo, sin poner en riesgo comandas, pagos, reservas, KDS ni ocupacion.