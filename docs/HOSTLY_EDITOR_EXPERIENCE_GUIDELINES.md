# HOSTLY_EDITOR_EXPERIENCE_GUIDELINES

> Guia oficial de experiencia del Editor V2 de Hostly.

**Estado:** referencia canonica de producto y experiencia  
**Ambito:** Editor V2 de espacios para restaurantes, bares, cafeterias, terrazas, rooftops, hoteles, resorts, beach clubs y chiringuitos  
**Autoridad:** documento maestro de experiencia del Editor V2, subordinado a la Product Bible de Hostly y complementario al lenguaje visual y catalogo visual del Editor V2  
**Ultima revision:** 2026-07-05  

---

## 1. Proposito

Este documento define como debe sentirse, entenderse y evolucionar la experiencia del Editor V2 de Hostly.

No documenta implementacion. No define pantallas concretas, componentes, modelos, persistencia, estilos ni arquitectura tecnica. Define el marco de decision que cualquier persona del equipo debe usar cuando tome decisiones sobre la experiencia del Editor V2.

La arquitectura interna de Hostly puede ser solida, profunda y sofisticada. El usuario no debe verla.

El usuario debe sentir una sola cosa:

**Estoy construyendo mi restaurante.**

Este documento existe para proteger esa idea durante los proximos anos.

---

## 2. Filosofia del Editor

### 2.1 Que es realmente el Editor de Hostly

El Editor V2 de Hostly es una herramienta para construir, entender y operar visualmente un establecimiento de hosteleria.

No es un editor generico. No es una aplicacion de dibujo. No es una herramienta de arquitectura. No es una maqueta decorativa. Es una experiencia pensada para que un responsable de hosteleria pueda representar su negocio y usarlo como base operativa.

El Editor debe permitir que una persona reconozca su local, entienda sus espacios, coloque sus mesas, organice el servicio y convierta el plano en una herramienta diaria.

Su valor no esta en ofrecer libertad absoluta. Su valor esta en convertir una realidad compleja en una experiencia clara.

Hostly debe ayudar a responder preguntas reales:

- Donde estan mis mesas.
- Como esta organizada mi sala.
- Que zonas tengo.
- Donde estan los accesos.
- Donde trabaja el equipo.
- Que espacios son interiores, exteriores, lounge, terraza, playa, piscina o hotel.
- Como se entiende el restaurante en hora punta.
- Como se opera el negocio con menos friccion.

### 2.2 Que no es

El Editor V2 no es un CAD.

No debe pedir al usuario mentalidad tecnica, precision constructiva ni conocimiento arquitectonico.

El Editor V2 no es Paint.

No debe sentirse como un lienzo libre donde cada usuario inventa su propio sistema visual.

El Editor V2 no es un videojuego.

No debe priorizar espectacularidad, realismo, efectos o decoracion por encima de claridad operativa.

El Editor V2 no es una biblioteca de iconos.

No debe convertirse en una coleccion creciente de objetos bonitos sin una funcion clara.

El Editor V2 no es una exposicion de sistemas internos.

No debe obligar al usuario a entender categorias tecnicas para poder crear su restaurante.

### 2.3 Que debe transmitir

El Editor debe transmitir:

- Claridad.
- Control.
- Rapidez.
- Profesionalidad.
- Calma.
- Confianza.
- Sencillez inevitable.
- Sensacion de producto comercial maduro.
- Reconocimiento inmediato del espacio.
- Utilidad real para la operacion diaria.

Debe sentirse moderno sin parecer experimental. Debe sentirse potente sin parecer complejo. Debe sentirse visual sin parecer decorativo.

### 2.4 Que debe evitar

El Editor debe evitar:

- Lenguaje tecnico visible.
- Pasos innecesarios.
- Herramientas escondidas.
- Paneles que exigen aprendizaje.
- Decoracion que compite con mesas.
- Estados visuales ambiguos.
- Superficies que parecen mas importantes que la operacion.
- Sensacion de software interno.
- Sensacion de maqueta inacabada.
- Sensacion de que el usuario esta configurando un sistema.

La mejor experiencia del Editor V2 es aquella en la que el usuario olvida que esta usando un editor.

---

## 3. Modelo Mental

### 3.1 Principio central

El usuario no debe pensar en fases.

El usuario debe pensar en su restaurante.

Un responsable de hosteleria no piensa en sistemas, documentos, capas o fases. Piensa en espacios, mesas, servicio, accesos, barras, terrazas y zonas que necesita gestionar.

El modelo mental oficial del Editor V2 debe estar centrado en hosteleria real.

### 3.2 Como piensa un encargado

Cuando un encargado crea su restaurante, su pensamiento natural suele seguir este orden:

1. Este es mi negocio.
2. Estos son mis espacios.
3. Estos son los limites del local.
4. Aqui entran los clientes.
5. Aqui se sientan.
6. Aqui trabaja el equipo.
7. Aqui esta la barra.
8. Aqui hay terraza, jardin, playa, piscina o lounge.
9. Asi quiero reconocer mi restaurante en pantalla.
10. Asi quiero operarlo durante el servicio.

Este pensamiento no es lineal de forma rigida. Un encargado puede empezar por las mesas, por la terraza, por la barra o por la sala principal. El Editor debe acompanar esa forma natural de pensar, no imponer una secuencia tecnica.

### 3.3 El restaurante como unidad mental

La unidad mental principal no es el plano.

La unidad mental principal es:

**Mi restaurante.**

Dentro de esa unidad aparecen:

- Mis espacios.
- Mis mesas.
- Mi servicio.
- Mis accesos.
- Mis barras.
- Mi terraza.
- Mi sala.
- Mi ambiente.
- Mi forma de operar.

El Editor debe reforzar constantemente esa relacion de propiedad y reconocimiento.

No se trata de crear "un mapa". Se trata de crear "mi restaurante".

### 3.4 El espacio como herramienta operativa

El espacio no existe para ser bonito.

El espacio existe para hacer visible la operacion.

Una sala se representa para entender donde estan las mesas. Una terraza se representa para gestionar ocupacion, rutas y servicio. Una barra se representa porque condiciona trabajo, pedidos y flujo. La vegetacion se representa porque ayuda a reconocer el lugar, no porque el editor sea decorativo.

El modelo mental correcto es:

**El espacio ayuda a operar.**

### 3.5 La arquitectura interna debe ser invisible

Hostly puede tener sistemas internos profundos. Esa profundidad es necesaria para que el producto sea robusto.

Pero el usuario no debe tener que pensar en ellos.

Los conceptos internos pueden organizar el producto por dentro. Por fuera, el producto debe hablar el idioma del restaurante.

Cuando el usuario siente que debe entender la estructura interna para avanzar, la experiencia falla.

---

## 4. Idioma del Producto

### 4.1 Principio de lenguaje

Hostly debe hablar como hablaria un responsable de hosteleria.

El idioma del Editor debe ser concreto, cotidiano y operativo. Debe describir cosas que existen en el negocio real, no abstracciones internas del producto.

Cada palabra debe ayudar al usuario a actuar.

### 4.2 Palabras recomendadas

Estas palabras pertenecen al idioma oficial de experiencia del Editor:

| Concepto | Uso recomendado |
| --- | --- |
| Mi restaurante | Forma principal de expresar propiedad y reconocimiento. |
| Mi sala | Espacio interior principal de servicio. |
| Mi terraza | Espacio exterior operativo. |
| Espacios | Agrupacion natural de salas, terrazas, zonas y ambientes. |
| Mesas | Centro operativo del plano. |
| Barra | Punto clave de venta, servicio y orientacion espacial. |
| Servicio | Actividad real del equipo durante la operacion. |
| Accesos | Entradas, salidas y puntos de paso comprensibles. |
| Puertas | Elementos reconocibles del local. |
| Cristales | Cerramientos visibles y comprensibles. |
| Paredes | Limites fisicos claros. |
| Separadores | Elementos que dividen sin cerrar completamente. |
| Zonas | Areas reconocibles para el usuario, siempre con significado hostelero. |
| Terraza | Espacio exterior de uso comercial. |
| Rooftop | Espacio exterior elevado con identidad propia. |
| Beach club | Espacio de playa, piscina, hamacas, camas y servicio. |
| Lounge | Zona de estancia, sofas, mesas bajas y servicio relajado. |
| Piscina | Hito espacial y ambiental. |
| Jardin | Area verde reconocible y contenida. |
| Ambiente | Elementos que ayudan a reconocer el local sin dominar la operacion. |
| Capacidad | Numero de personas que puede atenderse. |
| Distribucion | Organizacion de mesas, servicio y espacios. |
| Plano | Representacion clara del negocio. |

### 4.3 Palabras que deben evitarse en la experiencia

Estas palabras pueden existir en documentacion interna o conversaciones del equipo, pero no deben ser el idioma principal del usuario:

| Palabra a evitar | Por que debe evitarse |
| --- | --- |
| Surface | Es un concepto interno, no una palabra de hosteleria. |
| Operational | Es tecnico y distante. El usuario entiende "mesas" o "servicio". |
| Landscape | Puede ser interno, pero el usuario entiende "ambiente", "jardin" o "vegetacion". |
| Structure | Suena tecnico. El usuario entiende "paredes", "puertas" o "elementos fijos". |
| Documento | Expone la logica interna del producto. |
| Sistema | Hace que el usuario piense en software, no en su negocio. |
| Fase | Implica un proceso tecnico impuesto. |
| Capa | Puede ser util para expertos, pero no debe dominar la experiencia base. |
| Entidad | Es lenguaje de modelo, no de usuario. |
| Asset | Es lenguaje de produccion, no de hosteleria. |
| Nodo | Es lenguaje tecnico, no espacial. |
| Componente | Es lenguaje de interfaz, no de negocio. |
| Render | Es lenguaje tecnico/visual, no operativo. |

### 4.4 Traduccion oficial entre lenguaje interno y lenguaje de usuario

La experiencia debe traducir la complejidad interna a palabras humanas.

| Lenguaje interno | Lenguaje de usuario recomendado |
| --- | --- |
| Base | Mi restaurante, plano inicial, contorno del local. |
| Terreno | Suelo, exterior, playa, cesped, tarima, arena. |
| Zonas | Espacios, salas, terrazas, areas del restaurante. |
| Estructura | Paredes, puertas, cristales, columnas, separadores. |
| Paisajismo | Jardin, vegetacion, ambiente, exterior. |
| Operacion | Mesas, barra, servicio, estaciones, recogida. |
| Material | Acabado, suelo, superficie, estilo del espacio. |
| Visual Asset | Objeto, elemento, mobiliario, vegetacion. |

Esta traduccion no es cosmetica. Es producto.

Cuando el lenguaje cambia, cambia el modelo mental.

### 4.5 Tono de voz

El Editor debe hablar con un tono:

- Claro.
- Directo.
- Seguro.
- Breve.
- Operativo.
- Profesional.
- Cercano a la hosteleria.

Debe evitar:

- Explicaciones largas.
- Jerga tecnica.
- Mensajes de error abstractos.
- Etiquetas ambiguas.
- Promesas exageradas.
- Lenguaje infantil.
- Lenguaje de demo.

Hostly debe sonar como una herramienta que entiende el servicio.

---

## 5. Flujo Natural

### 5.1 Principio de flujo

La creacion de un restaurante debe sentirse como montar el negocio, no como completar un proceso tecnico.

El flujo natural no debe depender de que el usuario conozca el orden interno del editor. Debe permitir empezar por lo que el usuario tiene mas claro.

Un usuario puede pensar primero en la sala, en la terraza, en la barra o en las mesas. Todas esas entradas son validas si conducen rapidamente a un plano operativo.

### 5.2 Pasos naturales

El flujo ideal debe sentirse asi:

1. Definir el restaurante.
2. Dibujar los espacios principales.
3. Marcar limites y accesos.
4. Colocar mesas.
5. Anadir puntos de servicio.
6. Ajustar distribucion.
7. Hacer reconocible el ambiente.
8. Revisar si el plano sirve para operar.

Cada paso debe responder a una pregunta real:

- Que espacios tengo.
- Donde empieza y termina cada zona.
- Por donde entra la gente.
- Donde se sientan los clientes.
- Donde trabaja el equipo.
- Como se mueve el servicio.
- Que hace reconocible mi local.
- Si esto se entiende durante un turno real.

### 5.3 Pasos que no son naturales

No son naturales para el usuario:

- Elegir una fase tecnica antes de saber que quiere crear.
- Distinguir entre conceptos internos parecidos.
- Configurar capas antes de ver mesas.
- Elegir materiales antes de entender la distribucion.
- Buscar herramientas basicas en listas largas.
- Tener que recordar donde esta cada tipo de objeto.
- Interpretar nombres que no pertenecen al lenguaje de hosteleria.

### 5.4 Primer exito obligatorio

El Editor debe llevar al usuario a un primer exito rapido.

Ese primer exito no es tener un plano perfecto.

El primer exito es:

**Veo mi restaurante y puedo colocar mis mesas.**

Si el usuario no llega pronto a ese momento, el Editor se percibe complejo aunque sea potente.

### 5.5 Flujo desde lo operativo

Hostly debe recordar siempre que el plano no termina en el diseno. Termina en la operacion.

Un plano bonito que no ayuda a gestionar mesas no cumple la promesa de Hostly.

Un plano sencillo que permite operar con claridad si cumple la promesa.

---

## 6. Jerarquia Visual

### 6.1 Jerarquia oficial

La jerarquia visual oficial del Editor V2 es:

1. Operacion.
2. Espacio.
3. Ambiente.

Esta jerarquia es obligatoria. Toda decision futura debe evaluarse contra ella.

### 6.2 Operacion

La operacion es el nivel mas importante.

Incluye:

- Mesas.
- Numeros de mesa.
- Estados de mesa.
- Capacidad.
- Seleccion.
- Barras operativas.
- Recepcion.
- Estaciones de camareros.
- Puntos de recogida.
- Zonas de trabajo.
- Elementos que afectan directamente al servicio.

La operacion debe ser lo primero que se lee.

Un encargado debe poder abrir el plano y entender donde actuar sin analizar la decoracion.

Las mesas son el centro de gravedad visual del Editor. Todo lo demas existe para darles contexto.

### 6.3 Espacio

El espacio es el segundo nivel.

Incluye:

- Salas.
- Terrazas.
- Limites.
- Paredes.
- Puertas.
- Cristales.
- Columnas.
- Separadores.
- Suelos.
- Zonas reconocibles.

El espacio debe explicar donde ocurre la operacion.

Debe ser claro, estable y facil de reconocer. Debe ayudar al usuario a saber si una mesa pertenece a una sala, terraza, lounge, piscina, playa o barra.

El espacio no debe competir con las mesas. Debe sostenerlas.

### 6.4 Ambiente

El ambiente es el tercer nivel.

Incluye:

- Vegetacion.
- Pavimentos expresivos.
- Piscinas.
- Fuentes.
- Sombrillas.
- Hamacas.
- Sofas.
- Decoracion.
- Iluminacion ambiental.
- Elementos de identidad del local.

El ambiente ayuda a reconocer el restaurante.

No debe dominar la lectura. No debe convertir el plano en una ilustracion. No debe hacer que la operacion pierda contraste.

El ambiente es importante porque Hostly no quiere planos frios. Pero nunca es mas importante que las mesas.

### 6.5 Conflictos entre niveles

Cuando dos niveles compiten, gana siempre el nivel superior.

- Si un suelo hace menos legible una mesa, se reduce el suelo.
- Si una jardinera compite con una etiqueta, se reduce la jardinera.
- Si una piscina domina el plano, se baja su protagonismo.
- Si una zona compite con estados de mesa, se simplifica la zona.
- Si una decoracion es bonita pero confunde la operacion, se elimina o se suaviza.

La belleza esta subordinada a la claridad.

### 6.6 Consecuencia para el futuro

Cada nueva decision visual debe responder:

**Esto ayuda a entender y operar mejor el restaurante?**

Si la respuesta no es clara, la decision no pertenece al nucleo del Editor.

---

## 7. Biblioteca

### 7.1 Que debe ser la biblioteca

La biblioteca del Editor V2 debe sentirse como un repertorio curado de hosteleria profesional.

No debe sentirse como una lista tecnica. No debe sentirse como un cajon de iconos. No debe sentirse como una exposicion de posibilidades internas.

Debe transmitir:

- Orden.
- Confianza.
- Intencion.
- Rapidez.
- Familiaridad hostelera.
- Claridad tactil.
- Seleccion curada.

El usuario debe encontrar lo importante sin aprender la biblioteca.

### 7.2 Biblioteca como decision de producto

La biblioteca no debe crecer por acumulacion.

Cada elemento nuevo debe justificar su existencia.

Un objeto pertenece a la biblioteca si:

- Representa algo comun en hosteleria.
- Ayuda a crear un plano mas reconocible.
- Mejora la operacion o la lectura espacial.
- Puede convivir con mesas sin competir.
- Puede usarse en varias tipologias.
- Mantiene coherencia con el lenguaje visual de Hostly.

Un objeto no pertenece a la biblioteca si:

- Solo es decorativo.
- Es demasiado especifico.
- Complica la eleccion.
- Repite otro elemento con poca diferencia real.
- Hace que el editor parezca una herramienta de dibujo libre.
- Aporta mas ruido que claridad.

### 7.3 Familias comprensibles

Las familias de la biblioteca deben responder al pensamiento del usuario.

Familias recomendadas:

- Espacios.
- Mesas.
- Servicio.
- Accesos y limites.
- Exterior.
- Ambiente.
- Mobiliario.

Estas familias pueden traducirse internamente a sistemas mas precisos. Esa traduccion no debe condicionar el idioma principal.

### 7.4 Lo esencial debe estar cerca

El usuario debe encontrar rapidamente:

- Mesa.
- Barra.
- Puerta.
- Pared.
- Terraza.
- Zona.
- Jardinera.
- Sombrilla.
- Estacion de servicio.
- Punto de recogida.

Los elementos esenciales no deben quedar ocultos tras scroll profundo, categorias cerradas o nombres ambiguos.

### 7.5 Crecimiento futuro

La biblioteca debe crecer como un sistema editorial, no como inventario infinito.

Antes de anadir un elemento, el equipo debe decidir:

- Que problema real resuelve.
- En que tipo de negocio aparece.
- Si sera reconocido en vista cenital.
- Si respeta la jerarquia visual.
- Si aporta claridad o solo decoracion.
- Si reduce o aumenta la carga mental.

El crecimiento correcto es lento, curado y consistente.

---

## 8. Experiencia Tactil

### 8.1 Principio tactil

El Editor V2 debe sentirse comodo en manos reales.

No debe parecer una interfaz de escritorio encogida. Debe funcionar para iPad, tablet Android, portatil tactil y escritorio sin exigir precision excesiva.

La experiencia tactil debe transmitir:

- Seguridad.
- Control.
- Espacio para tocar.
- Estados claros.
- Acciones reversibles.
- Menos dependencia de menus pequenos.
- Menos necesidad de precision milimetrica.

### 8.2 El dedo no es un cursor

El usuario tactil no tiene hover.

No puede depender de pistas invisibles, microestados o acciones que solo aparecen al pasar el raton.

Toda accion principal debe ser comprensible sin hover.

### 8.3 Acciones naturales

Las acciones principales deben sentirse fisicas y previsibles:

- Tocar para seleccionar.
- Arrastrar para mover.
- Soltar para colocar.
- Tocar fuera para salir.
- Deshacer si algo sale mal.
- Usar controles contextuales solo cuando aportan claridad.

El usuario debe sentir que manipula su restaurante, no que opera una interfaz abstracta.

### 8.4 Evitar fatiga

La experiencia tactil debe evitar:

- Filas demasiado pequenas.
- Iconos ambiguos.
- Scroll excesivo.
- Objetos dificiles de seleccionar.
- Acciones que requieren demasiados toques.
- Herramientas que desaparecen.
- Modos que el usuario olvida que estan activos.

En hosteleria, el producto debe respetar el ritmo. Nadie quiere luchar con un plano durante el servicio o durante una configuracion urgente.

### 8.5 Claridad sobre densidad

En tactil, la claridad es mas importante que mostrar muchas cosas a la vez.

Un panel mas limpio, con menos opciones visibles pero mejor ordenadas, puede ser mejor que una biblioteca densa donde todo cabe pero nada respira.

---

## 9. Principios Innegociables

Estos principios son obligatorios para cualquier evolucion del Editor V2.

1. El usuario nunca debe pensar en arquitectura interna.
2. El usuario debe sentir que esta construyendo su restaurante, no aprendiendo un software.
3. Las mesas siempre son el foco.
4. La operacion siempre prevalece sobre espacio y ambiente.
5. El espacio debe explicar la operacion, no decorar el plano.
6. El ambiente debe ayudar a reconocer el local sin competir con mesas.
7. La complejidad debe esconderse hasta que sea necesaria.
8. El lenguaje debe pertenecer a la hosteleria, no a la implementacion.
9. La biblioteca debe ser curada, no infinita.
10. Cada objeto nuevo debe mejorar una lectura real del restaurante.
11. El primer exito debe llegar rapido.
12. Lo esencial no puede estar oculto.
13. El usuario no debe depender de conocer fases.
14. Los nombres deben ser comprensibles sin explicacion.
15. La experiencia tactil debe ser generosa.
16. Un plano debe ser util antes de ser bonito.
17. La belleza esta al servicio de entender el espacio.
18. Ningun material debe competir con una mesa.
19. Ninguna decoracion debe dificultar la operacion.
20. Ningun estado visual debe ser ambiguo.
21. El editor debe parecer sencillo aunque el producto sea sofisticado.
22. La interfaz debe reducir decisiones, no multiplicarlas.
23. El usuario debe poder recuperar el control si se equivoca.
24. El producto debe servir a restaurantes reales, no a demos ideales.
25. Si algo no mejora claridad, velocidad o operacion, debe cuestionarse.

---

## 10. Filtros Para Cualquier Decision Futura

Toda decision sobre el Editor V2 debe pasar por estas preguntas.

### 10.1 Filtro de usuario

- Esto ayuda a un encargado real a crear su restaurante mas rapido?
- Esto usa palabras que el usuario reconoceria en su negocio?
- Esto reduce la necesidad de aprender el software?
- Esto hace que el primer exito llegue antes?
- Esto se entiende sin explicacion?

### 10.2 Filtro de operacion

- Esto mejora la lectura de mesas?
- Esto ayuda a gestionar el servicio?
- Esto mejora la comprension de zonas, accesos o barras?
- Esto facilita trabajar en hora punta?
- Esto evita errores operativos?

### 10.3 Filtro de complejidad

- Esto introduce una decision innecesaria?
- Esto expone una logica interna?
- Esto obliga a entender fases, sistemas o capas?
- Esto podria resolverse con lenguaje mas simple?
- Esto aumenta carga mental?

### 10.4 Filtro visual

- Esto respeta Operacion > Espacio > Ambiente?
- Esto compite con las mesas?
- Esto hace que el plano parezca mas profesional?
- Esto ayuda a reconocer el local?
- Esto evita parecer Paint, CAD o videojuego?

### 10.5 Filtro de biblioteca

- Este objeto es realmente necesario?
- Aparece en negocios de hosteleria reales?
- Se reconoce en vista cenital?
- Tiene uso en mas de una tipologia?
- Aporta claridad o solo variedad?

### 10.6 Filtro tactil

- Esto se puede usar comodamente con el dedo?
- La accion principal es evidente sin hover?
- El usuario puede tocar sin miedo?
- El resultado de la accion es claro?
- Hay demasiados pasos para una tarea comun?

### 10.7 Filtro de lanzamiento

- Un usuario nuevo podria crear una sala util sin ayuda?
- El plano final se entiende en pocos segundos?
- El Editor parece producto comercial?
- Lo importante esta visible?
- El usuario siente control o siente configuracion?

Si una decision falla varios filtros, debe replantearse.

---

## 11. Criterio De Producto Para El Editor V2

El Editor V2 no debe competir por ser el editor mas completo.

Debe competir por ser el editor de espacios de hosteleria mas facil de entender y usar.

El exito del Editor no se mide por cuantas herramientas tiene. Se mide por la rapidez con la que un restaurante puede verse reflejado y empezar a operar.

La pregunta central no es:

**Que puede dibujar Hostly?**

La pregunta central es:

**Cuanto tarda un encargado en reconocer y usar su restaurante?**

Todo el producto debe optimizarse alrededor de esa pregunta.

---

## 12. Relacion Con Otros Documentos

Este documento define la experiencia.

El lenguaje visual define como debe verse el mundo del Editor.

El catalogo visual define que objetos pueden formar parte de la biblioteca futura.

La Product Bible define la direccion general de Hostly.

Cuando haya duda sobre una decision del Editor V2, este documento debe usarse para evaluar si la experiencia sigue siendo fiel a la promesa principal:

**Construir y operar un restaurante de forma visual, clara y sencilla.**

---

## 13. Declaracion Final

Hostly no debe ensenar al usuario como funciona el Editor.

Hostly debe permitirle reconocer su restaurante.

El mejor Editor V2 no sera el que mas se note. Sera el que desaparezca lo suficiente para que el usuario piense en su negocio, sus mesas, su equipo y su servicio.

La tecnologia puede ser compleja.

La experiencia no debe serlo.

