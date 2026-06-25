# Hostly Operations Guide

> Cómo debe pensar Hostly desde la realidad de un servicio de hostelería.

**Autoridad documental:** nivel 8  
**Principio rector:** si funciona un sábado con el restaurante lleno, funciona siempre.

---

## 1. La unidad real es el servicio

Hostly no debe optimizar pantallas aisladas. Debe conectar el recorrido:

```text
Preparar negocio
→ abrir servicio
→ recibir clientes
→ asignar mesa
→ tomar comanda
→ enviar
→ marchar
→ preparar
→ servir
→ cobrar
→ cerrar
→ aprender
```

Cada módulo debe comprender qué ocurrió antes y qué necesita el siguiente.

---

## 2. Camarero

Necesita:

- identificar operador y mesa;
- añadir productos con pocos toques;
- comprender pendientes, enviados y servidos;
- añadir notas y modificadores sin detenerse;
- evitar cobrar o cancelar por error;
- saber qué mesa necesita atención;
- recuperarse rápido si cambia de dispositivo.

Hostly debe reducir memoria y navegación. La comanda y la siguiente acción deben ser
evidentes.

---

## 3. Cocina

Necesita:

- entender la cola en menos de tres segundos;
- ver producto, cantidad, mesa, pase, nota y tiempo;
- distinguir pendiente, preparando, listo y servido;
- detectar urgencias sin exceso de badges;
- actuar con objetivos táctiles grandes;
- mantener contexto en hora punta.

Todo elemento visual debe responder: “¿Ayuda a sacar antes el siguiente plato?”.

---

## 4. Barra y Coctelería

Necesitan:

- recibir solo lo que les corresponde;
- diferenciar bebidas rápidas de elaboraciones;
- ver modificadores y mixers;
- marcar preparado/entregado sin ambigüedad;
- compartir estado con sala y TPV.

La calidad del routing de producto y estación es parte de la operación, no solo de la
configuración.

---

## 5. Sala

Necesita:

- conocer el estado de mesas;
- localizar platos listos;
- coordinar entrega;
- detectar mesas listas para cerrar;
- entender reservas próximas;
- evitar conflictos entre camareros o dispositivos.

El mapa es una representación operativa del restaurante, no un dibujo decorativo.

---

## 6. Encargado

Necesita:

- intervenir sin bloquear al equipo;
- corregir errores;
- autorizar acciones sensibles;
- ver saturación y excepciones;
- gestionar usuarios, estaciones y servicio;
- comprender qué requiere atención ahora.

Hostly debe separar alertas accionables de métricas informativas.

---

## 7. Propietario

Necesita:

- configurar el negocio;
- comprender ventas, costes y margen;
- controlar equipo y permisos;
- detectar pérdidas y oportunidades;
- confiar en que los datos pertenecen únicamente a su restaurante.

La analítica debe explicar decisiones posibles, no inundar con gráficos.

---

## 8. Compras

El flujo real es:

```text
Necesidad
→ propuesta o pedido
→ recepción
→ incidencia
→ factura
→ coste real
→ stock
```

Hostly debe diferenciar claramente pedido, recepción y factura. Que una mercancía haya
llegado no significa que esté conciliada ni pagada.

---

## 9. Inventario y escandallos

Inventario responde cuánto existe y cómo cambia.

Escandallo responde qué consume un producto y cuál es su coste teórico.

Factura proveedor aporta coste real.

Estas tres perspectivas deben relacionarse sin confundirse. Los movimientos deben ser
trazables e idempotentes.

---

## 10. Hora punta

Durante hora punta:

- las decisiones deben ser cortas;
- los estados deben ser inequívocos;
- no se abren formularios largos;
- no se depende de hover;
- no se obliga a leer párrafos;
- no se cambia de contexto innecesariamente;
- los errores deben poder corregirse;
- la conectividad imperfecta debe ser visible.

El modo normal de Hostly se diseña para presión, no como una excepción posterior.

---

## 11. Mapa de mesas

El mapa debe permitir comprender:

- distribución;
- estado;
- ocupación;
- reservas;
- agrupaciones;
- responsable;
- siguiente acción.

La geometría es secundaria respecto a la continuidad de IDs, pedidos y servicio.

---

## 12. Asistente de Salas

El asistente es la experiencia recomendada para crear el restaurante.

Debe:

- acompañar;
- preguntar una decisión principal cada vez;
- recomendar según tipo de negocio;
- preparar espacios, estructura, ambiente y elementos;
- guardar contexto local mientras el modelo no esté cerrado;
- mostrar revisión antes de publicar.

El editor avanzado permanece para ajustes de precisión.

---

## 13. Operación frente a Configuración

### Operación

- tiempo real;
- acciones frecuentes;
- alta presión;
- mínima explicación;
- máxima claridad;
- errores con impacto inmediato.

### Configuración

- decisiones estructurales;
- menor frecuencia;
- más contexto y ayuda;
- cambios que preparan el runtime;
- confirmación antes de afectar servicio.

Una opción de configuración no debe aparecer en operación salvo que sea necesaria para
trabajar en ese momento.

---

## 14. Prueba operativa

Antes de considerar terminada una función, comprobar:

- ¿la entiende un usuario nuevo?
- ¿funciona con una mano?
- ¿funciona con ruido y prisa?
- ¿evita el error más probable?
- ¿explica qué ocurrió?
- ¿se recupera de conexión inestable?
- ¿funciona con dos dispositivos?
- ¿respeta el restaurante correcto?
- ¿afecta al siguiente equipo del servicio?

Si funciona un sábado con el restaurante lleno, funciona siempre.

