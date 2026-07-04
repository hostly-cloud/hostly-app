# HOSTLY_EDITOR_V2_VISUAL_LANGUAGE

> Documento oficial del lenguaje visual del Editor V2 de Hostly.

**Estado:** referencia canonica de diseno visual  
**Ambito:** Editor V2 de espacios, mapas, salas, terrazas, barras, hoteles, resorts y beach clubs  
**Autoridad:** subordinado a la Product Bible de Hostly y complementario al roadmap tecnico del Editor V2  
**Ultima revision:** 2026-07-04  

---

## 1. Proposito

Este documento define el lenguaje visual oficial del Editor V2 de Hostly.

No documenta implementacion tecnica. No define CSS, componentes, tokens ni modelos de datos. Define como debe pensarse, dibujarse y evaluarse el mundo visual del Editor V2 para que el equipo pueda recrear practicamente cualquier establecimiento de hosteleria sin perder consistencia, claridad ni capacidad operativa.

Hostly debe poder representar:

- restaurantes gastronomicos;
- cafeterias;
- terrazas urbanas;
- rooftops;
- beach clubs;
- chiringuitos;
- hoteles;
- resorts;
- piscinas;
- barras;
- lounges;
- salas privadas;
- jardines y patios;
- espacios interiores y exteriores con varias zonas.

La ambicion visual no es decorar un plano. La ambicion visual es que cualquier persona entienda el espacio, sus zonas, sus mesas y su funcionamiento en pocos segundos.

---

## 2. Filosofia

Hostly no es un CAD.

Hostly no es Paint.

Hostly no es un videojuego.

Hostly es un **editor espacial para hosteleria**.

Un CAD prioriza precision tecnica. Paint prioriza libertad grafica sin modelo espacial. Un videojuego prioriza inmersion visual. Hostly debe priorizar otra cosa: **comprension operativa del espacio hostelero**.

El Editor V2 debe sentirse como una planta arquitectonica viva, clara y usable. Debe tener suficiente calidez para reconocer un restaurante real, pero suficiente abstraccion para no convertirse en una maqueta decorativa que dificulte el trabajo.

### 2.1 Principio rector

La belleza siempre esta al servicio de la operacion.

Un material puede ser bello, pero nunca debe competir con una mesa. Una piscina puede aportar identidad, pero nunca debe ocultar una zona de servicio. Una palmera puede situar un beach club, pero nunca debe impedir leer la ocupacion de las mesas.

El Editor V2 debe ayudar a responder preguntas operativas:

- Donde esta cada mesa.
- A que espacio pertenece.
- Como se circula por la sala.
- Donde estan las barras y puntos de servicio.
- Que zonas son interiores, exteriores, lounge, playa, piscina o terraza.
- Que elementos estructurales condicionan la operacion.
- Que ambiente tiene el negocio sin perder legibilidad.

---

## 3. Jerarquia visual oficial

El lenguaje visual del Editor V2 se organiza en tres niveles:

1. Operacion.
2. Espacio.
3. Ambiente.

Esta jerarquia es obligatoria. Cuando haya conflicto visual entre niveles, siempre prevalece el nivel superior.

---

## 4. Nivel 1: Operacion

Operacion es todo aquello que afecta directamente al servicio, la gestion de mesas, el flujo del equipo o el uso diario del restaurante.

### 4.1 Elementos de operacion

Pertenecen a este nivel:

- mesas;
- sillas cuando ayudan a leer capacidad;
- mesas altas;
- taburetes de barra;
- sofas operativos;
- hamacas si se usan como unidad de servicio;
- camas balinesas si se reservan o atienden;
- barras activas;
- puntos de recogida;
- zonas de camareros;
- recepcion o host stand;
- estados de mesa;
- nombres, numeros y capacidad;
- seleccion activa;
- agrupaciones o zonas operativas;
- rutas claras de circulacion cuando afectan al servicio.

### 4.2 Por que es el nivel principal

Hostly se usa para operar negocios reales. El objetivo no es contemplar un plano bonito, sino entender una sala en uso. Por eso la mesa, el estado y la accion deben leerse antes que el suelo, la decoracion o el estilo del local.

### 4.3 Reglas visuales

- La mesa siempre debe destacar sobre el suelo.
- El estado operativo siempre debe ser mas claro que el material de fondo.
- La seleccion activa debe ser inequívoca.
- Los elementos operativos deben tener siluetas limpias y bordes reconocibles.
- La capacidad debe poder entenderse sin depender de decoracion excesiva.
- Ningun elemento ambiental puede cubrir, ensuciar o confundir una mesa.

---

## 5. Nivel 2: Espacio

Espacio es la estructura que permite entender donde ocurre la operacion.

### 5.1 Elementos de espacio

Pertenecen a este nivel:

- salas;
- terrazas;
- barras como volumen espacial;
- cocinas visibles si forman parte del plano;
- limites de espacio;
- muros;
- cristales;
- puertas;
- columnas;
- escaleras;
- desniveles;
- accesos;
- piscinas cuando definen una zona;
- fuentes cuando ordenan el patio;
- jardineras estructurales;
- separadores;
- pavimentos;
- tarimas;
- zonas de arena, cesped o tierra.

### 5.2 Por que es el segundo nivel

El espacio da contexto a la operacion. Permite entender si una mesa esta en sala, terraza, barra, piscina, jardin o lounge. Sin espacio, las mesas flotan sin significado. Pero el espacio no debe dominar sobre la operacion.

### 5.3 Reglas visuales

- Los limites espaciales deben ser claros pero no pesados.
- Los pavimentos deben diferenciar zonas sin competir con mesas.
- Las transiciones de material deben ayudar a leer cambios de uso.
- Puertas, muros y cristales deben explicar circulacion y separacion.
- Los elementos estructurales deben ser mas visibles que la decoracion, pero menos que la operacion.

---

## 6. Nivel 3: Ambiente

Ambiente es todo aquello que aporta identidad, estilo, calidez o contexto al establecimiento.

### 6.1 Elementos de ambiente

Pertenecen a este nivel:

- texturas decorativas;
- vegetacion no estructural;
- flores;
- objetos decorativos;
- iluminacion ambiental;
- patrones de suelo;
- alfombras visuales;
- detalles de agua no operativos;
- sombras suaves;
- mobiliario no operativo;
- elementos de estilo local.

### 6.2 Por que es el tercer nivel

El ambiente diferencia un chiringuito de un hotel, un rooftop de una cafeteria, un restaurante gastronomico de un resort. Pero su papel es apoyar la lectura, no ocupar el centro.

### 6.3 Reglas visuales

- El ambiente debe ser reconocible, no protagonista por defecto.
- La decoracion nunca puede dificultar la operacion.
- La textura nunca puede reducir el contraste de una mesa.
- Los detalles deben funcionar como acentos, no como ruido.
- Si un elemento ambiental no ayuda a comprender el espacio, debe simplificarse o desaparecer.

---

## 7. Nivel de abstraccion

Hostly no busca hiperrealismo.

Hostly busca reconocimiento inmediato.

Los materiales son interpretaciones graficas, no fotografias. La vegetacion es una sintesis cenital, no una ilustracion botanica. El agua es una lectura espacial, no una simulacion fisica. La iluminacion es una indicacion de ambiente y uso, no un efecto dramatico.

### 7.1 Estilo grafico oficial

El estilo visual recomendado es:

- planta cenital;
- lectura arquitectonica;
- formas simplificadas;
- sombras suaves;
- bordes finos;
- colores naturales y desaturados;
- texturas sutiles;
- objetos reconocibles desde arriba;
- contraste operativo alto;
- ornamentacion controlada.

### 7.2 Lo que Hostly no debe hacer

Hostly no debe usar:

- texturas fotograficas;
- materiales hiperrealistas;
- iconografia infantil;
- objetos caricaturescos;
- efectos de videojuego;
- brillos excesivos;
- sombras dramaticas;
- patrones que compitan con las mesas;
- decoracion que parezca mas importante que la operacion;
- representaciones tecnicas propias de CAD que requieran conocimiento profesional para interpretarse.

### 7.3 Criterio de aceptacion visual

Un elemento visual es correcto cuando:

- se reconoce en menos de un segundo;
- no necesita leyenda para entenderse;
- mantiene la mesa por encima en jerarquia;
- ayuda a distinguir tipo de espacio;
- conserva consistencia con el resto del mapa;
- funciona tanto en establecimientos simples como complejos.

---

## 8. Principios oficiales de diseno

Estos principios son permanentes y deben guiar cualquier decision futura del Editor V2.

1. La mesa siempre debe destacar sobre el suelo.
2. La decoracion nunca puede dificultar la operacion.
3. Un material puede ser bonito, pero nunca competir con una mesa.
4. Todo elemento visual debe ayudar a comprender el espacio.
5. La belleza esta al servicio de entender el espacio.
6. El mapa debe leerse antes de admirarse.
7. La operacion manda sobre la arquitectura; la arquitectura manda sobre el ambiente.
8. La abstraccion es una herramienta de claridad, no una limitacion estetica.
9. Cada material debe diferenciar uso espacial sin convertirse en protagonista innecesario.
10. La vegetacion debe ordenar, separar o ambientar; nunca ocultar.
11. El agua debe construir contexto espacial; nunca actuar como decoracion confusa.
12. La iluminacion debe explicar zonas y ambiente, no simular un render nocturno.
13. Los objetos deben tener siluetas reconocibles desde vista cenital.
14. La consistencia global pesa mas que la fidelidad exacta a un local concreto.
15. Hostly debe poder representar cualquier establecimiento del mundo sin perder su propia gramatica visual.

---

## 9. Materiales

Los materiales en Hostly son superficies de lectura espacial. No son acabados constructivos reales ni texturas fotograficas.

Cada material debe responder a tres preguntas:

- Que tipo de espacio estoy mirando.
- Que tono operativo tiene este espacio.
- Como se relacionan las mesas con ese fondo.

### 9.1 Madera

**Uso recomendado:** restaurantes calidos, cafeterias, hoteles boutique, barras, tarimas, salones interiores, terrazas cubiertas.  
**No usar:** zonas humedas donde el lenguaje dominante sea piscina, playa o cocina tecnica; mapas con demasiada densidad si la veta compite con mesas.  
**Protagonismo visual:** medio.  
**Colores recomendados:** roble claro, nogal suave, fresno, miel, madera lavada, tabaco desaturado.  
**Relacion con mesas:** aporta calidez bajo mesas, pero debe mantener contraste suficiente. Las mesas oscuras sobre madera oscura necesitan borde o separacion visual.  
**Estilo grafico:** veta amplia, muy sutil, sin realismo fotografico. Mejor sugerir direccion y calidez que dibujar detalle.

### 9.2 Piedra

**Uso recomendado:** hoteles, patios, restaurantes mediterraneos, resorts, terrazas premium, accesos y zonas nobles.  
**No usar:** locales de rotacion rapida si endurece demasiado la lectura; espacios pequenos donde cada textura compite por atencion.  
**Protagonismo visual:** medio.  
**Colores recomendados:** caliza, travertino, gris calido, piedra arena, beige mineral, greige.  
**Relacion con mesas:** funciona como fondo estable para mesas premium y zonas exteriores; debe ser mas silenciosa que el mobiliario.  
**Estilo grafico:** variacion mineral suave, manchas grandes, juntas discretas.

### 9.3 Hormigon

**Uso recomendado:** cafeterias urbanas, rooftops, locales contemporaneos, barras modernas, espacios industriales refinados.  
**No usar:** restaurantes clasicos, resorts naturales o beach clubs donde el material contradiga el ambiente.  
**Protagonismo visual:** bajo-medio.  
**Colores recomendados:** gris calido, microcemento, greige, humo, piedra urbana.  
**Relacion con mesas:** fondo neutro ideal para alta densidad de mesas. Debe reforzar claridad, no frialdad excesiva.  
**Estilo grafico:** superficie plana con variacion tonal minima.

### 9.4 Marmol

**Uso recomendado:** hoteles, restaurantes gastronomicos, barras premium, lobbies, zonas de recepcion, rooftops sofisticados.  
**No usar:** chiringuitos informales, terrazas rusticas, zonas con demasiada operacion rapida o espacios de lectura muy densa.  
**Protagonismo visual:** medio-alto si se usa en barra o zona noble; bajo si se usa como suelo.  
**Colores recomendados:** blanco roto, crema, verde oscuro muy controlado, negro suave, gris veteado.  
**Relacion con mesas:** debe reservarse para piezas o zonas con intencion, no como fondo dominante de todo el mapa.  
**Estilo grafico:** vetas largas y muy simplificadas. Nunca textura fotografica.

### 9.5 Arena

**Uso recomendado:** beach clubs, chiringuitos, resorts, zonas de playa, terrazas informales junto al mar.  
**No usar:** interiores formales, barras tecnicas, restaurantes gastronomicos urbanos sin relacion exterior.  
**Protagonismo visual:** medio.  
**Colores recomendados:** arena clara, marfil, beige salino, dorado apagado.  
**Relacion con mesas:** mesas, hamacas y camas deben tener sombra o base clara para no perderse sobre la arena.  
**Estilo grafico:** grano abstracto, irregularidad muy suave, sin textura fotografica.

### 9.6 Cesped

**Uso recomendado:** jardines, hoteles, resorts, terrazas verdes, patios, zonas lounge exteriores, areas familiares.  
**No usar:** restaurantes gastronomicos interiores, cocinas, barras principales, zonas urbanas sin vegetacion real.  
**Protagonismo visual:** bajo-medio.  
**Colores recomendados:** verde oliva, verde seco, salvia, cesped natural desaturado.  
**Relacion con mesas:** ayuda a separar areas exteriores. Las mesas deben mantener contorno limpio y lectura de estado.  
**Estilo grafico:** textura plana con ligera variacion, no cesped hiperrealista.

### 9.7 Agua como material

**Uso recomendado:** piscinas, fuentes, laminas de agua, patios, resorts, hoteles, beach clubs, rooftops con piscina.  
**No usar:** como relleno decorativo sin funcion espacial; en zonas donde pueda confundirse con superficie transitable.  
**Protagonismo visual:** alto cuando define una piscina; medio cuando es fuente; bajo-medio cuando es lamina decorativa.  
**Colores recomendados:** azul mineral, turquesa desaturado, azul grisaceo, verde agua suave.  
**Relacion con mesas:** las mesas deben respetar margen visual. El agua nunca debe tocar visualmente elementos operativos salvo que represente una configuracion real.  
**Estilo grafico:** superficie limpia, brillo sutil, borde claro. No simular olas de forma realista.

### 9.8 Baldosa

**Uso recomendado:** cafeterias, restaurantes tradicionales, patios, terrazas mediterraneas, hoteles con identidad local.  
**No usar:** espacios con mesas muy pequenas y densas si el patron afecta la lectura.  
**Protagonismo visual:** medio-alto si tiene patron; medio si es baldosa lisa.  
**Colores recomendados:** crema, terracota, azul apagado, verde botella suave, gris claro, blanco roto.  
**Relacion con mesas:** preferible en franjas, patios o zonas concretas. Evitar patrones demasiado pequenos bajo mesas densas.  
**Estilo grafico:** patron simplificado, repeticion amplia, juntas discretas.

### 9.9 Tarima

**Uso recomendado:** terrazas, rooftops, beach clubs, piscinas, zonas lounge, plataformas elevadas, espacios temporales.  
**No usar:** interiores gastronomicos muy formales si contradice el concepto; zonas donde se confunda con mesa o barra.  
**Protagonismo visual:** medio.  
**Colores recomendados:** madera lavada, teka suave, gris exterior, roble natural, arena.  
**Relacion con mesas:** debe ayudar a entender plataformas y zonas de estancia. Las mesas deben alinearse con la tarima sin depender de ella para leerse.  
**Estilo grafico:** lamas largas, ritmo claro, baja textura.

### 9.10 Tierra

**Uso recomendado:** jardines rusticos, fincas, terrazas naturales, chiringuitos, bodegas, patios rurales.  
**No usar:** hoteles urbanos premium, restaurantes muy pulidos, espacios donde parezca suciedad accidental.  
**Protagonismo visual:** bajo-medio.  
**Colores recomendados:** arcilla, terracota seca, marron claro, arena rojiza, tierra mineral.  
**Relacion con mesas:** funciona mejor con mobiliario exterior, jardineras y arboles. Mantener contraste alto con mesas.  
**Estilo grafico:** superficie mate, irregularidad amplia, sin grano detallado.

---

## 10. Vegetacion

La vegetacion en Hostly debe cumplir una funcion espacial: separar, orientar, ambientar o caracterizar una tipologia.

No debe usarse como relleno decorativo indiscriminado.

### 10.1 Arboles

**Uso recomendado:** jardines, patios, terrazas amplias, hoteles, resorts, restaurantes con espacio exterior.  
**No usar:** salas pequeñas donde oculten mesas o recorridos; espacios interiores sin intencion vegetal clara.  
**Protagonismo visual:** alto si son hitos; medio si forman borde.  
**Colores recomendados:** verde oliva, verde hoja desaturado, sombra verde gris, tronco marron calido.  
**Relacion con mesas:** deben generar zonas de sombra y referencia, no bloquear lectura. Las mesas cercanas deben conservar margen visual.  
**Estilo grafico:** copa cenital simplificada, sombra suave, tronco discreto.

### 10.2 Palmeras

**Uso recomendado:** beach clubs, resorts, piscinas, rooftops tropicales, chiringuitos, hoteles costeros.  
**No usar:** restaurantes gastronomicos urbanos, cafeterias clasicas, espacios interiores sin narrativa tropical.  
**Protagonismo visual:** alto.  
**Colores recomendados:** verde profundo, verde seco, tronco arena, sombra calida.  
**Relacion con mesas:** funcionan como hitos entre lounge, piscina y playa. No deben cruzar visualmente estados de mesa.  
**Estilo grafico:** silueta radial elegante, hojas simplificadas, tronco pequeño.

### 10.3 Olivos

**Uso recomendado:** restaurantes mediterraneos, terrazas premium, hoteles boutique, patios, beach clubs sobrios.  
**No usar:** conceptos tropicales, cafeterias urbanas muy compactas, espacios nocturnos de cocteleria donde no aporten contexto.  
**Protagonismo visual:** medio-alto.  
**Colores recomendados:** verde grisaceo, oliva seco, tronco calido, sombra piedra.  
**Relacion con mesas:** ideales como pieza central o borde de terraza. Deben crear identidad sin dominar la operacion.  
**Estilo grafico:** copa irregular, menos densa que un arbol comun, textura ligera.

### 10.4 Jardineras

**Uso recomendado:** separar mesas, delimitar terrazas, crear privacidad, organizar recorridos, marcar bordes de lounge.  
**No usar:** pasos estrechos, zonas donde reduzcan accesibilidad o oculten mesas.  
**Protagonismo visual:** medio.  
**Colores recomendados:** piedra clara, barro, terracota, negro mate, verde contenido.  
**Relacion con mesas:** son herramientas de orden. Deben ayudar a modular distancia y privacidad entre mesas.  
**Estilo grafico:** volumen simple, borde claro, vegetacion suave y compacta.

### 10.5 Flores

**Uso recomendado:** hoteles, restaurantes romanticos, cafeterias, patios, eventos, zonas de entrada, acentos mediterraneos.  
**No usar:** operaciones densas, cocinas, barras tecnicas, mapas donde añadan ruido cromatico.  
**Protagonismo visual:** bajo.  
**Colores recomendados:** blanco, lavanda, buganvilla, coral suave, amarillo muy controlado.  
**Relacion con mesas:** acento periferico o de entrada; no bajo mesas ni sobre estados operativos.  
**Estilo grafico:** manchas pequeñas de color, nunca flores detalladas.

### 10.6 Arbustos

**Uso recomendado:** separar zonas, construir bordes de jardin, acompañar muros, suavizar limites exteriores.  
**No usar:** donde parezcan obstaculos no transitables si no lo son; interiores con lectura tecnica.  
**Protagonismo visual:** bajo-medio.  
**Colores recomendados:** salvia, laurel, verde seco, oliva oscuro.  
**Relacion con mesas:** buenos para crear fondo y privacidad sin competir con la mesa.  
**Estilo grafico:** masas organicas continuas, textura muy reducida.

---

## 11. Agua

El agua debe representarse como elemento espacial de alto valor. No es un efecto decorativo. Ordena zonas, define ambientes y condiciona la circulacion.

### 11.1 Piscinas

**Uso recomendado:** resorts, hoteles, beach clubs, rooftops, zonas wellness, terrazas con piscina real.  
**No usar:** restaurantes o cafeterias donde el agua no exista como parte del espacio.  
**Protagonismo visual:** muy alto.  
**Colores recomendados:** turquesa desaturado, azul mineral, azul claro profundo, borde piedra clara.  
**Relacion con mesas:** mesas, hamacas y camas balinesas deben mantener separacion visual del borde. El agua debe ordenar el layout, no invadirlo.  
**Representacion:** planta limpia, borde definido, brillo muy sutil, ligera variacion interna. No simular movimiento realista.

### 11.2 Fuentes

**Uso recomendado:** patios, hoteles, restaurantes mediterraneos, resorts, entradas, jardines formales.  
**No usar:** espacios de alta rotacion o salas pequenas donde ocupen demasiada atencion.  
**Protagonismo visual:** medio-alto.  
**Colores recomendados:** agua azul grisacea, piedra caliza, travertino, sombra suave.  
**Relacion con mesas:** pueden organizar mesas alrededor, siempre con margen ceremonial y circulacion clara.  
**Representacion:** geometria simple circular, cuadrada o longitudinal. Agua contenida, sin detalle excesivo.

### 11.3 Laminas de agua

**Uso recomendado:** hoteles boutique, gastronomia, patios premium, resorts contemporaneos.  
**No usar:** chiringuitos informales, cafeterias rapidas, planos donde pueda confundirse con piscina usable.  
**Protagonismo visual:** medio.  
**Colores recomendados:** azul gris, verde agua oscuro, negro agua en contextos nocturnos.  
**Relacion con mesas:** elemento de atmosfera y separacion. Debe mantenerse claramente no transitable.  
**Representacion:** superficie plana, elegante, con borde fino y reflejo minimo.

---

## 12. Iluminacion

La iluminacion en Hostly no debe tratarse como efecto grafico. Debe tratarse como elemento espacial.

La luz ayuda a entender:

- zonas de estancia;
- barras;
- recorridos;
- espacios nocturnos;
- areas premium;
- limites entre comedor, lounge y terraza.

### 12.1 Reglas de iluminacion

- La luz nunca debe ocultar estados de mesa.
- Los halos deben ser suaves y controlados.
- La iluminacion debe sugerir ambiente, no renderizar una escena.
- La luz calida comunica hospitalidad; la luz neutra comunica funcion.
- Las zonas tecnicas pueden tener luz mas limpia y menos emocional.
- Las guirnaldas, focos y lineas de luz deben dibujar estructura espacial.

### 12.2 Tipos recomendados

**Luz puntual calida:** restaurantes, hoteles, mesas premium, zonas gastronomicas. Protagonismo medio.  
**Guirnaldas:** terrazas, chiringuitos, patios y rooftops informales. Protagonismo medio, nunca saturado.  
**Luz lineal:** barras, recepciones, hoteles modernos, rooftops. Protagonismo bajo-medio.  
**Luz funcional:** cocina, puntos de recogida, barras operativas. Protagonismo bajo.  
**Luz ambiental exterior:** jardines, piscinas, resorts. Protagonismo bajo, como lectura de zona.

---

## 13. Mobiliario

El mobiliario debe distinguir entre mobiliario operativo y mobiliario ambiental.

El mobiliario operativo pertenece al nivel 1. El mobiliario ambiental pertenece al nivel 3, salvo que condicione circulacion o reserva.

### 13.1 Mesas

**Uso:** elemento central de Hostly.  
**Protagonismo visual:** maximo.  
**Reglas:** deben destacar siempre, mostrar capacidad cuando corresponda y mantener lectura clara de estado, seleccion y pertenencia a espacio.  
**Estilo grafico:** silueta limpia, borde claro, geometria reconocible, sombra suave.

### 13.2 Sofas

**Uso recomendado:** zonas lounge, hoteles, rooftops, beach clubs, cocteleria, espera, salas privadas.  
**No usar:** si se confunden con mesas operativas o reducen claridad de paso.  
**Protagonismo visual:** medio-alto cuando son reservables; medio-bajo si son decorativos.  
**Relacion con mesas:** pueden formar grupos lounge asociados a mesas bajas. Deben leerse como otra logica de servicio.  
**Estilo grafico:** bloques blandos, esquinas suaves, tapicerias neutras.

### 13.3 Barras

**Uso recomendado:** restaurantes, hoteles, cafeterias, beach clubs, rooftops, chiringuitos.  
**No usar:** como decoracion si no cumple funcion espacial u operativa.  
**Protagonismo visual:** alto.  
**Relacion con mesas:** la barra es ancla de servicio. Debe orientar circulacion y zonas de taburetes sin robar jerarquia a mesas activas.  
**Estilo grafico:** volumen solido, material noble, frontal claro, posible backbar simplificado.

### 13.4 Sombrillas

**Uso recomendado:** terrazas, piscinas, beach clubs, chiringuitos, patios soleados.  
**No usar:** interiores o espacios donde oculten demasiadas mesas.  
**Protagonismo visual:** medio.  
**Relacion con mesas:** deben agrupar o proteger mesas, no taparlas visualmente.  
**Estilo grafico:** circulos o poligonos cenitales, color crudo, sombra ligera.

### 13.5 Hamacas

**Uso recomendado:** piscinas, resorts, beach clubs, zonas de playa y wellness.  
**No usar:** restaurantes formales o cafeterias sin uso lounge.  
**Protagonismo visual:** medio cuando son reservables; bajo-medio si solo ambientan.  
**Relacion con mesas:** pueden actuar como unidades de servicio alternativas. Deben diferenciarse claramente de mesas comedor.  
**Estilo grafico:** silueta alargada, textil simple, orientacion clara.

### 13.6 Camas balinesas

**Uso recomendado:** beach clubs, resorts, piscinas premium, terrazas privadas, zonas VIP.  
**No usar:** establecimientos urbanos sin lounge real o espacios muy compactos.  
**Protagonismo visual:** alto.  
**Relacion con mesas:** suelen ser unidad reservable y deben tener jerarquia cercana a mesa operativa. Mantener separacion con piscina y circulacion.  
**Estilo grafico:** rectangulo textil amplio, sombra suave, posible dosel muy simplificado.

---

## 14. Tipologias

Las tipologias no son plantillas cerradas. Son direcciones visuales que ayudan a mantener coherencia.

### 14.1 Restaurante gastronomico

**Lenguaje:** sobrio, silencioso, preciso.  
**Materiales:** madera oscura, piedra, marmol puntual, hormigon calido.  
**Vegetacion:** olivos discretos, jardineras puntuales, flores muy controladas.  
**Agua:** solo si ordena patio o acceso.  
**Iluminacion:** puntual calida, baja intensidad visual.  
**Mesas:** pocas, claras, con mucha separacion. Maximo protagonismo.

### 14.2 Cafeteria

**Lenguaje:** amable, luminoso, flexible.  
**Materiales:** madera clara, terrazo, baldosa, hormigon suave.  
**Vegetacion:** plantas bajas, flores pequeñas, jardineras ligeras.  
**Agua:** generalmente no protagonista.  
**Iluminacion:** clara, calida, funcional.  
**Mesas:** mas densas, pequeñas, lectura rapida.

### 14.3 Terraza

**Lenguaje:** exterior ordenado, tactil, adaptable.  
**Materiales:** tarima, piedra, baldosa exterior, hormigon, cesped puntual.  
**Vegetacion:** jardineras como separadores, arbustos, arboles si hay escala.  
**Agua:** solo si forma parte real del patio o plaza.  
**Iluminacion:** guirnaldas o luz calida exterior.  
**Mesas:** agrupadas por zonas, con pasos claros.

### 14.4 Rooftop

**Lenguaje:** premium, nocturno, horizontal, social.  
**Materiales:** piedra oscura, madera exterior, hormigon pulido, marmol en barra.  
**Vegetacion:** palmeras puntuales, jardineras lineales, arbustos bajos.  
**Agua:** piscinas o laminas si son parte de la experiencia.  
**Iluminacion:** lineal, calida, ambiente nocturno controlado.  
**Mesas:** combinadas con sofas, barras y lounge. La operacion debe seguir siendo clara.

### 14.5 Beach Club

**Lenguaje:** solar, relajado, amplio, mediterraneo o tropical segun contexto.  
**Materiales:** arena, tarima, madera lavada, piedra clara, textiles crudos.  
**Vegetacion:** palmeras, jardineras, arbustos costeros.  
**Agua:** piscina o borde de playa como elemento principal.  
**Iluminacion:** natural de dia, calida y baja al atardecer.  
**Mesas:** conviven con hamacas y camas balinesas. Distinguir claramente servicio comedor, lounge y playa.

### 14.6 Hotel

**Lenguaje:** elegante, internacional, zonificado.  
**Materiales:** piedra, marmol, madera, alfombras graficas discretas, baldosa noble.  
**Vegetacion:** olivos, arboles, jardineras arquitectonicas, flores en acceso.  
**Agua:** fuentes, piscinas o laminas segun zona.  
**Iluminacion:** jerarquica: recepcion, barra, comedor, lounge y exterior.  
**Mesas:** deben leerse por contexto: desayuno, restaurante, lobby, eventos, terraza.

### 14.7 Resort

**Lenguaje:** paisajistico, amplio, natural, por capas.  
**Materiales:** piedra, arena, madera, cesped, agua, tierra controlada.  
**Vegetacion:** palmeras, arboles, arbustos, jardineras, jardines extensos.  
**Agua:** piscinas y laminas de agua como ordenadores espaciales.  
**Iluminacion:** ambiental exterior y recorridos suaves.  
**Mesas:** islas operativas dentro del paisaje. Mantener margenes generosos.

### 14.8 Chiringuito

**Lenguaje:** directo, fresco, informal, costero.  
**Materiales:** arena, madera lavada, tarima, tierra clara, fibras naturales sugeridas.  
**Vegetacion:** palmeras puntuales, sombrillas, arbustos costeros.  
**Agua:** mar o piscina solo si forma parte del espacio real; no decorar por decorar.  
**Iluminacion:** guirnaldas, luz calida simple, puntos funcionales.  
**Mesas:** simples, visibles, resistentes, con lectura clara de servicio.

---

## 15. Lenguaje visual unificado

Hostly debe poder representar establecimientos muy distintos sin perder identidad. Para conseguirlo, todos los mapas deben compartir una misma gramatica visual.

### 15.1 Gramatica comun

- Vista cenital.
- Siluetas limpias.
- Bordes finos y consistentes.
- Sombra suave.
- Paleta natural.
- Textura de baja intensidad.
- Operacion siempre encima.
- Materiales como zonas, no como protagonistas.
- Vegetacion como estructura o ambiente, nunca ruido.
- Agua como elemento espacial reconocible.
- Iluminacion como organizacion, no efecto.
- Mobiliario simplificado y reconocible.

### 15.2 Adaptabilidad global

El mismo sistema debe servir para:

- un restaurante gastronomico en Copenhague;
- una terraza mediterranea en Mallorca;
- un rooftop en Singapur;
- un hotel en Marrakech;
- un beach club en Mykonos;
- una cafeteria en Madrid;
- un resort en Tulum;
- un chiringuito en Formentera.

La diferencia entre ellos no debe depender de cambiar el estilo grafico de Hostly. Debe depender de combinar materiales, vegetacion, agua, luz y mobiliario dentro de la misma gramatica.

### 15.3 Consistencia sobre literalidad

Hostly no debe intentar copiar cada establecimiento con fidelidad decorativa absoluta. Debe interpretarlo de forma suficiente para operar, entender y reconocer.

La pregunta no es:

"Se parece exactamente al local?"

La pregunta correcta es:

"Permite entender este local, operar sus mesas y reconocer su tipo de espacio sin perder claridad Hostly?"

---

## 16. Criterios de revision visual

Cada nueva decision visual del Editor V2 debe revisarse con estas preguntas:

1. La mesa sigue siendo el elemento mas importante?
2. El estado operativo se entiende inmediatamente?
3. El material ayuda a diferenciar el espacio?
4. La textura compite con la operacion?
5. La vegetacion ordena o solo decora?
6. El agua se entiende como elemento espacial?
7. La iluminacion explica uso o solo añade efecto?
8. El mobiliario se distingue por funcion?
9. La tipologia del establecimiento se reconoce?
10. El mapa sigue pareciendo Hostly?

Si la respuesta a cualquiera de las cuatro primeras preguntas es negativa, el diseño debe simplificarse.

---

## 17. Decision canonica

El Editor V2 de Hostly debe ser el editor visual mas intuitivo del sector hostelero porque entiende una verdad sencilla:

Un restaurante no es solo un plano.  
Un hotel no es solo una coleccion de mesas.  
Un beach club no es solo una piscina con hamacas.  
Una terraza no es solo mobiliario exterior.

Todos son sistemas espaciales vivos donde operan personas.

Hostly debe representar esos sistemas con belleza, pero la belleza nunca es el objetivo final. El objetivo final es que cualquier equipo pueda comprender, configurar y operar su espacio con confianza.

**La belleza esta al servicio de la operacion.**
