# Hostly Operations Guide

> CÃ³mo debe pensar Hostly desde la realidad de un servicio de hostelerÃ­a.

**Autoridad documental:** nivel 8
**Principio rector:** si funciona un sÃ¡bado con el restaurante lleno, funciona siempre.

---

## 1. La unidad real es el servicio

Hostly no debe optimizar pantallas aisladas. Debe conectar el recorrido:

```text
Preparar negocio
â†’ abrir servicio
â†’ recibir clientes
â†’ asignar mesa
â†’ tomar comanda
â†’ enviar
â†’ marchar
â†’ preparar
â†’ servir
â†’ cobrar
â†’ cerrar
â†’ aprender
```

Cada mÃ³dulo debe comprender quÃ© ocurriÃ³ antes y quÃ© necesita el siguiente.

---

## 2. Camarero

Necesita:

- identificar operador y mesa;
- aÃ±adir productos con pocos toques;
- comprender pendientes, enviados y servidos;
- aÃ±adir notas y modificadores sin detenerse;
- evitar cobrar o cancelar por error;
- saber quÃ© mesa necesita atenciÃ³n;
- recuperarse rÃ¡pido si cambia de dispositivo.

Hostly debe reducir memoria y navegaciÃ³n. La comanda y la siguiente acciÃ³n deben ser
evidentes.

---

## 3. Cocina

Necesita:

- entender la cola en menos de tres segundos;
- ver producto, cantidad, mesa, pase, nota y tiempo;
- distinguir pendiente, preparando, listo y servido;
- detectar urgencias sin exceso de badges;
- actuar con objetivos tÃ¡ctiles grandes;
- mantener contexto en hora punta.

Todo elemento visual debe responder: â€œÂ¿Ayuda a sacar antes el siguiente plato?â€.

---

## 4. Barra y CoctelerÃ­a

Necesitan:

- recibir solo lo que les corresponde;
- diferenciar bebidas rÃ¡pidas de elaboraciones;
- ver modificadores y mixers;
- marcar preparado/entregado sin ambigÃ¼edad;
- compartir estado con sala y TPV.

La calidad del routing de producto y estaciÃ³n es parte de la operaciÃ³n, no solo de la
configuraciÃ³n.

---

## 5. Sala

Necesita:

- conocer el estado de mesas;
- localizar platos listos;
- coordinar entrega;
- detectar mesas listas para cerrar;
- entender reservas prÃ³ximas;
- evitar conflictos entre camareros o dispositivos.

El mapa es una representaciÃ³n operativa del restaurante, no un dibujo decorativo.

---

## 6. Encargado

Necesita:

- intervenir sin bloquear al equipo;
- corregir errores;
- autorizar acciones sensibles;
- ver saturaciÃ³n y excepciones;
- gestionar usuarios, estaciones y servicio;
- comprender quÃ© requiere atenciÃ³n ahora.

Hostly debe separar alertas accionables de mÃ©tricas informativas.

---

## 7. Propietario

Necesita:

- configurar el negocio;
- comprender ventas, costes y margen;
- controlar equipo y permisos;
- detectar pÃ©rdidas y oportunidades;
- confiar en que los datos pertenecen Ãºnicamente a su restaurante.

La analÃ­tica debe explicar decisiones posibles, no inundar con grÃ¡ficos.

---

## 8. Compras

El flujo real es:

```text
Necesidad
â†’ propuesta o pedido
â†’ recepciÃ³n
â†’ incidencia
â†’ factura
â†’ coste real
â†’ stock
```

Hostly debe diferenciar claramente pedido, recepciÃ³n y factura. Que una mercancÃ­a haya
llegado no significa que estÃ© conciliada ni pagada.

---

## 9. Inventario y escandallos

Inventario responde cuÃ¡nto existe y cÃ³mo cambia.

Escandallo responde quÃ© consume un producto y cuÃ¡l es su coste teÃ³rico.

Factura proveedor aporta coste real.

Estas tres perspectivas deben relacionarse sin confundirse. Los movimientos deben ser
trazables e idempotentes.

---

## 10. Hora punta

Durante hora punta:

- las decisiones deben ser cortas;
- los estados deben ser inequÃ­vocos;
- no se abren formularios largos;
- no se depende de hover;
- no se obliga a leer pÃ¡rrafos;
- no se cambia de contexto innecesariamente;
- los errores deben poder corregirse;
- la conectividad imperfecta debe ser visible.

El modo normal de Hostly se diseÃ±a para presiÃ³n, no como una excepciÃ³n posterior.

---

## 11. Mapa de mesas

El mapa debe permitir comprender:

- distribuciÃ³n;
- estado;
- ocupaciÃ³n;
- reservas;
- agrupaciones;
- responsable;
- siguiente acciÃ³n.

La geometrÃ­a es secundaria respecto a la continuidad de IDs, pedidos y servicio.

---

## 12. Asistente de Salas

El asistente es la experiencia recomendada para crear el restaurante.

Debe:

- acompaÃ±ar;
- preguntar una decisiÃ³n principal cada vez;
- recomendar segÃºn tipo de negocio;
- preparar espacios, estructura, ambiente y elementos;
- guardar contexto local mientras el modelo no estÃ© cerrado;
- mostrar revisiÃ³n antes de publicar.

El editor avanzado permanece para ajustes de precisiÃ³n.

---

## 13. OperaciÃ³n frente a ConfiguraciÃ³n

### OperaciÃ³n

- tiempo real;
- acciones frecuentes;
- alta presiÃ³n;
- mÃ­nima explicaciÃ³n;
- mÃ¡xima claridad;
- errores con impacto inmediato.

### ConfiguraciÃ³n

- decisiones estructurales;
- menor frecuencia;
- mÃ¡s contexto y ayuda;
- cambios que preparan el runtime;
- confirmaciÃ³n antes de afectar servicio.

Una opciÃ³n de configuraciÃ³n no debe aparecer en operaciÃ³n salvo que sea necesaria para
trabajar en ese momento.

---

## 14. Prueba operativa

Antes de considerar terminada una funciÃ³n, comprobar:

- Â¿la entiende un usuario nuevo?
- Â¿funciona con una mano?
- Â¿funciona con ruido y prisa?
- Â¿evita el error mÃ¡s probable?
- Â¿explica quÃ© ocurriÃ³?
- Â¿se recupera de conexiÃ³n inestable?
- Â¿funciona con dos dispositivos?
- Â¿respeta el restaurante correcto?
- Â¿afecta al siguiente equipo del servicio?

Si funciona un sÃ¡bado con el restaurante lleno, funciona siempre.

---

## 15. Soporte de la cola masiva de imágenes

El consumidor `catalog-image-bulk` emite una línea JSON por cada señal operativa. Para
investigar un trabajo, soporte debe filtrar los Runtime Logs de Vercel por
`service=catalog-image-bulk-queue` y después por `restaurantId`, `jobId` o
`messageId`. Nunca se necesita consultar productos de otro restaurante.

| Evento | Significado | Acción de soporte |
| --- | --- | --- |
| `delivery_started` | Vercel entregó el mensaje al consumidor | Buscar el cierre con el mismo `messageId` e intento |
| `delivery_completed` | El trabajo terminó esa entrega sin error | Revisar `jobStatus`, `requeued` y `recoveryStatus` |
| `delivery_retry_scheduled` | El error es recuperable y habrá reentrega | Vigilar que el siguiente intento avance |
| `delivery_discarded` | El mensaje es inválido o el trabajo ya no existe | No reinyectar; comprobar origen si se repite |
| `delivery_expiring` | El siguiente reintento roza el fin de retención | Investigar de inmediato Firestore, proveedor y estado del job |

Los logs nunca son autoridad para cambiar el trabajo. Firestore conserva el estado,
los contadores y los leases; las acciones de soporte deben utilizar los endpoints
autenticados y acotados al tenant.
