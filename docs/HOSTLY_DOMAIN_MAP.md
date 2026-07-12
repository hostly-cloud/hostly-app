# HOSTLY_DOMAIN_MAP

> Mapa funcional de dominios de Hostly para definir propiedad de datos, fuentes de verdad y lÃ­mites entre responsabilidades.

**Estado:** referencia funcional
**Ãmbito:** dominios de negocio, ownership de datos, snapshots histÃ³ricos y reglas transversales
**Principio rector:** cada dato importante debe tener un Ãºnico dominio propietario

**Relacion documental:** complementa `docs/01_HOSTLY_ARCHITECTURE_GUIDE.md`. Este mapa define ownership funcional; la guia de arquitectura sigue gobernando estructura tecnica, Firebase/Firestore y patrones de implementacion.

---

## 1. Principio general

Hostly debe crecer con una Ãºnica fuente de verdad por responsabilidad.

Un dominio puede consultar datos de otros dominios para operar, mostrar contexto, validar una acciÃ³n o generar una vista compuesta. Eso no lo convierte en propietario de esos datos.

La pregunta obligatoria antes de implementar una funcionalidad nueva es:

**Â¿QuiÃ©n manda sobre este dato?**

Si dos dominios pueden modificar directamente el mismo dato crÃ­tico, Hostly queda expuesto a inconsistencias operativas: mesas que parecen libres cuando estÃ¡n ocupadas, pagos que no cuadran, comandas incompletas, stock sin trazabilidad o histÃ³ricos recalculados con datos actuales.

Reglas base:

- Un dominio posee los datos que debe mantener correctos.
- Un dominio no debe escribir directamente datos cuya verdad pertenece a otro dominio.
- Las vistas compuestas no son fuente de verdad.
- Los estados visuales ayudan a operar, pero no sustituyen estados operativos.
- Los datos histÃ³ricos crÃ­ticos deben congelarse como snapshot.
- La IA/OCR puede proponer, pero no debe confirmar datos crÃ­ticos sin validaciÃ³n humana.
- Todo dato operativo debe mantener `restaurantId` como frontera de tenant.

---

## 2. Tabla resumen de dominios

| Dominio | QuÃ© representa | Fuente de verdad | Datos que posee | Datos que NO posee | Dominios relacionados | Riesgo principal |
| --- | --- | --- | --- | --- | --- | --- |
| Editor V2 | DiseÃ±o operativo del restaurante: espacios, zonas, mesas visuales, elementos fijos y contexto de sala | Documento V2 / borrador canÃ³nico del editor hasta publicaciÃ³n | Layout, geometrÃ­a, capas visuales, elementos del plano, configuraciÃ³n espacial editable | OcupaciÃ³n real, reservas, comandas, pagos, stock, ventas | Mesas, Reservas, TPV, AnalÃ­tica | Confundir representaciÃ³n visual con verdad operativa |
| Mesas | Unidades operativas de servicio en sala | Estado operativo de mesas publicado para el restaurante | Mesa, capacidad, estado, ocupaciÃ³n, asignaciÃ³n operativa, relaciÃ³n con sesiÃ³n/servicio | Comandas completas, pagos, reservas como entidad, diseÃ±o detallado del editor | Editor V2, Reservas, TPV, Comanda, KDS | Mentir sobre disponibilidad u ocupaciÃ³n |
| Reservas | Compromisos futuros de ocupaciÃ³n con clientes | Sistema de reservas | Reserva, fecha/hora, pax, estado, preferencias, vÃ­nculo opcional a mesa | Estado actual de mesa, comanda, pago, cliente fiscal | Mesas, CRM, TPV, AnalÃ­tica | Convertir una reserva en ocupaciÃ³n real sin transiciÃ³n explÃ­cita |
| TPV | Punto de venta y orquestaciÃ³n del servicio comercial | SesiÃ³n/venta activa del TPV | Venta activa, lÃ­neas de venta, descuentos operativos, canal, camarero, mesa vinculada | PreparaciÃ³n real de cocina, liquidaciÃ³n bancaria, stock directo, receta maestra | Mesas, Comanda, Pagos, Inventario, CRM, AnalÃ­tica | Duplicar verdad entre venta, comanda y pago |
| Comanda | Lo que debe prepararse y servirse | Comanda emitida desde TPV o flujo autorizado | Ãtems a preparar, cantidades, modificadores, notas, estado de preparaciÃ³n/envÃ­o | Cobro, disponibilidad de mesa, stock fÃ­sico, receta maestra | TPV, KDS, Inventario, Mesas | Que cocina prepare algo distinto a lo vendido/solicitado |
| KDS | Trabajo pendiente y progreso de cocina/barra | Comandas recibidas y estados KDS | Cola de preparaciÃ³n, prioridad, estaciÃ³n, tiempos, estado de elaboraciÃ³n | Venta, pago, stock, mesa, receta | Comanda, TPV, Inventario, AnalÃ­tica | Ocultar trabajo pendiente o marcarlo incorrectamente |
| Pagos | Movimiento real de dinero y liquidaciÃ³n | Registro de pagos/transacciones | Pago, mÃ©todo, importe, estado, referencia, propina, devoluciÃ³n, conciliaciÃ³n | LÃ­neas de venta como catÃ¡logo, comanda, ocupaciÃ³n de mesa, factura fiscal completa | TPV, FacturaciÃ³n, AnalÃ­tica, CRM | Mentir sobre dinero cobrado o pendiente |
| Inventario | Existencias y movimientos fÃ­sicos/econÃ³micos de stock | Ledger de movimientos de inventario | Stock, movimientos, ajustes, consumos, mermas, lotes si aplica | Facturas como documento fiscal, proveedor maestro, receta maestra | Compras, Proveedores, Escandallos, TPV, Comanda | Cambios de stock sin movimiento trazable |
| Compras | Ciclo de compra y recepciÃ³n de mercancÃ­a | Pedidos, recepciones y validaciones de compra | Pedido de compra, recepciÃ³n, cantidades recibidas, incidencias, coste validado | Stock final sin movimiento, proveedor maestro, factura fiscal como verdad contable | Proveedores, Inventario, FacturaciÃ³n, Escandallos | Hacer que una factura cree stock sin recepciÃ³n validada |
| Proveedores | Entidades proveedoras y condiciones comerciales | Maestro de proveedores | Proveedor, datos comerciales, contactos, condiciones, catÃ¡logo proveedor | Stock, facturas como histÃ³rico fiscal, recepciones | Compras, Inventario, FacturaciÃ³n | Mezclar proveedor actual con proveedor histÃ³rico de una factura |
| Escandallos / Food Cost | Recetas, composiciÃ³n y coste teÃ³rico | Maestro de recetas/escandallos versionados | Receta, ingredientes, rendimiento, coste teÃ³rico, versiÃ³n vigente | Ventas histÃ³ricas, stock fÃ­sico, precio cobrado histÃ³rico | Inventario, TPV, Comanda, AnalÃ­tica | Recalcular ventas pasadas con recetas actuales |
| CRM / Clientes | RelaciÃ³n hostelera con clientes y hÃ¡bitos | Maestro CRM de clientes | Cliente hostelero, preferencias, historial relacional, consentimiento, etiquetas | Cliente fiscal congelado, pagos, reservas como entidad, facturas | Reservas, TPV, FacturaciÃ³n, AnalÃ­tica | Mezclar cliente fiscal con cliente hostelero |
| FacturaciÃ³n | Documentos fiscales y legales | Factura/ticket emitido e inmutable | Ticket, factura, datos fiscales snapshot, impuestos, numeraciÃ³n, totales | Pago bancario como liquidaciÃ³n, recepciÃ³n de mercancÃ­a, cliente CRM editable | TPV, Pagos, CRM, Compras, Proveedores | Recalcular documentos fiscales con datos actuales |
| AnalÃ­tica | Lectura agregada y diagnÃ³stico del negocio | Eventos/snapshots derivados de dominios propietarios | MÃ©tricas, agregados, indicadores, vistas histÃ³ricas derivadas | Verdad operativa primaria, pagos, stock, comandas, facturas | Todos | Convertir mÃ©tricas derivadas en fuente de verdad |

---

## 3. Dominios

### Editor V2

**QuÃ© representa.**
El Editor V2 representa el diseÃ±o operativo del restaurante: espacios, suelos, zonas, elementos fijos, ambiente, mesas visuales y puntos de servicio. Su objetivo es que el restaurante sea reconocible, editable y Ãºtil para operar.

**Fuente de verdad.**
Documento V2 / borrador canÃ³nico del editor, hasta que exista un proceso explÃ­cito de publicaciÃ³n hacia los dominios operativos.

**Responsabilidades.**

- Mantener el plano editable del restaurante.
- Definir geometrÃ­a, capas, posiciones y atributos visuales.
- Preparar layout para mesas, zonas y elementos de servicio.
- Preservar separaciÃ³n entre representaciÃ³n y operaciÃ³n real.
- Permitir publicar o sincronizar hacia dominios operativos solo mediante contratos explÃ­citos.

**QuÃ© NO debe hacer.**

- No decidir ocupaciÃ³n real de mesas.
- No crear comandas.
- No registrar pagos.
- No modificar stock.
- No convertirse en fuente de verdad de reservas.

**QuÃ© puede consultar.**

- Mesas publicadas para mostrar contexto.
- Reservas para capas futuras de planificaciÃ³n.
- AnalÃ­tica para diagnÃ³stico de uso espacial.
- TPV para entender flujos operativos, si existe integraciÃ³n explÃ­cita.

**QuÃ© no debe modificar directamente.**

- Estados operativos de mesas.
- Ventas activas del TPV.
- Comandas.
- Pagos.
- Inventario.
- Facturas.

**Reglas sagradas.**

- El plano no es la operaciÃ³n.
- Un objeto visual no equivale automÃ¡ticamente a una entidad operativa.
- Documento V2 no debe romper compatibilidad por cambios visuales.
- Las capas visuales ayudan a entender, no mandan sobre dinero, stock o preparaciÃ³n.

### Mesas

**QuÃ© representa.**
Mesas representa las unidades operativas sobre las que se organiza el servicio: disponibilidad, ocupaciÃ³n, capacidad, sesiÃ³n y estado en sala.

**Fuente de verdad.**
Estado operativo de mesas publicado para el restaurante.

**Responsabilidades.**

- Mantener disponibilidad y ocupaciÃ³n real.
- Vincular una mesa a una sesiÃ³n, venta o servicio activo cuando corresponda.
- Exponer capacidad, nombre/nÃºmero y estado operativo.
- Coordinar transiciones como libre, ocupada, reservada, bloqueada o cerrada.

**QuÃ© NO debe hacer.**

- No poseer la comanda completa.
- No registrar cobros.
- No recalcular ventas.
- No almacenar diseÃ±o detallado del Editor V2.
- No convertir reservas futuras en ocupaciÃ³n sin acciÃ³n explÃ­cita.

**QuÃ© puede consultar.**

- Editor V2 para posiciÃ³n/contexto visual publicado.
- Reservas para anticipar disponibilidad.
- TPV para sesiones activas.
- Comanda para indicadores resumidos.

**QuÃ© no debe modificar directamente.**

- LÃ­neas de venta del TPV.
- Estado de preparaciÃ³n KDS.
- Pagos.
- Inventario.
- Facturas.

**Reglas sagradas.**

- Una mesa nunca debe mentir sobre ocupaciÃ³n.
- Una reserva no es una mesa.
- Una mesa visual no basta para declarar una mesa operativa.
- La liberaciÃ³n de mesa debe respetar venta/comanda/pago pendientes.

### Reservas

**QuÃ© representa.**
Reservas representa compromisos futuros o planificados con clientes: fecha, hora, nÃºmero de personas, estado, preferencias y posible asignaciÃ³n de mesa.

**Fuente de verdad.**
Sistema de reservas.

**Responsabilidades.**

- Mantener reservas y sus estados.
- Gestionar pax, fecha/hora, duraciÃ³n estimada y notas.
- Vincular clientes CRM cuando aplique.
- Sugerir o bloquear mesas segÃºn disponibilidad planificada.

**QuÃ© NO debe hacer.**

- No ocupar una mesa en tiempo real sin check-in o transiciÃ³n explÃ­cita.
- No crear ventas automÃ¡ticamente.
- No registrar pagos salvo depÃ³sitos mediante flujo de pagos autorizado.
- No sustituir el CRM.

**QuÃ© puede consultar.**

- Mesas para disponibilidad y capacidad.
- CRM para cliente, preferencias y contacto.
- TPV para saber si una reserva ya se convirtiÃ³ en servicio.
- AnalÃ­tica para no-shows, ocupaciÃ³n y demanda.

**QuÃ© no debe modificar directamente.**

- Estado de pago.
- Stock.
- Comandas.
- Facturas.
- Recetas.

**Reglas sagradas.**

- Una reserva no es una mesa.
- Una reserva no es una venta.
- El cliente de reserva no siempre es cliente fiscal.
- La asignaciÃ³n de mesa debe ser reversible hasta que la operaciÃ³n la confirme.

### TPV

**QuÃ© representa.**
TPV representa la operaciÃ³n comercial en tiempo real: venta activa, lÃ­neas, cantidades, descuentos, camarero, canal, mesa asociada y cierre operativo.

**Fuente de verdad.**
SesiÃ³n/venta activa del TPV.

**Responsabilidades.**

- Crear y mantener ventas activas.
- AÃ±adir, editar o cancelar lÃ­neas segÃºn permisos.
- Coordinar emisiÃ³n de comandas.
- Solicitar pagos.
- Generar tickets/facturas mediante el dominio de FacturaciÃ³n.
- Emitir eventos para inventario y analÃ­tica mediante flujos definidos.

**QuÃ© NO debe hacer.**

- No marcar trabajo KDS como preparado directamente.
- No modificar stock fÃ­sico sin movimiento.
- No alterar proveedor, receta o factura histÃ³rica.
- No usar estados visuales de mesa como verdad Ãºnica.

**QuÃ© puede consultar.**

- Mesas para contexto operativo.
- CRM para cliente hostelero.
- Escandallos para coste teÃ³rico vigente.
- Inventario para disponibilidad orientativa.
- Pagos para estado de cobro.

**QuÃ© no debe modificar directamente.**

- Ledger de inventario.
- Maestro de proveedores.
- Recetas histÃ³ricas.
- Transacciones de pago confirmadas.
- Documentos fiscales emitidos.

**Reglas sagradas.**

- TPV no debe duplicar pagos.
- TPV no debe inventar stock.
- TPV no debe reescribir documentos fiscales.
- Una venta cerrada debe conservar los snapshots crÃ­ticos de precio, impuestos, receta/coste aplicado y cliente fiscal si existe.

### Comanda

**QuÃ© representa.**
Comanda representa lo que debe prepararse y servirse, separado del cobro y de la ocupaciÃ³n de mesa.

**Fuente de verdad.**
Comanda emitida desde TPV o flujo autorizado.

**Responsabilidades.**

- Registrar platos/bebidas a preparar.
- Conservar cantidades, modificadores, notas y destino.
- Comunicar trabajo a KDS.
- Mantener estado de envÃ­o, cancelaciÃ³n o modificaciÃ³n.

**QuÃ© NO debe hacer.**

- No cobrar.
- No decidir ocupaciÃ³n de mesa.
- No modificar stock directamente.
- No editar recetas maestras.

**QuÃ© puede consultar.**

- TPV para venta/lÃ­nea origen.
- KDS para estado de preparaciÃ³n.
- Inventario para disponibilidad informativa.
- Escandallos para receta usada si aplica.

**QuÃ© no debe modificar directamente.**

- Pagos.
- Facturas.
- Stock fÃ­sico.
- Cliente CRM.
- Mesas, salvo seÃ±ales de resumen mediante contrato.

**Reglas sagradas.**

- Una comanda nunca debe mentir sobre lo que hay que preparar.
- Cocina debe ver exactamente el trabajo pendiente autorizado.
- Una modificaciÃ³n de comanda debe ser trazable.
- Cancelar una lÃ­nea no debe borrar el histÃ³rico operativo sin registro.

### KDS

**QuÃ© representa.**
KDS representa la cola de trabajo de cocina, barra, coctelerÃ­a u otras estaciones de preparaciÃ³n.

**Fuente de verdad.**
Comandas recibidas y estados KDS por estaciÃ³n.

**Responsabilidades.**

- Mostrar trabajo pendiente.
- Priorizar, agrupar y marcar progreso.
- Registrar tiempos de aceptaciÃ³n, preparaciÃ³n y finalizaciÃ³n.
- Separar estaciones y responsabilidades.

**QuÃ© NO debe hacer.**

- No crear ventas.
- No cobrar.
- No modificar recetas.
- No cambiar stock directamente.
- No decidir ocupaciÃ³n de mesa.

**QuÃ© puede consultar.**

- Comanda para Ã­tems y notas.
- TPV para contexto de mesa/canal.
- Inventario para alertas de disponibilidad, si estÃ¡n validadas.
- AnalÃ­tica para tiempos y cuellos de botella.

**QuÃ© no debe modificar directamente.**

- Pagos.
- Facturas.
- Stock.
- Mesas.
- CRM.

**Reglas sagradas.**

- KDS nunca debe mentir sobre trabajo pendiente.
- Marcar como preparado debe ser una acciÃ³n consciente y trazable.
- Una pantalla KDS filtrada no debe ocultar trabajo real sin indicarlo.
- El retraso operativo debe ser visible, no maquillado.

### Pagos

**QuÃ© representa.**
Pagos representa el dinero real: intentos, autorizaciones, capturas, efectivo, tarjeta, propinas, devoluciones y conciliaciÃ³n.

**Fuente de verdad.**
Registro de pagos/transacciones.

**Responsabilidades.**

- Registrar importe, mÃ©todo, estado y referencia.
- Mantener idempotencia para evitar cobros duplicados.
- Gestionar pagos parciales, devoluciones y cancelaciones.
- Informar al TPV del estado de cobro.

**QuÃ© NO debe hacer.**

- No modificar lÃ­neas de venta.
- No crear comandas.
- No liberar mesas por sÃ­ solo sin cierre operativo.
- No editar facturas emitidas.

**QuÃ© puede consultar.**

- TPV para importe esperado y venta asociada.
- FacturaciÃ³n para documento emitido o pendiente.
- CRM para medios guardados o cliente asociado si aplica.
- AnalÃ­tica para conciliaciÃ³n e informes.

**QuÃ© no debe modificar directamente.**

- Comandas.
- Inventario.
- Mesas.
- Recetas.
- Proveedores.

**Reglas sagradas.**

- Un pago nunca debe mentir sobre dinero.
- Un pago confirmado no se borra: se compensa o devuelve.
- La idempotencia es obligatoria.
- El importe cobrado histÃ³rico debe conservarse aunque cambien precios actuales.

### Inventario

**QuÃ© representa.**
Inventario representa existencias, movimientos, consumos, mermas, ajustes y valoraciÃ³n de stock.

**Fuente de verdad.**
Ledger de movimientos de inventario.

**Responsabilidades.**

- Mantener stock calculable a partir de movimientos.
- Registrar entradas por recepciÃ³n validada.
- Registrar salidas por consumo, merma, ajuste o venta si aplica.
- Mantener trazabilidad de costes por movimiento.

**QuÃ© NO debe hacer.**

- No tratar una factura como recepciÃ³n automÃ¡tica.
- No modificar proveedores maestros.
- No editar recetas.
- No alterar ventas pasadas.

**QuÃ© puede consultar.**

- Compras para recepciones.
- Proveedores para contexto.
- Escandallos para consumos teÃ³ricos.
- TPV/Comanda para ventas que disparan consumo.

**QuÃ© no debe modificar directamente.**

- Facturas fiscales.
- Pedidos de compra.
- Recetas maestras.
- Ventas TPV.
- Pagos.

**Reglas sagradas.**

- Inventario nunca debe cambiar sin movimiento trazable.
- Un ajuste no es una correcciÃ³n invisible.
- Una recepciÃ³n validada crea movimiento; una factura por sÃ­ sola no.
- El coste histÃ³rico de una lÃ­nea debe conservarse.

### Compras

**QuÃ© representa.**
Compras representa planificaciÃ³n, pedido, recepciÃ³n y validaciÃ³n de mercancÃ­a.

**Fuente de verdad.**
Pedidos, recepciones y validaciones de compra.

**Responsabilidades.**

- Crear pedidos de compra.
- Registrar recepciones reales.
- Comparar pedido, albarÃ¡n/factura y recepciÃ³n.
- Validar cantidades y costes antes de afectar inventario.

**QuÃ© NO debe hacer.**

- No modificar stock sin emitir movimiento de inventario.
- No convertir OCR en verdad sin revisiÃ³n.
- No sustituir proveedor maestro.
- No generar ventas.

**QuÃ© puede consultar.**

- Proveedores para condiciones.
- Inventario para necesidades y stock actual.
- Escandallos para previsiÃ³n.
- FacturaciÃ³n para facturas de proveedor, si aplica.

**QuÃ© no debe modificar directamente.**

- Stock agregado sin movimiento.
- Pagos de clientes.
- TPV.
- KDS.
- CRM.

**Reglas sagradas.**

- Una factura no es una recepciÃ³n.
- Una recepciÃ³n debe reflejar lo que llegÃ³ fÃ­sicamente.
- Las diferencias deben quedar visibles.
- OCR/IA puede ayudar a capturar datos, no validarlos como verdad final.

### Proveedores

**QuÃ© representa.**
Proveedores representa empresas o personas que suministran productos, servicios o mercancÃ­as al restaurante.

**Fuente de verdad.**
Maestro de proveedores.

**Responsabilidades.**

- Mantener datos comerciales y de contacto.
- Mantener condiciones, referencias y catÃ¡logos proveedor si aplica.
- Servir de contexto a compras, facturas y recepciÃ³n.

**QuÃ© NO debe hacer.**

- No modificar stock.
- No validar facturas.
- No confirmar recepciones.
- No reescribir proveedor histÃ³rico de una factura.

**QuÃ© puede consultar.**

- Compras para historial comercial.
- Inventario para productos vinculados.
- FacturaciÃ³n para documentos asociados.
- AnalÃ­tica para rendimiento proveedor.

**QuÃ© no debe modificar directamente.**

- Movimientos de inventario.
- Facturas emitidas o recibidas histÃ³ricas.
- Pedidos ya cerrados.
- Costes histÃ³ricos congelados.

**Reglas sagradas.**

- El proveedor actual no debe cambiar el proveedor snapshot de documentos pasados.
- El proveedor maestro no es una factura.
- Las condiciones comerciales actuales no deben recalcular costes histÃ³ricos.

### Escandallos / Food Cost

**QuÃ© representa.**
Escandallos / Food Cost representa recetas, composiciÃ³n de productos, rendimiento, coste teÃ³rico y mÃ¡rgenes.

**Fuente de verdad.**
Maestro de recetas/escandallos versionados.

**Responsabilidades.**

- Definir ingredientes, cantidades, rendimiento y coste teÃ³rico.
- Mantener versiones o snapshots para uso histÃ³rico.
- Dar contexto a TPV, inventario y analÃ­tica.
- Calcular food cost esperado.

**QuÃ© NO debe hacer.**

- No modificar stock fÃ­sico.
- No alterar ventas pasadas.
- No cambiar precio cobrado histÃ³rico.
- No sustituir comanda.

**QuÃ© puede consultar.**

- Inventario para costes actuales.
- Proveedores para costes de referencia.
- TPV para ventas y mÃ¡rgenes.
- Comanda para consumo operativo si aplica.

**QuÃ© no debe modificar directamente.**

- Ventas cerradas.
- Movimientos de inventario.
- Facturas.
- Pagos.
- KDS.

**Reglas sagradas.**

- Una receta modificada hoy no cambia ventas pasadas.
- La receta usada en una venta debe conservarse como snapshot o versiÃ³n resoluble.
- El coste teÃ³rico no es stock real.
- Food Cost informa; no debe inventar movimientos.

### CRM / Clientes

**QuÃ© representa.**
CRM / Clientes representa la relaciÃ³n hostelera con personas: preferencias, visitas, reservas, hÃ¡bitos, consentimiento y comunicaciÃ³n.

**Fuente de verdad.**
Maestro CRM de clientes.

**Responsabilidades.**

- Mantener perfil hostelero del cliente.
- Guardar preferencias y etiquetas operativas.
- Relacionar reservas, visitas y consumo cuando corresponda.
- Respetar consentimiento y privacidad.

**QuÃ© NO debe hacer.**

- No sustituir cliente fiscal congelado.
- No registrar pagos.
- No crear reservas sin flujo de reservas.
- No modificar facturas emitidas.

**QuÃ© puede consultar.**

- Reservas para historial.
- TPV para consumo asociado.
- FacturaciÃ³n para documentos vinculados, sin reescribirlos.
- AnalÃ­tica para segmentaciÃ³n.

**QuÃ© no debe modificar directamente.**

- Facturas histÃ³ricas.
- Pagos.
- Stock.
- Comandas.
- Mesas.

**Reglas sagradas.**

- Cliente fiscal y cliente hostelero no son lo mismo.
- Cambiar datos CRM no cambia facturas emitidas.
- La privacidad y el consentimiento son parte del dato.
- Un cliente puede existir sin factura y una factura puede tener datos fiscales sin perfil CRM.

### FacturaciÃ³n

**QuÃ© representa.**
FacturaciÃ³n representa documentos fiscales y legales: tickets, facturas, numeraciÃ³n, impuestos, datos fiscales y totales emitidos.

**Fuente de verdad.**
Factura/ticket emitido e inmutable.

**Responsabilidades.**

- Emitir tickets y facturas.
- Congelar datos fiscales, lÃ­neas, impuestos, precios y totales.
- Mantener numeraciÃ³n y estado legal.
- Relacionar pagos y ventas sin sustituirlos.

**QuÃ© NO debe hacer.**

- No modificar stock.
- No confirmar recepciÃ³n de mercancÃ­a.
- No decidir ocupaciÃ³n de mesa.
- No reabrir una venta sin flujo autorizado.

**QuÃ© puede consultar.**

- TPV para venta cerrada.
- Pagos para estado de cobro.
- CRM para datos cliente antes de emitir.
- Proveedores/Compras para facturas de proveedor si el alcance lo requiere.

**QuÃ© no debe modificar directamente.**

- Pagos confirmados.
- Stock.
- Comandas.
- Reservas.
- Recetas actuales.

**Reglas sagradas.**

- Una factura emitida no se recalcula con datos actuales.
- El cliente fiscal debe quedar congelado.
- El precio cobrado y los impuestos aplicados deben conservarse.
- Una factura no es una recepciÃ³n.

### AnalÃ­tica

**QuÃ© representa.**
AnalÃ­tica representa lectura, agregaciÃ³n y diagnÃ³stico: ventas, mÃ¡rgenes, tiempos, ocupaciÃ³n, compras, rotaciÃ³n, food cost y comportamiento.

**Fuente de verdad.**
Eventos y snapshots derivados de dominios propietarios.

**Responsabilidades.**

- Agregar datos sin convertirse en dueÃ±o de la operaciÃ³n.
- Mantener mÃ©tricas reproducibles.
- Separar datos actuales de snapshots histÃ³ricos.
- Ayudar a tomar decisiones de gestiÃ³n.

**QuÃ© NO debe hacer.**

- No corregir ventas.
- No modificar pagos.
- No ajustar stock.
- No cambiar recetas.
- No editar mesas o reservas.

**QuÃ© puede consultar.**

- Todos los dominios, respetando permisos, `restaurantId` y contratos de lectura.

**QuÃ© no debe modificar directamente.**

- Cualquier dato operativo primario.
- Documentos fiscales.
- Pagos.
- Movimientos de inventario.
- Comandas.

**Reglas sagradas.**

- Una mÃ©trica no es fuente de verdad operativa.
- Un agregado nunca debe reemplazar el evento original.
- Los histÃ³ricos deben calcularse con snapshots/versiones correctas.
- Recalcular histÃ³rico con datos actuales es una regresiÃ³n funcional.

---

## 4. Snapshots histÃ³ricos

Los snapshots histÃ³ricos existen para impedir que datos pasados cambien cuando cambia la configuraciÃ³n actual del restaurante.

Deben congelarse histÃ³ricamente:

- **Factura:** lÃ­neas, impuestos, totales, numeraciÃ³n, datos fiscales y fecha de emisiÃ³n.
- **Ticket:** productos, cantidades, precios, impuestos, descuentos, mÃ©todo de emisiÃ³n y totales.
- **Venta:** precio cobrado, descuento aplicado, camarero/canal/mesa si aplica, productos vendidos y cierre.
- **Coste de lÃ­nea:** coste teÃ³rico o coste aplicado en el momento de la venta, con versiÃ³n o snapshot.
- **Proveedor en factura:** nombre, identificador fiscal, datos relevantes y condiciones reflejadas en el documento.
- **Cliente fiscal:** razÃ³n social/nombre, NIF/CIF, direcciÃ³n fiscal y datos legales usados al emitir.
- **Receta usada en venta:** versiÃ³n de receta, ingredientes o coste resoluble usado para margen histÃ³rico.
- **Precio cobrado:** importe real cobrado por lÃ­nea y total, independiente del precio actual de carta.

Regla prÃ¡ctica:

**Todo dato que afecte dinero, impuestos, margen, stock histÃ³rico o responsabilidad legal debe poder leerse en el futuro como era en el momento del hecho.**

---

## 5. Reglas transversales

- Una mesa nunca debe mentir sobre ocupaciÃ³n.
- Un pago nunca debe mentir sobre dinero.
- Una comanda nunca debe mentir sobre lo que hay que preparar.
- KDS nunca debe mentir sobre trabajo pendiente.
- Inventario nunca debe cambiar sin movimiento trazable.
- Una receta modificada hoy no cambia ventas pasadas.
- Una reserva no es una mesa.
- Una factura no es una recepciÃ³n.
- OCR/IA nunca es fuente de verdad sin validaciÃ³n humana.
- Un estado visual no es verdad operativa.
- Un agregado analÃ­tico no sustituye el evento original.
- Un documento fiscal emitido no se recalcula con datos actuales.
- `restaurantId` debe preservarse en toda lectura, escritura, snapshot y evento.
- Los procesos econÃ³micos deben ser idempotentes.
- Las transiciones crÃ­ticas deben dejar rastro.

---

## 6. QuÃ© NO hacer

Errores estratÃ©gicos que Hostly debe evitar:

- Duplicar fuentes de verdad.
- Permitir que dos dominios escriban el mismo dato crÃ­tico sin contrato.
- Mezclar cliente fiscal con cliente hostelero.
- Hacer que facturas creen stock.
- Tratar una reserva como ocupaciÃ³n real sin check-in o transiciÃ³n explÃ­cita.
- Permitir que IA confirme datos crÃ­ticos sin validaciÃ³n humana.
- Usar estados visuales como verdad operativa.
- Recalcular histÃ³rico con datos actuales.
- Convertir analÃ­tica en propietario de datos operativos.
- Cambiar ventas pasadas al modificar carta, recetas, proveedores o impuestos.
- Corregir stock editando nÃºmeros agregados sin movimiento.
- Hacer que KDS modifique pagos, mesas o stock.
- Hacer que TPV escriba directamente documentos fiscales ya emitidos.
- Hacer que Editor V2 decida estados reales de mesas por posiciÃ³n visual.
- Ocultar discrepancias entre pedido, recepciÃ³n y factura.

---

## 7. Uso del documento

Este documento debe revisarse antes de implementar cualquier funcionalidad nueva que toque datos operativos, econÃ³micos, fiscales, histÃ³ricos o multi-dominio.

Checklist antes de construir:

1. Identificar el dominio propietario.
2. Confirmar la fuente de verdad.
3. Definir quÃ© dominios solo consultan.
4. Definir quÃ© datos deben congelarse como snapshot.
5. Evitar escrituras directas sobre dominios ajenos.
6. Verificar impacto en `restaurantId`, permisos, historial y trazabilidad.
7. Documentar cualquier excepciÃ³n como decisiÃ³n consciente.

Si una funcionalidad no puede responder quiÃ©n manda sobre cada dato importante, todavÃ­a no estÃ¡ lista para implementarse.
