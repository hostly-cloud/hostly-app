# HOSTLY_EVENT_MAP

> Mapa funcional de eventos de negocio de Hostly. Define que ocurre realmente cuando un usuario realiza una accion y que dominios quedan afectados.

**Estado:** referencia funcional
**Ambito:** eventos de negocio, consecuencias entre dominios y trazabilidad operativa
**Principio rector:** no existen efectos secundarios magicos

**Relacion documental:** complementa `HOSTLY_DOMAIN_MAP.md` y `HOSTLY_SOURCE_OF_TRUTH.md`. Distingue eventos de dominio de eventos de UI, persistencia o roadmap; no convierte ideas futuras en comportamiento implementado.

---

## 1. Filosofia

Hostly debe poder explicar cada consecuencia importante de una accion del usuario.

Los usuarios realizan acciones.
Las acciones generan eventos.
Los eventos afectan dominios.
Los dominios producen consecuencias.

Un evento funcional no es un detalle tecnico, una llamada API, una escritura en Firestore ni un cambio visual. Un evento funcional es algo que el restaurante reconoce como parte de su operacion:

- se abre una mesa;
- se envia una comanda;
- se cobra una venta;
- se recibe mercancia;
- se emite una factura;
- se actualiza una receta;
- se cancela una reserva.

Todo evento importante debe responder:

- que lo inicia;
- que dominio es responsable;
- que produce;
- que no produce;
- que datos congela;
- que riesgos introduce;
- que regla nunca debe romper.

Hostly no debe crecer con efectos secundarios invisibles. Si una accion cambia dinero, trabajo pendiente, stock, disponibilidad, historial o responsabilidad fiscal, ese cambio debe ser explicable, trazable y pertenecer a un dominio claro.

Este documento usa cuatro tipos de evento:

- **Evento de dominio:** hecho operativo que el restaurante reconoce y que cambia una responsabilidad de negocio.
- **Evento de UI:** interaccion visual que puede iniciar un evento de dominio, pero no es la verdad por si misma.
- **Evento de persistencia:** lectura o escritura tecnica necesaria para guardar el estado; no debe confundirse con el hecho de negocio.
- **Evento futuro:** capacidad prevista o dependiente de roadmap, marcada como tal cuando no pertenece al comportamiento actual.

---

## 2. Eventos principales

### Crear restaurante

**Que inicia el evento.**
Un usuario autorizado crea o completa el alta de un restaurante.

**Dominios implicados.**
Configuracion del negocio, usuarios/tenant, analitica.

**Evento principal.**
`Restaurante creado`.

**Que produce.**

- Crea la unidad operativa principal del tenant.
- Define `restaurantId` como frontera de datos.
- Habilita configuracion inicial de espacios, carta, usuarios, TPV y operacion.

**Que NO produce.**

- No crea ventas.
- No crea stock.
- No crea mesas operativas reales salvo plantilla explicitamente confirmada.
- No crea facturas ni pagos.

**Snapshots creados.**

- Datos iniciales del restaurante.
- Usuario/owner inicial.
- Fecha y origen de creacion.

**Riesgos.**

- Crear datos sin `restaurantId`.
- Mezclar configuracion demo con datos reales.
- Asumir que un restaurante creado ya esta listo para operar.

**Reglas sagradas.**

- Todo dato posterior debe pertenecer a un `restaurantId`.
- El alta no debe inventar operacion.

### Crear espacio

**Que inicia el evento.**
El usuario crea una sala, terraza, jardin, barra u otro espacio de trabajo.

**Dominios implicados.**
Editor V2, Mesas si el espacio se publica, Analitica.

**Evento principal.**
`Espacio creado`.

**Que produce.**

- Crea una unidad visual/organizativa del restaurante.
- Permite ubicar mesas, elementos fijos, zonas y ambiente.

**Que NO produce.**

- No ocupa mesas.
- No crea reservas.
- No crea comandas.
- No modifica TPV, pagos ni inventario.

**Snapshots creados.**

- Nombre, tipo, orden y configuracion visual inicial del espacio.

**Riesgos.**

- Confundir espacio visual con operacion activa.
- Usar el espacio como fuente de verdad de ocupacion.

**Reglas sagradas.**

- Un espacio ayuda a operar, pero no opera por si mismo.

### Crear mesa

**Que inicia el evento.**
El usuario crea una mesa en configuracion o la publica desde el Editor V2 hacia operacion.

**Dominios implicados.**
Editor V2, Mesas, Analitica.

**Evento principal.**
`Mesa creada`.

**Que produce.**

- Crea una unidad operativa de sala.
- Define nombre/numero, capacidad y espacio asociado.
- Puede crear representacion visual si se hace desde el editor.

**Que NO produce.**

- No abre la mesa.
- No crea venta.
- No crea reserva.
- No crea comanda.

**Snapshots creados.**

- Configuracion inicial de la mesa.
- Relacion con espacio publicado.

**Riesgos.**

- Duplicar mesa visual y mesa operativa.
- Crear mesas sin capacidad o identificacion clara.

**Reglas sagradas.**

- Una mesa creada no esta ocupada.
- La mesa operativa manda sobre ocupacion; el plano solo la representa.

### Editar mesa

**Que inicia el evento.**
El usuario cambia nombre, capacidad, ubicacion, visibilidad o propiedades de una mesa.

**Dominios implicados.**
Mesas, Editor V2 si el cambio es visual, Reservas, TPV, Analitica.

**Evento principal.**
`Mesa actualizada`.

**Que produce.**

- Actualiza configuracion futura de la mesa.
- Puede afectar disponibilidad futura o lectura visual.

**Que NO produce.**

- No debe alterar ventas pasadas.
- No debe cambiar tickets o facturas emitidas.
- No debe cerrar una mesa abierta.

**Snapshots creados.**

- Cambio de configuracion.
- Estado anterior si afecta operacion.

**Riesgos.**

- Cambiar capacidad mientras hay reservas o servicio activo.
- Reescribir historicos de ventas por cambios actuales.

**Reglas sagradas.**

- Editar una mesa no puede mentir sobre su ocupacion actual.
- Los historicos conservan la mesa como era en el momento del servicio.

### Abrir mesa

**Que inicia el evento.**
Un camarero o encargado inicia servicio en una mesa.

**Dominios implicados.**
Mesas, TPV, Reservas si viene de reserva, Analitica.

**Evento principal.**
`Mesa abierta`.

**Que produce.**

- Cambia ocupacion de mesa.
- Crea o vincula una sesion/venta activa de TPV.
- Marca inicio de servicio.

**Que NO produce.**

- No envia comanda.
- No cobra.
- No consume stock.
- No crea factura.

**Snapshots creados.**

- Mesa, hora de apertura, usuario, pax si aplica.
- Reserva origen si aplica.

**Riesgos.**

- Abrir una mesa ya ocupada.
- Crear varias ventas activas para la misma mesa sin intencion.

**Reglas sagradas.**

- Una mesa nunca debe mentir sobre ocupacion.
- Abrir mesa debe ser visible para sala y TPV.

### Anadir producto

**Que inicia el evento.**
El usuario selecciona un producto en TPV para una mesa, venta o canal.

**Dominios implicados.**
TPV, Comanda si el producto requiere preparacion, Escandallos, Analitica.

**Evento principal.**
`Linea de venta creada`.

**Que produce.**

- Anade una linea a la venta activa.
- Captura precio vigente y configuracion comercial necesaria.
- Prepara la linea para envio a comanda si corresponde.

**Que NO produce.**

- No envia automaticamente a cocina salvo flujo explicito.
- No cobra.
- No descuenta stock sin evento de consumo definido.
- No emite factura.

**Snapshots creados.**

- Producto, precio, impuestos, nombre visible, categoria, receta/version si aplica.

**Riesgos.**

- Usar precio actual para ventas pasadas.
- Confundir linea de venta con comanda enviada.

**Reglas sagradas.**

- El precio cobrado debe poder reconstruirse historicamente.
- La venta activa es responsabilidad de TPV.

### Modificar cantidad

**Que inicia el evento.**
El usuario aumenta o reduce cantidad de una linea.

**Dominios implicados.**
TPV, Comanda si ya fue enviada, KDS si esta en preparacion, Analitica.

**Evento principal.**
`Cantidad de linea modificada`.

**Que produce.**

- Cambia cantidad pendiente o vendida segun estado.
- Puede requerir ajuste/cancelacion de comanda si la linea ya fue enviada.

**Que NO produce.**

- No debe borrar la trazabilidad de la cantidad anterior.
- No cobra por si solo.
- No modifica stock sin movimiento.

**Snapshots creados.**

- Cantidad anterior, nueva cantidad, usuario y momento.

**Riesgos.**

- Cambiar cocina sin avisar.
- Alterar importes cerrados.

**Reglas sagradas.**

- Si cocina ya recibio trabajo, la modificacion debe generar senal operativa.

### Anadir modificador

**Que inicia el evento.**
El usuario anade opcion, extra, punto de coccion, alergenos o variacion a una linea.

**Dominios implicados.**
TPV, Comanda, KDS, Escandallos si afecta coste, Analitica.

**Evento principal.**
`Modificador aplicado`.

**Que produce.**

- Cambia la descripcion operativa/comercial de la linea.
- Puede cambiar precio, preparacion o coste teorico.

**Que NO produce.**

- No modifica la receta maestra.
- No edita comandas ya preparadas sin evento de cambio.

**Snapshots creados.**

- Modificador, precio adicional si aplica, impacto operativo.

**Riesgos.**

- Que cocina no vea el modificador.
- Que el precio extra no quede congelado.

**Reglas sagradas.**

- Una comanda nunca debe mentir sobre lo que hay que preparar.

### Anadir nota

**Que inicia el evento.**
El usuario escribe una nota en linea, comanda, mesa o reserva.

**Dominios implicados.**
TPV, Comanda, KDS, Mesas, Reservas, CRM segun contexto.

**Evento principal.**
`Nota anadida`.

**Que produce.**

- Aporta contexto operativo.
- Puede viajar a cocina/barra si afecta preparacion.

**Que NO produce.**

- No cambia precio.
- No cambia stock.
- No cambia estado de pago.
- No sustituye modificadores estructurados cuando son necesarios.

**Snapshots creados.**

- Texto, autor, fecha y entidad asociada.

**Riesgos.**

- Usar notas como datos criticos no estructurados.
- Ocultar informacion importante donde cocina no la ve.

**Reglas sagradas.**

- Las notas ayudan; no deben sustituir eventos criticos.

### Enviar comanda

**Que inicia el evento.**
El usuario manda a cocina/barra/cocteleria las lineas preparables de una venta.

**Dominios implicados.**
TPV, Comanda, KDS, Inventario, Analitica.

**Evento principal.**
`Comanda enviada`.

**Que produce.**

- Crea trabajo pendiente para estaciones.
- Congela contenido operativo enviado.
- Informa al KDS de platos/bebidas a preparar.
- Puede preparar futuros consumos de inventario segun politica.

**Que NO produce.**

- No cobra.
- No cierra mesa.
- No emite factura.
- No modifica receta maestra.

**Snapshots creados.**

- Lineas enviadas, cantidades, modificadores, notas, estacion destino, usuario y hora.

**Riesgos.**

- Enviar informacion incompleta.
- Duplicar comandas por reintento.
- Que KDS muestre menos trabajo del real.

**Reglas sagradas.**

- Una comanda nunca debe mentir sobre lo que hay que preparar.
- Enviar comanda debe ser trazable e idempotente.

### Marchar primeros

**Que inicia el evento.**
El usuario ordena preparar o avanzar el pase de primeros.

**Dominios implicados.**
Comanda, KDS, TPV, Analitica.

**Evento principal.**
`Pase de primeros marchado`.

**Que produce.**

- Activa prioridad o preparacion de lineas marcadas como primeros.
- Actualiza trabajo pendiente en KDS.

**Que NO produce.**

- No cobra.
- No cierra mesa.
- No cambia receta.

**Snapshots creados.**

- Lineas afectadas, pase, hora y usuario.

**Riesgos.**

- Marchar productos equivocados.
- Ocultar segundos/postres pendientes.

**Reglas sagradas.**

- KDS debe reflejar trabajo pendiente real por pase.

### Marchar segundos

**Que inicia el evento.**
El usuario ordena preparar o avanzar el pase de segundos.

**Dominios implicados.**
Comanda, KDS, TPV, Analitica.

**Evento principal.**
`Pase de segundos marchado`.

**Que produce.**

- Activa prioridad o preparacion de lineas marcadas como segundos.
- Informa a cocina del siguiente pase.

**Que NO produce.**

- No cobra.
- No elimina primeros.
- No modifica stock directamente.

**Snapshots creados.**

- Lineas afectadas, pase, hora y usuario.

**Riesgos.**

- Descoordinar sala y cocina.

**Reglas sagradas.**

- Marchar un pase debe ser visible para cocina.

### Marchar postres

**Que inicia el evento.**
El usuario ordena preparar o avanzar el pase de postres.

**Dominios implicados.**
Comanda, KDS, TPV, Analitica.

**Evento principal.**
`Pase de postres marchado`.

**Que produce.**

- Activa preparacion o servicio de postres pendientes.

**Que NO produce.**

- No cierra la mesa.
- No cobra automaticamente.

**Snapshots creados.**

- Lineas afectadas, pase, hora y usuario.

**Riesgos.**

- Confundir postres marchados con mesa lista para cobrar.

**Reglas sagradas.**

- Un pase no cambia estado economico de la venta.

### Cancelar linea

**Que inicia el evento.**
El usuario cancela una linea de venta o comanda.

**Dominios implicados.**
TPV, Comanda, KDS, Pagos si ya habia cobro parcial, Analitica.

**Evento principal.**
`Linea cancelada`.

**Que produce.**

- Marca la linea como cancelada o ajusta cantidad.
- Notifica a cocina/barra si la linea ya fue enviada.
- Puede afectar total pendiente.

**Que NO produce.**

- No borra el historico.
- No devuelve dinero sin evento de pago/devolucion.
- No ajusta stock sin movimiento.

**Snapshots creados.**

- Linea original, motivo, usuario, estado anterior, momento.

**Riesgos.**

- Cancelar algo ya preparado sin registro.
- Descuadrar pago parcial.

**Reglas sagradas.**

- Cancelar no es borrar.
- Cocina debe enterarse si el trabajo cambia.

### Invitar producto

**Que inicia el evento.**
El usuario marca una linea como invitacion/cortesia.

**Dominios implicados.**
TPV, Analitica, Inventario si hay consumo, Comanda si preparable.

**Evento principal.**
`Producto invitado`.

**Que produce.**

- Mantiene la linea y su consumo operativo.
- Ajusta el importe cobrado al cliente segun regla.
- Permite analizar cortesias.

**Que NO produce.**

- No elimina la linea.
- No evita preparacion si el producto debe servirse.
- No oculta coste.

**Snapshots creados.**

- Producto, precio original, descuento/invitacion, usuario y motivo.

**Riesgos.**

- Confundir invitacion con cancelacion.
- Perder margen real.

**Reglas sagradas.**

- Una invitacion conserva consumo y trazabilidad.

### Cambiar mesa

**Que inicia el evento.**
El usuario mueve una venta/sesion activa de una mesa a otra.

**Dominios implicados.**
Mesas, TPV, Reservas si aplica, Comanda, Analitica.

**Evento principal.**
`Servicio cambiado de mesa`.

**Que produce.**

- Libera mesa origen si corresponde.
- Ocupa mesa destino.
- Mantiene venta activa y comandas asociadas.

**Que NO produce.**

- No crea nueva venta salvo decision explicita.
- No duplica comandas.
- No cobra.

**Snapshots creados.**

- Mesa origen, mesa destino, usuario, hora y venta asociada.

**Riesgos.**

- Dejar dos mesas ocupadas por la misma venta.
- Perder trazabilidad para sala/cocina.

**Reglas sagradas.**

- Una mesa nunca debe mentir sobre ocupacion.

### Unir mesas

**Que inicia el evento.**
El usuario une dos o mas mesas para operar una venta o grupo conjunto.

**Dominios implicados.**
Mesas, TPV, Reservas, Analitica.

**Evento principal.**
`Mesas unidas`.

**Que produce.**

- Crea relacion operativa entre mesas.
- Permite tratar varias mesas como unidad de servicio.

**Que NO produce.**

- No fusiona facturas ya emitidas.
- No borra ventas existentes sin flujo explicito.
- No cambia capacidad historica.

**Snapshots creados.**

- Mesas unidas, venta/sesion principal, hora y usuario.

**Riesgos.**

- Duplicar ocupacion.
- Confundir union fisica con union economica.

**Reglas sagradas.**

- Unir mesas debe preservar trazabilidad de cada mesa.

### Separar mesas

**Que inicia el evento.**
El usuario deshace una union operativa de mesas.

**Dominios implicados.**
Mesas, TPV, Reservas, Analitica.

**Evento principal.**
`Mesas separadas`.

**Que produce.**

- Rompe la agrupacion operativa.
- Reasigna ocupacion o ventas segun flujo elegido.

**Que NO produce.**

- No cancela comandas.
- No devuelve pagos.
- No emite facturas.

**Snapshots creados.**

- Grupo anterior, resultado, usuario y hora.

**Riesgos.**

- Dejar ventas sin mesa responsable.

**Reglas sagradas.**

- Separar mesas no debe perder venta, comanda ni pago.

### Cobrar mesa

**Que inicia el evento.**
El usuario solicita cobrar total o parcialmente una mesa/venta.

**Dominios implicados.**
TPV, Pagos, Facturacion, Mesas, Analitica, CRM si hay cliente.

**Evento principal.**
`Cobro iniciado` y, si se confirma, `Pago registrado`.

**Que produce.**

- Calcula importe pendiente.
- Registra pago si se confirma.
- Puede habilitar cierre de venta/mesa.
- Puede preparar ticket/factura.

**Que NO produce.**

- No cierra mesa automaticamente si quedan importes, comandas o reglas pendientes.
- No emite factura si solo se registra pago y el flujo no lo solicita.
- No modifica stock directamente.

**Snapshots creados.**

- Importe cobrado, metodo, venta, mesa, usuario, fecha, referencia y estado.

**Riesgos.**

- Duplicar pago por reintento.
- Cobrar importe incorrecto.
- Cerrar mesa con pago pendiente.

**Reglas sagradas.**

- Un pago nunca debe mentir sobre dinero.
- Los pagos deben ser idempotentes.

### Pago parcial

**Que inicia el evento.**
El usuario cobra parte de una venta o divide cuenta.

**Dominios implicados.**
TPV, Pagos, Facturacion, Mesas, Analitica.

**Evento principal.**
`Pago parcial registrado`.

**Que produce.**

- Reduce importe pendiente.
- Mantiene venta abierta si queda saldo.
- Puede asociar lineas o importe a un pago.

**Que NO produce.**

- No cierra venta si queda pendiente.
- No cancela lineas no pagadas.
- No libera mesa por si solo.

**Snapshots creados.**

- Importe parcial, metodo, lineas afectadas si aplica, saldo resultante.

**Riesgos.**

- Perder correspondencia entre pagado y pendiente.

**Reglas sagradas.**

- El saldo pendiente debe ser explicable.

### Aplicar descuento

**Que inicia el evento.**
El usuario aplica descuento a linea, venta o grupo.

**Dominios implicados.**
TPV, Pagos, Facturacion, Analitica.

**Evento principal.**
`Descuento aplicado`.

**Que produce.**

- Cambia total a cobrar.
- Conserva precio original y motivo.
- Afecta ticket/factura futura.

**Que NO produce.**

- No elimina consumo.
- No cambia receta.
- No devuelve pagos ya confirmados sin evento especifico.

**Snapshots creados.**

- Precio original, descuento, motivo, usuario y regla aplicada.

**Riesgos.**

- Ocultar perdida de margen.
- Aplicar descuentos sin permiso.

**Reglas sagradas.**

- El precio original y precio cobrado deben conservarse.

### Aplicar vale

**Que inicia el evento.**
El usuario aplica un vale, bono, tarjeta regalo o credito.

**Dominios implicados.**
TPV, Pagos, CRM, Facturacion, Analitica.

**Evento principal.**
`Vale aplicado`.

**Que produce.**

- Reduce importe pendiente o registra medio de pago/promocion.
- Consume saldo del vale si procede.

**Que NO produce.**

- No crea dinero nuevo.
- No modifica stock.
- No altera comandas.

**Snapshots creados.**

- Identificador del vale, saldo antes/despues, importe aplicado, venta asociada.

**Riesgos.**

- Usar el mismo vale dos veces.
- Confundir vale con descuento contable.

**Reglas sagradas.**

- El saldo del vale debe ser trazable e idempotente.

### Cerrar mesa

**Que inicia el evento.**
El usuario cierra una mesa tras terminar servicio.

**Dominios implicados.**
Mesas, TPV, Pagos, Facturacion, Comanda, KDS, Analitica.

**Evento principal.**
`Mesa cerrada`.

**Que produce.**

- Libera la mesa.
- Cierra sesion/venta si cumple reglas.
- Consolida resumen operativo del servicio.

**Que NO produce.**

- No debe cerrar si hay pago pendiente.
- No debe cerrar si hay trabajo KDS pendiente critico.
- No crea factura si el flujo fiscal no se ha ejecutado.
- No borra la venta.

**Snapshots creados.**

- Hora de cierre, venta asociada, estado de pago, usuario, mesa y resumen.

**Riesgos.**

- Liberar mesa con deuda.
- Ocultar comandas pendientes.
- Perder trazabilidad del servicio.

**Reglas sagradas.**

- Cerrar mesa no debe mentir sobre dinero, ocupacion ni trabajo pendiente.

### Crear reserva

**Que inicia el evento.**
El usuario registra una reserva futura.

**Dominios implicados.**
Reservas, CRM, Mesas, Analitica.

**Evento principal.**
`Reserva creada`.

**Que produce.**

- Crea compromiso futuro con fecha, hora, pax y estado.
- Puede vincular cliente CRM.
- Puede sugerir o asignar mesa.

**Que NO produce.**

- No abre mesa.
- No crea venta.
- No envia comanda.
- No cobra salvo deposito mediante evento de pago.

**Snapshots creados.**

- Datos de reserva, cliente asociado, preferencias, origen.

**Riesgos.**

- Bloquear capacidad sin visibilidad.
- Confundir cliente de reserva con cliente fiscal.

**Reglas sagradas.**

- Una reserva no es una mesa.

### Sentar reserva

**Que inicia el evento.**
El cliente llega y el usuario marca la reserva como sentada/check-in.

**Dominios implicados.**
Reservas, Mesas, TPV, CRM, Analitica.

**Evento principal.**
`Reserva sentada`.

**Que produce.**

- Cambia estado de reserva.
- Puede abrir mesa y venta mediante flujo explicito.
- Vincula visita real al cliente.

**Que NO produce.**

- No cobra.
- No envia comanda.
- No crea factura.

**Snapshots creados.**

- Reserva, mesa asignada, hora real de llegada, pax real si aplica.

**Riesgos.**

- Sentar sin mesa disponible.
- Abrir mesa duplicada.

**Reglas sagradas.**

- Sentar reserva debe transicionar de planificacion a operacion real.

### Cancelar reserva

**Que inicia el evento.**
El usuario o cliente cancela una reserva.

**Dominios implicados.**
Reservas, CRM, Mesas, Pagos si habia deposito, Analitica.

**Evento principal.**
`Reserva cancelada`.

**Que produce.**

- Libera disponibilidad planificada.
- Registra motivo/canal si existe.
- Puede activar flujo de devolucion de deposito.

**Que NO produce.**

- No cierra mesa.
- No cancela venta activa salvo flujo separado.
- No devuelve dinero automaticamente sin evento de pago.

**Snapshots creados.**

- Estado anterior, motivo, hora, usuario/canal.

**Riesgos.**

- Cancelar una reserva ya sentada sin resolver mesa/venta.

**Reglas sagradas.**

- Cancelar reserva no equivale a cerrar servicio.

### No Show

**Que inicia el evento.**
El usuario marca que el cliente no se presento.

**Dominios implicados.**
Reservas, CRM, Mesas, Pagos si habia deposito, Analitica.

**Evento principal.**
`Reserva marcada como no show`.

**Que produce.**

- Cambia estado de reserva.
- Libera disponibilidad planificada.
- Actualiza historial CRM.

**Que NO produce.**

- No abre mesa.
- No crea venta.
- No cobra penalizacion sin evento de pago/regla explicita.

**Snapshots creados.**

- Reserva, hora limite, usuario, politica aplicada si existe.

**Riesgos.**

- Penalizar sin regla clara.

**Reglas sagradas.**

- No show debe ser trazable y reversible solo con permiso.

### Registrar recepcion

**Que inicia el evento.**
El usuario registra que mercancia ha llegado fisicamente.

**Dominios implicados.**
Compras, Inventario, Proveedores, Facturacion proveedor, Analitica.

**Evento principal.**
`Recepcion registrada`.

**Que produce.**

- Registra cantidades recibidas.
- Puede generar movimientos de entrada de inventario tras validacion.
- Permite comparar pedido, recepcion y factura.

**Que NO produce.**

- No es una factura.
- No paga al proveedor.
- No cambia proveedor maestro salvo flujo separado.

**Snapshots creados.**

- Producto, cantidad recibida, coste validado si aplica, proveedor, fecha, usuario.

**Riesgos.**

- Meter stock sin validacion.
- Confundir recepcion con factura.

**Reglas sagradas.**

- Inventario nunca debe cambiar sin movimiento trazable.
- Una factura no es una recepcion.

### Crear pedido de compra

**Que inicia el evento.**
El usuario crea una solicitud o pedido a proveedor.

**Dominios implicados.**
Compras, Proveedores, Inventario, Analitica.

**Evento principal.**
`Pedido de compra creado`.

**Que produce.**

- Registra intencion de compra.
- Define productos, cantidades, proveedor y condiciones esperadas.

**Que NO produce.**

- No crea stock.
- No registra factura.
- No paga proveedor.

**Snapshots creados.**

- Lineas pedidas, proveedor, coste esperado, fecha y usuario.

**Riesgos.**

- Tratar pedido como recepcion.

**Reglas sagradas.**

- Pedido, recepcion y factura son eventos distintos.

### Recibir mercancia

**Que inicia el evento.**
El usuario confirma recepcion fisica contra pedido, albaran o entrada directa.

**Dominios implicados.**
Compras, Inventario, Proveedores, Analitica.

**Evento principal.**
`Mercancia recibida`.

**Que produce.**

- Confirma entrada fisica.
- Genera o prepara movimientos de inventario.
- Registra diferencias con lo pedido.

**Que NO produce.**

- No valida automaticamente factura.
- No paga proveedor.
- No actualiza costes historicos de ventas pasadas.

**Snapshots creados.**

- Cantidades recibidas, incidencias, lote/caducidad si aplica, coste de entrada.

**Riesgos.**

- Aceptar cantidades incorrectas.
- Sobrescribir coste pasado.

**Reglas sagradas.**

- Lo recibido debe reflejar lo que llego fisicamente.

### Registrar factura proveedor

**Que inicia el evento.**
El usuario sube, importa o registra una factura de proveedor.

**Dominios implicados.**
Facturacion proveedor, Compras, Proveedores, Inventario, Analitica, IA/OCR.

**Evento principal.**
`Factura de proveedor registrada`.

**Que produce.**

- Crea documento fiscal/contable recibido.
- Permite conciliacion con pedido y recepcion.
- Puede proponer costes a validar.

**Que NO produce.**

- No crea stock.
- No confirma recepcion.
- No modifica costes automaticamente por OCR.
- No paga al proveedor por si sola.

**Snapshots creados.**

- Proveedor snapshot, lineas, impuestos, totales, fecha, documento original.

**Riesgos.**

- Que OCR se convierta en verdad sin validacion.
- Cambiar inventario sin recepcion.

**Reglas sagradas.**

- OCR/IA nunca es fuente de verdad sin validacion humana.
- Una factura no es una recepcion.

### Actualizar receta

**Que inicia el evento.**
El usuario modifica ingredientes, cantidades, rendimiento o version de una receta.

**Dominios implicados.**
Escandallos / Food Cost, Inventario, TPV, Comanda, Analitica.

**Evento principal.**
`Receta actualizada`.

**Que produce.**

- Crea nueva version o actualiza version vigente.
- Cambia calculo teorico futuro.
- Puede afectar costes futuros y recomendaciones.

**Que NO produce.**

- No cambia ventas pasadas.
- No cambia comandas ya enviadas.
- No modifica stock fisico.
- No cambia facturas emitidas.

**Snapshots creados.**

- Version anterior, version nueva, ingredientes, cantidades, coste teorico, usuario.

**Riesgos.**

- Recalcular historicos con receta actual.
- Consumir stock con receta no vigente en el momento.

**Reglas sagradas.**

- Una receta modificada hoy no cambia ventas pasadas.

### Actualizar coste

**Que inicia el evento.**
El usuario valida o actualiza coste de producto/ingrediente/proveedor.

**Dominios implicados.**
Inventario, Compras, Proveedores, Escandallos, Analitica.

**Evento principal.**
`Coste actualizado`.

**Que produce.**

- Cambia coste de referencia o coste futuro.
- Puede recalcular coste teorico vigente.

**Que NO produce.**

- No cambia coste historico de una venta.
- No cambia factura emitida.
- No crea movimiento de stock salvo ajuste especifico.

**Snapshots creados.**

- Coste anterior, coste nuevo, fuente, fecha y usuario.

**Riesgos.**

- Sobrescribir coste de linea historica.

**Reglas sagradas.**

- El coste historico debe poder leerse como era en su momento.

### Crear cliente

**Que inicia el evento.**
El usuario crea un perfil de cliente o el sistema propone uno tras reserva/venta validada.

**Dominios implicados.**
CRM, Reservas, TPV, Facturacion, Analitica.

**Evento principal.**
`Cliente creado`.

**Que produce.**

- Crea perfil hostelero.
- Permite asociar preferencias, reservas y visitas.

**Que NO produce.**

- No crea cliente fiscal historico.
- No emite factura.
- No cobra.
- No crea reserva por si solo.

**Snapshots creados.**

- Datos iniciales, consentimiento, origen.

**Riesgos.**

- Mezclar cliente CRM con cliente fiscal.
- Crear perfiles duplicados.

**Reglas sagradas.**

- Cliente fiscal y cliente hostelero no son lo mismo.

### Crear factura

**Que inicia el evento.**
El usuario solicita emitir factura/ticket desde una venta cerrada o lista para facturar.

**Dominios implicados.**
Facturacion, TPV, Pagos, CRM, Analitica.

**Evento principal.**
`Factura creada`.

**Que produce.**

- Emite documento fiscal.
- Congela cliente fiscal, lineas, impuestos, totales y fecha.
- Vincula venta y pagos segun corresponda.

**Que NO produce.**

- No cobra si no hay evento de pago.
- No modifica stock.
- No cambia recetas.
- No modifica datos CRM actuales por si sola.

**Snapshots creados.**

- Cliente fiscal, lineas, precios, impuestos, descuentos, totales, numeracion.

**Riesgos.**

- Recalcular factura con datos actuales.
- Usar cliente CRM mutable como cliente fiscal historico.

**Reglas sagradas.**

- Una factura emitida no se recalcula.

### Cerrar venta

**Que inicia el evento.**
El usuario finaliza una venta cuando no quedan operaciones pendientes.

**Dominios implicados.**
TPV, Pagos, Mesas, Facturacion, Analitica, Inventario si hay consumo.

**Evento principal.**
`Venta cerrada`.

**Que produce.**

- Congela resumen comercial.
- Deja la venta fuera del flujo activo.
- Puede habilitar cierre de mesa.

**Que NO produce.**

- No inventa pagos faltantes.
- No borra comandas.
- No recalcula factura emitida.

**Snapshots creados.**

- Lineas finales, precios, descuentos, pagos asociados, usuario y momento.

**Riesgos.**

- Cerrar con saldo pendiente.
- Cerrar antes de resolver comandas.

**Reglas sagradas.**

- Una venta cerrada debe poder auditarse.

### Registrar merma

**Que inicia el evento.**
El usuario registra perdida, rotura, caducidad o desperdicio.

**Dominios implicados.**
Inventario, Analitica, Escandallos si se analiza coste.

**Evento principal.**
`Merma registrada`.

**Que produce.**

- Crea movimiento de salida no vendida.
- Registra motivo y coste.

**Que NO produce.**

- No crea venta.
- No crea factura.
- No modifica receta.

**Snapshots creados.**

- Producto, cantidad, coste, motivo, usuario y fecha.

**Riesgos.**

- Usar merma para corregir stock sin trazabilidad real.

**Reglas sagradas.**

- Todo cambio de stock debe tener movimiento trazable.

### Registrar ajuste de inventario

**Que inicia el evento.**
El usuario corrige inventario por conteo, error o regularizacion autorizada.

**Dominios implicados.**
Inventario, Analitica.

**Evento principal.**
`Ajuste de inventario registrado`.

**Que produce.**

- Crea movimiento de ajuste positivo o negativo.
- Explica diferencia entre stock esperado y contado.

**Que NO produce.**

- No modifica ventas pasadas.
- No modifica facturas proveedor.
- No borra movimientos anteriores.

**Snapshots creados.**

- Stock anterior, stock contado, diferencia, motivo, usuario.

**Riesgos.**

- Ocultar errores recurrentes.

**Reglas sagradas.**

- Ajustar no es borrar historia.

---

## 3. Eventos criticos

### Enviar comanda

Es critico porque convierte una intencion comercial en trabajo real para cocina/barra.

Si falla, el cliente no recibe lo pedido, cocina trabaja con informacion parcial o se preparan productos duplicados.

Debe ser:

- trazable;
- idempotente;
- visible para KDS;
- fiel a cantidades, modificadores y notas;
- separado del cobro.

### Cobrar mesa

Es critico porque afecta dinero real.

Si falla, Hostly puede duplicar cobros, dejar deudas invisibles, liberar mesas incorrectamente o generar cierres descuadrados.

Debe ser:

- idempotente;
- conciliable;
- vinculado a venta y mesa;
- claro sobre pagado y pendiente;
- separado de factura y cierre cuando corresponda.

### Cerrar mesa

Es critico porque libera un recurso operativo y declara terminado un servicio.

Si falla, una mesa puede parecer libre con deuda, con comandas pendientes o con venta incompleta.

Debe verificar:

- ocupacion;
- venta asociada;
- pagos pendientes;
- trabajo pendiente relevante;
- cierre fiscal/comercial si aplica.

### Recepcion mercancia

Es critico porque puede afectar stock y coste.

Si falla, inventario queda mal, food cost se distorsiona y compras pierde trazabilidad.

Debe diferenciar:

- pedido;
- recepcion fisica;
- factura proveedor;
- movimiento de inventario.

### Actualizar receta

Es critico porque afecta coste teorico, consumo futuro y analitica de margen.

Si falla, Hostly puede recalcular ventas pasadas con recetas actuales o consumir stock de forma incorrecta.

Debe conservar:

- version anterior;
- version nueva;
- vigencia;
- coste teorico aplicable.

### Crear factura

Es critico porque crea un documento fiscal.

Si falla, Hostly puede incumplir numeracion, impuestos, cliente fiscal o historico legal.

Debe congelar:

- cliente fiscal;
- lineas;
- precios;
- impuestos;
- descuentos;
- totales;
- fecha y numeracion.

---

## 4. Eventos prohibidos

Estos eventos nunca deberian existir como efecto directo o silencioso:

- Una factura creando stock.
- Una reserva cerrando una mesa.
- Una reserva abriendo una mesa sin check-in o accion explicita.
- Un OCR modificando costes automaticamente.
- Un OCR validando una factura proveedor sin revision humana.
- Un KDS modificando una comanda.
- Un KDS cobrando o cerrando mesa.
- Una impresion siendo fuente de verdad.
- Un ticket impreso cambiando una venta.
- Un estado visual del Editor V2 cambiando ocupacion real.
- Una metrica de analitica corrigiendo ventas, pagos o stock.
- Una actualizacion de receta recalculando ventas pasadas.
- Un cambio de proveedor actual modificando facturas historicas.
- Un descuento borrando consumo real.
- Una cancelacion borrando historico operativo.
- Un pago parcial liberando mesa con saldo pendiente.
- Una factura emitida recalculandose con datos actuales.
- Una recepcion de mercancia creando factura proveedor automaticamente.

---

## 5. Impacto entre dominios

### Editor V2

**Eventos que recibe.**

- Restaurante creado.
- Espacio creado.
- Mesa creada.
- Mesa actualizada.

**Eventos que produce.**

- Espacio creado.
- Configuracion visual actualizada.
- Mesa visual preparada/publicada, cuando exista flujo explicito.

**Eventos que nunca deberia producir.**

- Mesa abierta.
- Comanda enviada.
- Pago registrado.
- Factura creada.
- Movimiento de inventario.

### Mesas

**Eventos que recibe.**

- Mesa creada.
- Mesa actualizada.
- Reserva sentada.
- Servicio cambiado de mesa.
- Mesas unidas.
- Mesas separadas.
- Venta cerrada.

**Eventos que produce.**

- Mesa abierta.
- Mesa cerrada.
- Ocupacion actualizada.
- Mesa liberada.

**Eventos que nunca deberia producir.**

- Pago registrado.
- Factura creada.
- Comanda enviada.
- Stock ajustado.

### Reservas

**Eventos que recibe.**

- Cliente creado.
- Mesa actualizada.
- Pago de deposito registrado, si existe.

**Eventos que produce.**

- Reserva creada.
- Reserva sentada.
- Reserva cancelada.
- Reserva marcada como no show.

**Eventos que nunca deberia producir.**

- Mesa cerrada.
- Venta cerrada.
- Factura creada.
- Comanda enviada.

### TPV

**Eventos que recibe.**

- Mesa abierta.
- Producto actualizado en carta si aplica.
- Cliente asociado.
- Pago registrado.

**Eventos que produce.**

- Linea de venta creada.
- Cantidad de linea modificada.
- Modificador aplicado.
- Nota anadida.
- Descuento aplicado.
- Vale aplicado.
- Venta cerrada.
- Solicitud de comanda.
- Solicitud de cobro.
- Solicitud de factura.

**Eventos que nunca deberia producir.**

- Movimiento de stock directo sin inventario.
- Factura emitida sin dominio de facturacion.
- Pago confirmado sin dominio de pagos.
- Receta actualizada.

### Comanda

**Eventos que recibe.**

- Linea de venta creada.
- Modificador aplicado.
- Nota anadida.
- Linea cancelada.
- Marchar primeros/segundos/postres.

**Eventos que produce.**

- Comanda enviada.
- Comanda modificada.
- Pase marchado.
- Linea de comanda cancelada.

**Eventos que nunca deberia producir.**

- Pago registrado.
- Mesa cerrada.
- Factura creada.
- Stock ajustado sin inventario.

### KDS

**Eventos que recibe.**

- Comanda enviada.
- Comanda modificada.
- Pase marchado.
- Linea cancelada.

**Eventos que produce.**

- Preparacion iniciada.
- Item preparado.
- Comanda lista.
- Retraso detectado.

**Eventos que nunca deberia producir.**

- Comanda de venta modificada como fuente primaria.
- Pago registrado.
- Mesa cerrada.
- Factura creada.
- Movimiento de inventario.

### Pagos

**Eventos que recibe.**

- Cobro iniciado.
- Pago parcial solicitado.
- Vale aplicado.
- Devolucion solicitada.

**Eventos que produce.**

- Pago registrado.
- Pago fallido.
- Pago devuelto.
- Saldo pendiente actualizado.

**Eventos que nunca deberia producir.**

- Linea de venta creada.
- Comanda enviada.
- Mesa abierta.
- Stock actualizado.

### Inventario

**Eventos que recibe.**

- Mercancia recibida.
- Recepcion registrada.
- Merma registrada.
- Ajuste de inventario registrado.
- Consumo por venta/comanda si existe politica definida.
- Coste actualizado.

**Eventos que produce.**

- Movimiento de inventario creado.
- Stock actualizado.
- Coste de entrada registrado.
- Alerta de stock.

**Eventos que nunca deberia producir.**

- Factura proveedor creada.
- Venta cerrada.
- Pago registrado.
- Receta actualizada como maestro.

### Compras

**Eventos que recibe.**

- Alerta de stock.
- Proveedor actualizado.
- Factura proveedor registrada.

**Eventos que produce.**

- Pedido de compra creado.
- Recepcion registrada.
- Mercancia recibida.
- Diferencia de recepcion detectada.

**Eventos que nunca deberia producir.**

- Pago cliente registrado.
- Mesa cerrada.
- Comanda enviada.
- Factura fiscal de venta creada.

### Proveedores

**Eventos que recibe.**

- Pedido de compra creado.
- Factura proveedor registrada.
- Recepcion registrada.

**Eventos que produce.**

- Proveedor creado.
- Proveedor actualizado.
- Condiciones proveedor actualizadas.

**Eventos que nunca deberia producir.**

- Stock actualizado.
- Factura historica modificada.
- Venta cerrada.

### Escandallos / Food Cost

**Eventos que recibe.**

- Coste actualizado.
- Producto vendido.
- Inventario actualizado.

**Eventos que produce.**

- Receta actualizada.
- Coste teorico actualizado.
- Margen teorico recalculado para futuro.

**Eventos que nunca deberia producir.**

- Venta historica modificada.
- Stock fisico actualizado.
- Factura creada.
- Pago registrado.

### CRM / Clientes

**Eventos que recibe.**

- Reserva creada.
- Reserva sentada.
- Venta cerrada.
- Factura creada.
- No show.

**Eventos que produce.**

- Cliente creado.
- Cliente actualizado.
- Preferencia registrada.
- Consentimiento actualizado.

**Eventos que nunca deberia producir.**

- Cliente fiscal historico modificado.
- Pago registrado.
- Mesa cerrada.
- Comanda enviada.

### Facturacion

**Eventos que recibe.**

- Solicitud de factura.
- Venta cerrada.
- Pago registrado.
- Cliente fiscal confirmado.
- Factura proveedor registrada.

**Eventos que produce.**

- Factura creada.
- Ticket creado.
- Factura anulada/rectificada si aplica.
- Documento fiscal congelado.

**Eventos que nunca deberia producir.**

- Stock actualizado.
- Recepcion de mercancia.
- Pago confirmado.
- Comanda enviada.

### Analitica

**Eventos que recibe.**

- Todos los eventos funcionales relevantes, como lectura derivada.

**Eventos que produce.**

- Metrica actualizada.
- Alerta de rendimiento.
- Insight operativo.
- Informe generado.

**Eventos que nunca deberia producir.**

- Pago registrado.
- Stock corregido.
- Mesa cerrada.
- Factura creada.
- Comanda modificada.

---

## 6. Principios

- Los eventos deben ser explicables.
- Los efectos secundarios deben ser visibles.
- Cada evento tiene un responsable.
- Todo evento importante deja trazabilidad.
- No existen acciones silenciosas.
- Un evento de negocio no es un detalle tecnico.
- Un evento no debe escribir datos de un dominio ajeno sin contrato.
- Los eventos criticos deben ser idempotentes cuando impliquen dinero, stock o envio de trabajo.
- Un evento puede producir consecuencias en otros dominios, pero esas consecuencias deben ser explicitas.
- La impresion, la UI y la analitica no son fuentes de verdad operativa.
- La IA/OCR puede proponer eventos, pero no confirmarlos en datos criticos sin validacion humana.
- Todo evento importante debe preservar `restaurantId`.
- Todo evento que afecte historico debe crear o conservar snapshots suficientes.

---

## 7. Uso del documento

Antes de implementar cualquier nueva funcionalidad debe comprobarse:

- si crea un evento nuevo;
- si modifica uno existente;
- si rompe el flujo de otro dominio;
- que dominio inicia el evento;
- que dominio es responsable de confirmarlo;
- que consecuencias produce;
- que consecuencias no debe producir;
- que snapshots conserva;
- que reglas sagradas aplica.

Checklist de decision:

1. Nombrar el evento en lenguaje de negocio.
2. Identificar que accion humana o automatizada lo inicia.
3. Identificar dominio responsable.
4. Identificar dominios afectados.
5. Definir consecuencias visibles.
6. Definir consecuencias prohibidas.
7. Definir snapshots.
8. Validar contra `HOSTLY_DOMAIN_MAP.md`.

Si una accion no puede explicar que evento genera y que dominio responde por sus consecuencias, todavia no esta lista para implementarse.

---

## Impacto sobre otros dominios

Este documento afecta a:

âœ” TPV
âœ” Comanda
âœ” Mesas
âœ” KDS
âœ” Pagos
âœ” Inventario
âœ” Compras
âœ” Reservas
âœ” CRM
âœ” Facturacion
âœ” Analitica

No afecta directamente a:

âœ˜ Editor V2
âœ˜ Sistema visual
âœ˜ Design System
