# HOSTLY_EDITOR_INTERACTION_MODEL

> Manifiesto oficial del modelo de interaccion del Editor de Hostly.

**Estado:** documento maestro de producto  
**Ambito:** modelo de interaccion del Editor de espacios de Hostly  
**Autoridad:** complementa `HOSTLY_EDITOR_EXPERIENCE_GUIDELINES.md` y `HOSTLY_EDITOR_HUMANIZATION_ROADMAP.md`  
**Horizonte:** referencia para los proximos diez anos de evolucion del Editor  
**Ultima revision:** 2026-07-05  

---

## 1. Proposito

Este documento define como debe interactuar una persona con el Editor de Hostly.

No describe como funciona el producto por dentro. No define pantallas. No define componentes. No define arquitectura tecnica. No describe el Editor actual.

Describe el Editor ideal.

La pregunta central es:

**Como construye realmente un restaurante un encargado?**

La respuesta no esta en los sistemas internos del producto. Esta en la forma en que una persona entiende su local, su sala, sus mesas, su equipo y su servicio.

Hostly debe ser el editor que menos se siente como editor y mas se siente como una herramienta natural para dibujar y operar un restaurante.

---

## 2. El Problema De Los Editores Tradicionales

### 2.1 Por que obligan a aprender el editor

Los editores tradicionales suelen empezar desde el punto de vista de la herramienta.

Primero ensenan:

- modos;
- capas;
- herramientas;
- propiedades;
- paneles;
- categorias;
- estados;
- reglas;
- configuraciones.

El usuario entra queriendo resolver una tarea, pero el producto le obliga a aprender una gramatica previa.

Antes de poder crear algo, debe entender como piensa el editor.

Ese modelo puede funcionar en herramientas tecnicas, profesionales o creativas donde el usuario acepta una curva de aprendizaje a cambio de precision y libertad. Pero ese no es el contrato principal de Hostly.

Hostly no existe para que el usuario aprenda a editar.

Hostly existe para que el usuario pueda representar y operar su restaurante con claridad.

### 2.2 Por que eso es un error para Hostly

En hosteleria, el usuario no tiene paciencia para aprender un sistema abstracto si la tarea que tiene en la cabeza es concreta.

Un encargado no abre Hostly pensando:

"Necesito seleccionar una fase, activar una herramienta y colocar una entidad sobre una capa."

Piensa:

"Tengo que montar mi sala."

"Aqui van las mesas."

"Esta terraza se llena por la noche."

"La barra esta aqui."

"El camarero tiene que poder pasar."

"Esta zona no se usa."

"Necesito que el plano se entienda rapido."

Cuando Hostly obliga a traducir esos pensamientos a lenguaje de editor, introduce friccion.

La friccion no siempre parece grave al equipo interno, porque el equipo conoce el producto. Pero para un usuario nuevo, cada termino abstracto es una pequena interrupcion. Muchas interrupciones convierten una experiencia potente en una experiencia cansada.

El error no es tener herramientas. El error es hacer que el usuario piense en herramientas antes de pensar en su restaurante.

### 2.3 La regla principal

El Editor no debe pedir al usuario que aprenda su logica.

Debe adaptarse a la logica del restaurante.

---

## 3. Modelo Mental Real De Un Encargado

### 3.1 El encargado piensa desde la realidad fisica

Un encargado no empieza por abstracciones.

Empieza por una imagen mental del negocio.

Piensa:

"Mi restaurante tiene una sala principal."

"Tengo una terraza fuera."

"La entrada esta por aqui."

"La barra queda en este lado."

"La cocina sale por esta puerta."

"Aqui hay una columna que molesta."

"Esta pared no se puede mover."

"Esta zona se usa solo para reservas."

"Aqui no quiero mesas porque pasa el equipo."

"En esta esquina caben dos mesas pequenas."

"La mesa grande va al fondo."

El restaurante se entiende como un lugar vivido, no como un plano tecnico.

Cada elemento tiene una funcion practica: sentar clientes, mover camareros, cobrar, recoger platos, separar zonas, reconocer el espacio o evitar problemas.

### 3.2 El encargado piensa en espacios reconocibles

El primer nivel mental son los espacios.

No piensa en superficies ni sistemas.

Piensa:

"Esta es la sala."

"Esta es la terraza."

"Este es el reservado."

"Este es el lounge."

"Esta es la zona de piscina."

"Esta es la playa."

"Este es el rooftop."

"Este es el comedor interior."

"Este es el pasillo por donde se mueve el equipo."

"Esta zona pertenece al hotel."

"Esta parte es solo para desayunos."

"Esta zona se abre en verano."

El Editor debe permitir que el usuario nombre, reconozca y organice estos espacios desde su propio lenguaje.

### 3.3 El encargado piensa en limites y condicionantes

Despues aparecen los limites.

No como construccion tecnica, sino como cosas que condicionan la operacion.

Piensa:

"Aqui hay una pared."

"Aqui esta la puerta."

"Por esta cristalera se sale a la terraza."

"Esta columna no deja poner una mesa grande."

"Este separador divide la zona privada."

"Aqui no puede pasar el cliente."

"Esta entrada debe quedar libre."

"Aqui entra el personal."

"Este camino no se puede bloquear."

"La barra marca el centro de esta zona."

Los limites no son decoracion. Son reglas del espacio.

Ayudan a decidir donde se puede operar y donde no.

### 3.4 El encargado piensa en mesas antes que en detalles

Las mesas son el corazon operativo.

El encargado piensa:

"Aqui van cuatro mesas de dos."

"Esta mesa es para seis."

"Necesito una mesa grande para grupos."

"Esta mesa debe quedar cerca de la barra."

"Esta mesa no puede molestar al paso."

"La mesa 12 siempre da problemas."

"Estas mesas se juntan a menudo."

"Aqui quiero mesas rapidas."

"Esta es una mesa buena."

"Esta zona tiene que verse clara en el servicio."

"El numero tiene que leerse rapido."

Para Hostly, una mesa no es un dibujo.

Una mesa es una unidad de operacion.

Si el Editor no hace que las mesas dominen la experiencia, no esta actuando como producto de hosteleria.

### 3.5 El encargado piensa en el equipo

El restaurante no es solo clientes sentados.

Es trabajo en movimiento.

El encargado piensa:

"El camarero necesita pasar por aqui."

"Desde esta estacion se atiende esta zona."

"La barra tiene que estar cerca de estas mesas."

"El punto de recogida queda aqui."

"La recepcion debe ver la entrada."

"La cocina sale por este lado."

"Aqui se acumula gente."

"Esta zona se atasca."

"No quiero poner mesas donde estorban."

"El equipo debe entender el plano sin preguntar."

El Editor debe representar el servicio como parte natural del restaurante, no como un extra posterior.

### 3.6 El encargado piensa en restricciones

Muchas decisiones vienen de lo que no debe ocurrir.

Piensa:

"No quiero que esta zona se utilice."

"Aqui no cabe una mesa."

"Esta puerta debe quedar libre."

"No puedo bloquear este paso."

"Esta zona no se reserva."

"Aqui solo pongo mesas pequenas."

"No quiero clientes aqui."

"Esta parte se cierra cuando llueve."

"Estas mesas no deben juntarse."

"Esta zona no pertenece al servicio de noche."

Un buen Editor no solo permite anadir cosas. Permite expresar restricciones de forma natural.

### 3.7 El encargado piensa en temporadas y momentos

Un restaurante no siempre funciona igual.

Piensa:

"La terraza se usa en verano."

"El rooftop se abre por la noche."

"La sala interior funciona en invierno."

"Para desayunos usamos esta zona."

"En eventos juntamos estas mesas."

"Los domingos abrimos la zona exterior."

"Cuando llueve cerramos esta parte."

"En temporada alta metemos mas mesas."

El Editor ideal debe respetar que un restaurante es dinamico. No debe obligar a pensar en un unico plano rigido.

### 3.8 El encargado piensa en reconocimiento

Tambien necesita que el plano se parezca al local.

Piensa:

"Aqui estan los olivos."

"Esta zona tiene arena."

"La piscina esta en el centro."

"Las sombrillas van aqui."

"La barra exterior se reconoce por esta zona."

"Esta terraza tiene jardineras."

"El cliente se sienta junto al cristal."

"Esta parte es lounge."

"Este espacio es mas elegante."

"Quiero reconocerlo de un vistazo."

El ambiente importa porque ayuda a orientarse.

Pero el ambiente nunca debe ganar a la operacion.

### 3.9 El encargado piensa en uso, no en dibujo

La pregunta final del encargado no es:

"El plano esta bonito?"

Es:

"Me sirve para trabajar?"

El Editor debe ayudar a responder:

- Se entiende donde esta cada mesa?
- El equipo reconoce la sala?
- Las zonas tienen sentido?
- Los caminos estan libres?
- La barra esta clara?
- La terraza se distingue?
- El plano se lee rapido?
- El servicio puede operar mejor?

Este es el modelo mental que Hostly debe proteger.

---

## 4. Modelos De Interaccion Posibles

### 4.1 Modelo por fases

Un modelo por fases divide la creacion en pasos secuenciales.

Ventajas:

- Da sensacion de orden.
- Puede ayudar a usuarios que no saben por donde empezar.
- Permite explicar el producto de forma lineal.
- Reduce algunas decisiones iniciales.

Inconvenientes:

- Obliga a seguir un orden que no siempre coincide con la realidad.
- Hace visible la estructura interna.
- Puede retrasar la llegada a las mesas.
- Convierte la experiencia en proceso.
- Hace que cada fase parezca igual de importante.

Para Hostly, el modelo por fases puede servir como orientacion, pero no como modelo mental principal.

### 4.2 Modelo libre

Un modelo libre permite colocar cualquier cosa en cualquier momento.

Ventajas:

- Da sensacion de libertad.
- Permite empezar por cualquier parte.
- Puede ser rapido para usuarios expertos.

Inconvenientes:

- Genera desorden.
- Aumenta carga mental.
- Convierte el Editor en una herramienta de dibujo.
- Dificulta mantener consistencia.
- Puede hacer que el usuario no sepa por donde empezar.

Para Hostly, la libertad absoluta no es suficiente. Hostly debe guiar sin parecer restrictivo.

### 4.3 Modelo asistido

Un modelo asistido guia al usuario paso a paso.

Ventajas:

- Reduce miedo inicial.
- Puede acelerar el primer resultado.
- Ayuda en casos simples.

Inconvenientes:

- Puede sentirse infantil.
- Puede limitar usuarios con locales complejos.
- Puede obligar a responder preguntas antes de tiempo.
- Puede convertirse en una encuesta en vez de una herramienta.

Para Hostly, la asistencia debe aparecer cuando ayuda, no dominar la experiencia.

### 4.4 Modelo contextual

Un modelo contextual muestra acciones segun lo que el usuario esta haciendo.

Ventajas:

- Reduce ruido.
- Acerca la herramienta correcta al momento adecuado.
- Hace que la experiencia parezca inteligente.
- Evita paneles saturados.

Inconvenientes:

- Si se oculta demasiado, el usuario puede sentirse perdido.
- Puede ser dificil descubrir posibilidades.
- Requiere mucha claridad en estados y lenguaje.

Para Hostly, lo contextual es esencial, pero necesita una base visible de orientacion.

### 4.5 Modelo por intencion

Un modelo por intencion empieza preguntando que quiere lograr el usuario, no que herramienta quiere usar.

El usuario piensa:

"Quiero crear una terraza."

"Quiero colocar mesas."

"Quiero marcar una zona que no se usa."

"Quiero anadir una barra."

"Quiero hacer reconocible el ambiente."

La experiencia responde a esa intencion y ofrece el camino mas natural.

Ventajas:

- Habla el idioma del usuario.
- Reduce traduccion mental.
- Acerca Hostly a hosteleria real.
- Permite flexibilidad sin caos.
- Es compatible con usuarios nuevos y expertos.

Inconvenientes:

- Debe cuidar mucho el lenguaje.
- Debe evitar parecer una lista de comandos.
- Debe mantener orientacion sin convertirse en wizard.

Para Hostly, este es el modelo correcto.

---

## 5. Modelo Elegido: Construccion Por Intencion Progresiva

### 5.1 Definicion

El modelo oficial de interaccion del Editor de Hostly es:

**Construccion por intencion progresiva.**

Significa que el usuario no interactua principalmente con fases, herramientas o sistemas.

Interactua con intenciones reales de restaurante.

El Editor debe entender y acompanar intenciones como:

- Crear mi sala.
- Dibujar mi terraza.
- Colocar mesas.
- Anadir una barra.
- Marcar accesos.
- Separar una zona.
- Reservar un paso.
- Anadir un punto de servicio.
- Hacer reconocible el ambiente.
- Ajustar la distribucion.
- Revisar si el plano funciona.

La palabra "progresiva" es importante.

El Editor no debe mostrar todo desde el principio. Debe revelar complejidad cuando el usuario la necesita.

### 5.2 Por que no debe ser solo por fases

Las fases organizan bien el producto por dentro, pero no representan como piensa el usuario.

Un encargado puede empezar por las mesas porque ya sabe como quiere distribuirlas. Otro puede empezar por la terraza porque es lo que mas condiciona su negocio. Otro puede empezar por la barra porque estructura toda la sala.

Un flujo rigido por fases castiga esa diversidad.

Hostly debe permitir diferentes puntos de entrada sin perder claridad.

### 5.3 Por que no debe ser totalmente libre

La libertad absoluta parece poderosa, pero puede ser una carga.

Si todo esta disponible siempre, el usuario debe decidir demasiado.

Hostly no debe abandonar al usuario frente a un lienzo vacio. Debe ofrecer caminos naturales.

La construccion por intencion da libertad con criterio.

### 5.4 Como cambia el paradigma respecto a un CAD

Un CAD pregunta implicitamente:

"Que herramienta quieres usar?"

Hostly debe preguntar:

"Que parte de tu restaurante quieres construir ahora?"

Un CAD prioriza precision geometrica.

Hostly prioriza comprension operativa.

Un CAD espera usuarios tecnicos.

Hostly espera responsables de hosteleria.

Un CAD deja que el usuario construya cualquier cosa.

Hostly ayuda a construir algo reconocible y util para un restaurante.

### 5.5 Como debe comportarse

La construccion por intencion debe comportarse asi:

- El usuario expresa una intencion comprensible.
- El Editor ofrece la forma mas directa de cumplirla.
- Las opciones secundarias aparecen despues.
- El resultado se ve inmediatamente en el plano.
- Las acciones frecuentes permanecen cerca.
- El usuario puede cambiar de intencion sin sentirse atrapado.
- El plano mantiene coherencia aunque el usuario no conozca los sistemas internos.

El Editor ideal no pregunta demasiado pronto.

Primero deja crear. Despues permite ajustar.

---

## 6. El Primer Minuto

### 6.1 Como debe sentirse

El primer minuto debe sentirse tranquilo, claro y productivo.

El usuario debe entender rapidamente:

"Puedo empezar."

"Esto va de mi restaurante."

"No necesito saber como funciona por dentro."

"Puedo crear algo util ahora."

El primer minuto no debe demostrar potencia. Debe generar confianza.

### 6.2 Que debe hacer primero el usuario

El usuario debe poder hacer una de estas acciones naturales:

- Crear su primer espacio.
- Dibujar su sala.
- Crear una terraza.
- Colocar sus primeras mesas.
- Marcar una barra.
- Empezar desde una distribucion basica reconocible.

No hay una unica entrada correcta.

El Editor debe permitir que el usuario empiece por aquello que mas claro tiene.

### 6.3 Que nunca deberia tener que pensar

Durante el primer minuto, el usuario nunca deberia pensar:

- Que fase debo elegir?
- Que sistema estoy usando?
- Donde esta la herramienta correcta?
- Que significa esta categoria?
- Estoy modificando la capa correcta?
- Por que no puedo colocar esto ahora?
- Tengo que configurar algo antes?
- Donde se guardara esto?
- Que diferencia hay entre estos conceptos internos?

Si aparece cualquiera de estas preguntas, el Editor esta hablando demasiado como editor.

### 6.4 Que deberia descubrir de forma natural

El usuario deberia descubrir:

- Que puede crear espacios reconocibles.
- Que puede colocar mesas facilmente.
- Que puede anadir barra y puntos de servicio.
- Que puede marcar accesos y limites.
- Que puede dar ambiente al local despues.
- Que puede corregir sin miedo.
- Que el plano empieza a parecerse a su restaurante.

El primer minuto debe terminar con sensacion de avance, no con sensacion de aprendizaje.

### 6.5 El primer exito

El primer exito ideal es:

**Un espacio reconocible con mesas claras.**

No hace falta que el plano este completo.

Hace falta que el usuario sienta:

"Ya veo mi restaurante."

---

## 7. Principios De Interaccion

### 7.1 La intencion precede a la herramienta

El usuario debe elegir que quiere lograr antes de elegir como se llama la herramienta.

La herramienta es secundaria.

### 7.2 Nunca preguntar antes de que el usuario lo necesite

Cada pregunta prematura aumenta carga mental.

El Editor debe permitir avanzar con decisiones minimas y revelar detalle cuando aporte valor.

### 7.3 Nunca obligar a seguir un orden artificial

La hosteleria real no se dibuja siempre en el mismo orden.

El Editor debe guiar sin encerrar.

### 7.4 La herramienta correcta debe aparecer cuando tenga sentido

Las acciones deben emerger en el momento adecuado.

El usuario no debe explorar paneles largos para encontrar lo que naturalmente necesita.

### 7.5 Las acciones frecuentes deben ser obvias

Seleccionar, mover, colocar, duplicar, borrar, ajustar, nombrar y corregir deben sentirse directas.

Si una accion comun necesita explicacion, no es suficientemente clara.

### 7.6 La operacion domina siempre

Las mesas, el servicio, la barra y los puntos de trabajo mandan sobre ambiente, materiales y decoracion.

El Editor debe recordar constantemente que el plano existe para operar.

### 7.7 El usuario debe poder cambiar de idea

Crear un restaurante es iterativo.

El usuario mueve mesas, cambia zonas, recoloca barra, ajusta pasos y prueba alternativas.

La interaccion debe permitir corregir sin miedo.

### 7.8 Lo esencial debe estar cerca

Mesas, espacios, barra, accesos y servicio no pueden quedar ocultos.

Si el usuario tarda en encontrar lo basico, el modelo falla.

### 7.9 La complejidad debe aparecer por capas de necesidad

El Editor puede ser profundo, pero no debe ser profundo desde el primer segundo.

Primero se crea.

Luego se ajusta.

Despues se perfecciona.

### 7.10 Los objetos deben comportarse como cosas de restaurante

Una mesa debe sentirse como una mesa.

Una barra debe sentirse como un punto de servicio.

Una zona debe sentirse como parte del local.

Una puerta debe sentirse como un acceso.

El usuario no debe pensar en objetos abstractos.

### 7.11 El contexto debe explicar el siguiente paso

Despues de crear una sala, es natural colocar mesas.

Despues de colocar mesas, es natural ajustar servicio.

Despues de definir servicio, es natural revisar circulacion.

Despues de que el plano funcione, es natural anadir ambiente.

El Editor debe acompanar esa progresion sin imponerla.

### 7.12 No hay belleza sin legibilidad

Cada elemento visual debe ayudar a comprender el restaurante.

Si un elemento se ve bien pero dificulta operar, debe perder protagonismo.

### 7.13 El tacto debe sentirse seguro

En tablet o portatil tactil, el usuario debe tocar sin miedo.

Las acciones deben ser claras, reversibles y suficientemente generosas.

### 7.14 El Editor debe tolerar imperfeccion

Un usuario no siempre sabe exactamente como quiere su plano.

Debe poder empezar de forma aproximada y mejorar despues.

El Editor debe favorecer avance antes que perfeccion inicial.

### 7.15 El sistema nunca debe presumir de si mismo

Hostly no debe hacer visible su sofisticacion interna como argumento de interfaz.

La sofisticacion debe sentirse como facilidad.

---

## 8. El Stepper Como Concepto

### 8.1 Cuando ayuda

Un stepper puede ayudar cuando:

- El usuario necesita orientacion inicial.
- Hay una secuencia recomendada para empezar.
- El producto quiere transmitir progreso.
- El usuario no sabe que viene despues.
- Sirve como mapa mental suave, no como obligacion.

En esos casos, el stepper funciona como una guia.

### 8.2 Cuando molesta

Un stepper molesta cuando:

- Obliga a seguir un orden artificial.
- Hace pensar que hay una forma correcta unica.
- Presenta conceptos internos como pasos de usuario.
- Retrasa el acceso a mesas y servicio.
- Convierte la experiencia en configuracion.
- Hace que cada paso parezca igual de importante.
- Hace que el usuario se pregunte "en que fase estoy" en vez de "que estoy creando".

En esos casos, el stepper deja de orientar y empieza a mandar.

### 8.3 Alternativas conceptuales

Existen alternativas al stepper tradicional:

**Mapa de intenciones.**  
Organiza la experiencia por lo que el usuario quiere hacer: crear espacio, colocar mesas, anadir servicio, marcar accesos, dar ambiente.

**Guia progresiva.**  
Sugiere el siguiente paso natural sin bloquear caminos alternativos.

**Checklist de preparacion.**  
Ayuda a revisar si el restaurante esta listo: espacios, mesas, servicio, accesos, ambiente.

**Orientacion contextual.**  
Muestra acciones relevantes segun lo que el usuario esta haciendo.

**Modo libre con recomendaciones.**  
Permite empezar por cualquier parte, pero mantiene una estructura de apoyo.

### 8.4 Criterio para Hostly

Hostly no debe depender de un stepper como modelo principal.

El stepper puede existir como orientacion secundaria, especialmente para primeros usos o revision de completitud. Pero el modelo mental principal debe ser construccion por intencion.

La pregunta no debe ser:

"En que paso estoy?"

Debe ser:

"Que parte de mi restaurante quiero construir ahora?"

### 8.5 Decision de producto

El concepto que mejor encaja con Hostly es:

**Intenciones principales con orientacion progresiva.**

Esto significa:

- El usuario puede empezar por diferentes puntos.
- El producto sugiere un orden natural sin imponerlo.
- La navegacion habla en lenguaje de restaurante.
- La operacion permanece siempre cerca.
- La experiencia no se convierte en una secuencia tecnica.

El stepper puede ser una ayuda.

No debe ser el jefe.

---

## 9. Evolucion Del Editor En Cinco Anos

Esta evolucion se describe desde la interaccion, no desde la tecnologia.

### 9.1 Ano 1 - Claridad de intencion

El Editor debe consolidar su lenguaje y su modelo mental.

El usuario debe entender rapidamente:

- Que puede crear espacios.
- Que puede colocar mesas.
- Que puede organizar servicio.
- Que puede hacer reconocible su local.
- Que no necesita aprender sistemas internos.

La prioridad es eliminar friccion conceptual.

### 9.2 Ano 2 - Flujo operativo natural

El Editor debe hacer que las tareas frecuentes se encadenen de forma natural.

Crear una sala debe invitar a colocar mesas.

Colocar mesas debe invitar a revisar servicio.

Anadir barra debe ayudar a entender circulacion.

Crear terraza debe abrir decisiones propias de exterior.

La experiencia debe sentirse menos como uso de herramientas y mas como montaje progresivo del restaurante.

### 9.3 Ano 3 - Personalizacion sin complejidad

El Editor debe permitir representar mas tipologias sin aumentar carga mental.

Restaurante gastronomico, cafeteria, hotel, resort, rooftop, beach club y chiringuito deben sentirse diferentes en resultado, pero no exigir aprender un nuevo editor.

La variedad debe aparecer como reconocimiento del negocio, no como menu infinito.

### 9.4 Ano 4 - Interaccion anticipatoria

El Editor debe empezar a anticipar necesidades de forma prudente.

No debe tomar decisiones importantes por el usuario.

Debe ayudar a ver:

- donde falta claridad;
- donde una mesa puede molestar;
- donde un paso parece bloqueado;
- donde el servicio puede necesitar apoyo;
- donde el plano no se entiende suficientemente bien.

La anticipacion debe sentirse como criterio experto, no como automatizacion invasiva.

### 9.5 Ano 5 - Editor como copiloto de operacion espacial

El Editor debe convertirse en una herramienta que no solo permite dibujar el restaurante, sino entenderlo mejor.

Debe ayudar al usuario a pensar:

- como se opera esta sala;
- que zonas funcionan mejor;
- donde se produce friccion;
- como se podria reorganizar el servicio;
- que partes del plano necesitan atencion;
- como adaptar el espacio a diferentes momentos del negocio.

El objetivo no es que Hostly dibuje por el usuario.

El objetivo es que Hostly le ayude a tomar mejores decisiones espaciales y operativas.

### 9.6 Principio permanente

Durante los cinco anos, el Editor no debe perder su promesa central:

**Construir un restaurante debe sentirse mas natural que usar un editor.**

---

## 10. Reglas De Evaluacion Permanente

Cada decision futura sobre interaccion debe responder estas preguntas:

- Esto empieza desde una intencion real del usuario?
- Esto evita que el usuario piense en sistemas internos?
- Esto acerca mesas y servicio al centro de la experiencia?
- Esto reduce carga mental?
- Esto permite empezar sin miedo?
- Esto respeta diferentes formas de construir un restaurante?
- Esto ayuda a corregir sin frustracion?
- Esto hace que el primer minuto sea mas claro?
- Esto se entiende en tablet?
- Esto ayuda a un encargado real en un negocio real?
- Esto evita convertir Hostly en CAD, Paint o videojuego?
- Esto hace que la sofisticacion se sienta como sencillez?

Si una decision no mejora la relacion entre intencion y resultado, no pertenece al modelo principal de interaccion.

---

## 11. Declaracion Final

El Editor de Hostly no debe ensenar a editar.

Debe ayudar a construir un restaurante.

Su modelo de interaccion no debe nacer de herramientas, fases ni sistemas. Debe nacer de las frases que una persona real tiene en la cabeza:

"Tengo una sala."

"Aqui iran las mesas."

"Necesito una barra."

"Esta zona no se usa."

"El camarero tiene que pasar."

"Quiero reconocer mi terraza."

"Esto debe servir durante el servicio."

Cuando Hostly responda a esas intenciones de forma natural, el Editor dejara de ser una herramienta visual avanzada y se convertira en algo mucho mas valioso:

**la forma mas sencilla de convertir un restaurante real en una operacion visual clara.**

