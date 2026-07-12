# HOSTLY_CONSOLIDATION_ROADMAP

> Roadmap tecnico-funcional de consolidacion de Hostly. Define que debe estabilizarse primero para reducir el mayor riesgo del producto.

**Estado:** documento maestro de evolucion
**Ambito:** consolidacion funcional, confianza operativa, reduccion de riesgo y orden de evolucion
**Regla central:** Hostly consolida confianza antes de ampliar ambicion

**Relacion documental:** complementa `docs/03_HOSTLY_ROADMAP.md`. No sustituye el roadmap general ni declara completadas las capacidades listadas; ordena que debe consolidarse antes de ampliar producto.

**Lectura correcta:** cada bloque describe riesgo y criterio de salida. Si una capacidad aparece en niveles superiores, debe tratarse como futuro hasta que el producto y la arquitectura la validen.

---

## Filosofia

Hostly no debe crecer por acumulacion de modulos.

Un restaurante no evalua el producto por la cantidad de secciones disponibles. Lo evalua por si puede confiar en el sistema durante un servicio real:

- si una mesa esta ocupada, debe verse ocupada;
- si una comanda se envia, cocina debe recibirla;
- si una mesa se cobra, el dinero debe cuadrar;
- si una mesa se cierra, no debe quedar deuda invisible;
- si hay varios restaurantes, ningun dato debe cruzar fronteras;
- si se guarda informacion critica, debe persistir correctamente.

Por eso el orden de evolucion de Hostly no debe responder a "que modulo toca ahora", sino a:

**que riesgo compromete mas la confianza del restaurante?**

Primero se consolida lo que puede romper la operacion.
Despues se consolida lo que mejora el trabajo diario.
Luego se construye diferenciacion.
Finalmente se escala.

Hostly nunca debe construir el siguiente nivel si el anterior todavia compromete la confianza del restaurante.

---

## Nivel 1 Â· Riesgo critico

### Objetivo

Garantizar que Hostly no falle en los momentos donde un error detiene, confunde o perjudica directamente la operacion del restaurante.

Este nivel protege la confianza basica:

- se puede vender;
- se puede preparar;
- se puede cobrar;
- se puede cerrar;
- se puede recuperar;
- cada restaurante ve solo sus datos.

### Por que esta en este nivel

Porque cualquier fallo aqui destruye la confianza en el producto.

Un restaurante puede esperar por una mejora visual o una automatizacion futura. No puede aceptar perder comandas, cobrar mal, cerrar mesas con deuda, mezclar datos entre restaurantes o perder estado operativo.

### Bloques a consolidar

#### Comanda

Debe consolidarse que lo enviado a cocina/barra sea exactamente lo que debe prepararse.

Riesgos que elimina:

- comandas perdidas;
- comandas duplicadas;
- modificadores no enviados;
- notas invisibles;
- cancelaciones sin aviso;
- cocina preparando algo distinto a lo pedido.

Terminado cuando:

- enviar comanda sea confiable e idempotente;
- cocina/barra reciban siempre el trabajo correcto;
- cambios y cancelaciones queden claros;
- el usuario sepa si algo fue enviado o no.

#### Pagos

Debe consolidarse que el dinero registrado represente dinero real.

Riesgos que elimina:

- cobros duplicados;
- pagos parciales mal calculados;
- importes pendientes invisibles;
- devoluciones sin trazabilidad;
- caja descuadrada;
- confusion entre factura, ticket y pago.

Terminado cuando:

- todo pago sea trazable;
- los reintentos no dupliquen cobros;
- el saldo pendiente sea explicable;
- caja pueda cerrarse con confianza.

#### Cierre de mesa

Debe consolidarse que una mesa solo se cierre cuando el servicio esta realmente resuelto.

Riesgos que elimina:

- mesa libre con cuenta abierta;
- mesa cerrada con pago pendiente;
- comanda pendiente oculta;
- venta incompleta;
- perdida de historico del servicio.

Terminado cuando:

- cerrar mesa valide dinero, venta y estado operativo;
- la mesa liberada sea confiable para sala;
- el cierre deje snapshot suficiente del servicio.

#### KDS

Debe consolidarse que cocina y barra vean trabajo pendiente real.

Riesgos que elimina:

- pedidos invisibles;
- trabajo filtrado sin indicacion;
- estados falsos de preparacion;
- retrasos ocultos;
- falta de coordinacion entre sala y cocina.

Terminado cuando:

- todo trabajo enviado aparezca donde corresponde;
- los estados sean claros;
- las estaciones no oculten trabajo por error;
- cocina pueda confiar en KDS como verdad de preparacion.

#### Estado de mesa

Debe consolidarse que la disponibilidad de mesa no mienta.

Riesgos que elimina:

- mesa libre estando ocupada;
- mesa ocupada sin venta;
- cambios de mesa que duplican ocupacion;
- union/separacion inconsistente;
- reservas confundidas con ocupacion real.

Terminado cuando:

- cada mesa tenga estado operativo claro;
- abrir, mover, unir, separar y cerrar sean consistentes;
- reservas y mesas mantengan fronteras claras.

#### Persistencia

Debe consolidarse que los datos criticos no se pierdan ni queden en estados imposibles.

Riesgos que elimina:

- ventas activas perdidas;
- estados que desaparecen al recargar;
- documentos incompletos;
- datos historicos recalculados;
- acciones criticas sin trazabilidad.

Terminado cuando:

- lo critico persista de forma predecible;
- los historicos no dependan de datos actuales;
- las recuperaciones no generen duplicados ni perdida operativa.

#### Multi-restaurante

Debe consolidarse que cada restaurante sea una frontera real.

Riesgos que elimina:

- datos cruzados entre restaurantes;
- usuarios viendo informacion ajena;
- operaciones sin `restaurantId`;
- analitica mezclada;
- configuracion compartida por error.

Terminado cuando:

- toda operacion critica preserve tenant;
- permisos y datos esten aislados;
- no existan flujos que dependan solo de filtros visuales.

---

## Nivel 2 Â· Riesgo operativo

### Objetivo

Consolidar dominios que no siempre detienen el servicio de forma inmediata, pero mejoran la operacion diaria, reducen friccion y conectan gestion con servicio.

### Por que esta en este nivel

Porque estos dominios amplian control y eficiencia, pero deben apoyarse sobre un nucleo ya confiable.

Reservas, inventario, escandallos o compras pierden valor si mesas, TPV, pagos, comandas y KDS todavia generan dudas.

### Bloques a consolidar

#### Editor V2

Debe consolidarse como representacion clara del restaurante, no como fuente de verdad operativa.

Riesgos que elimina:

- planos que confunden;
- mesas visuales no alineadas con mesas operativas;
- configuracion dificil de mantener;
- usuarios que no reconocen su restaurante;
- cambios visuales que afectan operacion sin contrato.

Terminado cuando:

- crear y ajustar espacios sea claro;
- mesas, zonas y elementos ayuden a operar;
- el editor no suplante estados reales;
- publicar cambios sea seguro y comprensible.

#### Reservas

Debe consolidarse la planificacion de demanda futura sin confundirla con ocupacion real.

Riesgos que elimina:

- reservas duplicadas;
- reservas que bloquean mal la sala;
- no shows sin trazabilidad;
- clientes mal identificados;
- sentar reservas sin transicion clara.

Terminado cuando:

- crear, modificar, cancelar y sentar reservas sea confiable;
- disponibilidad futura sea explicable;
- reserva, mesa y cliente mantengan fronteras claras.

#### Inventario

Debe consolidarse stock basado en movimientos trazables.

Riesgos que elimina:

- stock negativo sin explicacion;
- ajustes invisibles;
- consumos teoricos tratados como verdad fisica;
- entradas sin recepcion;
- informes de stock no confiables.

Terminado cuando:

- todo cambio de stock tenga movimiento;
- entradas, salidas, mermas y ajustes sean auditables;
- el restaurante pueda confiar en existencias criticas.

#### Escandallos

Debe consolidarse coste teorico y receta versionada.

Riesgos que elimina:

- ventas pasadas recalculadas con recetas actuales;
- margenes falsos;
- ingredientes sin trazabilidad;
- cambios de coste sin version;
- confusion entre coste teorico y stock real.

Terminado cuando:

- recetas tengan version o snapshot suficiente;
- coste historico de venta se conserve;
- food cost ayude a decidir sin reescribir pasado.

#### Compras

Debe consolidarse el ciclo pedido-recepcion-factura sin mezclar responsabilidades.

Riesgos que elimina:

- facturas creando stock;
- pedidos tratados como recepcion;
- recepciones sin validacion;
- costes de proveedor mal aplicados;
- compras desconectadas de inventario real.

Terminado cuando:

- pedido, recepcion y factura sean eventos distintos;
- diferencias sean visibles;
- stock solo cambie con movimiento;
- proveedor y coste queden trazables.

---

## Nivel 3 Â· Diferenciacion

### Objetivo

Construir aquello que hace que Hostly sea claramente superior a un TPV tradicional, sin comprometer la confianza operativa ya consolidada.

### Por que esta en este nivel

Porque la diferenciacion solo aporta valor si el nucleo es confiable.

La IA, las automatizaciones, la importacion inteligente, la analitica avanzada o un editor premium pueden multiplicar el valor de Hostly. Pero si se construyen sobre estados dudosos, amplifican errores.

### Bloques a consolidar

#### IA

Debe asistir decisiones y reducir trabajo repetitivo.

Riesgos que elimina:

- recomendaciones sin contexto;
- automatizaciones peligrosas;
- confianza excesiva en datos no validados;
- IA actuando como fuente de verdad.

Terminado cuando:

- la IA explique lo que propone;
- los datos criticos requieran confirmacion humana;
- sus acciones sean reversibles o trazables;
- ayude sin sustituir criterio operativo.

#### Importacion inteligente

Debe acelerar alta de carta, facturas, proveedores o datos operativos sin confirmar automaticamente lo critico.

Riesgos que elimina:

- OCR modificando costes;
- productos mal importados;
- proveedores duplicados;
- facturas validadas sin revision;
- errores masivos por automatizacion.

Terminado cuando:

- importar sea rapido pero revisable;
- los datos criticos pasen por validacion;
- exista diferencia clara entre propuesta y verdad.

#### Editor premium

Debe hacer que el restaurante se reconozca mejor y configure mas rapido, sin volver fragil la operacion.

Riesgos que elimina:

- editor bonito pero no operativo;
- exceso de detalle visual;
- herramientas complejas;
- configuracion que solo entiende un experto.

Terminado cuando:

- el editor sea rapido, claro y tactil;
- el usuario pueda crear un restaurante real sin formacion;
- lo visual refuerce la operacion, no compita con ella.

#### Automatizaciones

Debe reducir tareas repetitivas manteniendo control humano.

Riesgos que elimina:

- acciones silenciosas;
- cambios no explicables;
- errores propagados automaticamente;
- perdida de confianza por falta de control.

Terminado cuando:

- cada automatizacion tenga responsable y explicacion;
- pueda revisarse su impacto;
- nunca actue de forma irreversible sobre datos criticos sin permiso.

#### Analitica

Debe transformar operacion en decisiones claras.

Riesgos que elimina:

- informes tardios;
- metricas que contradicen fuentes de verdad;
- decisiones basadas en datos incompletos;
- analitica usada para corregir operacion.

Terminado cuando:

- las metricas sean explicables;
- el origen de cada indicador sea claro;
- analitica interprete, no modifique, la verdad operativa.

---

## Nivel 4 Â· Escalabilidad

### Objetivo

Preparar Hostly para crecer en clientes, integraciones, equipos, empresas y canales sin perder estabilidad ni identidad.

### Por que esta en este nivel

Porque escalar un producto que todavia no es confiable solo escala sus inconsistencias.

API, marketplace, integraciones, multiempresa avanzado, enterprise o app movil deben apoyarse sobre dominios consolidados, eventos explicables y fuentes de verdad claras.

### Bloques a consolidar

#### API

Debe permitir integraciones sin romper ownership de datos.

Riesgos que elimina:

- terceros escribiendo datos incorrectos;
- eventos sin trazabilidad;
- bypass de reglas de dominio;
- inconsistencias entre sistemas.

Terminado cuando:

- cada endpoint respete dominio propietario;
- los eventos externos sean auditables;
- no existan escrituras criticas sin validacion.

#### Marketplace

Debe ampliar capacidades sin comprometer operacion.

Riesgos que elimina:

- integraciones de baja calidad;
- datos externos no confiables;
- dependencias que bloquean el servicio;
- extensiones que rompen experiencia Hostly.

Terminado cuando:

- las integraciones tengan contratos claros;
- el usuario entienda que datos comparten;
- un fallo externo no detenga el restaurante.

#### Integraciones

Debe conectar pagos, delivery, contabilidad, reservas, proveedores u otros sistemas sin duplicar verdades.

Riesgos que elimina:

- doble fuente de verdad;
- sincronizaciones peligrosas;
- conciliacion imposible;
- datos externos sobrescribiendo historicos.

Terminado cuando:

- cada integracion declare que lee, que escribe y que no puede modificar;
- haya trazabilidad de sincronizacion;
- los conflictos sean visibles.

#### Multiempresa avanzado

Debe permitir grupos, marcas, franquicias y estructuras complejas sin romper aislamiento operativo.

Riesgos que elimina:

- permisos ambiguos;
- datos cruzados entre locales;
- analitica mezclada;
- configuracion global aplicada por error.

Terminado cuando:

- empresa, restaurante, usuario y permisos tengan fronteras claras;
- los agregados no sustituyan datos locales;
- cada local pueda operar aunque el grupo tenga complejidad.

#### Enterprise

Debe aportar control, auditoria, seguridad y soporte a organizaciones grandes sin convertir Hostly en ERP generico.

Riesgos que elimina:

- complejidad administrativa;
- flujos pesados;
- permisos inseguros;
- auditoria insuficiente;
- configuraciones que ralentizan servicio.

Terminado cuando:

- enterprise aumente control sin frenar operacion;
- auditoria y permisos sean claros;
- la experiencia de servicio siga siendo rapida.

#### App movil

Debe extender Hostly al trabajo real en movimiento.

Riesgos que elimina:

- experiencia movil incompleta;
- acciones criticas inseguras en pantalla pequena;
- offline/latencia mal resueltos;
- duplicidad entre movil y desktop.

Terminado cuando:

- el movil respete las mismas fuentes de verdad;
- las acciones criticas sean seguras y claras;
- el equipo pueda operar sin perder contexto.

---

## Regla final

Hostly nunca debe construir el siguiente nivel si el anterior todavia compromete la confianza del restaurante.

La expansion es correcta solo cuando el nucleo operativo ya es confiable.

La diferenciacion es valiosa solo cuando no maquilla errores basicos.

La escalabilidad es deseable solo cuando escala una experiencia estable.

Primero confianza.
Despues mejora.
Luego diferenciacion.
Finalmente escala.
