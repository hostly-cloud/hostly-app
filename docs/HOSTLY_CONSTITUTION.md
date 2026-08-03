# HOSTLY_CONSTITUTION

> Constitucion de producto de Hostly. Define los principios que no deben romperse aunque cambien modulos, pantallas, tecnologia o estrategia comercial.

**Estado:** documento canonico
**Ambito:** producto, experiencia, operacion, decisiones funcionales e identidad
**Regla central:** antes producto hostelero; despues software

**Relacion documental:** complementa `docs/00_HOSTLY_PRODUCT_BIBLE.md`. No la sustituye ni cambia la jerarquia documental existente; resume principios innegociables para decisiones futuras.

---

## 1. Que es la Constitucion de Hostly

La Constitucion de Hostly es el acuerdo minimo que toda persona del equipo debe respetar antes de disenar, programar, vender, revisar o modificar cualquier parte del producto.

No es un roadmap.
No es una especificacion tecnica.
No es una lista de modulos.
No es una guia visual.

Es la respuesta a una pregunta:

**Que debe seguir siendo Hostly aunque todo lo demas cambie?**

Si una decision contradice esta Constitucion, la decision debe cambiar.

---

## 2. La mision permanente

Hostly existe para ayudar a que un negocio de hosteleria opere con mas claridad, menos friccion y mas control.

Su mision no es tener mas funciones que otros TPV.
Su mision no es parecer mas moderno.
Su mision no es convertir un restaurante en un sistema administrativo.

La mision permanente de Hostly es:

**hacer que el trabajo real de sala, cocina, barra, reservas, cobro, compras e inventario sea mas facil de entender, ejecutar y mejorar.**

Hostly debe estar del lado del restaurante en los momentos de presion.

---

## 3. Principios innegociables

### 1. La operacion manda

La operacion siempre esta por encima de la estetica, la arquitectura interna, la demo comercial y la sofisticacion tecnica.

Si algo se ve bien pero ralentiza el servicio, no es Hostly.

### 2. El restaurante nunca debe detenerse por el software

Un restaurante no puede parar porque una pantalla confunde, un flujo bloquea o una automatizacion decide mal.

Hostly debe ayudar incluso cuando hay prisa, ruido, errores humanos o cambios de ultimo minuto.

### 3. Una unica fuente de verdad por responsabilidad

Cada dato importante debe tener un propietario claro.

Las vistas, caches, snapshots, impresiones, metricas y estados visuales pueden ayudar, pero no deben sustituir la verdad oficial.

### 4. La IA asiste; no sustituye el criterio humano

La IA puede proponer, resumir, ordenar, detectar y acelerar.

No debe confirmar datos criticos, cobrar, modificar stock, validar facturas, cambiar costes o tomar decisiones irreversibles sin control humano.

### 5. La simplicidad gana a la complejidad

Una solucion simple que el equipo entiende vale mas que una solucion avanzada que exige explicacion.

Hostly debe reducir carga mental, no demostrar inteligencia interna.

### 6. El usuario piensa como restaurante

El restaurante piensa en mesas, clientes, comandas, servicio, cocina, barra, reservas, caja, compras y stock.

Nunca debe verse obligado a pensar en modelos de datos, estados internos, capas, entidades tecnicas o arquitectura.

### 7. Cada pantalla debe ahorrar tiempo

Cada pantalla debe ayudar a decidir, actuar o entender mas rapido.

Si una pantalla solo organiza informacion para el sistema, pero no ayuda al restaurante, debe replantearse.

### 8. La confianza vale mas que cien funcionalidades

El usuario debe creer que Hostly no miente sobre mesas, dinero, comandas, stock, reservas ni facturas.

Cuando la confianza se pierde, ninguna funcionalidad compensa.

### 9. Crecer sin romper compatibilidad

Hostly debe evolucionar sin romper operacion, historico, datos fiscales, restauranteId, permisos ni flujos criticos.

La expansion nunca justifica poner en riesgo lo que ya funciona.

### 10. Antes producto hostelero; despues software

La pregunta correcta no es "como lo modelamos?".

La pregunta correcta es:

**como trabaja realmente un restaurante en este momento?**

---

## 4. Reglas que nunca deben romperse

- Una mesa nunca debe mentir sobre ocupacion.
- Una comanda nunca debe mentir sobre lo que hay que preparar.
- Un pago nunca debe mentir sobre dinero.
- KDS nunca debe ocultar trabajo pendiente.
- Inventario nunca debe cambiar sin movimiento trazable.
- Una factura emitida no se recalcula con datos actuales.
- Una receta modificada hoy no cambia ventas pasadas.
- Una reserva no es una mesa.
- Una factura no es una recepcion.
- OCR/IA nunca es fuente de verdad sin validacion humana.
- Una impresion nunca es la verdad oficial.
- Un estado visual nunca sustituye un estado operativo.
- Todo dato operativo debe respetar el restaurante al que pertenece.
- Una correccion nunca debe borrar la historia que explica el error.

---

## 5. Como decidir cuando existan dudas

Cuando haya dudas entre dos caminos, Hostly debe elegir el que mejor proteja el servicio real.

Orden de decision:

1. Protege la operacion del restaurante.
2. Protege la confianza en los datos.
3. Protege dinero, stock, comandas, reservas y facturas.
4. Reduce pasos y carga mental.
5. Usa lenguaje de hosteleria.
6. Mantiene compatibilidad con lo que ya funciona.
7. Permite crecer sin crear dobles fuentes de verdad.
8. Deja trazabilidad cuando algo importa.

Si una decision es elegante tecnicamente pero confusa para un encargado, no es la decision correcta.

Si una automatizacion ahorra tiempo pero puede equivocarse en un dato critico, debe pedir confirmacion.

Si una funcionalidad nueva complica un flujo esencial, debe esperar.

---

## 6. Que significa construir "a lo Hostly"

Construir a lo Hostly significa pensar primero en el restaurante y despues en el software.

Significa preguntarse:

- Esto ayuda durante un servicio real?
- Ahorra tiempo al equipo?
- Reduce dudas?
- Evita errores?
- Mantiene la verdad de los datos?
- Puede usarlo alguien con prisa?
- Se entiende sin formacion larga?
- Respeta la forma natural de trabajar en hosteleria?

Una solucion Hostly debe sentirse:

- clara;
- rapida;
- tactil;
- confiable;
- humana;
- operativa;
- dificil de malinterpretar.

Hostly no debe impresionar al usuario con complejidad. Debe darle control sin pedirle paciencia.

---

## 7. Errores que nunca deben cometerse

Hostly nunca debe:

- convertirse en un ERP generico con vocabulario de hosteleria;
- crecer como una coleccion de modulos inconexos;
- priorizar belleza sobre legibilidad operativa;
- crear pantallas que no ahorran tiempo;
- duplicar fuentes de verdad;
- permitir que la IA confirme datos criticos;
- ocultar errores de datos con estados visuales bonitos;
- recalcular historicos con datos actuales;
- hacer que una factura cree stock;
- hacer que una reserva cierre una mesa;
- hacer que una impresion confirme una operacion;
- pedir al usuario que entienda la arquitectura interna;
- lanzar funcionalidades que reducen confianza;
- romper compatibilidad para avanzar mas rapido;
- confundir sofisticacion con valor.

Un restaurante puede aceptar que falte una funcion.

No puede aceptar que el sistema le haga dudar de lo que esta pasando.

---

## 8. Como debe evolucionar Hostly

Hostly debe crecer durante los proximos anos sin perder su identidad.

Puede incorporar mas IA, mas automatizacion, mas analitica, mas integraciones, mas verticales de hosteleria y mas profundidad operativa.

Pero cada avance debe respetar estas condiciones:

- la operacion sigue siendo el centro;
- el usuario sigue pensando en su restaurante, no en el sistema;
- los datos criticos siguen teniendo una fuente de verdad clara;
- las automatizaciones siguen siendo explicables;
- los historicos siguen protegidos;
- los flujos esenciales siguen siendo rapidos;
- la confianza aumenta, no disminuye;
- el producto se vuelve mas capaz sin volverse mas pesado.

Hostly debe evolucionar como evoluciona un buen restaurante:

mejorando procesos, afinando detalles y ampliando capacidades sin perder la esencia que hace que el equipo confie en el servicio.

La identidad de Hostly no esta en una pantalla ni en una tecnologia.

Esta en una promesa:

**ayudar a que la hosteleria trabaje mejor cuando mas importa.**
