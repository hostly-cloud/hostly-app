# HOSTLY_EDITOR_PRODUCT_STRATEGY

> Estrategia oficial de producto para la siguiente etapa del Editor V2 de Hostly.

**Estado:** documento maestro de estrategia de producto
**Ambito:** direccion 12-24 meses del Editor V2
**Autoridad:** complementa `HOSTLY_EDITOR_PRODUCT_MANIFESTO.md`, `HOSTLY_EDITOR_TASK_MODEL.md`, `HOSTLY_EDITOR_INTERACTION_MODEL.md`, `HOSTLY_EDITOR_EXPERIENCE_GUIDELINES.md` y `HOSTLY_EDITOR_HUMANIZATION_ROADMAP.md`
**Horizonte:** preparacion para lanzamiento comercial y crecimiento posterior
**Ultima revision:** 2026-07-05

**Relacion con el estado actual:** este documento separa estrategia de producto, estado consolidado y roadmap. No acelera funcionalidades ni sustituye el contrato tecnico Editor V2 -> TPV.

---

## 1. Proposito

Este documento define la estrategia de producto del Editor V2 para los proximos 12-24 meses.

No es un backlog. No es una especificacion tecnica. No describe implementacion. No enumera tareas pequenas.

Define que debe madurar para que el Editor V2 pueda venderse como una de las grandes fortalezas de Hostly.

La pregunta central es:

**Que debe ocurrir para que un restaurante vea el Editor V2 y piense: esto puede ayudarme a operar mejor mi negocio?**

La estrategia parte de una premisa:

La arquitectura ya esta aprobada.

El siguiente reto no es demostrar capacidad interna. El reto es convertir esa capacidad en una experiencia comercial clara, fiable y deseable.

## 1.1 Estado Consolidado Actual

En la etapa actual, el Editor V2 ya no debe tratarse como un experimento visual aislado. La arquitectura consolidada distingue:

- `Documento V2` como fuente visual canonica del sistema espacial.
- Editor V2 como modo edicion.
- TPV como modo operacion.
- `SalaEditorReadonlyMap` como renderer readonly compartido para lectura visual.
- `SalaOperationalElementVisual` como base visual de elementos operativos.
- `EditableFloorMap` como capa operativa e interaccion legacy/fallback.
- Vinculo de espacios mediante `legacyFloorPlanId`.
- Vinculo de mesas mediante `legacyTableId`.
- Creacion controlada de mesas nuevas mediante ids deterministas `v2-table-*`.
- Publicacion hacia `floorPlans`, `tables` y `zones`.
- Zonas, decorativos y estructura visibles como capas readonly cuando hay contrato visual.
- Viewport basado en el plano completo, no solo en contenido visible.
- Duplicacion segura de espacios e instancias, sin copiar vinculos runtime indebidos.
- Renombrado y reordenacion de espacios como operaciones de documento V2.

Esto no significa que legacy haya desaparecido. Legacy sigue siendo compatibilidad y fallback seguro, pero no debe ser la fuente visual principal cuando hay paridad V2 valida.

## 1.2 Fases Actuales Del Editor

Las fases visibles del Editor ordenan la creacion del restaurante, pero no deben imponerse como lenguaje mental del usuario:

- **Base:** tamano, lienzo y forma general del espacio.
- **Terreno:** superficies y contexto fisico.
- **Zonas:** areas reconocibles u operativas, opcionales.
- **Estructura:** muros, puertas, columnas y elementos que condicionan.
- **Paisajismo:** ambiente reconocible sin competir con la operacion.
- **Operacion:** mesas, barras, recepcion, estaciones y puntos de servicio.

La estrategia debe permitir uno o varios planos/espacios. No todos los restaurantes necesitan zonas, y no todas las zonas deben convertirse en entidad operativa.

## 1.3 Implementado, Validado, Pendiente Y Futuro

**Implementado en la arquitectura actual:**

- documento V2 editable;
- fases principales del editor;
- enlace de espacios y mesas con compatibilidad legacy;
- renderer readonly compartido para TPV;
- paridad visual/hitbox como criterio de render;
- fallback visible legacy cuando no hay match seguro;
- viewport plan-based;
- renombrado, reordenacion y duplicacion segura de espacios;
- publicacion controlada hacia entidades legacy compatibles.

**Validado como decision vigente:**

- Editor V2 y TPV son dos modos de una misma experiencia espacial.
- La operacion real pertenece al TPV y dominios operativos.
- El Documento V2 manda sobre la representacion visual editable.
- Legacy se conserva como compatibilidad y seguridad.
- Tablet y touch son requisitos de producto, no extras.

**Pendiente de consolidacion/QA:**

- pruebas manuales completas de publicacion de mesas nuevas `v2-table-*`;
- auditoria recurrente de idempotencia del Publisher;
- cobertura automatizada de contratos visuales y de hitbox;
- retirada gradual de rutas legacy solo cuando el fallback ya no sea necesario.

**Futuro:**

- automatizaciones avanzadas;
- IA visible para sugerir espacios o distribuciones;
- colaboracion realtime;
- bibliotecas masivas o marketplace de elementos;
- precision profesional avanzada.

Nada futuro debe venderse como implementado ni priorizarse por encima de estabilidad, touch, publicacion segura y operacion real.

---

## 2. Tesis Estrategica

El Editor V2 debe convertirse en la pieza que diferencia Hostly de un TPV tradicional y de un software generico de gestion.

Un TPV clasico muestra mesas.

Hostly debe ayudar a construir, entender y operar el restaurante.

Esa diferencia solo sera creible comercialmente si el Editor cumple tres condiciones:

1. Es facil de entender en el primer minuto.
2. Permite crear un restaurante operativo sin pensar en sistemas internos.
3. Hace que mesas, servicio y espacio trabajen juntos con claridad.

La estrategia de los proximos 12-24 meses no debe centrarse en ampliar el Editor.

Debe centrarse en consolidarlo.

Hostly no necesita parecer mas grande.

Necesita parecer inevitablemente util.

---

## 3. Objetivo De Producto Para La Siguiente Etapa

El objetivo no es que el Editor pueda representar cualquier cosa.

El objetivo es que represente lo importante con una experiencia excelente.

Durante esta etapa, Hostly debe conseguir que un encargado pueda:

- crear sus espacios principales;
- marcar lo que condiciona la distribucion;
- colocar mesas con rapidez;
- organizar el servicio;
- hacer reconocible el restaurante;
- entender si el plano ya sirve para trabajar;
- usarlo con confianza en escritorio y tablet;
- explicar el plano a su equipo sin traducir conceptos tecnicos.

El Editor estara preparado para venderse como fortaleza cuando deje de sentirse como un modulo avanzado y empiece a sentirse como una forma natural de montar un restaurante.

---

## 4. Bloques Estrategicos De Trabajo

Los siguientes bloques ordenan la evolucion del Editor V2 por madurez de producto.

No son epicas tecnicas.

Son areas de consolidacion que deben guiar decisiones de producto, UX, diseno, QA y comunicacion comercial.

---

## 5. Prioridad 1 - Consolidacion Del Modelo Mental

### Por que es prioritario

El Editor no puede venderse como fortaleza si el usuario todavia debe pensar en fases, categorias internas o herramientas.

La humanizacion del lenguaje ha mejorado la percepcion, pero el paso decisivo es que la experiencia completa se organice alrededor de tareas reales:

- Crear mis espacios.
- Marcar lo que condiciona.
- Colocar mis mesas.
- Organizar mi servicio.
- Hacerlo reconocible.

### Resultado esperado

El usuario debe narrar su avance con frases de restaurante:

"Ya tengo la sala."

"Ya marque puertas y limites."

"Ya coloque las mesas."

"Ya se como trabaja el equipo."

"Ya reconozco la terraza."

No debe narrarlo con frases de editor:

"Cambie de fase."

"Seleccione una herramienta."

"Use una categoria."

"Active una capa."

### Criterio de madurez

Este bloque estara maduro cuando un usuario nuevo pueda explicar que esta haciendo sin usar lenguaje tecnico ni preguntar en que seccion esta.

---

## 6. Prioridad 2 - Excelencia En Colocar Mesas

### Por que es prioritario

Las mesas son el centro operativo del Editor.

Si colocar mesas no es rapido, claro y comodo, el Editor no puede considerarse comercialmente fuerte.

Esta tarea concentra la promesa principal de Hostly: convertir un espacio en una operacion visual.

### Resultado esperado

El usuario debe poder distribuir mesas de diferentes capacidades, entender pasillos, relacionarlas con barra y recepcion, y llegar rapido a una sala util.

Debe sentir:

"Puedo preparar mi sala para abrir."

No:

"Estoy colocando objetos uno por uno."

### Criterio de madurez

Este bloque estara maduro cuando crear una distribucion real de mesas se perciba como una tarea fluida, no repetitiva ni delicada.

La sala debe sentirse lista cuando mesas, capacidad, pasos y lectura general estan claros.

---

## 7. Prioridad 3 - Servicio Como Diferenciador

### Por que es prioritario

Organizar el servicio es lo que separa Hostly de un editor de planos.

Barra, recepcion, estaciones, punto de recogida y circulacion no son objetos decorativos. Son la forma en que el equipo trabaja.

Si esta tarea madura, Hostly deja de ser "un plano bonito con mesas" y se convierte en una herramienta operativa.

### Resultado esperado

El usuario debe entender:

- donde se recibe al cliente;
- donde se atiende;
- donde se recoge;
- como se mueve el equipo;
- que zonas quedan bien cubiertas;
- que pasos deben quedar libres;
- como se relacionan mesas y puntos de servicio.

### Criterio de madurez

Este bloque estara maduro cuando el usuario pueda mirar el plano y decir:

"Mi equipo puede trabajar aqui."

No basta con colocar puntos de servicio. Debe entenderse su relacion con la sala.

---

## 8. Prioridad 4 - Claridad De Condicionantes

### Por que es prioritario

Antes de montar mesas, el usuario necesita saber que condiciona el espacio: muros, puertas, columnas, accesos, separadores, cristales, limites y zonas no ocupables.

El riesgo es que esta tarea se sienta como arquitectura.

Hostly debe convertir esos elementos en decisiones operativas.

### Resultado esperado

El usuario debe poder marcar:

- por donde se entra;
- que puerta debe quedar libre;
- donde hay un limite fisico;
- que columna molesta;
- que paso no debe bloquearse;
- que separador divide ambientes;
- que zona no se puede ocupar.

### Criterio de madurez

Este bloque estara maduro cuando el usuario sienta:

"Ya se donde puedo montar la sala."

No:

"Estoy dibujando estructura."

---

## 9. Prioridad 5 - Identidad Visual Subordinada A Operacion

### Por que es prioritario

Hostly debe permitir que el usuario reconozca su restaurante. Esto es comercialmente muy potente: un plano propio genera confianza y vinculacion.

Pero tambien es peligroso. Materiales, vegetacion y ambiente pueden convertir el Editor en decoracion si ganan demasiado peso.

### Resultado esperado

El usuario debe poder distinguir sala, terraza, jardin, playa, rooftop, piscina o lounge sin perder lectura de mesas y servicio.

El ambiente debe responder a:

"Esto me ayuda a reconocer mi restaurante."

No a:

"Estoy decorando el plano."

### Criterio de madurez

Este bloque estara maduro cuando el plano pueda ser reconocible y atractivo sin que el ambiente compita con la operacion.

---

## 10. Prioridad 6 - Experiencia Tactil Y De Trabajo Real

### Por que es prioritario

Hostly es un producto para hosteleria. El uso no siempre sera tranquilo, sentado y con precision de escritorio.

Tablet, portatil tactil y contextos de preparacion real importan.

Un editor que funciona solo con punteria fina no esta suficientemente alineado con hosteleria.

### Resultado esperado

El usuario debe poder tocar, mover, seleccionar, ajustar y corregir con confianza.

La experiencia tactil debe sentirse comoda, no simplemente compatible.

### Criterio de madurez

Este bloque estara maduro cuando las tareas principales puedan completarse en tablet sin frustracion, exceso de precision o miedo a equivocarse.

---

## 11. Prioridad 7 - Validacion Operativa Con Casos Reales

### Por que es prioritario

El Editor no puede validarse solo con escenarios ideales.

Debe probarse contra restaurantes reales:

- bares pequenos;
- cafeterias;
- restaurantes gastronomicos;
- terrazas urbanas;
- rooftops;
- chiringuitos;
- beach clubs;
- hoteles;
- resorts;
- locales con varias zonas;
- locales con restricciones fisicas.

### Resultado esperado

Hostly debe demostrar que el Task Model aguanta variedad sin volverse tecnico ni pesado.

### Criterio de madurez

Este bloque estara maduro cuando el Editor permita representar varios tipos de establecimiento sin cambiar de idioma mental ni introducir complejidad visible innecesaria.

---

## 12. Prioridad 8 - Preparacion Comercial Y Narrativa De Producto

### Por que es prioritario

Para vender el Editor como fortaleza, Hostly necesita una narrativa clara.

No debe venderse como "editor de planos".

Debe venderse como:

**la forma visual de construir, entender y operar tu restaurante.**

### Resultado esperado

El producto debe poder demostrarse con una historia simple:

1. Creo mis espacios.
2. Marco lo que condiciona.
3. Coloco mis mesas.
4. Organizo mi servicio.
5. Lo hago reconocible.

La demo comercial debe sonar como hosteleria, no como software.

### Criterio de madurez

Este bloque estara maduro cuando un cliente entienda el valor del Editor sin una explicacion larga sobre como funciona.

---

## 13. Que No Deberia Desarrollarse Todavia

Durante esta etapa, Hostly debe retrasar funcionalidades atractivas que puedan dispersar el foco.

### 13.1 Automatizaciones avanzadas

No deben priorizarse hasta que la experiencia manual base sea excelente.

Automatizar una experiencia todavia confusa solo oculta el problema.

### 13.2 IA visible como promesa principal

La IA puede ser futura ventaja, pero no debe presentarse como sustituto de claridad operativa.

Antes de que Hostly sugiera o genere, debe permitir construir bien.

### 13.3 Biblioteca masiva de objetos

No conviene ampliar por cantidad.

Una biblioteca grande puede hacer que el producto parezca mas completo, pero tambien mas pesado.

### 13.4 Render avanzado o realismo visual

El Editor no debe perseguir hiperrealismo antes de consolidar legibilidad.

El riesgo es acercarse a una maqueta visual y alejarse de la operacion.

### 13.5 Tipologias demasiado especializadas

Antes de cubrir casos extremos, Hostly debe dominar los casos frecuentes.

El producto debe crecer desde un nucleo solido, no desde excepciones.

### 13.6 Configuracion profesional avanzada

Opciones profundas de precision, reglas o configuracion deben retrasarse si obligan al usuario medio a pensar como tecnico.

### 13.7 Personalizacion visual excesiva

Colores, materiales y variantes deben crecer con criterio.

La identidad importa, pero la operacion manda.

### 13.8 Multiplicar modos de trabajo

Demasiados modos aumentan carga mental.

La estrategia debe priorizar intenciones estables, no modos acumulativos.

---

## 14. Criterios De Lanzamiento Comercial

El Editor V2 estara listo para venderse como una gran fortaleza de Hostly cuando cumpla estos criterios de experiencia.

### 14.1 Criterio de primer minuto

Un usuario nuevo entiende rapidamente que esta construyendo su restaurante, no aprendiendo un editor.

Debe poder empezar sin preguntar que fase toca.

### 14.2 Criterio de primer plano util

El usuario puede llegar pronto a un espacio reconocible con mesas claras.

No necesita configurar detalles secundarios antes de obtener valor.

### 14.3 Criterio de mesas

Colocar y distribuir mesas de varias capacidades se siente rapido, claro y operativo.

La mesa no se percibe como un objeto mas.

### 14.4 Criterio de servicio

Barra, recepcion, estaciones y recogida se entienden como parte del trabajo del equipo.

El servicio no parece decoracion ni categoria secundaria.

### 14.5 Criterio de condicionantes

Muros, puertas, accesos, columnas y separadores se entienden como limites y restricciones operativas.

No como dibujo arquitectonico.

### 14.6 Criterio de reconocimiento

El usuario puede hacer que el plano se parezca a su local sin que ambiente, materiales o vegetacion compitan con mesas.

### 14.7 Criterio tactil

Las tareas principales pueden completarse de forma comoda en tablet o portatil tactil.

La experiencia no depende de precision excesiva.

### 14.8 Criterio de lenguaje

El Editor habla de restaurante:

- espacios;
- mesas;
- servicio;
- barra;
- accesos;
- ambiente;
- terraza;
- sala;
- recepcion.

No habla de arquitectura interna.

### 14.9 Criterio de confianza comercial

El producto puede mostrarse a un cliente sin justificar su complejidad.

La demo debe sentirse natural.

### 14.10 Criterio de estabilidad conceptual

Cada nueva decision encaja en el Task Model y respeta:

**Operacion > Espacio > Ambiente.**

---

## 15. Secuencia Estrategica 12-24 Meses

### Fase A - Consolidar la comprension

Objetivo: que el usuario entienda el Editor desde las tareas reales, no desde el sistema.

Resultado: menor carga mental, mejor primer minuto, lenguaje estable.

### Fase B - Consolidar el corazon operativo

Objetivo: hacer excelentes las tareas de mesas y servicio.

Resultado: el Editor empieza a ser una fortaleza real de Hostly, no solo una capacidad visual.

### Fase C - Consolidar condicionantes e identidad

Objetivo: que limites, accesos y ambiente ayuden a montar y reconocer el restaurante sin competir con la operacion.

Resultado: planos mas claros, utiles y propios.

### Fase D - Validar en casos reales

Objetivo: probar la experiencia contra variedad de locales.

Resultado: confianza comercial y criterio para crecimiento.

### Fase E - Preparar narrativa de venta

Objetivo: convertir el Editor en una historia comercial simple, demostrable y diferenciadora.

Resultado: Hostly puede presentar el Editor como parte central de su propuesta.

---

## 16. Indicadores De Que La Estrategia Funciona

La estrategia funciona si empiezan a aparecer estas senales:

- Los usuarios hablan de su restaurante, no del editor.
- Las mesas se colocan sin friccion percibida.
- El servicio se entiende como parte natural del plano.
- Las dudas sobre categorias disminuyen.
- El ambiente se usa para reconocer, no para decorar.
- La tablet se siente viable para preparar espacios.
- Las demos comerciales requieren menos explicacion.
- Los clientes entienden rapido por que Hostly no es solo un TPV.
- El equipo interno evalua nuevas ideas contra el Task Model.
- El producto crece sin volver a exponer arquitectura interna.

---

## 17. Veredicto Estrategico

El Editor V2 ya tiene suficiente base para convertirse en una de las grandes fortalezas de Hostly.

Pero aun no deberia crecer por expansion.

Debe crecer por consolidacion.

Los proximos 12-24 meses deben estar gobernados por una idea:

**hacer que el Editor se sienta menos como una herramienta y mas como la forma natural de montar un restaurante.**

Cuando Hostly consiga eso, el Editor dejara de ser una funcionalidad avanzada y se convertira en una ventaja competitiva dificil de copiar.

No porque tenga mas objetos.

No porque tenga mas tecnologia.

Sino porque entendera mejor que nadie como piensa y trabaja la hosteleria real.
