# HOSTLY DESIGN BIBLE v1.0

## 1. Propósito

Este documento define cómo debe sentirse, verse y comportarse Hostly como producto SaaS para hostelería.

Hostly no debe percibirse como un ERP, un TPV antiguo, un panel administrativo ni una herramienta técnica. Debe sentirse como una plataforma operativa premium, rápida, clara y especializada en restaurantes, bares, beach clubs, hoteles y otros negocios de hostelería.

La pregunta de control para cualquier decisión de producto o diseño es:

> ¿Hace que Hostly sea más fácil, rápido, claro y seguro para un encargado o trabajador real de hostelería?

Si la respuesta es no, la mejora no debe implementarse.

---

## 2. Filosofía de producto

### 2.1. Simple by design

La complejidad puede existir en la arquitectura interna, pero nunca debe trasladarse al usuario.

Hostly debe convertir procesos complejos en decisiones simples, visibles y accionables.

### 2.2. Operación antes que configuración

La operación diaria es siempre la protagonista.

Orden de prioridad visual:

1. Operación
2. Espacio
3. Ambiente
4. Configuración técnica

### 2.3. Menos clics, menos dudas

Cada flujo debe minimizar:

- clics;
- desplazamientos;
- cambios de contexto;
- decisiones innecesarias;
- campos técnicos;
- errores operativos.

### 2.4. El usuario nunca debería preguntarse qué hacer después

Cada pantalla debe tener una acción principal clara.

Ejemplos:

- Dashboard: Abrir TPV.
- Productos: Crear producto.
- Inventario: Registrar compra.
- Reservas: Nueva reserva.
- Cocina: Ver pedidos pendientes.
- Editor V2: Añadir el siguiente elemento útil al plano.

---

## 3. Personalidad visual

Hostly debe sentirse:

- premium;
- tecnológico;
- calmado;
- preciso;
- moderno;
- especializado en hostelería;
- fácil de aprender;
- fiable bajo presión.

Referencias iniciales: Apple, Linear, Stripe, Arc, Toast y SevenRooms.

Estas referencias no deben copiarse literalmente. La dirección final debe responder a una pregunta propia:

> ¿Qué haría Hostly?

---

## 4. Jerarquía visual

### 4.1. Principio general

La interfaz debe destacar primero lo que permite actuar.

La información secundaria nunca debe competir con la acción principal.

### 4.2. Jerarquía en operación

1. Acción inmediata.
2. Estado que requiere atención.
3. Contexto operativo.
4. Información secundaria.
5. Configuración.

### 4.3. Jerarquía en el Editor V2

1. Mesas y elementos operativos.
2. Distribución del espacio.
3. Barras y puntos de servicio.
4. Muros y estructura.
5. Vegetación y decoración.
6. Materiales y superficies.

Los materiales deben aportar ambiente sin competir con las mesas.

---

## 5. Color

### 5.1. Paleta base

- Fondo principal: blanco limpio.
- Fondo secundario: azul hielo muy suave.
- Texto fuerte: azul marino profundo.
- Texto secundario: gris azulado.
- Bordes: finos, fríos y discretos.
- Acento Hostly: azul hielo tecnológico.

### 5.2. Estados operativos de mesa

- Libre: verde.
- Ocupada: azul.
- Reservada: morado.
- Atención: amarillo.
- Crítica: rojo.
- Retrasada: naranja.
- Seleccionada: tratamiento específico de selección, sin sustituir el estado real.

Los estados deben ser visibles en Editor readonly y TPV sin romper la identidad visual del elemento.

### 5.3. Uso del color

El color debe informar, no decorar.

Evitar:

- fondos saturados sin función;
- múltiples colores compitiendo;
- degradados llamativos en áreas operativas;
- codificación solo por color sin apoyo visual o textual.

---

## 6. Tipografía

La tipografía debe priorizar velocidad de lectura.

### 6.1. Jerarquía

- Título principal: breve, fuerte y con alto contraste.
- Título de sección: compacto y funcional.
- Etiqueta operativa: clara, sin adornos.
- Texto auxiliar: corto y de menor contraste.
- Datos críticos: nunca demasiado pequeños.

### 6.2. Reglas

- Evitar párrafos largos en interfaces operativas.
- Evitar mayúsculas extensas.
- Usar textos de ayuda breves debajo de acciones complejas.
- Mantener nombres consistentes en toda la aplicación.

---

## 7. Espaciado y densidad

Hostly debe tener aire, pero no desperdiciar espacio.

### 7.1. Principio

Configuración puede ser más espaciosa.

Operación debe ser compacta, táctil y rápida.

### 7.2. Pantallas táctiles

- Objetivos táctiles mínimos: 44 px cuando sea posible.
- Separación suficiente entre acciones críticas.
- Evitar controles pequeños en zonas de alta presión.
- No depender de hover.

---

## 8. Bordes, radios y sombras

### 8.1. Bordes

- Finos.
- Discretos.
- Más importantes que las sombras para separar superficies.

### 8.2. Radios

Usar una escala pequeña y consistente:

- pequeño: inputs, badges y controles;
- medio: tarjetas y paneles;
- grande: superficies protagonistas y modales.

### 8.3. Sombras

- Mínimas.
- Suaves.
- Solo cuando exista elevación real o foco importante.
- Nunca deben hacer que Hostly parezca un conjunto de tarjetas flotantes sin jerarquía.

---

## 9. Botones y acciones

### 9.1. Tipos

- Primario: acción principal de la pantalla.
- Secundario: acción complementaria.
- Operativo: acción rápida durante el servicio.
- Destructivo: borrar, cancelar o revertir algo sensible.
- IA: acción asistida por inteligencia artificial.

### 9.2. Reglas

- Una acción primaria dominante por contexto.
- No llenar la pantalla de botones.
- Agrupar acciones secundarias.
- Usar texto explícito en acciones importantes.
- Evitar iconos sin etiqueta cuando exista riesgo de confusión.

---

## 10. Tarjetas

Las tarjetas deben tener una función clara.

Tipos válidos:

- Acción.
- Estado.
- Módulo.
- KPI.
- Elemento de biblioteca.
- Ficha contextual.

Una tarjeta no debe existir solo para decorar o encerrar contenido.

---

## 11. Formularios e inspector

### 11.1. Prioridad

Mostrar primero lo que un encargado necesita normalmente.

Ejemplo para una mesa:

1. Nombre o número.
2. Capacidad.
3. Forma.
4. Tamaño.
5. Vinculación con TPV.
6. Opciones avanzadas.

### 11.2. Controles técnicos

Campos como IDs, orden interno, visibilidad avanzada o compatibilidad legacy deben:

- ocultarse por defecto;
- agruparse en una sección avanzada;
- no competir con los datos operativos.

---

## 12. Movimiento y feedback

### 12.1. Principios

- Movimiento corto y funcional.
- Feedback inmediato.
- Nada debe moverse solo por estética.
- La animación nunca debe ralentizar una acción operativa.

### 12.2. Arrastrar y ordenar

El patrón preferido para ordenar elementos es mantener pulsado y arrastrar.

Debe incluir:

- feedback visual claro;
- posición de destino visible;
- cancelación segura;
- soporte táctil y ratón;
- persistencia explícita.

### 12.3. Reducir movimiento

Respetar `prefers-reduced-motion` y evitar animaciones esenciales para comprender el estado.

---

## 13. Dashboard

El Dashboard no debe ser un menú de módulos.

Debe responder:

> ¿Qué necesita mi atención ahora mismo?

Debe incluir pocas acciones y estados de alto valor.

Prioridad:

1. Abrir TPV o continuar operación.
2. Alertas relevantes.
3. Reservas próximas.
4. Producción retrasada.
5. Accesos de gestión.

Evitar KPIs que no ayuden a actuar.

---

## 14. TPV

### 14.1. Objetivo

Registrar y gestionar comandas con la mínima fricción posible.

### 14.2. Reglas

- Touch-first.
- Productos protagonistas.
- Comanda siempre visible, incluso vacía.
- Abrir mesa equivale a abrir comanda.
- Separar claramente operación y configuración.
- Destinos de producción automáticos según familia o producto.
- El camarero no debe elegir manualmente destinos normales.
- Enviar y Marchar son acciones diferentes.

### 14.3. Plano

El mapa del TPV debe consumir el mismo modelo y lenguaje visual que el Editor V2.

No se admite una representación visual paralela.

---

## 15. Editor V2

### 15.1. Propósito

Permitir que una persona no técnica cree y mantenga el plano operativo de su negocio.

No debe parecer:

- Paint;
- AutoCAD;
- un videojuego;
- una herramienta interna de desarrollo.

Debe parecer una planta arquitectónica premium especializada en hostelería.

### 15.2. Modelo mental visible

La interfaz debe simplificar las fases internas en tres conceptos:

#### Espacio

- plano;
- base;
- terreno;
- zonas opcionales;
- estructura.

#### Ambiente

- materiales;
- paisajismo;
- decoración.

#### Operación

- mesas;
- barras;
- recepción;
- puntos de servicio;
- otros elementos operativos.

Las fases internas pueden mantenerse por compatibilidad, pero no deben dominar la experiencia del usuario.

### 15.3. Zonas

Las zonas son siempre opcionales.

Hostly debe soportar:

- un único plano con espacios separados por muros;
- varios planos independientes;
- planos con o sin zonas.

### 15.4. Biblioteca

La biblioteca debe:

- mantener estructura estable;
- disponer de buscador;
- usar categorías claras;
- mostrar primero elementos disponibles;
- utilizar miniaturas cenitales coherentes con el canvas;
- ofrecer objetivos táctiles cómodos;
- evitar elementos futuros que generen ruido.

### 15.5. Canvas

- Es el protagonista.
- Debe conservar el máximo espacio útil.
- Solo la fase activa es editable.
- Mover nunca crea.
- Crear nunca mueve.
- No debe existir ningún caso en el que mover una superficie la duplique.

### 15.6. Mesas

Las mesas deben tener el mayor protagonismo visual.

Deben priorizar:

- número;
- nombre cuando exista;
- capacidad;
- forma;
- estado operativo;
- selección;
- legibilidad a diferentes escalas.

### 15.7. Materiales

- Bajo protagonismo.
- Textura sutil.
- Coherencia cenital.
- No competir con los elementos operativos.
- El agua es la referencia de calidad actual.

### 15.8. Paisajismo

- Representación cenital reconocible.
- Palmeras y olivos deben mantener coherencia al escalar.
- Jardineras pueden admitir resize.
- El paisajismo nunca debe competir con las mesas.

---

## 16. Paridad Editor V2 y TPV

Esta es una regla arquitectónica obligatoria.

El Editor V2 es la fuente de verdad del plano.

El TPV es consumidor del mismo modelo.

Cada nueva funcionalidad, propiedad, tipo de elemento o comportamiento debe responder:

1. ¿Cómo se representa en la biblioteca?
2. ¿Cómo se representa en el canvas?
3. ¿Cómo se persiste?
4. ¿Cómo se publica?
5. ¿Cómo se representa en readonly?
6. ¿Cómo se ve en el TPV?
7. ¿Mantiene geometría, escala, rotación e hitbox?

Ninguna mejora del Editor V2 se considera cerrada si el TPV queda desactualizado.

---

## 17. Cocina, barra y sala

### 17.1. Estados operativos

- pending;
- preparing;
- ready;
- served.

Cocina normalmente marca `ready` y Sala marca `served`, pero Cocina o Barra pueden marcar `served` cuando la operación real lo requiera.

### 17.2. Interfaz

- Pedidos y tiempos protagonistas.
- Acciones grandes y obvias.
- Mínimo texto secundario.
- Nada de controles administrativos durante producción.

---

## 18. IA

La IA debe eliminar trabajo manual, no añadir conversación innecesaria.

Casos prioritarios:

- importar carta desde foto, PDF o QR;
- crear productos automáticamente;
- leer facturas;
- ayudar con inventario y escandallos;
- generar comandas por voz o lenguaje natural;
- asistir al personal usando solo datos del restaurante;
- crear planos desde fotos, bocetos o instrucciones.

### 18.1. Reglas

- Mostrar siempre qué va a cambiar.
- Permitir revisión humana.
- No guardar cambios sensibles sin confirmación.
- Explicar errores de forma accionable.
- No inventar datos del restaurante.

---

## 19. Accesibilidad

Hostly debe ser usable con:

- ratón;
- teclado;
- pantalla táctil;
- lectores de pantalla cuando el contexto lo permita.

Requisitos:

- contraste suficiente;
- foco visible;
- etiquetas accesibles;
- no depender solo del color;
- estados de carga y error claros;
- soporte de reducción de movimiento.

---

## 20. Lenguaje y microcopy

- Profesional.
- Directo.
- Humano.
- Sin jerga técnica innecesaria.
- Sin emojis en interfaces profesionales.
- Sin mezcla de español e inglés visible.
- Acciones escritas como verbos claros.

Ejemplos:

- Crear mesa.
- Publicar en TPV.
- Registrar compra.
- Marcar como listo.
- Separar mesas.

Evitar:

- Ejecutar.
- Procesar.
- Submit.
- Toggle.
- Sync manual.

---

## 21. Responsive y dispositivos

### 21.1. TPV y operación

Prioridad:

1. tablet;
2. móvil;
3. escritorio táctil;
4. escritorio tradicional.

### 21.2. Configuración

Prioridad:

1. escritorio;
2. tablet;
3. móvil para tareas puntuales.

### 21.3. Editor V2

Debe funcionar correctamente en tablet y escritorio.

En tablet:

- paneles compactos;
- objetivos táctiles amplios;
- canvas protagonista;
- inspector contextual;
- evitar tres columnas demasiado estrechas.

---

## 22. Proceso obligatorio de diseño e implementación

Antes de cualquier cambio:

1. Identificar el dominio.
2. Adoptar la perspectiva especialista adecuada.
3. Explicar qué se entiende.
4. Identificar qué puede romperse.
5. Proponer la solución mínima.
6. Enumerar archivos a tocar.
7. Enumerar archivos a no tocar.
8. Revisar impacto en TPV cuando afecte al Editor V2.

Durante la implementación:

- un cambio importante por iteración;
- evitar refactors masivos;
- reutilizar componentes existentes;
- preservar `restaurantId` y aislamiento multi-tenant;
- pensar primero como operador de hostelería;
- no hacer push automático.

Al finalizar:

1. Explicar qué cambió.
2. Explicar qué no cambió.
3. Enumerar archivos modificados.
4. Indicar qué validar.
5. Indicar riesgos pendientes.
6. Informar resultado TypeScript.
7. Informar resultado Build.
8. Recomendar commit, sin hacer push automático.

---

## 23. Checklist de aprobación

Una mejora solo se aprueba si cumple la mayoría de estas preguntas:

- ¿Es más rápida?
- ¿Es más clara?
- ¿Reduce clics?
- ¿Reduce errores?
- ¿Funciona bien con tacto?
- ¿La entiende una persona no técnica?
- ¿Mantiene consistencia visual?
- ¿Respeta la operación real de un restaurante?
- ¿Evita complejidad visible?
- ¿Mantiene compatibilidad multi-restaurante?
- ¿El TPV sigue alineado con el Editor V2?
- ¿Parece Hostly?

---

## 24. Principio final

Hostly debe hacer que la complejidad operativa de la hostelería parezca sencilla.

> Simple by design.
