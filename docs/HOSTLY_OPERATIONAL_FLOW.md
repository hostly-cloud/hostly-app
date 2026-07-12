# HOSTLY_OPERATIONAL_FLOW

> Flujo operativo canonico de Hostly. Describe como transcurre un servicio completo en un restaurante real usando Hostly, desde la apertura hasta el cierre.

**Estado:** referencia funcional
**Ambito:** operacion diaria, sala, cocina, barra, TPV, reservas, cobros, inventario, compras, CRM y gestion
**Principio rector:** Hostly no es una coleccion de modulos; es un unico flujo operativo

**Relacion documental:** complementa `HOSTLY_DOMAIN_MAP.md`, `HOSTLY_EVENT_MAP.md` y `HOSTLY_SOURCE_OF_TRUTH.md`. Describe el flujo objetivo de operacion; cuando una capacidad no este implementada, debe tratarse como criterio de producto o roadmap, no como estado actual.

---

## 1. Filosofia

Hostly existe para que un restaurante funcione mejor durante la operacion real.

No es un conjunto de pantallas separadas. No es solo un TPV. No es un editor, una cocina digital, una agenda de reservas o un modulo de inventario funcionando por su cuenta.

Hostly es el hilo que conecta lo que ocurre en el restaurante:

- quien llega;
- donde se sienta;
- que pide;
- quien lo prepara;
- cuando se sirve;
- cuanto se cobra;
- que stock se mueve;
- que cliente vuelve;
- que aprende el negocio al final del dia.

Todos los dominios existen para apoyar ese flujo.

La operacion manda. La estetica, la configuracion, los informes y la automatizacion solo tienen sentido si ayudan a que el equipo trabaje con menos dudas, menos errores y mas control.

Un buen servicio con Hostly debe sentirse asi:

- sala entiende que mesas necesitan atencion;
- cocina sabe exactamente que preparar;
- barra no pierde pedidos;
- el encargado ve incidencias antes de que sean problemas;
- el cliente paga sin friccion;
- el gerente entiende el dia sin reconstruirlo manualmente.

---

## 2. El dia comienza

### Apertura del restaurante

El dia operativo empieza antes de que llegue el primer cliente.

El encargado o responsable abre Hostly para comprobar que el negocio esta preparado:

- el restaurante correcto esta activo;
- el turno o jornada queda identificado;
- los usuarios trabajan con permisos adecuados;
- la sala refleja la realidad esperada;
- las estaciones de cocina/barra estan listas;
- caja y medios de pago estan disponibles;
- reservas, compras e incidencias pendientes son visibles.

Hostly debe transmitir una idea inmediata:

**"Hoy podemos operar."**

### Inicio de sesion

Cada persona entra con su perfil operativo:

- camarero;
- jefe de sala;
- cocina;
- barra;
- encargado;
- gerente.

El sistema no debe pedirles entender la arquitectura. Debe mostrarles lo que necesitan para trabajar.

El camarero necesita sala y mesas.
Cocina necesita comandas pendientes.
Barra necesita bebidas y tiempos.
El encargado necesita control global.
El gerente necesita vision de negocio.

### Apertura de caja

Antes del primer cobro, caja debe estar preparada:

- efectivo inicial;
- datÃ¡fono o integraciones de pago;
- usuario responsable;
- turno/caja activa;
- reglas de cobro disponibles.

Apertura de caja no crea ventas. Solo habilita la operacion economica del turno.

### Preparacion de sala

Sala revisa:

- mesas disponibles;
- mesas bloqueadas o fuera de servicio;
- zonas abiertas;
- reservas previstas;
- distribucion del equipo;
- notas operativas del dia.

El plano o vista de sala debe ayudar a reconocer el restaurante, pero la verdad operativa vive en Mesas, Reservas y TPV.

### Preparacion de cocina

Cocina revisa:

- estaciones activas;
- productos no disponibles;
- preparaciones pendientes;
- posibles roturas de stock;
- incidencias del turno anterior;
- tiempos esperados.

Cocina no necesita informacion decorativa. Necesita saber que puede preparar, que falta y que va a llegar.

### Comprobacion de reservas

Antes del servicio se revisa:

- numero de reservas;
- horas punta;
- pax;
- preferencias;
- mesas sugeridas;
- no shows historicos relevantes;
- peticiones especiales.

Una reserva no ocupa una mesa hasta que el cliente llega y se produce una transicion operativa.

### Comprobacion de compras pendientes

El encargado o responsable revisa:

- pedidos de compra pendientes;
- recepciones esperadas;
- facturas de proveedor pendientes de validar;
- productos criticos bajo minimo;
- incidencias de proveedores.

Una factura no es una recepcion. Un pedido no es stock. Hostly debe ayudar a distinguir claramente cada cosa.

### Estado inicial del negocio

Al final de la preparacion, Hostly debe poder resumir:

- estamos abiertos o preparados para abrir;
- caja esta lista;
- sala esta preparada;
- cocina/barra estan disponibles;
- reservas importantes estan visibles;
- compras/stock critico no bloquean el servicio;
- el equipo sabe por donde empezar.

---

## 3. Llegan los clientes

### Reservas

Cuando llega una reserva, Hostly debe ayudar a responder rapido:

- quien es;
- a que hora estaba prevista;
- para cuantas personas;
- que mesa tenia sugerida;
- que preferencias o notas trae;
- si tiene historial relevante.

Sentar una reserva convierte una planificacion en operacion real. Puede abrir mesa, vincular cliente y comenzar servicio, pero solo mediante accion clara.

### Walk-ins

Cuando llega un cliente sin reserva, sala necesita decidir:

- si hay mesa disponible;
- que zona conviene;
- cuantos son;
- si se puede aceptar espera;
- si afecta reservas futuras.

Hostly debe ayudar a tomar esa decision en segundos. No debe obligar a navegar entre modulos.

### Asignacion de mesa

La asignacion debe respetar:

- disponibilidad real;
- capacidad;
- reservas futuras;
- zonas abiertas;
- carga de camareros;
- necesidades del cliente.

La mesa asignada pasa a ser parte de la operacion del servicio. Si cambia, el cambio debe ser visible y trazable.

### Recepcion

Recepcion o jefe de sala necesita:

- encontrar cliente/reserva;
- confirmar pax;
- asignar mesa;
- anotar preferencias;
- comunicar al equipo que la mesa empieza.

La recepcion no debe crear ventas duplicadas, reservas falsas ni clientes CRM innecesarios.

### Apertura de mesa

Abrir mesa marca el inicio operativo del servicio.

Produce:

- mesa ocupada;
- venta o sesion activa;
- hora de inicio;
- contexto de camarero/zona;
- posible vinculo con reserva o cliente.

No produce:

- comanda enviada;
- pago;
- factura;
- consumo de stock;
- cierre de reserva sin estado claro.

---

## 4. Durante el servicio

### Abrir mesa

El camarero entra en la mesa para iniciar o continuar el servicio.

Debe ver:

- numero/nombre de mesa;
- pax;
- estado de cuenta;
- comandas enviadas;
- productos pendientes;
- notas relevantes;
- posibles restricciones o alergias.

La mesa debe ser un punto de control, no una pantalla administrativa.

### Crear comanda

La comanda nace de lo que el cliente pide.

El camarero selecciona productos, cantidades, modificadores y notas. Hasta que se envia, puede ser preparacion de venta o borrador operativo, pero cocina no debe asumir que existe trabajo real.

### Anadir productos

Anadir producto debe ser rapido:

- producto visible;
- precio claro;
- categoria entendible;
- disponibilidad si aplica;
- variantes accesibles;
- repeticion facil.

El producto anadido cambia la venta. No necesariamente cambia cocina hasta enviar comanda.

### Modificadores

Los modificadores convierten una linea generica en una instruccion real:

- punto de carne;
- sin hielo;
- sin gluten;
- extra salsa;
- cambio de guarnicion;
- menu o combo;
- opcion de preparacion.

Si afecta preparacion, debe viajar a Comanda/KDS. Si afecta precio, debe quedar en TPV y factura/ticket.

### Notas

Las notas ayudan a comunicar excepciones:

- "cliente tiene prisa";
- "sacar todo junto";
- "cumpleanos";
- "sin sal";
- "mesa con nino".

No deben sustituir datos estructurados criticos. Una alergia importante no deberia vivir solo como nota libre si el producto necesita control formal.

### Enviar comanda

Enviar comanda es uno de los momentos mas importantes del servicio.

Convierte pedido en trabajo real:

- cocina recibe platos;
- barra recibe bebidas;
- KDS muestra trabajo pendiente;
- tiempos empiezan a contar;
- el camarero puede seguir atendiendo.

No cobra. No cierra mesa. No emite factura.

Debe ser claro para el camarero que la comanda se envio. Debe ser claro para cocina que el trabajo existe.

### Cocina

Cocina trabaja con prioridad, claridad y ritmo.

Necesita:

- que preparar;
- cantidad;
- modificadores;
- notas;
- mesa o destino;
- tiempo de espera;
- pase;
- cambios/cancelaciones.

KDS nunca debe esconder trabajo pendiente. Si algo esta filtrado, retrasado o modificado, debe ser evidente.

### Barra

Barra comparte logica con cocina, pero su ritmo suele ser mas inmediato:

- bebidas rapidas;
- cocteles;
- cafes;
- botellas;
- servicio de barra directa;
- pedidos de sala.

Hostly debe evitar que barra pierda pedidos entre sala, TPV y KDS.

### Servicio

El camarero entrega, revisa y continua:

- nuevos productos;
- segundos pases;
- postres;
- bebidas adicionales;
- incidencias;
- cambios de mesa;
- union/separacion de mesas.

Hostly debe mantener continuidad. El camarero no debe reconstruir mentalmente que esta pendiente.

### Ampliaciones

Durante una mesa real, casi siempre hay ampliaciones:

- otra ronda;
- pan extra;
- cafe;
- postre;
- producto invitado;
- menu ampliado;
- cambio de cantidad.

Cada ampliacion debe conservar trazabilidad: que se vendio, que se preparo, que se cobro y que quedo pendiente.

### Cambios

Cambios frecuentes:

- mover mesa;
- unir mesas;
- separar cuentas;
- cancelar linea;
- cambiar cantidad;
- cambiar pase;
- aplicar descuento;
- invitar producto.

El sistema debe permitir corregir sin borrar la historia. Cancelar no es borrar. Invitar no es eliminar. Mover mesa no duplica venta.

### Incidencias

Incidencias reales:

- plato devuelto;
- producto agotado;
- comanda duplicada;
- cliente cambia de mesa;
- pago fallido;
- reserva llega tarde;
- cocina retrasa un pase;
- stock no coincide;
- camarero se equivoca.

Hostly debe hacer que la incidencia sea visible, corregible y trazable sin parar el servicio.

---

## 5. Cobro

### Cuenta

Cuando el cliente pide la cuenta, Hostly debe mostrar:

- lineas consumidas;
- productos invitados;
- descuentos;
- impuestos;
- pagos ya realizados;
- saldo pendiente;
- division de cuenta si aplica.

La cuenta debe coincidir con lo vendido y lo cobrado. No debe depender de memoria del camarero.

### Descuentos

El descuento debe ser explicito:

- motivo;
- importe o porcentaje;
- usuario;
- linea o cuenta completa;
- impacto en total.

No debe ocultar consumo ni cambiar recetas, stock o comandas.

### Vales

Un vale o bono debe tratarse como valor controlado:

- saldo antes;
- importe aplicado;
- saldo despues;
- venta asociada;
- cliente si aplica.

No es un descuento informal ni dinero inventado.

### Pagos parciales

En hosteleria real, una mesa puede pagar:

- por persona;
- por productos;
- en efectivo y tarjeta;
- parte ahora y parte despues;
- con vale y tarjeta;
- con invitacion parcial.

Hostly debe mantener claro:

- que esta pagado;
- que falta;
- con que metodo;
- quien pago;
- si la mesa puede cerrarse.

### Ticket

El ticket representa lo cobrado o lo vendido segun flujo fiscal definido.

Debe congelar:

- lineas;
- precios;
- descuentos;
- impuestos;
- fecha;
- total.

La impresion del ticket no es la verdad. La verdad es el documento emitido y su relacion con venta/pago.

### Factura

La factura requiere especial cuidado:

- cliente fiscal;
- datos legales;
- numeracion;
- impuestos;
- totales;
- venta asociada.

Cambiar el CRM despues no cambia una factura emitida. Una factura no cobra por si sola.

### Cierre de mesa

Cerrar mesa libera el recurso operativo.

Debe comprobar:

- no queda saldo pendiente;
- no queda trabajo critico pendiente;
- la venta esta resuelta;
- pagos estan registrados;
- ticket/factura se emitio si aplica;
- la mesa puede volver a usarse.

Cerrar mesa no debe ser una forma de esconder deuda o errores.

---

## 6. Despues del cobro

### Liberacion de mesa

La mesa vuelve a estar disponible cuando el servicio queda resuelto.

Hostly debe reflejarlo rapidamente para sala, recepcion y reservas futuras.

### Actualizacion de analitica

Analitica empieza a convertir operacion en aprendizaje:

- ventas;
- ticket medio;
- tiempos de servicio;
- rendimiento por zona;
- productos mas vendidos;
- descuentos;
- invitaciones;
- no shows;
- rotacion de mesa.

Analitica no corrige la operacion. La interpreta.

### Actualizacion de inventario

Si el restaurante trabaja con consumo integrado, inventario se actualiza mediante movimientos trazables:

- consumo por venta;
- merma;
- ajustes;
- recepciones;
- costes.

El stock no debe cambiar por una vista, una factura o un calculo silencioso.

### Historico

El servicio deja historia:

- mesa;
- venta;
- comanda;
- pagos;
- ticket/factura;
- cliente si aplica;
- tiempos;
- incidencias.

Ese historico debe poder reconstruirse sin recalcularlo con datos actuales.

### CRM

Si hay cliente identificado, Hostly puede enriquecer relacion:

- visita realizada;
- preferencias;
- productos habituales;
- no show;
- celebraciones;
- incidencias;
- gasto aproximado.

CRM no debe modificar cliente fiscal historico ni inventar identidad cuando no existe.

### Fidelizacion futura

Despues del servicio, Hostly puede ayudar a:

- recordar preferencias;
- sugerir comunicacion;
- detectar clientes frecuentes;
- preparar reservas futuras;
- analizar valor del cliente.

La fidelizacion debe sentirse como memoria util, no como automatizacion invasiva.

---

## 7. Fin del turno

### Cierre de caja

Al final del turno, el encargado revisa:

- efectivo esperado;
- efectivo real;
- tarjeta;
- vales;
- pagos parciales;
- devoluciones;
- descuadres;
- propinas si aplica.

El cierre de caja debe explicar diferencias, no ocultarlas.

### Revision de ventas

El responsable revisa:

- total vendido;
- ventas por canal;
- ventas por zona;
- productos principales;
- descuentos;
- invitaciones;
- cancelaciones;
- camarero;
- horas punta.

Esto no debe requerir exportar datos y reconstruir la verdad manualmente.

### Incidencias

El turno deja incidencias:

- pagos fallidos;
- comandas canceladas;
- platos devueltos;
- stock roto;
- reservas no show;
- errores de mesa;
- diferencias de caja.

Hostly debe ayudar a ver que paso y que queda pendiente.

### Compras pendientes

Despues del servicio se revisa:

- productos bajo minimo;
- compras sugeridas;
- pedidos pendientes;
- recepciones esperadas;
- facturas de proveedor sin validar.

La compra empieza como decision de gestion, no como movimiento de stock.

### Stock

El cierre operativo puede incluir:

- revisar consumos;
- registrar mermas;
- contar productos criticos;
- validar diferencias;
- preparar pedidos.

Stock debe estar basado en movimientos y conteos trazables.

### Resultados del dia

El gerente necesita entender:

- que se vendio;
- donde se gano o perdio margen;
- que mesas rotaron mejor;
- que productos funcionaron;
- que incidencias se repiten;
- que compras vienen;
- que reservas futuras importan;
- que decisiones tomar manana.

Hostly debe convertir el dia en claridad.

---

## 8. Que siente cada perfil

### Camarero

Espera:

- rapidez;
- pocas pulsaciones;
- saber que mesa necesita atencion;
- mandar comandas sin duda;
- corregir errores sin miedo;
- cobrar sin complicarse;
- no tener que explicar al sistema como funciona un restaurante.

Para el camarero, Hostly debe sentirse como una herramienta de servicio, no como administracion.

### Jefe de sala

Espera:

- control de ocupacion;
- reservas claras;
- rotacion visible;
- incidencias detectables;
- cambios de mesa seguros;
- coordinacion con cocina y barra;
- capacidad de ayudar al equipo sin perder vision global.

Para el jefe de sala, Hostly debe ser radar y mando operativo.

### Cocina

Espera:

- comandas claras;
- modificadores visibles;
- tiempos reales;
- prioridades;
- cambios y cancelaciones sin confusion;
- nada duplicado;
- nada perdido.

Para cocina, Hostly debe ser verdad de trabajo pendiente.

### Barra

Espera:

- pedidos inmediatos;
- separacion clara entre sala y barra;
- tiempos rapidos;
- cambios visibles;
- control de rondas;
- menos gritos y menos papel perdido.

Para barra, Hostly debe reducir ruido.

### Encargado

Espera:

- caja controlada;
- equipo coordinado;
- incidencias visibles;
- reservas bajo control;
- stock critico conocido;
- cierres claros;
- permiso para intervenir rapido.

Para el encargado, Hostly debe ser confianza durante presion.

### Gerente

Espera:

- saber si el negocio fue bien;
- entender margen;
- ver ventas, compras y stock conectados;
- detectar problemas repetidos;
- preparar decisiones futuras;
- no depender de intuicion o hojas sueltas.

Para el gerente, Hostly debe transformar operacion en gestion.

---

## 9. Puntos donde Hostly aporta mas valor

Hostly marca diferencia frente a un TPV tradicional cuando conecta momentos que normalmente viven separados:

- reserva y mesa;
- mesa y venta;
- venta y comanda;
- comanda y KDS;
- venta y pago;
- pago y cierre de mesa;
- venta y cliente;
- venta y consumo teorico;
- recepcion y stock;
- stock y compras;
- receta y margen;
- operacion diaria y analitica.

Momentos clave:

- antes del servicio, mostrando si el restaurante esta preparado;
- al sentar una reserva, evitando confundir planificacion con ocupacion;
- al enviar comanda, asegurando que cocina recibe exactamente lo necesario;
- durante cambios e incidencias, permitiendo corregir sin borrar historia;
- en cobro, manteniendo claro pagado/pendiente;
- al cerrar mesa, evitando liberar una mesa con deuda o trabajo pendiente;
- al cerrar turno, convirtiendo ventas, caja, stock e incidencias en lectura accionable.

El valor no esta en tener mas funciones. Esta en que el restaurante trabaje con menos duda.

---

## 10. Errores imperdonables

Hostly nunca debe permitir que estos errores se normalicen:

- perder una comanda;
- duplicar una comanda sin senal clara;
- cobrar mal;
- duplicar un pago;
- dejar una mesa libre con cuenta abierta;
- cerrar una mesa con saldo pendiente;
- mostrar una reserva falsa;
- sentar una reserva sin mesa real;
- ocultar trabajo pendiente en cocina/barra;
- registrar stock incoherente;
- cambiar stock sin movimiento;
- emitir ticket incorrecto;
- emitir factura con datos fiscales equivocados;
- recalcular historicos con datos actuales;
- confundir cliente fiscal con cliente hostelero;
- dejar que OCR confirme datos criticos;
- usar una impresion como fuente de verdad;
- permitir que una vista visual mande sobre la operacion.

Un restaurante puede tolerar una funcion que falta. No puede tolerar perder confianza en lo que Hostly dice.

---

## 11. Principios

- La operacion siempre esta por encima de la estetica.
- Un restaurante nunca debe detenerse por el software.
- La confianza vale mas que una funcionalidad nueva.
- El usuario nunca debe preguntarse que hacer despues.
- Lo urgente debe estar visible.
- Lo critico debe ser trazable.
- Lo historico debe quedar congelado.
- La correccion debe ser facil, pero nunca invisible.
- Sala, cocina, barra y gestion deben ver la misma realidad desde perspectivas distintas.
- Hostly debe reducir ruido, no anadirlo.
- Cada modulo existe para servir al flujo completo.
- Si una accion afecta dinero, stock, cocina, mesa o cliente, debe ser explicable.
- La mejor automatizacion es la que evita dudas sin quitar control humano.

---

## Impacto sobre otros dominios

Este documento afecta al flujo completo de Hostly. Cada fase del servicio convoca dominios distintos.

## Apertura y preparacion

Dominios participantes:

- Configuracion del negocio.
- Mesas.
- Reservas.
- TPV.
- Pagos/caja.
- KDS.
- Inventario.
- Compras.
- Analitica.

Objetivo:

- confirmar que el restaurante esta listo para operar.

## Llegada y asignacion

Dominios participantes:

- Reservas.
- CRM.
- Mesas.
- TPV.
- Analitica.

Objetivo:

- convertir demanda real en servicio activo sin crear dobles verdades.

## Servicio activo

Dominios participantes:

- Mesas.
- TPV.
- Comanda.
- KDS.
- Inventario.
- Escandallos.
- Analitica.

Objetivo:

- coordinar venta, preparacion, servicio y cambios sin perder trazabilidad.

## Cobro y cierre de mesa

Dominios participantes:

- TPV.
- Pagos.
- Facturacion.
- Mesas.
- CRM.
- Analitica.

Objetivo:

- resolver dinero, documentos y disponibilidad sin inconsistencias.

## Post-servicio

Dominios participantes:

- Analitica.
- Inventario.
- CRM.
- Compras.
- Proveedores.
- Escandallos.

Objetivo:

- convertir lo ocurrido en aprendizaje, reposicion y gestion futura.

## Fin de turno

Dominios participantes:

- Pagos/caja.
- TPV.
- Facturacion.
- Analitica.
- Inventario.
- Compras.
- Reservas.
- CRM.

Objetivo:

- cerrar el dia con confianza, detectar incidencias y preparar el siguiente servicio.

## Dominios que deben respetar este flujo

- Editor V2 debe apoyar la comprension espacial, no sustituir la operacion.
- Sistema visual debe clarificar estados, no inventarlos.
- Design System debe priorizar rapidez y confianza en contexto de servicio.
- IA/OCR debe asistir, no confirmar datos criticos.
- Analitica debe interpretar, no corregir fuentes de verdad.
