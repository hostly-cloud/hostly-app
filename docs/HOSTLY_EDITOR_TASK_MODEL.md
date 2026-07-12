# HOSTLY_EDITOR_TASK_MODEL

> Modelo oficial de tareas del Editor V2 de Hostly.

**Estado:** documento maestro de producto
**Ambito:** modelo conceptual de tareas e intenciones del Editor V2
**Autoridad:** complementa `HOSTLY_EDITOR_INTERACTION_MODEL.md`, `HOSTLY_EDITOR_EXPERIENCE_GUIDELINES.md` y `HOSTLY_EDITOR_HUMANIZATION_ROADMAP.md`
**Horizonte:** referencia para la evolucion del Editor durante los proximos anos
**Ultima revision:** 2026-07-05

**Relacion con el trabajo actual:** este documento define como pensar y trabajar sobre el Editor V2. Combina modelo mental de usuario con reglas operativas para cambios de producto, documentacion y codigo.

---

## 1. Proposito

Este documento define el modelo oficial de tareas del Editor V2 de Hostly.

No describe arquitectura. No describe pantallas. No describe componentes. No define implementacion. No explica como funciona el Editor por dentro.

Define como debe organizarse mentalmente la experiencia desde el punto de vista de una persona que quiere construir su restaurante.

La pregunta central no es:

**Como esta organizado el Editor?**

La pregunta central es:

**Que quiere hacer un encargado en cada momento?**

El Task Model existe para evitar que Hostly vuelva a organizar la experiencia visible por sistemas, fases, capas o categorias internas. La arquitectura puede seguir existiendo. El usuario no debe pensar en ella.

---

## 2. Principio Rector

El Editor V2 debe organizarse alrededor de intenciones humanas.

Una intencion es una frase que un encargado podria decir en voz alta mientras piensa en su restaurante:

- "Quiero crear mi sala."
- "Tengo una terraza."
- "Aqui iran las mesas."
- "Necesito una barra."
- "Esta puerta debe quedar libre."
- "Aqui no quiero mesas."
- "Esta zona es para reservas."
- "Quiero separar este ambiente."
- "Necesito que el equipo pueda pasar."
- "Quiero reconocer mi local de un vistazo."

Si una decision del Editor no puede traducirse a una frase asi, probablemente pertenece a la arquitectura interna y no al modelo visible.

---

## 3. Flujo Mental Ideal De Un Encargado

### 3.1 Antes de tocar nada

El encargado no empieza pensando en herramientas.

Empieza imaginando su local.

Piensa:

"Mi restaurante tiene una sala principal."

"Tengo una terraza que uso casi todo el ano."

"La barra esta a la izquierda."

"La entrada esta junto a recepcion."

"La cocina sale por el fondo."

"Hay una zona donde no quiero poner mesas."

"Necesito que se entienda rapido."

Su primera necesidad no es precision. Es reconocimiento.

Quiere que el plano empiece a parecerse a su negocio.

### 3.2 Primera decision: que espacios tengo

El encargado piensa en areas reales.

"Esta es la sala."

"Esta es la terraza."

"Este es el reservado."

"Esta parte es lounge."

"Aqui esta el comedor interior."

"Aqui empieza la zona exterior."

"Esta parte pertenece al hotel."

"Esta zona se abre solo por la noche."

Todavia no piensa en materiales, capas ni sistemas. Piensa en zonas que el equipo reconoce y utiliza.

Considera que esta tarea esta terminada cuando puede mirar el plano y decir:

"Estos son mis espacios principales."

### 3.3 Segunda decision: que condiciona el espacio

Despues piensa en lo que no se puede ignorar.

"Aqui hay un muro."

"Esta puerta se usa todo el tiempo."

"Por esta cristalera se sale a la terraza."

"Esta columna molesta."

"La barra condiciona la sala."

"Este separador divide dos ambientes."

"Este paso debe quedar libre."

"Aqui no cabe una mesa."

No piensa en elementos fijos como una familia tecnica. Piensa en condicionantes del restaurante.

Considera que esta tarea esta terminada cuando el plano ya marca lo que limita, guia o impide colocar cosas.

### 3.4 Tercera decision: donde se sienta la gente

Despues aparece el corazon del restaurante: las mesas.

Piensa:

"Aqui van las mesas de dos."

"Esta zona es de mesas de cuatro."

"Necesito una mesa grande de doce."

"Esta mesa corrida va junto a la pared."

"Estas mesas se pueden juntar."

"Aqui quiero mesas rapidas."

"Esta mesa no debe bloquear el paso."

"Desde aqui el camarero debe ver bien la sala."

Esta es la parte donde Hostly debe sentirse mas fluido, porque es la parte mas cercana a la operacion diaria.

Considera que esta tarea esta terminada cuando puede reconocer la capacidad y la distribucion principal del restaurante.

### 3.5 Cuarta decision: como trabaja el equipo

El encargado no solo coloca clientes. Organiza trabajo.

Piensa:

"Necesito una barra aqui."

"La recepcion debe ver la entrada."

"La estacion de camareros debe estar cerca de esta zona."

"El punto de recogida queda junto a la salida de cocina."

"Por aqui tiene que pasar el equipo."

"Este pasillo debe quedar limpio."

"Estas mesas no deben invadir la circulacion."

"La terraza necesita apoyo de servicio."

Aqui el plano deja de ser dibujo y se convierte en operacion.

Considera que esta tarea esta terminada cuando el equipo puede entender como moverse y donde trabajar.

### 3.6 Quinta decision: como reconozco el restaurante

Cuando el plano ya funciona, el encargado quiere que se parezca a su local.

Piensa:

"La terraza tiene jardineras."

"Aqui hay olivos."

"Esta zona tiene arena."

"La piscina queda al centro."

"Las sombrillas van en esta parte."

"El lounge debe sentirse distinto."

"La zona de entrada debe reconocerse."

"Este ambiente es mas tranquilo."

El ambiente no crea el restaurante por si solo. Lo hace reconocible.

Considera que esta tarea esta terminada cuando el plano ayuda a orientarse sin competir con mesas, servicio ni circulacion.

### 3.7 Cambio de contexto

El encargado cambia de contexto cuando una pregunta queda resuelta y aparece otra mas concreta.

Pasa de espacios a limites cuando ya sabe "donde esta cada area".

Pasa de limites a mesas cuando ya sabe "donde puede colocar".

Pasa de mesas a servicio cuando empieza a preguntarse "como se trabaja aqui".

Pasa de servicio a ambiente cuando el plano ya funciona y quiere hacerlo reconocible.

Pero este orden no debe ser obligatorio.

Un encargado puede volver atras:

- cambia la terraza despues de colocar mesas;
- mueve una barra porque interfiere con el paso;
- retira una jardinera porque molesta;
- cambia la mesa corrida porque rompe la circulacion;
- ajusta una puerta porque no se entiende el acceso.

Crear un restaurante es iterativo.

El modelo de tareas debe permitir volver, corregir y reorganizar sin que el usuario sienta que esta rompiendo el flujo.

---

## 4. Modelo Oficial De Tareas

El Editor V2 debe organizarse conceptualmente alrededor de cinco tareas principales.

Estas tareas no son fases obligatorias.

Son intenciones estables.

Pueden crecer durante anos sin depender de la arquitectura interna.

---

## Tarea 1 - Crear Mis Espacios

### Objetivo

Permitir que el usuario represente las areas principales de su restaurante.

Esta tarea responde a la pregunta:

**Que partes tiene mi negocio?**

### Que espera conseguir el usuario

El usuario espera poder decir:

- "Esta es mi sala."
- "Esta es mi terraza."
- "Este es mi reservado."
- "Aqui esta el lounge."
- "Esta zona pertenece a piscina."
- "Esta parte es exterior."
- "Esta parte se usa para desayunos."

No busca aun perfeccion visual. Busca orientacion.

Quiere que el plano empiece a tener forma de restaurante.

### Elementos que pertenecen a esta tarea

Pertenecen realmente a esta tarea:

- sala principal;
- terraza;
- reservado;
- lounge;
- rooftop;
- zona de piscina;
- zona de playa;
- comedor interior;
- zona exterior;
- area del hotel;
- zonas del local;
- areas que el equipo reconoce en el servicio.

Tambien puede pertenecer aqui la idea general de suelo cuando ayuda a distinguir un espacio, pero no como decision decorativa prematura.

### Elementos que NO deberian aparecer mientras realiza esta tarea

No deberian dominar:

- decoracion detallada;
- objetos ambientales secundarios;
- opciones esteticas avanzadas;
- categorias internas;
- nombres tecnicos;
- ajustes finos;
- elementos de baja frecuencia;
- decisiones que no ayudan a entender los espacios principales.

### Sensacion que debe transmitir

Debe transmitir amplitud, claridad y comienzo facil.

El usuario debe sentir:

"Ya estoy dibujando mi restaurante."

No:

"Estoy configurando una base."

---

## Tarea 2 - Marcar Lo Que Condiciona

### Objetivo

Permitir que el usuario indique los limites, accesos y condicionantes que afectan a la distribucion.

Esta tarea responde a la pregunta:

**Que cosas no puedo ignorar al montar mi restaurante?**

### Que espera conseguir el usuario

El usuario espera poder decir:

- "Aqui hay una pared."
- "Por aqui se entra."
- "Esta puerta debe quedar libre."
- "Aqui hay cristal."
- "Esta columna condiciona la sala."
- "Este separador divide ambientes."
- "Este paso no se puede bloquear."
- "Esta zona no debe usarse para mesas."

Quiere establecer las reglas fisicas y operativas del espacio.

### Elementos que pertenecen a esta tarea

Pertenecen realmente a esta tarea:

- muros;
- paredes;
- puertas;
- cristales;
- columnas;
- separadores;
- accesos;
- entradas;
- salidas;
- pasos naturales;
- zonas que no deben ocuparse;
- limites entre interior y exterior;
- condicionantes que afectan a mesas o servicio.

### Elementos que NO deberian aparecer mientras realiza esta tarea

No deberian dominar:

- vegetacion decorativa;
- acabado estetico del suelo;
- mesas como catalogo amplio si el usuario aun esta marcando limites;
- elementos de ambiente sin funcion de condicionante;
- informacion tecnica sobre sistemas;
- opciones que hagan pensar en construccion arquitectonica profesional.

### Sensacion que debe transmitir

Debe transmitir precision sin tecnicismo.

El usuario debe sentir:

"Estoy marcando lo que condiciona mi sala."

No:

"Estoy dibujando estructura."

---

## Tarea 3 - Colocar Mis Mesas

### Objetivo

Permitir que el usuario cree la distribucion principal de clientes.

Esta tarea responde a la pregunta:

**Donde se sienta la gente?**

### Que espera conseguir el usuario

El usuario espera poder decir:

- "Aqui van las mesas de dos."
- "Aqui coloco mesas de cuatro."
- "Esta es la mesa grande."
- "Aqui va la mesa corrida."
- "Esta zona tiene mas capacidad."
- "Estas mesas quedan cerca de la barra."
- "Estas mesas no bloquean el paso."
- "La numeracion se entiende."

Quiere pasar rapidamente de un espacio vacio a una distribucion operativa.

### Elementos que pertenecen a esta tarea

Pertenecen realmente a esta tarea:

- mesas de dos personas;
- mesas de cuatro personas;
- mesas de seis personas;
- mesas grandes;
- mesas de doce personas;
- mesa corrida;
- mesas redondas;
- mesas rectangulares;
- grupos de mesas;
- capacidad;
- numeracion;
- separacion entre mesas;
- relacion entre mesas y zonas;
- lectura operativa de la sala.

### Elementos que NO deberian aparecer mientras realiza esta tarea

No deberian dominar:

- materiales;
- vegetacion;
- decoracion;
- ajustes de ambiente;
- categorias que no afecten a la distribucion;
- objetos secundarios;
- informacion que distraiga de capacidad, posicion y claridad.

### Sensacion que debe transmitir

Debe transmitir velocidad, control y claridad.

Esta es una de las tareas mas importantes de Hostly.

El usuario debe sentir:

"Estoy montando mi sala."

No:

"Estoy colocando objetos."

---

## Tarea 4 - Organizar Mi Servicio

### Objetivo

Permitir que el usuario represente como trabaja el equipo dentro del restaurante.

Esta tarea responde a la pregunta:

**Como se opera este espacio?**

### Que espera conseguir el usuario

El usuario espera poder decir:

- "La barra va aqui."
- "La recepcion esta junto a la entrada."
- "La estacion de camareros cubre esta zona."
- "El punto de recogida queda cerca de cocina."
- "El equipo puede pasar por aqui."
- "Esta zona necesita apoyo."
- "La terraza se atiende desde este punto."
- "El servicio no se cruza mal con los clientes."

Quiere que el plano no solo se vea como restaurante, sino que funcione como restaurante.

### Elementos que pertenecen a esta tarea

Pertenecen realmente a esta tarea:

- barra;
- recepcion;
- estaciones de camareros;
- punto de recogida;
- zonas de paso;
- circulacion natural;
- relacion entre barra y mesas;
- relacion entre recepcion y entrada;
- relacion entre cocina, recogida y sala;
- areas de trabajo;
- puntos de apoyo al servicio;
- lectura del equipo durante el turno.

### Elementos que NO deberian aparecer mientras realiza esta tarea

No deberian dominar:

- decoracion sin impacto operativo;
- opciones esteticas;
- objetos ambientales;
- detalles de acabado;
- categorias que no ayuden al movimiento del equipo;
- configuracion visual que retrase decisiones de servicio.

### Sensacion que debe transmitir

Debe transmitir eficiencia, seguridad y ritmo de servicio.

El usuario debe sentir:

"Mi equipo puede trabajar aqui."

No:

"Estoy anadiendo una capa de operacion."

---

## Tarea 5 - Hacerlo Reconocible

### Objetivo

Permitir que el usuario haga que el plano se parezca a su local sin perder claridad operativa.

Esta tarea responde a la pregunta:

**Como reconozco mi restaurante de un vistazo?**

### Que espera conseguir el usuario

El usuario espera poder decir:

- "La terraza tiene jardineras."
- "Aqui estan los olivos."
- "Esta zona tiene palmeras."
- "Aqui hay arena."
- "La piscina queda al centro."
- "El lounge se distingue."
- "Esta parte se siente exterior."
- "El plano se parece a mi negocio."

Quiere identidad, orientacion y reconocimiento.

No quiere decoracion por decoracion.

### Elementos que pertenecen a esta tarea

Pertenecen realmente a esta tarea:

- jardineras;
- olivos;
- palmeras;
- vegetacion;
- sombrillas;
- hamacas;
- elementos lounge;
- piscina;
- fuente;
- arena;
- cesped;
- tarima;
- pavimentos con funcion de reconocimiento;
- ambiente de terraza, playa, rooftop, hotel o resort.

### Elementos que NO deberian aparecer mientras realiza esta tarea

No deberian dominar:

- objetos puramente decorativos sin lectura espacial;
- elementos que compitan con mesas;
- detalles visuales que dificulten servicio;
- variedad excesiva;
- opciones que conviertan el Editor en una herramienta de decoracion;
- cualquier elemento que haga perder la jerarquia Operacion > Espacio > Ambiente.

### Sensacion que debe transmitir

Debe transmitir identidad contenida y profesional.

El usuario debe sentir:

"Reconozco mi local."

No:

"Estoy decorando un dibujo."

---

## 5. Tarea Transversal - Comprobar Que Funciona

Aunque el modelo oficial tenga cinco tareas principales, existe una tarea transversal que debe acompanar a todas:

**Comprobar que funciona.**

No debe tratarse como una sexta fase. Debe estar presente durante todo el proceso.

El encargado se pregunta constantemente:

- Se entiende la sala?
- Caben las mesas?
- Hay paso suficiente?
- La barra esta bien situada?
- La recepcion tiene sentido?
- La terraza se entiende?
- El equipo puede trabajar?
- Las mesas se leen rapido?
- El ambiente ayuda o molesta?

Esta revision permanente es lo que convierte el Editor en producto de hosteleria y no en herramienta de dibujo.

---

## 6. Comparacion Con El Editor V2 Actual

Esta seccion compara el modelo conceptual propuesto con el modelo visible actual del Editor V2.

No evalua implementacion. Evalua experiencia.

### 6.1 Lo que coincide

El Editor V2 actual ya ha avanzado hacia un lenguaje mas humano.

Coinciden especialmente:

- "Mi restaurante" como entrada mental de propiedad.
- "Espacios" como forma comprensible de agrupar salas y zonas.
- "Mesas y servicio" como lenguaje mucho mas cercano a hosteleria que "Operacion".
- "Ambiente" como sustitucion mas humana de paisajismo.
- "Zonas del local" como lenguaje mas natural que catalogos internos.
- "Puntos de servicio" como concepto reconocible para barra, estaciones y recogida.

Tambien coincide la ambicion de separar lo operativo de lo ambiental.

El Editor ya no habla tan claramente desde su arquitectura. Ha empezado a hablar desde el restaurante.

### 6.2 Lo que sobra

Sobra cualquier elemento visible que haga pensar en el Editor como sistema.

Especialmente:

- lenguaje de fases;
- sensacion de paso obligatorio;
- categorias internas visibles;
- conceptos que suenan a organizacion del producto, no del restaurante;
- elementos "proximamente" dentro del flujo principal;
- opciones decorativas antes de tener una distribucion operativa;
- informacion que explique el Editor en lugar de apoyar la tarea actual.

Tambien sobra la idea de que todas las areas del Editor tienen el mismo peso.

No lo tienen.

Mesas y servicio pesan mas que ambiente.

Espacios pesan mas que decoracion.

Condicionantes pesan mas que variedad visual.

### 6.3 Lo que falta

Falta consolidar la experiencia alrededor de tareas reales.

El usuario debe sentir menos:

"Estoy en una seccion."

Y mas:

"Estoy resolviendo una parte de mi restaurante."

Falta tambien que las tareas hibridas tengan un significado mas claro:

- una barra no es solo un objeto; es servicio y orientacion;
- una jardinera no es solo ambiente; a veces separa zonas;
- una mesa corrida no es solo una mesa grande; es una decision de distribucion;
- una terraza no es solo un espacio; implica suelo, mesas, servicio y ambiente;
- un paso libre no es ausencia de objeto; es una decision operativa.

Falta que el modelo mental haga visible la intencion, no la clasificacion.

### 6.4 Conceptos que deberian desaparecer del lenguaje visible

Estos conceptos no deberian protagonizar la experiencia del usuario:

- fase;
- sistema;
- capa;
- superficie;
- estructura;
- paisajismo;
- operacion como termino abstracto;
- herramienta como categoria principal;
- catalogo tecnico;
- documento;
- entidad;
- asset;
- modo;
- configuracion interna.

Pueden existir como lenguaje interno. No deben ser el idioma del encargado.

### 6.5 Conceptos que deberian cambiar de significado

Algunos conceptos pueden mantenerse, pero deben cambiar su significado visible.

**Mi restaurante**
No debe ser solo el punto inicial. Debe ser la unidad mental completa.

**Espacios**
No debe significar zonas internas. Debe significar partes reconocibles del negocio.

**Suelo**
No debe significar material o capa. Debe ayudar a distinguir donde ocurre la operacion: interior, terraza, arena, tarima, cesped, piscina, exterior.

**Elementos fijos**
No debe sonar a estructura. Debe significar todo aquello que condiciona la distribucion.

**Mesas y servicio**
No debe ser una categoria mas. Debe ser el centro de gravedad del Editor.

**Ambiente**
No debe significar decoracion. Debe significar reconocimiento del local.

**Elementos**
No debe ser un contenedor generico. Debe sentirse como repertorio de cosas necesarias para construir un restaurante.

---

## 7. Modelo De Madurez

El Task Model debe guiar la evolucion del Editor durante anos.

Para evaluar si el Editor madura, el equipo debe observar si el usuario puede contar su proceso asi:

1. "He creado mis espacios."
2. "He marcado lo que condiciona el local."
3. "He colocado mis mesas."
4. "He organizado el servicio."
5. "He hecho que se reconozca mi restaurante."

Si el usuario cuenta su proceso con estas palabras, el modelo funciona.

Si lo cuenta asi:

1. "He entrado en una fase."
2. "He seleccionado una herramienta."
3. "He colocado elementos."
4. "He cambiado de categoria."
5. "He ajustado capas."

El modelo no esta suficientemente humanizado.

---

## 8. Criterios Para Futuras Decisiones

Cualquier decision futura del Editor debe pasar estas preguntas:

- A que intencion real responde?
- Un encargado lo diria con sus palabras?
- Ayuda a crear espacios, marcar condicionantes, colocar mesas, organizar servicio o reconocer el local?
- Reduce la necesidad de entender el Editor?
- Acerca al usuario al primer plano util?
- Protege que las mesas y el servicio dominen?
- Evita convertir ambiente en decoracion dominante?
- Evita exponer arquitectura interna?
- Permite volver atras y corregir sin romper el flujo mental?
- Ayuda a que Hostly se sienta como producto de hosteleria, no como editor generico?

Si una decision no encaja en ninguna tarea principal, debe cuestionarse.

---

## 9. Modelo De Trabajo Para Iteraciones

El Editor V2 debe avanzar con una tarea importante por iteracion.

Antes de cambiar algo, el equipo debe declarar:

- que entiende del objetivo;
- que riesgo principal existe;
- cual es la solucion minima;
- que archivos deberian tocarse;
- que archivos no deberian tocarse;
- si afecta TPV, Publisher, Firestore, pagos, reservas, KDS u orders.

Durante la ejecucion:

- no hacer refactors masivos;
- no reescribir sistemas completos;
- no mezclar arquitectura, UI y persistencia salvo necesidad explicita;
- preservar `restaurantId` y compatibilidad multi-tenant;
- mantener compatibilidad legacy mientras sea fallback operativo;
- pensar primero como restaurante y despues como software;
- no tocar pagos, reservas, KDS, orders, comandas o cobros si la tarea no lo exige.

Al terminar:

- explicar que cambio;
- explicar que no cambio;
- listar archivos modificados;
- declarar riesgos pendientes;
- indicar resultado de TypeScript o motivo si no se ejecuto;
- indicar resultado de build o motivo si no se ejecuto;
- recomendar commit si procede;
- no hacer push automatico.

## 10. Roles De Trabajo

**Cursor implementa.**

Cursor puede modificar codigo, componentes, estilos, tests o documentacion cuando la tarea lo pide. Debe trabajar con cambios pequenos, validar y no tocar dominios sensibles sin necesidad.

**Codex audita y consolida.**

Codex debe priorizar revision, arquitectura conceptual, documentacion, QA, deteccion de contradicciones y analisis de riesgos. Puede proponer cambios, pero no debe convertir una auditoria en reescritura ni declarar implementado lo que siga pendiente.

Ambos roles deben respetar la misma regla central:

**Hostly es un producto de hosteleria. La arquitectura existe para proteger la operacion, no para exhibirse.**

---

## 11. Declaracion Final

El Editor V2 no debe organizarse alrededor de como esta construido.

Debe organizarse alrededor de lo que el encargado quiere resolver.

El modelo oficial de tareas de Hostly es:

1. Crear mis espacios.
2. Marcar lo que condiciona.
3. Colocar mis mesas.
4. Organizar mi servicio.
5. Hacerlo reconocible.

Estas no son fases.

Son intenciones.

El usuario debe poder moverse entre ellas con naturalidad, volver, corregir, completar y perfeccionar sin sentir que esta usando una herramienta tecnica.

Cuando Hostly consiga que un encargado piense:

"Estoy montando mi restaurante."

Y no:

"Estoy aprendiendo el editor."

Entonces el Editor V2 habra alcanzado su modelo mental correcto.
