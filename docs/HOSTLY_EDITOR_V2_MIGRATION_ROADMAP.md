# HOSTLY_EDITOR_V2_MIGRATION_ROADMAP

> Documento canonico de migracion entre el Editor Legacy de espacios/mesas y el Editor Sala V2.

**Estado:** roadmap tecnico canonico  
**Ambito:** Configuracion > Espacios, Editor Legacy, Editor Sala V2, TPV/Sala dependiente del mapa  
**Autoridad:** subordinado a `00_HOSTLY_PRODUCT_BIBLE.md`, `01_HOSTLY_ARCHITECTURE_GUIDE.md` y `09_HOSTLY_PATTERNS.md`  
**Ultima revision:** 2026-07-02  

---

## 1. Estado actual

Hostly convive actualmente con dos formas de configurar la sala:

1. **Editor Legacy**
   - Ruta principal de produccion para configuracion operativa real: `dashboard/configuracion/espacios/mesas`.
   - Incluye el Asistente de Salas y un editor avanzado basado en planos, zonas y elementos persistidos.
   - Es la fuente efectiva para los datos que hoy consumen TPV, mesas, sala y parte del mapa operativo.
   - Es funcional, pero mezcla responsabilidades de configuracion, persistencia, compatibilidad legacy, editor visual, asistente, publicacion y runtime operativo.

2. **Editor Sala V2**
   - Ruta preview: `dashboard/configuracion/espacios/editor-v2`.
   - Es la direccion de producto y arquitectura para el futuro Editor Oficial de Hostly.
   - Trabaja con el concepto canonico de **Espacio** como unidad central y con **Operational Space Engine (OSE)** como modelo conceptual de elementos operativos.
   - A dia de hoy funciona como editor local/preview: no escribe Firestore, no sustituye el modelo `floorPlans`/`tables`/`zones` y no esta conectado al runtime TPV.

La migracion no debe consistir en copiar el legacy dentro del V2. La Product Bible establece que Hostly no debe ser un editor tecnico que obliga al usuario a entender el modelo interno y que no se deben extender patrones legacy como arquitectura nueva. Por tanto, el objetivo de paridad es **paridad operativa**, no paridad visual ni paridad de deuda.

---

## 2. Funcionalidades del Editor Legacy

### 2.1 Asistente de Salas

El legacy incluye un asistente inicial para configurar un borrador de sala. Sus capacidades actuales son:

- Seleccion de tipo de negocio: restaurante, bar, cafeteria, beach club, hotel, rooftop, chiringuito, discoteca u otro.
- Seleccion de espacios iniciales.
- Preguntas sobre estructura: forma, paredes, barra y terraza conectada.
- Preguntas de ambiente: material, tono, suelo uniforme, desniveles y estilo.
- Preguntas de elementos estructurales: puertas, ventanas, columnas, escaleras, ascensor y obstaculos.
- Preguntas de elementos de servicio: barra, caja, recepcion, punto de camareros, recogida y espera.
- Preguntas de mesas: volumen aproximado, distribucion de tamanos, mesas altas, barra, terraza y exterior.
- Generacion de un borrador local en `sessionStorage`.
- Traduccion del borrador del asistente a un `FloorPlanWorkingDraft` compatible con el editor legacy.

### 2.2 Gestion de zonas

El legacy mantiene gestion explicita de zonas:

- Crear zona con nombre y color.
- Editar nombre y color.
- Eliminar zona si no esta en uso.
- Bloquear eliminacion cuando hay mesas/elementos asociados.
- Leer y escribir `zones` en Firestore por `restaurantId`.
- Asociar zonas a plano mediante `floorPlanId` cuando aplica.

### 2.3 Gestion de planos

El legacy soporta planos persistidos:

- Crear plano.
- Duplicar plano.
- Reordenar planos.
- Marcar plano por defecto o canonico.
- Activar/desactivar plano.
- Mostrar/ocultar plano en TPV.
- Resolver compatibilidad con elementos antiguos sin `floorPlanId` mediante ancla legacy.
- Gestionar dimensiones de canvas (`width`, `height`).

### 2.4 Editor visual avanzado

El legacy incluye un editor visual sobre `EditableFloorMap` con:

- Lienzo amplio con viewport.
- Zoom/fit/controles de vista.
- Colocacion de elementos sobre el plano.
- Movimiento y redimensionado de elementos.
- Seleccion e inspector contextual.
- Quick actions flotantes.
- Paneles de guia/ayuda del editor.
- HUD de seleccion.
- Layout toolbar.
- Capacidad de trabajar con elementos operativos y decorativos.

### 2.5 Elementos del plano

El modelo legacy persiste elementos en `tables`, aunque no todos sean mesas:

- `table`
- `sunbed`
- `bed`
- `custom`
- `wall`
- `bar`
- `column`
- `pool`
- `door`
- `planter`

Campos relevantes:

- `restaurantId`
- `floorPlanId`
- `name`
- `type`
- `status`
- `zone`, `zoneId`, `zoneName`
- `tableShape`
- `seats`
- `x`, `y`
- `width`, `height`
- `locked`
- `isActive`
- asignaciones operativas de sala/TPV cuando existen

### 2.6 Publicacion

El legacy dispone de contrato de publicacion:

- Cargar baseline publicado.
- Publicar `FloorPlanWorkingDraft`.
- Escribir dimensiones de plano en `floorPlans/{floorPlanId}`.
- Escribir layout de elementos en `tables/{id}`.
- Marcar `isActive:false` para elementos retirados del borrador.
- Actualizar/crear zonas modificadas.

No cubre todavia de forma completa:

- activity logs durables.
- snapshots completos como fuente canonica.
- idempotencia durable de publicacion.
- rollback operativo formal.

---

## 3. Funcionalidades actuales del Editor Sala V2

### 3.1 Navegacion y modelo mental

El V2 ya tiene una estructura por fases:

1. **Espacios**
2. **Estructura**
3. **Operacion**

Capacidades actuales:

- Stepper visual por fases.
- Fases bloqueadas hasta tener espacio activo cuando aplica.
- Panel izquierdo por contexto.
- Inspector condicional.
- Selector compacto de espacio en Estructura y Operacion.
- El espacio activo se trata como workspace independiente de edicion.
- El marco del espacio activo se centra al seleccionarlo.

### 3.2 Espacios

El V2 introduce `SalaEspacio` como unidad central:

- `id`
- `restaurantId`
- `name`
- `tipo`
- `color`
- `sortOrder`
- `visible`
- `active`
- puentes de migracion `legacyFloorPlanId` y `legacyZoneId`

Capacidades actuales:

- Crear espacios en memoria local.
- Seleccionar espacio.
- Editar nombre, tipo, color, visibilidad y actividad en inspector.
- Ordenar visualmente por `sortOrder`.
- Reforzar identidad visual del espacio mediante nombre y color.
- Preparar scope/key interno por espacio sin persistencia.

### 3.3 Estructura

Herramientas disponibles en toolbox:

- Pared.
- Cristal.
- Puerta.
- Barra.
- Jardinera.
- Separador.

Capacidades actuales:

- Dibujar segmentos de pared en memoria local.
- Seleccionar paredes.
- Limpiar seleccion de pared al cambiar de espacio.
- Mostrar placeholders para herramientas estructurales aun no implementadas.

### 3.4 Operacion / OSE

Catalogo operativo V2:

- Mesa.
- Mesa alta.
- Taburete de barra.
- Sofa.
- Hamaca.
- Cama balinesa.
- Sala privada.
- Cabana.
- Punto de recogida.
- Personalizado.

Capacidades actuales:

- Seleccionar tipo operativo.
- Colocar instancia en el lienzo.
- Nombrado automatico.
- Seleccionar instancia.
- Diferenciar tap de drag mediante touch slop.
- Mover instancia.
- Redimensionar instancia mediante handles.
- Duplicar instancia.
- Eliminar instancia.
- Mantener tamano visual en metadata local.
- Toolbar flotante con transicion.
- Feedback visual durante mover y redimensionar.
- Hit areas tactiles ampliadas.

### 3.5 Persistencia

El V2 no escribe Firestore actualmente. Su documento de trabajo es local:

- `SalaEditorDocument`.
- `espacios`.
- `walls`.
- `structuralElements`.
- `operationalElements`.
- `operationalElementInstances`.
- `navigation`.

Esto es deliberado: el V2 todavia no es fuente de verdad de produccion.

---

## 4. Matriz de paridad funcional

| Area | Legacy | V2 actual | Estado | Paridad requerida |
| --- | --- | --- | --- | --- |
| Acceso desde configuracion | Produccion en Mesas/Zonas | Preview en Editor V2 | Parcial | V2 debe ser entrada principal y legacy secundario |
| Concepto de espacio | Planos + zonas + mesas | `SalaEspacio` canonico | Parcial | Mapear espacios a planos/zonas sin perder compatibilidad |
| Crear espacio/plano | Si, persistido | Si, local | Parcial | Crear espacio persistible con contrato de migracion |
| Editar nombre/color | Zonas/planos | Espacios | Parcial | Persistir cambios equivalentes |
| Gestion de zonas | CRUD persistido | No como entidad editable independiente | Parcial | Convertir zona legacy en concepto derivado o subordinado a espacio |
| Multi-plano | Si | Workspaces por espacio preparados | Parcial | Cada espacio debe poder actuar como plano independiente |
| Canvas/lienzo | Persistido con dimensiones | Lienzo local por espacio | Parcial | Definir canvas por espacio y persistirlo |
| Zoom/fit | Si | No | Pendiente | Requerido antes de oficializar |
| Snap/grid | Si/impl. legacy | No consolidado | Pendiente | Requerido para edicion profesional |
| Undo/redo | Legacy avanzado segun editor | No | Pendiente | Requerido antes de reemplazar legacy |
| Drag | Si | Si | Parcial | Consolidar con persistencia y constraints |
| Resize | Si | Si | Parcial | Consolidar con persistencia y constraints |
| Rotacion | Si/legacy | Placeholder V2 | Pendiente | Requerida para paridad visual minima |
| Bloqueo de elementos | Campo legacy `locked` | Placeholder V2 | Pendiente | Requerido |
| Duplicar | Si | Si local | Parcial | Persistir e integrar con historial |
| Eliminar/desactivar | Si (`isActive`) | Eliminar local | Parcial | Definir baja logica compatible |
| Mesas | Si | Si como OSE `TABLE` | Parcial | Mapear `table` a `TABLE` |
| Hamacas/camas | Si | Si `SUNBED`, `BALINESE_BED` | Parcial | Mapear `sunbed`/`bed` |
| Barra | Elemento decorativo/servicio | Herramienta estructural y posible operativo futuro | Parcial | Decidir si barra es estructura, operativo o ambos |
| Puertas | Si | Toolbox estructural placeholder | Pendiente | Implementar colocacion/dimension/rotacion |
| Paredes | Si como elemento plano | Segmentos locales | Parcial | Persistir segmentos y mapear legacy |
| Columnas | Si | No explicito | Pendiente | Incorporar o declarar no migrable segun producto |
| Piscina | Si | No explicito | Pendiente | Incorporar como estructura/ambiente si aplica |
| Jardineras | Si | Toolbox placeholder | Pendiente | Implementar |
| Elemento custom | Si | Si `CUSTOM` | Parcial | Persistencia y metadata |
| Inspector | Si | Si condicional | Parcial | Completar todos los campos persistibles |
| Asistente de salas | Si | No integrado | Pendiente | Migrar como generador de documento V2 |
| Publicacion | Si | No | Pendiente critico | Requerido para produccion |
| Carga desde Firestore | Si | Solo preview/initial espacios | Pendiente critico | Requerido |
| Guardado en Firestore | Si | No | Pendiente critico | Requerido |
| TPV consume resultado | Si | No | Pendiente critico | Requerido |
| Compatibilidad datos legacy | Si | Puentes tipados, sin adaptador completo | Pendiente critico | Requerido |
| Aislamiento `restaurantId` | Si | Tipado local | Parcial | Requerido en todo I/O |
| Touch first | Parcial | Mejorado | Parcial | Validacion tablet/Windows antes de oficializar |

---

## 5. Backlog priorizado hasta 100 % de paridad

### P0 - Fundacion de migracion segura

1. **Especificacion de modelo de salida V2**
   - Definir el documento canonico persistible del Editor Sala V2.
   - Decidir si se escribe inicialmente sobre `floorPlans`/`tables`/`zones` mediante adaptador o si se introduce una nueva coleccion canonica con publicacion hacia legacy.
   - Mantener `restaurantId` como frontera obligatoria.

2. **Adaptador de lectura legacy -> V2**
   - Leer `floorPlans`, `tables` y `zones`.
   - Convertir plano/zonas legacy a `SalaEspacio`.
   - Convertir elementos `tables` a instancias OSE/estructurales.
   - Preservar ids legacy en metadata/puentes.

3. **Adaptador de escritura/publicacion V2 -> legacy**
   - Publicar cambios V2 hacia el modelo que hoy consume TPV.
   - Mantener compatibilidad con `tables`, `zones` y `floorPlans`.
   - No cambiar runtime TPV en esta fase.

4. **Carga inicial real del Editor V2**
   - Abrir V2 con datos actuales del restaurante.
   - Mostrar warning si hay elementos legacy no representables.
   - Modo solo lectura si el adaptador detecta inconsistencias.

### P1 - Paridad operativa minima

5. **Persistencia de espacios**
   - Crear, editar, ordenar, activar/desactivar y ocultar espacios.
   - Mantener equivalencia con planos/zonas legacy mientras dure coexistencia.

6. **Persistencia de elementos operativos**
   - Crear, mover, redimensionar, duplicar, eliminar/desactivar.
   - Persistir capacidad, nombre, tipo, estado visual, zona/espacio y metadata necesaria.

7. **Inspector completo**
   - Nombre.
   - Tipo.
   - Capacidad/asientos.
   - Estado visible/activo.
   - Zona/espacio.
   - Bloqueo.
   - Dimensiones y posicion cuando proceda.

8. **Publicacion con baseline**
   - Cargar baseline publicado.
   - Comparar borrador vs baseline.
   - Publicar de forma batch.
   - Reportar cambios antes de aplicar.

9. **Validacion de consumo TPV**
   - Confirmar que TPV y Sala renderizan correctamente elementos publicados desde V2.
   - Confirmar estados `free`, `occupied`, `reserved`.
   - Confirmar elementos no operativos no aparecen como mesas cobrables.

### P2 - Paridad de edicion profesional

10. **Zoom, fit y pan**
    - Fit al espacio activo.
    - Zoom tactil/trackpad.
    - Pan sin interferir con drag.

11. **Snap/grid**
    - Snap configurable o fijo.
    - Grid visual coherente.
    - Snap compatible con touch.

12. **Undo/redo**
    - Historial local por espacio.
    - Acciones reversibles: crear, mover, resize, rotar, duplicar, borrar.
    - Reset del historial al publicar/cargar baseline.

13. **Rotacion**
    - Rotar elementos operativos y estructurales.
    - Persistir angulo.
    - Hit areas tactiles.

14. **Bloqueo**
    - Bloquear/desbloquear elementos.
    - Evitar movimiento/resize accidental.
    - Persistir `locked` o equivalente.

15. **Seleccion multiple**
    - Solo si existe una accion real: mover grupo, alinear, duplicar, borrar.
    - Debe ser dificil de activar por accidente en tablet.

### P3 - Estructura y decoracion

16. **Puertas, cristales, barras, jardineras y separadores**
    - Implementar colocacion real.
    - Definir si cada tipo es estructural, decorativo u operativo.
    - Persistir segun adaptador.

17. **Columnas y piscina**
    - Decidir producto: migrar como elementos estructurales/de ambiente o declararlos legacy-readonly.
    - Implementar solo si tienen valor operativo real.

18. **Paredes persistibles**
    - Convertir segmentos locales en estructura persistible.
    - Mapear legacy `wall` rectangular cuando sea posible.

### P4 - Asistente y onboarding

19. **Asistente V2**
    - Reutilizar preguntas utiles del asistente legacy.
    - Generar directamente un `SalaEditorDocument` V2.
    - No depender de `sessionStorage` como contrato canonico.

20. **Importacion asistida desde legacy**
    - Mostrar resumen de datos detectados.
    - Indicar elementos convertidos, aproximados y no migrables.
    - Permitir revision antes de publicar.

### P5 - Gobierno de retirada

21. **Telemetria de uso**
    - Medir aperturas de legacy vs V2.
    - Medir publicaciones V2 exitosas/fallidas.
    - Medir restaurantes con datos no convertibles.

22. **Modo legacy read-only**
    - Mantener acceso para consulta y emergencia.
    - Bloquear nuevas ediciones cuando V2 sea oficial.

23. **Retirada definitiva**
    - Eliminar entrada principal al legacy.
    - Mantener adaptadores de lectura durante ventana definida.
    - Eliminar codigo legacy solo con evidencia de cero dependencias.

---

## 6. Orden exacto de migracion

1. Congelar alcance funcional del legacy: no anadir nuevas capacidades al editor antiguo salvo fixes criticos.
2. Documentar el contrato de datos actual: `floorPlans`, `tables`, `zones` y campos consumidos por TPV/Sala.
3. Crear fixtures reales anonimizados de restaurantes con configuraciones simples, medias y complejas.
4. Implementar adaptador de lectura legacy -> documento V2 en modo solo lectura.
5. Validar visualmente que V2 representa los fixtures sin escribir Firestore.
6. Implementar persistencia de borrador V2 sin afectar TPV.
7. Implementar publicacion V2 -> modelo legacy consumido por TPV.
8. Ejecutar publicacion en entorno controlado con restaurantes de prueba.
9. Comparar TPV/Sala antes y despues de publicar desde V2.
10. Completar P1 de paridad operativa minima.
11. Completar P2 de edicion profesional: zoom, snap, undo/redo, rotacion y bloqueo.
12. Completar P3 solo para elementos que aportan valor operativo.
13. Integrar Asistente V2 como generador de documento V2, no como generador legacy.
14. Activar V2 como editor recomendado para restaurantes internos/beta.
15. Mantener legacy como fallback editable durante la beta.
16. Medir publicaciones, errores, restauraciones y soporte.
17. Convertir legacy a modo secundario/read-only cuando V2 alcance criterios objetivos.
18. Cambiar navegacion principal: `Editor V2` pasa a `Editor de Sala`; legacy queda en acceso de recuperacion.
19. Retirar escritura legacy tras ventana de estabilidad.
20. Eliminar codigo legacy solo cuando no haya consumidores, dependencias ni datos no migrados.

---

## 7. Funcionalidades que nunca se migraran

Estas capacidades no deben migrarse tal cual al V2:

- Mezclar elementos decorativos y mesas operativas bajo una entidad llamada `tables`.
- Depender de `sessionStorage` como contrato entre asistente y editor.
- Mantener dos pantallas separadas para zonas y mesas como experiencia principal.
- Exponer al usuario conceptos tecnicos como `floorPlanId`, ancla legacy o campos de compatibilidad.
- Crear fallbacks silenciosos que oculten datos corruptos o incompletos.
- Copiar el editor avanzado legacy como un componente monolitico dentro del V2.
- Usar zonas como sustituto ambiguo de espacio cuando el usuario piensa en salas, terrazas, barras o piscinas.
- Permitir borrar zonas/espacios con elementos asociados sin flujo claro de reasignacion.
- Mantener elementos no operativos como si fueran mesas cobrables.
- Introducir una tercera variante persistente de mesas/planos sin estrategia explicita de lectura, publicacion y retirada.

---

## 8. Estrategia de coexistencia

Durante la migracion deben convivir ambos editores con responsabilidades claras:

### Legacy

- Sigue siendo fuente de verdad mientras V2 no publique de forma segura.
- Permanece disponible como fallback de produccion.
- No recibe nuevas funcionalidades de producto, solo correcciones criticas.
- Puede quedar en modo read-only cuando V2 alcance paridad operativa.

### Editor Sala V2

- Empieza como preview sin escritura.
- Pasa a beta cuando cargue datos legacy reales en modo lectura.
- Pasa a editor recomendado cuando pueda publicar y revertir con seguridad.
- Pasa a editor oficial cuando cumpla los criterios objetivos de este documento.

### Datos

- El runtime TPV no debe cambiar de fuente de datos hasta que exista publicacion V2 validada.
- Mientras TPV consuma `tables`/`floorPlans`/`zones`, V2 debe publicar hacia ese contrato o mantener un adaptador estable.
- Los puentes `legacyFloorPlanId` y `legacyZoneId` deben tratarse como transitorios, no como diseno definitivo.

### UX

- El usuario no debe elegir entre "modelo legacy" y "modelo V2".
- La interfaz debe decir "Editor de Sala" y, si hace falta, "Editor anterior" como fallback.
- Cualquier dato no migrable debe mostrarse como aviso accionable antes de publicar.

---

## 9. Estrategia de retirada definitiva del legacy

La retirada debe hacerse en fases:

### Fase 1 - Congelacion

- No anadir funciones nuevas al legacy.
- Documentar bugs conocidos.
- Mantener solo fixes de seguridad, datos o produccion.

### Fase 2 - Fallback editable

- V2 aparece como opcion recomendada.
- Legacy sigue permitiendo editar.
- Cada publicacion V2 debe ser comparable con el estado legacy.

### Fase 3 - Fallback read-only

- V2 es editor principal.
- Legacy permite inspeccionar y recuperar informacion.
- Las ediciones nuevas se bloquean salvo permiso interno o feature flag de emergencia.

### Fase 4 - Ocultacion

- Legacy desaparece de la navegacion principal.
- Acceso solo mediante ruta interna documentada.
- Soporte lo usa unicamente para diagnostico.

### Fase 5 - Eliminacion

- Solo se elimina cuando:
  - no hay trafico real al legacy;
  - no hay restaurantes con datos no convertibles;
  - TPV/Sala ya no dependen de contratos exclusivos del legacy;
  - existen backups/snapshots suficientes;
  - producto y soporte aceptan la retirada.

---

## 10. Criterios objetivos para declarar el Editor Sala V2 como Editor Oficial de Hostly

El Editor Sala V2 solo puede declararse oficial cuando se cumplan todos estos criterios:

### Datos y persistencia

- Carga restaurantes existentes desde datos reales.
- Publica cambios a la fuente consumida por TPV/Sala sin romper servicio.
- Preserva `restaurantId` en todas las lecturas y escrituras.
- Mantiene compatibilidad con mesas legacy sin `floorPlanId`.
- Gestiona espacios, elementos operativos, zonas/agrupaciones y estructura con contrato documentado.
- Tiene estrategia clara para datos no migrables.

### Paridad operativa

- Crear, editar, mover, redimensionar, rotar, duplicar, bloquear y eliminar/desactivar elementos.
- Crear y editar espacios.
- Gestionar visibilidad/actividad operativa.
- Asociar elementos a espacio/zona equivalente.
- Publicar y ver el resultado en TPV/Sala.
- No convertir elementos decorativos en mesas operativas por accidente.

### Experiencia de edicion

- Touch first validado en tablet.
- Compatible con raton y pantalla tactil Windows.
- Zoom/fit/pan estables.
- Snap/grid estables.
- Undo/redo fiable para acciones principales.
- Seleccion y manipulacion sin movimientos accidentales.
- Inspector claro y no tecnico.

### Seguridad y recuperacion

- Publicacion batch con baseline.
- Prevencion de perdida accidental de elementos.
- Camino de rollback o restauracion definido.
- Validaciones antes de publicar.
- Sin fallbacks silenciosos ante datos corruptos.

### Calidad tecnica

- TypeScript sin errores.
- Build sin errores.
- Tests o fixtures de caracterizacion para migracion legacy -> V2.
- Separacion clara entre UI, documento V2, adaptadores y persistencia.
- Sin logica Firestore dentro de componentes visuales.
- Sin nueva deuda que duplique legacy bajo nombres nuevos.

### Producto y soporte

- Restaurantes internos o beta pueden configurar una sala completa solo con V2.
- Soporte puede explicar el flujo sin mencionar entidades tecnicas.
- El Asistente V2 genera un borrador revisable.
- La navegacion principal ya no necesita "Mesas" y "Zonas" como tareas separadas para el usuario final.
- El equipo puede operar durante hora punta con mapas publicados desde V2.

---

## Decision canonica

El Editor Sala V2 sera el Editor Oficial de Hostly cuando alcance **paridad operativa completa**, no cuando copie todas las pantallas legacy.

El legacy debe seguir vivo mientras sea necesario para proteger produccion, pero no debe dirigir la arquitectura futura. La migracion correcta es:

1. leer legacy con precision;
2. representar en V2 con lenguaje de restaurante;
3. publicar de forma compatible;
4. validar en TPV/Sala;
5. retirar legacy por evidencia, no por deseo de limpieza.
