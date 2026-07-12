# HOSTLY_SOURCE_OF_TRUTH

> Mapa maestro de fuentes de verdad de Hostly. Define cual es la verdad oficial de cada dato importante y que representaciones nunca deben sustituirla.

**Estado:** referencia funcional
**Ambito:** ownership de datos, snapshots, proyecciones, vistas, caches y derivados
**Principio rector:** cada dato importante tiene una unica fuente oficial

**Relacion documental:** complementa `docs/01_HOSTLY_ARCHITECTURE_GUIDE.md` y `HOSTLY_DOMAIN_MAP.md`. No redefine colecciones Firestore por si solo; precisa que dato manda en cada dominio y que representaciones son derivadas.

---

## 1. Filosofia

Cada dato importante de Hostly debe tener una unica fuente de verdad.

Las demas representaciones pueden ser utiles, rapidas o necesarias para operar, pero no mandan sobre el dato. Son:

- snapshots;
- proyecciones;
- vistas;
- caches;
- derivados.

Nunca deben convertirse en verdad.

Una vista puede mostrar que una mesa parece ocupada, pero la verdad de ocupacion vive en Mesas.
Un ticket puede mostrar el precio cobrado, pero ese precio queda congelado como snapshot historico.
Una metrica puede decir que el margen bajo, pero Analitica no corrige ventas, costes ni stock.
Un OCR puede proponer datos de una factura, pero no confirma datos criticos sin validacion humana.

La pregunta obligatoria es:

**Cual es la verdad oficial de este dato?**

Si la respuesta no es clara, la funcionalidad no debe implementarse todavia.

---

## 2. Tabla general

| Dato | Fuente oficial | Que NO es fuente de verdad | Dominio responsable | Riesgo principal |
| --- | --- | --- | --- | --- |
| `restaurantId` | Configuracion/tenant del restaurante | UI, ruta no validada, cache local | Plataforma / Tenant | Mezclar datos entre restaurantes |
| Layout editable del restaurante | Documento V2 / borrador del Editor V2 | Captura visual, screenshot, mesa operativa | Editor V2 | Confundir plano con operacion |
| Espacio visual | Editor V2 / configuracion espacial | Estado de mesa, venta, reserva | Editor V2 | Usar espacio como verdad operativa |
| Mesa operativa | Registro operativo de Mesas | Dibujo en el plano, texto visual, analitica | Mesas | Doble mesa visual/operativa |
| Ocupacion de mesa | Estado operativo de Mesas | Color en UI, KDS, reserva futura, venta historica | Mesas | Mesa libre con servicio activo |
| Venta activa | TPV | Mesa, ticket impreso, analitica | TPV | Duplicar venta o perder lineas |
| Linea de venta | TPV | Comanda, KDS, ticket impreso | TPV | Cobrar algo distinto a lo vendido |
| Producto enviado a cocina | Comanda emitida | Linea de TPV no enviada, impresion, KDS filtrado | Comanda | Cocina prepara algo no confirmado |
| Trabajo pendiente | KDS derivado de comandas | Impresion, color de UI, memoria del personal | KDS | Ocultar trabajo real |
| Pago | Registro de pagos/transacciones | Ticket, factura, boton de cobro, banco sin conciliacion | Pagos | Mentir sobre dinero |
| Importe pendiente | TPV + Pagos reconciliados | Vista de mesa, calculo de UI no persistido | TPV / Pagos | Cerrar con deuda |
| Stock | Ledger de movimientos de inventario | Factura, pedido de compra, OCR, numero editado | Inventario | Stock sin trazabilidad |
| Movimiento de stock | Ledger de inventario | Cambio manual de cantidad agregada | Inventario | No poder auditar origen |
| Pedido de compra | Registro de Compras | Recepcion, factura proveedor, stock | Compras | Tratar intencion como mercancia recibida |
| Recepcion de mercancia | Recepcion validada | Factura proveedor, pedido, OCR | Recepciones / Compras | Crear stock sin llegada fisica |
| Factura proveedor | Documento proveedor registrado y validado | Recepcion, stock, OCR sin validar | Facturacion proveedor / Compras | Hacer que factura cree stock |
| Proveedor maestro | Maestro de Proveedores | Snapshot en factura, texto OCR | Proveedores | Cambiar historicos con datos actuales |
| Proveedor en factura | Snapshot de factura proveedor | Proveedor maestro actual | Facturacion / Compras | Perder verdad historica |
| Receta vigente | Escandallo/version vigente | Venta historica, comanda pasada, analitica | Escandallos | Cambiar futuro y pasado a la vez |
| Receta usada en venta | Snapshot/version de venta | Receta actual | TPV / Escandallos | Recalcular ventas pasadas |
| Coste teorico actual | Escandallo + coste vigente | Coste historico de linea | Escandallos | Margen actual aplicado al pasado |
| Coste de venta historico | Snapshot de venta/linea | Coste actual, proveedor actual | TPV / Analitica historica | Reescribir margen pasado |
| Cliente hostelero | CRM | Cliente fiscal de factura, nombre en ticket | CRM | Mezclar relacion con dato legal |
| Cliente fiscal | Snapshot de factura | CRM actual, reserva, contacto editable | Facturacion | Factura cambia al editar cliente |
| Reserva | Sistema de Reservas | Mesa, venta, nota CRM | Reservas | Reserva tratada como ocupacion |
| Estado no show/cancelacion | Reservas | Mesa, TPV, comentario manual | Reservas | Penalizar sin trazabilidad |
| Ticket | Documento emitido/snapshot de venta | Pantalla de TPV, impresora, analitica | Facturacion / TPV | Recalcular ticket |
| Factura emitida | Documento fiscal inmutable | Pago, venta editable, CRM actual | Facturacion | Documento legal mutable |
| Descuento aplicado | TPV y snapshot fiscal si emitido | Nota, analitica, promocion visual | TPV / Facturacion | Ocultar margen real |
| Impuestos aplicados | Snapshot fiscal al emitir | Configuracion fiscal actual | Facturacion | Recalcular historico |
| Metrica | Analitica derivada de eventos/snapshots | Dato operativo primario | Analitica | Usar informe como verdad |
| Prediccion IA | Propuesta no confirmada | Confirmacion humana, documento fiscal | IA / Dominio receptor | Automatizar decisiones criticas |
| Impresion | Salida fisica de un documento/evento | Venta, pago, comanda, factura | Dominio origen | Creer que imprimir confirma verdad |

---

## 3. Fuentes de verdad por dominio

### Editor V2

**Que datos son verdad.**

- Documento V2 editable.
- Espacios visuales.
- Geometria, posiciones, capas y elementos del plano.
- Representacion visual de mesas, zonas, suelos, elementos fijos y ambiente.
- Estado de borrador hasta publicacion.

**Que datos son derivados.**

- Contexto operativo mostrado sobre el plano.
- Lecturas de ocupacion, reservas o ventas si se muestran como overlay.
- Resumen visual de configuracion.

**Que snapshots genera.**

- Versiones/borradores del plano.
- Configuracion visual publicada, si existe flujo explicito.

**Que nunca debe modificar.**

- Ocupacion real de mesa.
- Venta activa.
- Comanda.
- Pago.
- Stock.
- Factura.
- Reserva como entidad operativa.

**Relacion con legacy.**

- `Documento V2` manda sobre geometria editable, capas visuales, espacios y representacion de mapa en modo edicion.
- `floorPlans`, `tables` y `zones` mantienen compatibilidad operativa legacy y son consumidos por TPV cuando corresponda.
- `legacyFloorPlanId`, `legacyTableId` y `legacyZoneId` son puentes de publicacion/sincronizacion, no nuevas fuentes de verdad.
- El Publisher traduce desde Documento V2 hacia entidades operativas o visuales publicadas; no debe inventar ocupacion, pagos, comandas ni reservas.
- El renderer readonly compartido puede representar visualmente el Documento V2 en modo operacion, pero el estado operativo sigue perteneciendo a los dominios TPV/Mesas/Comanda/Pagos.

### Mesas

**Que datos son verdad.**

- Mesa operativa.
- Estado de ocupacion.
- Capacidad operativa.
- Relacion con servicio/venta activa.
- Union, separacion o cambio de mesa durante el servicio.

**Que datos son derivados.**

- Color o icono de mesa.
- Posicion visual en Editor V2.
- Indicadores de cuenta pendiente.
- Indicadores de cocina pendiente.

**Que snapshots genera.**

- Mesa y estado en apertura/cierre de servicio.
- Mesa origen/destino en cambios.
- Mesas unidas o separadas.

**Que nunca debe modificar.**

- Lineas de venta.
- Pagos.
- Facturas.
- Stock.
- Recetas.
- Comandas como fuente primaria.

### Reservas

**Que datos son verdad.**

- Reserva.
- Fecha, hora, pax, estado y origen.
- Cliente asociado a la reserva.
- Asignacion planificada de mesa si existe.
- Cancelacion, no show o check-in.

**Que datos son derivados.**

- Disponibilidad sugerida.
- Riesgo de no show.
- Ocupacion prevista.
- Preferencias inferidas.

**Que snapshots genera.**

- Datos de reserva al crear, cancelar, sentar o marcar no show.
- Cliente y preferencias en el momento de la reserva.

**Que nunca debe modificar.**

- Ocupacion real sin evento de sentar/abrir mesa.
- Venta TPV.
- Comanda.
- Pago, salvo deposito mediante dominio Pagos.
- Factura.
- Stock.

### TPV

**Que datos son verdad.**

- Venta activa.
- Lineas de venta.
- Cantidades, precios, descuentos y modificadores comerciales.
- Canal, camarero, mesa vinculada y estado comercial.
- Saldo esperado antes de reconciliar pagos.

**Que datos son derivados.**

- Estado visual de mesa.
- Resumen de cuenta.
- Margen estimado.
- Consumo teorico.

**Que snapshots genera.**

- Lineas vendidas.
- Precio cobrado.
- Descuentos aplicados.
- Producto, impuestos y receta/version aplicable en el momento.
- Resumen de venta cerrada.

**Que nunca debe modificar.**

- Pago confirmado.
- Documento fiscal emitido.
- Stock agregado sin movimiento.
- Receta maestra.
- Proveedor.

### Comanda

**Que datos son verdad.**

- Items enviados a preparacion.
- Cantidades, modificadores y notas operativas.
- Estado de envio/modificacion/cancelacion de comanda.
- Pase o marcha cuando aplica.

**Que datos son derivados.**

- Vista KDS filtrada.
- Impresion de cocina.
- Resumen en TPV.
- Tiempo estimado.

**Que snapshots genera.**

- Contenido enviado.
- Cambios de comanda.
- Cancelaciones o modificaciones despues de envio.

**Que nunca debe modificar.**

- Pago.
- Factura.
- Ocupacion de mesa.
- Stock fisico directamente.
- Receta maestra.

### KDS

**Que datos son verdad.**

- Estado de preparacion en estaciones.
- Trabajo pendiente, iniciado, listo o entregado segun flujo.
- Tiempos de preparacion.

**Que datos son derivados.**

- Cola visible filtrada.
- Alertas de retraso.
- Agrupaciones por estacion.
- Indicadores de carga.

**Que snapshots genera.**

- Inicio de preparacion.
- Item preparado.
- Comanda lista.
- Tiempos por estacion.

**Que nunca debe modificar.**

- Comanda original como fuente primaria.
- Venta.
- Pago.
- Factura.
- Stock.
- Mesa.

### Pagos

**Que datos son verdad.**

- Pago registrado.
- Metodo, importe, estado y referencia.
- Pago parcial.
- Devolucion.
- Conciliacion.
- Saldo pagado desde la perspectiva de dinero real.

**Que datos son derivados.**

- Estado visual de cuenta.
- Boton de cobro completado.
- Resumen financiero en analitica.
- Ticket impreso.

**Que snapshots genera.**

- Importe cobrado.
- Metodo.
- Referencia externa.
- Fecha, usuario, venta asociada.
- Devoluciones o anulaciones.

**Que nunca debe modificar.**

- Lineas de venta.
- Comanda.
- Stock.
- Receta.
- Mesa directamente sin flujo de cierre.
- Factura emitida.

### Inventario

**Que datos son verdad.**

- Ledger de movimientos.
- Stock calculado desde movimientos.
- Mermas.
- Ajustes.
- Entradas por recepcion validada.
- Salidas por consumo o ajuste.

**Que datos son derivados.**

- Stock mostrado en dashboard.
- Alertas de minimo.
- Coste medio calculado.
- Necesidades de compra.

**Que snapshots genera.**

- Movimiento de entrada/salida.
- Coste de entrada.
- Stock anterior/posterior cuando aplique.
- Motivo y usuario del ajuste.

**Que nunca debe modificar.**

- Factura proveedor.
- Pedido de compra.
- Venta historica.
- Receta maestra.
- Pago.

### Compras

**Que datos son verdad.**

- Pedido de compra.
- Intencion de compra.
- Cantidades pedidas.
- Proveedor seleccionado.
- Condiciones esperadas.

**Que datos son derivados.**

- Necesidad sugerida por inventario.
- Comparativa pedido/recepcion/factura.
- Estado de cumplimiento.

**Que snapshots genera.**

- Pedido emitido.
- Cambios de pedido.
- Diferencias esperadas frente a recepcion.

**Que nunca debe modificar.**

- Stock sin recepcion/movimiento.
- Factura proveedor como documento fiscal.
- Proveedor historico en factura.
- Venta.
- Pago cliente.

### Recepciones

**Que datos son verdad.**

- Mercancia recibida fisicamente.
- Cantidades recibidas.
- Incidencias de recepcion.
- Coste validado de entrada si aplica.
- Relacion con pedido o proveedor.

**Que datos son derivados.**

- Estado de pedido completado.
- Diferencia frente a factura.
- Entrada pendiente de inventario si no esta validada.

**Que snapshots genera.**

- Producto recibido.
- Cantidad, lote/caducidad si aplica.
- Proveedor snapshot operativo.
- Fecha, usuario e incidencias.

**Que nunca debe modificar.**

- Factura proveedor como documento.
- Pago proveedor.
- Venta.
- Receta.
- Cliente.

### Proveedores

**Que datos son verdad.**

- Proveedor maestro.
- Datos comerciales y contacto.
- Condiciones actuales.
- Catalogo proveedor si existe.

**Que datos son derivados.**

- Proveedor mostrado en factura historica.
- Ranking de proveedor.
- Estadisticas de entrega.

**Que snapshots genera.**

- Proveedor en pedido.
- Proveedor en factura.
- Condiciones vigentes al comprar, si aplica.

**Que nunca debe modificar.**

- Stock.
- Factura historica.
- Recepcion ya registrada.
- Coste historico de venta.
- Pago.

### Escandallos

**Que datos son verdad.**

- Receta vigente.
- Versiones de receta.
- Ingredientes, cantidades y rendimiento.
- Coste teorico vigente.
- Food cost esperado.

**Que datos son derivados.**

- Margen estimado.
- Consumo teorico.
- Recomendacion de precio.
- Comparativa coste actual/historico.

**Que snapshots genera.**

- Version de receta usada en venta.
- Coste teorico aplicado.
- Ingredientes y rendimiento en el momento.

**Que nunca debe modificar.**

- Venta historica.
- Stock fisico.
- Factura.
- Pago.
- Comanda ya enviada.

### CRM

**Que datos son verdad.**

- Cliente hostelero.
- Preferencias.
- Consentimiento.
- Historial relacional.
- Etiquetas y notas comerciales.

**Que datos son derivados.**

- Segmentos.
- Riesgo de no show.
- Valor estimado del cliente.
- Recomendaciones de comunicacion.

**Que snapshots genera.**

- Cliente asociado a reserva.
- Datos usados antes de emitir factura, si se copian a cliente fiscal.
- Preferencias relevantes en una visita.

**Que nunca debe modificar.**

- Cliente fiscal historico.
- Factura emitida.
- Pago.
- Stock.
- Mesa.
- Comanda.

### Facturacion

**Que datos son verdad.**

- Ticket emitido.
- Factura emitida.
- Numeracion fiscal.
- Cliente fiscal congelado.
- Lineas fiscales, impuestos, descuentos y totales.
- Rectificacion/anulacion si aplica.

**Que datos son derivados.**

- Vista de factura.
- PDF/impresion.
- Resumen contable.
- Estado de cobro si viene de Pagos.

**Que snapshots genera.**

- Ticket.
- Factura.
- Cliente fiscal.
- Precio cobrado.
- Impuestos.
- Descuentos.
- Lineas y totales.

**Que nunca debe modificar.**

- Pago confirmado.
- Stock.
- Recepcion de mercancia.
- Receta.
- Cliente CRM actual.
- Venta activa salvo mediante flujo fiscal definido.

### Analitica

**Que datos son verdad.**

- Metricas derivadas calculadas.
- Informes generados.
- Agregados historicos cuando se calculan desde eventos/snapshots correctos.

**Que datos son derivados.**

- Todo dato operativo que muestra: ventas, pagos, ocupacion, stock, margen, reservas y tiempos.

**Que snapshots genera.**

- Cortes analiticos.
- Informes de periodo.
- KPIs historicos si se congelan para comparacion.

**Que nunca debe modificar.**

- Venta.
- Pago.
- Factura.
- Stock.
- Comanda.
- Mesa.
- Reserva.
- Receta.
- Cliente.

---

## 4. Snapshots

Un snapshot congela como era un dato en el momento de un hecho operativo, economico o legal.

Los snapshots nunca deben recalcular pasado con datos actuales.

Deben congelarse:

- **Ticket:** lineas, cantidades, precios, descuentos, impuestos, totales, fecha y venta origen.
- **Factura:** numeracion, cliente fiscal, lineas, impuestos, descuentos, totales y fecha de emision.
- **Coste de venta:** coste teorico o coste aplicado a la linea en el momento de la venta.
- **Precio cobrado:** importe real cobrado por linea, total, metodo y momento.
- **Cliente fiscal:** nombre/razon social, identificador fiscal, direccion fiscal y datos legales usados al emitir.
- **Proveedor factura:** proveedor tal como aparece o se valida en la factura recibida.
- **Receta utilizada:** version, ingredientes o coste resoluble usado para la venta/comanda.
- **Descuentos:** descuento aplicado, motivo, usuario y base original.
- **Impuestos:** impuestos aplicados en el momento, no la configuracion fiscal actual.

Regla central:

**Si el dato afecta dinero, impuestos, margen, stock historico, responsabilidad legal o auditoria operativa, debe quedar congelado.**

---

## 5. Casos peligrosos

### Mesa libre con pedido activo

Indica que Mesas y TPV no estan alineados. La mesa visualmente libre no puede mandar sobre una venta activa.

Fuente a revisar:

- Mesas para ocupacion.
- TPV para venta activa.
- Comanda/KDS para trabajo pendiente.

### Pedido sin produccion

Una linea en TPV no siempre es comanda enviada. Si cocina debe prepararlo, la verdad de trabajo pendiente empieza en Comanda/KDS.

Fuente a revisar:

- TPV para linea de venta.
- Comanda para envio.
- KDS para preparacion.

### Factura distinta del pago

Factura y pago no son el mismo dato. La factura congela documento fiscal; Pagos manda sobre dinero real.

Fuente a revisar:

- Facturacion para documento.
- Pagos para cobro.
- TPV para venta origen.

### Stock negativo sin movimiento

El stock no debe cambiar sin ledger. Un numero negativo solo es explicable si hay movimientos que lo generan.

Fuente a revisar:

- Inventario para movimientos.
- Compras/Recepciones para entradas.
- TPV/Comanda/Escandallos para consumos si aplica.

### Reserva sin cliente

Puede ser valida si se permite reserva anonima o rapida, pero no debe convertirse en cliente CRM falso.

Fuente a revisar:

- Reservas para la reserva.
- CRM solo si hay cliente identificado o creado.

### Cliente fiscal distinto del ticket

El cliente fiscal del documento emitido manda historicamente, aunque CRM se edite despues.

Fuente a revisar:

- Facturacion para cliente fiscal snapshot.
- CRM para cliente hostelero actual.

### OCR modificando datos automaticamente

OCR puede extraer o sugerir, pero no confirmar costes, stock, proveedor, factura o recepcion sin validacion humana.

Fuente a revisar:

- Dominio responsable del dato validado.
- Registro de validacion humana.

### Vista de analitica corrigiendo operacion

Una metrica puede detectar inconsistencia, pero no corrige la fuente.

Fuente a revisar:

- Dominio propietario del dato original.
- Evento correctivo explicito.

### Impresion tomada como verdad

Imprimir no confirma venta, pago, comanda ni factura. La impresion es salida de un dato, no su fuente.

Fuente a revisar:

- Dominio que origino el documento o evento.

---

## 6. Reglas sagradas

- La actividad manda sobre estados visuales.
- Los snapshots nunca cambian.
- Las vistas nunca son fuente de verdad.
- La IA nunca confirma datos criticos.
- La impresion nunca es la verdad.
- Los estados derivados nunca sustituyen al dato original.
- Un cache puede acelerar, pero no decidir.
- Analitica interpreta, no corrige.
- Una factura no crea stock.
- Una recepcion no emite factura.
- Una reserva no ocupa mesa sin evento de sentar/abrir.
- Una mesa visual no abre servicio.
- Una comanda enviada no cobra.
- Un pago confirmado no se borra; se compensa o devuelve.
- Una receta actualizada no cambia ventas pasadas.
- Un proveedor maestro actualizado no cambia facturas historicas.
- Todo dato operativo debe preservar `restaurantId`.

---

## 7. Checklist para futuros desarrolladores

Antes de crear una funcionalidad, preguntar:

- Que dato estoy modificando?
- Quien es dueno?
- Existe ya una fuente de verdad?
- Estoy creando una segunda fuente?
- Estoy modificando un snapshot?
- Estoy usando una vista como verdad?
- Estoy confundiendo estado visual con estado operativo?
- Estoy dejando trazabilidad?
- Que dominio debe confirmar este cambio?
- Que dominios solo deben consultarlo?
- Hay datos historicos que deban congelarse?
- La IA/OCR propone o esta confirmando?
- Que pasa si el evento se reintenta?
- El cambio conserva `restaurantId`?

Si una respuesta no esta clara, detener la implementacion y revisar:

- `HOSTLY_DOMAIN_MAP.md`
- `HOSTLY_EVENT_MAP.md`
- este documento

---

## Impacto sobre otros dominios

Este documento afecta a toda la plataforma.

## Dominios que consumen estas reglas

Estos dominios deben consultar activamente este documento antes de crear, modificar o validar funcionalidades:

- TPV.
- Comanda.
- Mesas.
- KDS.
- Pagos.
- Inventario.
- Compras.
- Recepciones.
- Proveedores.
- Escandallos.
- Reservas.
- CRM.
- Facturacion.
- Analitica.

## Dominios que las respetan como limite

Estos dominios deben respetar las reglas para no convertirse en fuentes de verdad indebidas:

- Editor V2.
- Sistema visual.
- Design System.
- IA/OCR.
- Impresion.
- Dashboards.
- Caches.
- Proyecciones.
- Informes.

## Regla final

Cada nueva pantalla, flujo, automatizacion o integracion debe declarar si lee una fuente oficial, crea un snapshot, muestra una vista, actualiza un cache o calcula un derivado.

Si no puede declararlo, no debe escribir datos.
