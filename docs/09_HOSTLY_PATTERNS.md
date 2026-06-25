# HOSTLY PATTERNS

## 1. Objetivo del documento

Este documento define los patrones oficiales de UX y producto de Hostly.

Un patrón es una solución reutilizable para un problema que aparece de forma repetida en distintos módulos. Su función no es decorar una pantalla. Su función es evitar que dos equipos, dos desarrolladores o dos IAs resuelvan el mismo problema de maneras incompatibles.

Este documento debe consultarse:

- antes de crear una nueva pantalla;
- antes de introducir una nueva interacción;
- antes de decidir entre varias estructuras de flujo;
- cuando exista duda entre varias soluciones visuales o de producto;
- cuando un módulo nuevo deba sentirse coherente con el resto de Hostly.

Este documento no sustituye a la Product Bible ni al Design System. Las complementa desde la perspectiva de comportamiento, experiencia y consistencia de producto.

---

## 2. Principios generales

Hostly debe sentirse siempre:

- rápido;
- visual;
- táctil;
- premium;
- simple;
- pensado para usuarios no técnicos.

Toda decisión de UX debe responder a una pregunta simple:

¿ayuda a trabajar mejor durante un servicio real?

Si una solución parece correcta en una demo pero añade fricción en una operación real, no es válida para Hostly.

Principios permanentes:

- la velocidad operativa importa más que la sofisticación visual;
- la claridad importa más que la densidad de información;
- el siguiente paso debe ser evidente;
- el error debe prevenirse antes de tener que corregirse;
- el usuario no debe sentir que está manejando un software técnico;
- una misma acción debe comportarse de forma parecida en todo el producto.

---

## 3. Patrones de asistentes

El patrón oficial de asistentes de Hostly, hoy representado por el Asistente de Salas, debe seguir estas reglas:

- una decisión principal por paso;
- progreso visible y estable;
- navegación simple con Atrás y Continuar;
- CTA principal inequívoca;
- textos cortos y directos;
- ayuda contextual breve;
- selección táctil y visual;
- estado local persistente durante el flujo;
- resumen antes de cerrar o pasar a la siguiente fase importante;
- pantalla de generación o revisión solo cuando el sistema realmente necesite preparar algo;
- confirmación final cuando el flujo esté listo para guardarse o publicarse.

Qué debe evitar un asistente:

- preguntas largas en una sola pantalla;
- formularios densos al inicio;
- depender de conocimiento técnico del usuario;
- pedir precisión antes de tener contexto suficiente;
- abrir un editor vacío demasiado pronto;
- mezclar configuración estructural con acciones operativas de alta frecuencia.

Regla operacional:

un asistente debe acompañar, no interrogar.

---

## 4. Drawers

El drawer se usa cuando una tarea:

- modifica un elemento concreto;
- necesita contexto de la pantalla actual;
- debe resolverse sin romper el flujo principal;
- puede completarse en una interacción acotada.

Una página completa se usa cuando:

- la tarea tiene varias decisiones encadenadas;
- necesita onboarding o explicación;
- requiere revisión amplia;
- tiene impacto estructural;
- se comporta como un flujo y no como una edición puntual.

Patrón oficial del drawer:

- header claro;
- cuerpo desplazable;
- footer estable con acciones;
- CTA principal visible;
- cierre predecible;
- sin dobles scrolls innecesarios;
- sin esconder acciones críticas fuera de la zona final.

Qué no debe vivir en un drawer:

- asistentes largos;
- configuración fundacional del negocio;
- revisiones complejas de varios bloques;
- tareas que requieran orientación extensa.

---

## 5. Tablas

Las tablas en Hostly existen para trabajar, no para impresionar.

Patrones oficiales:

- columnas legibles y no excesivas;
- acciones claras y consistentes;
- cabeceras limpias;
- filas compactas pero táctiles cuando sea necesario;
- contenido priorizado por utilidad operativa.

Ordenación:

- solo cuando realmente aporte decisión;
- debe ser visible y comprensible;
- no debe romper el significado natural de la tabla.

Filtros:

- primero los filtros que más reducen ruido;
- no esconder filtros esenciales;
- separar filtros estructurales de filtros rápidos.

Búsqueda:

- visible cuando el volumen de datos lo justifique;
- útil desde el primer uso;
- sin depender de una taxonomía que el usuario no recuerde.

Selección múltiple:

- solo cuando exista una acción masiva real;
- debe ser reversible o claramente confirmada;
- no debe activarse por accidente.

Acciones masivas:

- reservarlas para tareas de mantenimiento o gestión;
- no mezclarlas con acciones delicadas sin confirmación.

Qué evitar:

- tablas tipo hoja de cálculo;
- columnas irrelevantes por completitud técnica;
- filas con demasiadas acciones visibles a la vez;
- patrones distintos de selección en cada módulo.

---

## 6. Formularios

Los formularios de Hostly deben reducir carga mental.

Patrones oficiales:

- label clara;
- ayuda breve cuando haga falta;
- separación visual suficiente;
- agrupación lógica;
- acción principal estable;
- validación cerca del campo afectado.

Inputs:

- para texto directo y corto;
- sin usar campos libres donde una decisión acotada sea mejor.

Selects:

- cuando el usuario debe elegir entre opciones definidas;
- no como sustituto automático de un patrón visual mejor.

Toggles:

- solo para estados binarios claros;
- nunca para decisiones ambiguas;
- su efecto debe entenderse sin leer documentación.

Validaciones:

- deben aparecer en el momento útil, no demasiado pronto;
- deben explicar qué falta o qué debe corregirse;
- no deben culpar al usuario.

Estados de error:

- específicos;
- accionables;
- visibles;
- sin lenguaje técnico innecesario.

Qué evitar:

- formularios largos sin agrupación;
- texto de ayuda que compite con la acción;
- validaciones tardías que obligan a rehacer todo;
- combinar en una sola pantalla decisiones que pertenecen a momentos distintos.

---

## 7. Tarjetas

Las tarjetas se usan cuando el contenido necesita:

- elección;
- jerarquía;
- agrupación visual;
- foco;
- una acción principal clara.

Patrones oficiales:

- una tarjeta debe expresar una idea;
- la selección debe ocupar toda la superficie pulsable;
- la diferencia entre estado normal y seleccionado debe ser inequívoca;
- la acción principal debe dominar sobre las secundarias;
- la información secundaria no debe competir con el título.

Cuándo usar tarjetas:

- selección de tipo;
- selección de espacio;
- elección de modo;
- presentación de caminos o alternativas;
- resumen visual breve.

Qué evitar:

- usar tarjetas para todo;
- convertir una lista simple en una card solo por estilo;
- tarjetas con múltiples decisiones no relacionadas;
- tarjetas que dependen del hover para entenderse.

---

## 8. Estados vacíos

Un estado vacío debe hacer tres cosas:

- explicar la situación actual;
- reducir ansiedad;
- invitar al siguiente paso correcto.

Patrón oficial:

- título claro;
- explicación breve;
- CTA principal evidente;
- tono útil, no defensivo.

Qué debe evitarse:

- culpar al usuario por no tener datos;
- mensajes vagos;
- pantallas frías sin orientación;
- listas vacías sin salida clara.

Un estado vacío de Hostly no debe decir únicamente que no hay contenido.

Debe decir qué hacer ahora.

---

## 9. Confirmaciones

Hostly debe confirmar cuando:

- la acción es destructiva;
- la acción es difícil de revertir;
- la acción afecta a dinero;
- la acción afecta a pedidos, servicio o datos compartidos;
- la acción puede impactar a otros usuarios o dispositivos.

Acciones reversibles:

- pueden requerir confirmación ligera o feedback posterior;
- no deben interrumpir de más si el riesgo es bajo.

Mensajes de éxito:

- breves;
- concretos;
- relacionados con la acción realizada.

Mensajes de error:

- deben explicar qué falló;
- deben orientar la recuperación;
- no deben usar lenguaje interno o técnico salvo necesidad real.

Qué evitar:

- confirmar acciones inocuas continuamente;
- no confirmar acciones realmente sensibles;
- mensajes de éxito genéricos que no aportan seguridad;
- errores que solo dicen que algo salió mal.

---

## 10. Carga

Hostly debe mostrar carga de forma coherente con la expectativa del usuario.

Patrones oficiales:

- skeleton cuando el usuario espera contenido con estructura clara;
- spinner cuando la espera es corta y no merece maqueta;
- progreso cuando existe una secuencia comprensible;
- pantalla de generación cuando el sistema está preparando algo significativo;
- feedback inmediato cuando una acción ha arrancado correctamente.

Reglas:

- no usar loaders ambiguos si la espera puede durar;
- no congelar la interfaz sin explicación;
- no esconder la acción principal sin motivo;
- no dar sensación de error cuando solo hay trabajo en curso.

Qué evitar:

- varios indicadores de carga simultáneos sin jerarquía;
- tiempos muertos sin contexto;
- progreso falso si no aporta confianza.

---

## 11. Responsive

Hostly se diseña como producto táctil y multi-dispositivo.

### Móvil

- una sola prioridad por bloque;
- CTA accesible;
- scroll claro;
- sin densidad excesiva;
- sin hover como mecanismo principal.

### Tablet

- debe ser un formato de trabajo real, no un escritorio comprimido;
- mantener jerarquía clara;
- aprovechar el ancho para operación, no para ruido.

### Escritorio

- puede mostrar más contexto, pero sin perder simplicidad;
- las acciones frecuentes deben seguir siendo evidentes;
- la densidad adicional debe mejorar productividad, no complicar lectura.

Regla común:

responsive en Hostly no significa encajar todo.

Significa priorizar bien en cada tamaño.

---

## 12. Drag & Drop

El drag & drop oficial de Hostly debe comportarse de forma predecible.

Patrón esperado:

- el usuario entiende qué puede arrastrar;
- la interacción tiene feedback visual inmediato;
- existe una forma clara de cancelar;
- el estado final es comprensible;
- la persistencia ocurre en el momento correcto, no de forma confusa.

Para contextos táctiles:

- el gesto debe ser suficientemente estable;
- no debe interferir con scroll accidental;
- el elemento activo debe diferenciarse claramente;
- el usuario debe sentir control durante todo el gesto.

Qué evitar:

- drag & drop como única forma de ordenar algo importante;
- persistencia silenciosa sin feedback;
- zonas destino ambiguas;
- cambios de posición sin confirmación visual.

---

## 13. Editor visual

El editor visual de Hostly debe obedecer estas reglas de producto:

- no ser el primer paso por defecto si el usuario aún no tiene contexto;
- permitir control fino solo cuando ya existe una base funcional;
- priorizar lectura operativa sobre dibujo decorativo;
- mostrar claramente qué está seleccionado;
- hacer evidente la herramienta o modo activo;
- evitar dobles scrolls y gestos confusos;
- separar edición estructural, elementos y operación;
- no exigir precisión técnica desde el primer minuto.

El editor no debe sentirse como un software de diseño.

Debe sentirse como una herramienta práctica para montar un restaurante funcional.

---

## 14. Inteligencia Artificial

La IA en Hostly debe aparecer como ayuda contextual, no como sustituto del usuario.

Patrones oficiales:

- sugerir;
- resumir;
- preparar;
- clasificar;
- orientar;
- acelerar decisiones repetitivas.

La IA debe:

- explicar qué propone;
- dejar claro qué sabe y qué no sabe;
- permitir revisión humana;
- mantener al usuario en control.

La IA no debe:

- publicar automáticamente;
- ejecutar acciones irreversibles por su cuenta;
- ocultar incertidumbre;
- decidir estructura de negocio sin validación;
- sustituir confirmaciones humanas en puntos sensibles.

La sensación correcta no es automatización ciega.

La sensación correcta es asistencia confiable.

---

## 15. Regla de oro

Hostly siempre debe cumplir este orden:

Primero restaurante.

Después operación.

Después experiencia.

Después código.

Si una solución es técnicamente correcta pero empeora el trabajo real del restaurante, no es un patrón válido para Hostly.
