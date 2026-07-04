# HOSTLY_EDITOR_V2_VISUAL_LIBRARY_CATALOG

> Catalogo oficial de referencia futura para la biblioteca visual del Editor V2 de Hostly.

**Estado:** referencia canonica futura, no inventario implementado  
**Ambito:** objetos visuales del Editor V2 para terreno, estructura, operacion, vegetacion, decoracion, exterior, iluminacion y agua  
**Autoridad:** complementa `docs/HOSTLY_EDITOR_V2_VISUAL_LANGUAGE.md`  
**Ultima revision:** 2026-07-04  

---

## 1. Proposito

Este documento convierte la direccion artistica del Editor V2 en un catalogo de objetos visuales de referencia.

No documenta objetos implementados. No define componentes, codigo, CSS, assets ni material system. Su funcion es establecer una biblioteca futura coherente para que Hostly pueda crecer durante años sin perder identidad visual, claridad operativa ni consistencia entre tipologias de hosteleria.

El catalogo debe servir para diseñar, evaluar y priorizar futuros objetos visuales del Editor V2.

---

## 2. Principio de biblioteca

La biblioteca visual de Hostly no debe crecer como una coleccion suelta de dibujos.

Debe crecer como un **atlas visual de hosteleria profesional**.

Cada objeto debe:

- reconocerse desde vista cenital;
- convivir con mesas, barras y estados operativos;
- respetar la jerarquia Operacion > Espacio > Ambiente;
- mantener una gramatica comun de borde fino, sombra suave y textura contenida;
- poder adaptarse a restaurantes, hoteles, rooftops, beach clubs, terrazas, resorts y chiringuitos;
- aportar lectura espacial, operativa o ambiental real.

---

## 3. Leyenda de prioridad

| Prioridad | Significado | Criterio de inclusion futura |
| --- | --- | --- |
| **P0** | Esencial | Objeto necesario para que el Editor V2 represente operaciones reales de hosteleria. Debe existir en la biblioteca base futura. |
| **P1** | Importante | Objeto muy util para tipologias frecuentes o para mejorar lectura espacial. Puede entrar despues del nucleo P0. |
| **P2** | Expansion | Objeto de riqueza ambiental, casos especiales o diferenciacion por tipologia. Debe añadirse solo si mantiene claridad. |

---

## 4. Leyenda de detalle

| Nivel | Significado | Uso recomendado |
| --- | --- | --- |
| **D1** | Silueta simple | Formas limpias, bajo detalle, maxima legibilidad. Ideal para fondos, limites, piezas pequeñas o elementos funcionales. |
| **D2** | Forma + material sugerido | Objeto reconocible con textura o material muy controlado. Nivel estandar para la mayoria de la biblioteca. |
| **D3** | Pieza protagonista | Elemento con identidad fuerte dentro del espacio. Debe usarse con moderacion y sin competir con la operacion. |

---

## 5. Regla de escala

La unidad visual base del Editor V2 es:

**Mesa de 4 pax = escala 1x**

Todas las recomendaciones de tamaño visual se expresan en relacion con esa unidad.

Ejemplos:

- 0.5x: objeto pequeño respecto a una mesa de 4 pax.
- 1x: tamaño equivalente a una mesa de 4 pax.
- 2x: aproximadamente dos veces la huella visual de una mesa de 4 pax.
- 4x o mas: elemento espacial grande que debe tratarse como zona o hito.

La escala no representa medidas constructivas exactas. Representa peso visual relativo dentro del mapa.

---

## 6. Criterios de personalizacion

Cada objeto define tres capacidades futuras:

| Capacidad | Significado |
| --- | --- |
| **Tintado** | El objeto puede cambiar color base sin perder identidad. |
| **Materiales** | El objeto puede adoptar acabados visuales como madera, piedra, metal, textil, marmol, hormigon o ceramica. |
| **Escalado** | El objeto puede cambiar tamaño manteniendo reconocimiento cenital y consistencia visual. |

Estas capacidades son criterios de diseño, no especificaciones tecnicas.

---

## 7. Familia: Terreno

Los objetos de Terreno definen la base espacial del establecimiento. Deben ser claros, silenciosos y subordinados a la operacion.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Suelo neutro | Terreno base | P0 | D1 | Area continua de fondo | Variable, fondo total o zona | Plano, mate, sin patron dominante | Blanco roto, gris calido, greige | Interior claro, interior oscuro, sala neutra | Si | Si | Si |
| Madera | Pavimento | P0 | D2 | Superficie por zona con direccion suave | Variable por sala o tarima | Lamas o veta amplia, no fotografica | Roble, nogal, teka, madera lavada | Lamas, espiga, tarima exterior | Si | Si | Si |
| Piedra | Pavimento | P0 | D2 | Losas amplias o superficie mineral | Variable por zona | Mancha mineral suave, juntas discretas | Caliza, travertino, gris calido, piedra arena | Lisa, irregular, patio, hotel | Si | Si | Si |
| Hormigon | Pavimento | P0 | D1 | Fondo continuo y limpio | Variable por sala | Microvariacion tonal, sin grano fuerte | Microcemento, gris calido, humo, greige | Pulido, urbano, mate | Si | Si | Si |
| Marmol | Pavimento noble | P1 | D2 | Losas grandes o piezas premium | Zonas nobles, barra o acceso | Veta larga simplificada | Blanco roto, crema, verde oscuro, negro suave | Blanco, crema, oscuro, barra noble | Si | Si | Si |
| Arena | Exterior/playa | P0 | D2 | Area organica amplia | Zonas de playa, chiringuito o beach club | Grano abstracto, irregularidad suave | Arena clara, beige salino, marfil | Playa, arena compacta, duna suave | Si | Si | Si |
| Cesped | Exterior/jardin | P0 | D2 | Mancha o area verde continua | Jardines, patios, hoteles | Textura plana con variacion natural | Verde oliva, salvia, verde seco | Natural, cuidado, jardin hotel | Si | Si | Si |
| Baldosa | Pavimento decorativo | P1 | D2 | Patron amplio y controlado | Patios, cafeterias, franjas | Repeticion simplificada, juntas suaves | Crema, terracota, azul apagado, verde suave | Hidraulica, ceramica, patio | Si | Si | Si |
| Tierra | Exterior natural | P1 | D1 | Area mate irregular | Jardines rusticos, fincas, chiringuitos | Superficie mineral simple | Arcilla, tierra seca, rojizo suave | Finca, jardin, exterior seco | Si | Si | Si |
| Alfombra o tapiz | Ambiente interior | P2 | D2 | Pieza bajo lounge o recepcion | 1.5x a 4x | Patron suave, borde definido | Neutros, vino apagado, verde profundo | Rectangular, circular, corredor | Si | Si | Si |

---

## 8. Familia: Estructura

Los objetos de Estructura explican limites, accesos, volumenes y condicionantes fisicos del espacio. Deben ser mas visibles que el ambiente y menos dominantes que la operacion.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Muro | Limite espacial | P0 | D1 | Linea gruesa continua | Longitud variable | Solido, claro, borde limpio | Blanco roto, gris, piedra | Recto, curvo, bajo, alto | Si | Si | Si |
| Cristal | Limite transparente | P0 | D1 | Linea fina doble o banda translucida | Longitud variable | Transparencia sugerida, brillo minimo | Azul gris, humo claro | Fijo, corredera, mampara | Si | No | Si |
| Puerta | Acceso | P0 | D1 | Hueco con arco o direccion de apertura | 0.8x a 1.5x | Geometria simple y funcional | Madera, blanco, metal suave | Abatible, doble, corredera | Si | Si | Si |
| Columna | Estructura vertical | P1 | D2 | Circulo o cuadrado solido | 0.25x a 0.8x | Volumen compacto con sombra leve | Piedra, hormigon, madera | Redonda, cuadrada, revestida | Si | Si | Si |
| Escalera | Circulacion | P1 | D2 | Secuencia de peldaños | 1x a 5x | Ritmo lineal claro | Gris, piedra, madera | Recta, en L, exterior | Si | Si | Si |
| Desnivel | Topografia interior/exterior | P1 | D1 | Franja, sombra o contorno suave | Variable | Sombra suave, borde discreto | Gris sombra, piedra, madera | Escalon, tarima elevada, rampa | Si | No | Si |
| Separador | Division ligera | P0 | D1 | Linea baja o panel fino | 1x a 5x | Ligero, no murario | Madera, metal, cuerda, vegetal | Biombo, cuerda, listones | Si | Si | Si |
| Barra estructural | Volumen fijo | P0 | D2 | Bloque largo, L o isla | 2x a 8x | Volumen solido, material noble | Piedra, madera, marmol, negro mate | Recta, L, isla, curva | Si | Si | Si |

---

## 9. Familia: Operacion

Los objetos de Operacion son la prioridad visual del Editor V2. Deben leerse antes que materiales, vegetacion o decoracion.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mesa redonda | Mesa | P0 | D2 | Circulo con lectura de capacidad | 0.8x a 1.4x | Tablero limpio, borde operativo | Tablero claro, madera, piedra suave | 2 pax, 4 pax, 6 pax | Si | Si | Si |
| Mesa rectangular | Mesa | P0 | D2 | Rectangulo con orientacion clara | 1x a 2.5x | Forma fuerte, lectura inmediata | Tablero neutro, madera, blanco roto | 2, 4, 6, 8 pax | Si | Si | Si |
| Mesa cuadrada | Mesa | P0 | D2 | Cuadrado compacto | 0.8x a 1.2x | Modular, limpia | Madera, piedra clara, neutro | Individual, modular, terraza | Si | Si | Si |
| Mesa alta | Mesa/bar | P0 | D2 | Mesa con sombra o base diferenciada | 0.8x a 1.5x | Altura sugerida sin realismo | Madera, negro, piedra | Redonda, rectangular, compartida | Si | Si | Si |
| Silla | Capacidad | P0 | D1 | Pieza pequeña alrededor de mesa | 0.15x a 0.35x | Silueta minima, repetible | Madera, negro, tapizado suave | Lateral, butaca, exterior | Si | Si | Parcial |
| Taburete | Barra | P0 | D1 | Punto o asiento alineado con barra | 0.15x a 0.35x | Compacto, claro | Madera, metal, cuero | Bajo, alto, barra | Si | Si | Si |
| Sofa lounge | Lounge operativo | P0 | D2 | Bloque blando lineal o modular | 1.5x a 4x | Textil suave, volumen bajo | Arena, gris calido, verde oliva, terracota | Lineal, L, modular, circular | Si | Si | Si |
| Mesa baja | Lounge | P1 | D1 | Pieza menor asociada a sofa | 0.5x a 1x | Sutil, secundaria | Piedra, madera, negro suave | Redonda, oval, rectangular | Si | Si | Si |
| Cama balinesa | Servicio premium | P0 | D3 | Rectangulo textil amplio | 2x a 4x | Pieza protagonista, sombra suave | Blanco roto, arena, madera | Simple, doble, con dosel | Si | Si | Si |
| Hamaca | Piscina/playa | P0 | D2 | Silueta alargada con direccion | 0.6x a 1.8x | Textil simple y legible | Blanco, arena, madera clara | Individual, doble, reclinada | Si | Si | Si |
| Punto camarero | Servicio | P1 | D1 | Mueble compacto | 0.8x a 1.2x | Funcional, bajo ruido | Gris, madera, negro suave | Estacion, mueble, consola | Si | Si | Si |
| Recepcion | Host stand | P1 | D2 | Volumen frontal pequeño | 1x a 2x | Pieza noble, clara | Madera, piedra, blanco roto | Hotel, restaurante, evento | Si | Si | Si |
| Punto recogida | Takeaway/pickup | P1 | D1 | Mostrador lineal claro | 1x a 2x | Utilitario, ordenado | Madera, blanco, negro suave | Delivery, pickup, barra rapida | Si | Si | Si |

---

## 10. Familia: Vegetacion

La vegetacion debe separar, orientar, ambientar o caracterizar. No debe usarse como relleno visual.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arbol generico | Vegetacion alta | P0 | D2 | Copa circular o irregular con tronco discreto | 1.5x a 4x | Masa vegetal suave, sombra ligera | Verde oliva, salvia, hoja desaturada | Pequeño, grande, con sombra | Si | No | Si |
| Palmera | Tropical/costa | P0 | D3 | Copa radial reconocible | 2x a 5x | Silueta elegante, hojas simplificadas | Verde profundo, tronco arena | Baja, alta, cluster | Si | No | Si |
| Olivo | Mediterraneo | P0 | D3 | Copa irregular grisacea | 1.5x a 3x | Sobrio, organico, premium | Verde grisaceo, oliva seco | Joven, centenario, en maceta | Si | No | Si |
| Jardinera rectangular | Separacion vegetal | P0 | D2 | Rectangulo lineal con vegetacion compacta | 1x a 4x | Volumen simple, borde claro | Piedra, barro, negro mate, verde | Baja, alta, lineal | Si | Si | Si |
| Jardinera circular | Vegetacion puntual | P1 | D2 | Circulo o bowl con planta | 0.6x a 1.5x | Objeto compacto | Barro, piedra, ceramica | Maceta, copa, bowl | Si | Si | Si |
| Arbusto | Masa vegetal | P0 | D1 | Mancha organica baja | 0.8x a 4x | Textura reducida, borde suave | Salvia, laurel, verde seco | Bajo, seto, irregular | Si | No | Si |
| Flores | Acento vegetal | P2 | D2 | Puntos o manchas pequeñas | 0.3x a 2x | Color controlado, sin detalle botanico | Blanco, lavanda, buganvilla, coral | Macizo, maceta, borde | Si | No | Si |
| Seto | Limite vegetal | P1 | D1 | Linea organica continua | Longitud variable | Masa lineal, baja textura | Verde oscuro suave, salvia | Bajo, alto, curvo | Si | No | Si |

---

## 11. Familia: Decoracion

Decoracion debe aportar ambiente o separacion sin reducir la lectura de la operacion. Todo objeto decorativo debe justificar su presencia.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Alfombra lounge | Decoracion util | P1 | D2 | Pieza bajo sofa o zona de espera | 1.5x a 4x | Patron suave, borde claro | Neutros, vino apagado, verde profundo | Redonda, rectangular, corredor | Si | Si | Si |
| Biombo | Separacion decorativa | P1 | D2 | Linea o panel articulado | 1x a 4x | Ligero, interiorista | Madera, ratan, textil | Recto, plegable, curvo | Si | Si | Si |
| Maceta decorativa | Ambiente | P1 | D2 | Objeto puntual con planta | 0.4x a 1x | Compacto, reconocible | Barro, piedra, ceramica | Alta, baja, bowl | Si | Si | Si |
| Escultura | Hito espacial | P2 | D2 | Pieza compacta central o lateral | 0.5x a 1.5x | Abstracta, sobria | Piedra, metal, blanco | Abstracta, totem, hotel | Si | Si | Si |
| Fuego o brasero | Exterior premium | P2 | D2 | Circulo o linea con centro calido | 0.8x a 1.5x | Hito atmosferico controlado | Piedra, negro, ambar | Circular, lineal, lounge | Si | Si | Si |
| Toldo | Sombra decorativa | P1 | D2 | Superficie parcial sobre zona | 2x a 8x | Textil plano, sombra ligera | Crudo, arena, rayas suaves | Fijo, vela, textil | Si | Si | Si |

---

## 12. Familia: Exterior

Exterior agrupa objetos propios de terraza, playa, jardin, piscina y resort. Deben ayudar a leer uso, sombra, circulacion y estancia.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sombrilla | Sombra exterior | P0 | D2 | Circulo o poligono con mastil sutil | 1.5x a 3x | Textil limpio, sombra ligera | Crudo, arena, verde seco | Central, lateral, playa | Si | Si | Si |
| Pergola | Estructura exterior | P1 | D2 | Reticula ligera sobre area | 3x a 10x | Lineal, arquitectonica | Madera, metal, caña | Abierta, cubierta, vegetal | Si | Si | Si |
| Cabana | Lounge exterior | P1 | D3 | Volumen abierto o semiabierto | 3x a 6x | Premium, textil y estructura clara | Textil claro, madera, arena | Abierta, cerrada, VIP | Si | Si | Si |
| Tarima elevada | Plataforma | P0 | D2 | Area rectangular o modular | Variable | Lamas limpias, borde claro | Teka, madera lavada, gris exterior | Playa, rooftop, piscina | Si | Si | Si |
| Camino exterior | Circulacion | P1 | D1 | Franja continua o losas | Longitud variable | Direccional, discreto | Piedra, arena, tierra | Recto, organico, losas | Si | Si | Si |
| Valla baja | Limite exterior | P1 | D1 | Linea fina repetida | Longitud variable | Ligera, no muraria | Madera, cuerda, metal | Playa, jardin, terraza | Si | Si | Si |
| Ducha exterior | Piscina/playa | P2 | D1 | Pequeño hito vertical visto desde arriba | 0.4x a 0.8x | Funcional, minimo | Metal, piedra | Simple, doble | Si | Si | Si |

---

## 13. Familia: Iluminacion

La iluminacion se cataloga como elemento espacial, no como efecto grafico. Debe indicar ambiente, uso, recorrido o jerarquia de zona.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luz puntual mesa | Iluminacion espacial | P1 | D1 | Halo suave centrado o cercano | 1x a 2x | Transparente, discreto | Ambar calido, champagne | Mesa, lounge, premium | Si | No | Si |
| Guirnalda | Terraza | P1 | D2 | Linea con puntos ritmicos | Longitud variable | Ligera, festiva pero sobria | Blanco calido | Recta, zigzag, patio | Si | No | Si |
| Luz lineal barra | Barra/hotel | P1 | D1 | Linea fina siguiendo volumen | 1x a 8x | Precisa, arquitectonica | Champagne, blanco calido | Frontal, trasera, suelo | Si | No | Si |
| Baliza exterior | Camino | P2 | D1 | Punto pequeño con halo bajo | 0.2x a 0.5x | Funcional, suave | Calido bajo | Jardin, piscina, resort | Si | Si | Si |
| Lampara colgante | Interior | P2 | D2 | Circulo pequeño con halo | 0.3x a 0.8x | Objeto puntual | Negro, laton, crema | Individual, cluster | Si | Si | Si |
| Foco funcional | Servicio | P1 | D1 | Halo neutro dirigido a zona | 0.8x a 2x | Limpio, tecnico | Blanco neutro | Cocina, pickup, barra | Si | No | Si |

---

## 14. Familia: Agua

El agua debe tratarse como elemento espacial de alto valor. Define zonas, condiciona circulacion y aporta identidad a hoteles, resorts, rooftops y beach clubs.

| Nombre | Categoria | Pri. | Det. | Vista cenital recomendada | Tamaño visual recomendado | Estilo grafico | Colores | Variantes | Tintado | Materiales | Escalado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Piscina rectangular | Agua principal | P0 | D3 | Rectangulo limpio con borde definido | 4x a 12x | Superficie plana, brillo sutil | Turquesa desaturado, azul mineral | Hotel, rooftop, beach club | Si | Borde si | Si |
| Piscina organica | Resort | P1 | D3 | Forma curva o lagoon | Grande, variable | Organica, borde suave | Azul mineral, verde agua | Lagoon, curva, infinity | Si | Borde si | Si |
| Fuente circular | Patio/hotel | P1 | D2 | Circulo central o lateral | 1.5x a 4x | Piedra + agua contenida | Agua azul gris, piedra clara | Central, baja, clasica | Si | Si | Si |
| Fuente lineal | Hotel/gastro | P2 | D2 | Franja o canal longitudinal | 2x a 8x | Elegante, arquitectonica | Azul oscuro, piedra | Canal, lamina, eje | Si | Si | Si |
| Lamina de agua | Ambiente premium | P1 | D2 | Area plana no transitable | 2x a 8x | Minimalista, reflexiva | Azul gris, negro agua | Patio, recepcion, jardin | Si | Borde si | Si |
| Borde piscina | Contencion | P0 | D1 | Linea perimetral o deck | Segun piscina | Preciso, materializado | Piedra clara, madera, hormigon | Deck, piedra, infinity | Si | Si | Si |

---

## 15. Regla de crecimiento de biblioteca

Antes de incorporar un nuevo objeto al catalogo futuro de Hostly, debe cumplir estas condiciones:

1. Se reconoce desde vista cenital.
2. No compite con las mesas.
3. Puede vivir dentro de la jerarquia Operacion > Espacio > Ambiente.
4. Comparte la misma gramatica visual: borde fino, sombra suave, textura contenida y color natural.
5. Puede adaptarse a varias tipologias sin parecer de otro producto.
6. Tiene variantes controladas, no infinitas.
7. Su escala tiene sentido frente a una mesa de 4 pax.
8. Aporta lectura espacial, operativa o ambiental real.
9. No introduce hiperrealismo, fotografia ni iconografia infantil.
10. Su presencia mejora la comprension del espacio.

Si un objeto no supera estos criterios, no debe entrar en la biblioteca visual oficial.

---

## 16. Decision canonica

La biblioteca visual del Editor V2 debe crecer de forma controlada, profesional y coherente.

Hostly debe poder representar cualquier establecimiento del mundo sin cambiar de lenguaje grafico. La diferencia entre un restaurante gastronomico, un chiringuito, un hotel, un rooftop o un beach club debe surgir de la combinacion de objetos, materiales, vegetacion, agua, luz y mobiliario dentro de una misma gramatica.

El catalogo futuro debe ser amplio, pero nunca ruidoso.

**La biblioteca visual existe para que la operacion se entienda mejor.**
