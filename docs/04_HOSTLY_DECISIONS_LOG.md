# Hostly Decisions Log

> Registro de decisiones permanentes o de largo alcance.

**Estado:** oficial y acumulativo
**Autoridad documental:** nivel 5
**Regla:** no borrar decisiones antiguas; marcarlas como sustituidas y enlazar la nueva.

---

## Formato

Cada nueva decisiÃ³n debe incluir:

- identificador;
- estado: propuesta, aceptada, sustituida o retirada;
- contexto;
- decisiÃ³n;
- consecuencias;
- documentos y cÃ³digo relacionados.

---

## Decisiones aceptadas

### H-001 â€” Hostly es SaaS multi-restaurante

**Estado:** aceptada.

Hostly se diseÃ±a como SaaS B2B para mÃºltiples restaurantes. Toda capacidad nueva debe
considerar aislamiento, permisos, coste y operaciÃ³n concurrente.

### H-002 â€” `restaurantId` es frontera de seguridad

**Estado:** aceptada.

`restaurantId` no es un filtro de interfaz. Determina el tenant de cada lectura,
escritura, listener, archivo y proceso servidor.

### H-003 â€” OperaciÃ³n y ConfiguraciÃ³n son mÃ³dulos separados

**Estado:** aceptada.

OperaciÃ³n prioriza rapidez y continuidad del servicio. ConfiguraciÃ³n define estructura
y comportamiento. Una no debe convertirse en una segunda implementaciÃ³n de la otra.

### H-004 â€” Carta visible y producto interno son conceptos distintos

**Estado:** aceptada.

La carta representa lo que se vende y cÃ³mo se presenta. El producto interno puede
incluir receta, inventario, estaciÃ³n, coste y configuraciÃ³n no visible al cliente.

### H-005 â€” TPV y KDS son runtimes crÃ­ticos

**Estado:** aceptada.

TPV, Cocina, Barra, CoctelerÃ­a y Sala evolucionan mediante cambios pequeÃ±os,
caracterizados y verificables. No se reescriben durante limpiezas visuales.

### H-006 â€” Enviar no significa Marchar

**Estado:** aceptada.

Enviar registra y comunica la comanda. Marchar libera un pase o curso para producciÃ³n.
No deben tratarse como la misma acciÃ³n.

### H-007 â€” Hostly Design System v1 es contrato

**Estado:** aceptada.

Los componentes, tokens y patrones canÃ³nicos se reutilizan. No se crean variantes
locales equivalentes.

### H-008 â€” Geist es la tipografÃ­a principal

**Estado:** aceptada.

Geist es la familia visual de Hostly. Otras familias solo pueden actuar como fallback
compatible.

### H-009 â€” Asistente de Salas como flujo principal futuro

**Estado:** aceptada.

La creaciÃ³n inicial de espacios debe ser guiada. El usuario no debe enfrentarse primero
a un lienzo vacÃ­o.

### H-010 â€” Editor avanzado como herramienta secundaria

**Estado:** aceptada.

El editor existente se conserva para precisiÃ³n y ajustes avanzados. No es la experiencia
recomendada para una primera configuraciÃ³n.

### H-011 â€” La IA propone y el humano confirma

**Estado:** aceptada.

La IA puede extraer, sugerir, ordenar y detectar. Nunca publica, cobra, elimina,
migra o confirma automÃ¡ticamente.

### H-012 â€” No reescribir megacomponentes sin caracterizaciÃ³n

**Estado:** aceptada.

El tamaÃ±o de un archivo no autoriza una reescritura. Primero se documentan contratos,
flujos, consumidores e invariantes.

### H-013 â€” Orden de modularizaciÃ³n

**Estado:** aceptada.

El orden recomendado es:

1. presentaciÃ³n;
2. helpers puros;
3. estado;
4. persistencia.

No se mezclan estas fases en una Ãºnica misiÃ³n crÃ­tica.

### H-014 â€” La arquitectura canÃ³nica no amplÃ­a legacy

**Estado:** aceptada.

`restaurantes`, `usuarios`, `mesas` y localStorage operativo pueden mantenerse por
compatibilidad, pero ninguna funcionalidad nueva debe elegirlos como patrÃ³n por defecto.

### H-015 â€” OperaciÃ³n antes que decoraciÃ³n

**Estado:** aceptada.

Toda decisiÃ³n visual debe responder primero a velocidad, comprensiÃ³n, prevenciÃ³n de
errores y uso tÃ¡ctil.

### H-016 - `HOSTLY_EDITOR_V2_TECHNICAL_REFERENCE.md` es la referencia tecnica actual del Editor V2

**Estado:** aceptada.

El estado tecnico vigente del Editor Sala V2 se documenta en
`docs/HOSTLY_EDITOR_V2_TECHNICAL_REFERENCE.md`. El roadmap de migracion conserva la
estrategia de coexistencia con legacy, pero no debe usarse como fuente principal para
conocer la arquitectura implementada, sistemas de interaccion, historial, documento V2
o pendientes reales del editor.

Consecuencias:

- Las iteraciones futuras del Editor V2 deben consultar primero la referencia tecnica.
- Los cambios estructurales del editor deben actualizar esa referencia cuando alteren
  fases, canvas, documento, historial, Smart Snap, seleccion o persistencia.
- Las funcionalidades pendientes no deben documentarse como implementadas.

### H-017 - Visual Assets es la arquitectura canonica para visuales complejos del Editor V2

**Estado:** aceptada.

Visual Assets sera la unica arquitectura permitida para representar elementos visuales
complejos del Editor V2. No se permitira incrustar texturas, iconos, imagenes,
recursos graficos complejos o decisiones de apariencia realista directamente dentro de
Surface System, Structure System u Operation System.

La apariencia visual debe permanecer desacoplada del comportamiento. Un muro sigue
siendo un muro, una mesa sigue siendo una mesa y una superficie sigue siendo una
superficie, aunque su representacion visual cambie.

Consecuencias:

- Toda representacion visual compleja debera pasar por Visual Assets.
- Los modelos de interaccion, Smart Snap, historial y persistencia no deben depender
  de texturas, imagenes ni variantes visuales.
- Los assets no contendran logica de negocio ni reglas de interaccion.
- La IA podra sugerir Visual Assets en el futuro, pero no podra sustituirlos,
  publicarlos ni confirmarlos sin intervencion humana.

---

### H-018 - Capacidades y transición de imágenes de catálogo

**Estado:** aceptada.

Las automatizaciones de imágenes se autorizan mediante capacidades explícitas:
`catalog.image.ai.single`, `catalog.image.ai.bulk` y
`catalog.image.catalogSearch`. La subida manual permanece disponible para todos los
planes y estas capacidades se comprueban siempre en el servidor.

`restaurants/{restaurantId}.subscription.plan` es la fuente canónica del plan. Durante
la transición, `billing.plan` y `plan` se leen como alias. Un restaurante existente sin
plan reconocible conserva temporalmente el acceso individual equivalente a Pro, pero
no recibe la capacidad masiva de Ultra. Esto evita bloquear tenants actuales al
introducir el nuevo contrato.

Los campos raíz `subscription`, `billing` y `plan` constituyen autoridad comercial y
son exclusivos del servidor: las Firestore Rules permiten a owner/admin conservarlos
al editar otros datos del restaurante, pero impiden añadirlos, modificarlos o
eliminarlos desde un cliente. El Admin SDK es la única vía para cambiar el plan. Los
futuros límites y créditos deben vivir dentro de esta autoridad protegida o en otra
colección igualmente server-only; ocultar controles en React nunca concede ni revoca
una capacidad.

El contrato de consumo opcional vive en
`subscription.catalogImages`: `meteringMode: "credit_balance"`, un
`creditBalance` entero no negativo y costes enteros no negativos en
`creditCosts.aiSingle`, `creditCosts.aiBulk` y `creditCosts.catalogSearch`. Los
importes no se fijan en componentes ni en una política global: son configuración
comercial modificable por tenant. Solo el modo explícito `credit_balance` activa la
restricción; un tenant sin esta configuración continúa en `usage_recorded`, sin saldo
inventado y sin perder el acceso de transición. Si se activa el modo pero falta el
saldo o el coste de la operación, el servidor falla de forma cerrada antes de llamar
al proveedor.

Una operación con saldo reserva créditos en la misma transacción que crea su registro
idempotente de uso. Los créditos pasan de `reserved` a `consumed` únicamente cuando el
resultado queda persistido para revisión; un fallo libera la reserva mediante una
actualización atómica. Los productos no elegibles, las marcas desviadas a catálogo y
las solicitudes duplicadas no consumen créditos. La API vuelve a leer plan, capacidad
y saldo desde el documento del restaurante dentro de la transacción, por lo que el
estado enviado por React nunca actúa como autoridad.

Cada intento individual usa una clave idempotente y deja un registro exclusivo de
servidor en `restaurants/{restaurantId}/catalogImageUsage/{idempotencyKey}` con tenant,
producto, usuario, plan efectivo, proveedor, resultado, coste disponible y motivo de
fallo. La colección no amplía el acceso del cliente ni cambia las reglas del catálogo.

El editor individual opera únicamente sobre un `productId` ya persistido; un borrador
sin guardar no se resuelve por nombre ni puede iniciar una operación con coste. La
misma clasificación conservadora sirve al flujo individual y al masivo: platos
genéricos usan IA, marcas y bebidas buscan catálogo real y los casos ambiguos requieren
intervención manual. Una imagen IA aprobada puede regenerarse solo tras confirmación
explícita, queda de nuevo pendiente de revisión y conserva la versión aprobada si la
generación falla. Las imágenes manuales, de catálogo y legacy nunca se desbloquean con
esa confirmación.

### H-019 - Cola masiva de imágenes persistente y acotada

**Estado:** aceptada.

La primera fase de “Completar imágenes del catálogo” usa documentos server-only en
`restaurants/{restaurantId}/catalogImageJobs/{jobId}` y su subcolección `items`. El
navegador solo solicita que el servidor avance un elemento; el estado, los intentos,
el leasing, los resultados y los fallos permanecen en Firestore y sobreviven a una
recarga o desconexión.

Cada trabajo exige `settings.manage`, plan Ultra y confirmación explícita. Solo se
procesa un elemento por trabajo a la vez, con clave idempotente por producto. Los
platos genéricos usan IA, las marcas y bebidas consultan catálogo real y los casos
ambiguos quedan para revisión manual. Ningún resultado se aprueba ni publica
automáticamente.

El procesamiento autónomo usa Vercel Queues con entrega durable e idempotencia por
trabajo y revisión. Firestore sigue siendo la fuente de verdad del estado, los intentos,
el leasing, los resultados y los fallos; la cola solo despierta al consumidor y nunca
autoriza un tenant ni publica una imagen.

La galería permite aprobar imágenes IA y seleccionar coincidencias reales devueltas por
el catálogo. Para estas últimas, el cliente solo envía `productId` y la referencia
persistida en el propio trabajo. El servidor vuelve a resolver y copiar la imagen bajo
el tenant, rechaza URLs o `restaurantId` aportados por el cliente y exige una
confirmación humana antes de aprobarla y protegerla.

### H-020 - Periodos, libro de créditos y reconciliación de reservas

**Estado:** aceptada.

La administración comercial de créditos no se concede a los roles del restaurante.
Aunque owner/admin pueden consultar su consumo y solicitar la reconciliación de
reservas caducadas, no pueden fijar asignaciones, abrir periodos ni aumentar saldos.
Esas operaciones se ejecutan únicamente con Firebase Admin mediante
`npm run admin:catalog-image-credits`, requieren una clave idempotente, operador,
motivo y `--apply`, y escriben un asiento append-only en
`restaurants/{restaurantId}/catalogImageCreditLedger/{idempotencyKey}`. La herramienta
arranca siempre en modo de vista previa y nunca acepta un ajuste que deje saldo
negativo o que no coincida con el periodo activo.

El periodo opcional vive dentro de la autoridad server-only en
`subscription.catalogImages.creditPeriod` con `id`, `startsAt`, `endsAt` y
`allocation`. No se define aquí ninguna asignación o precio: todos esos valores se
proporcionan como configuración comercial explícita. Los tenants sin periodo siguen
funcionando con el contrato de transición anterior.

Cada nueva reserva de crédito persiste `creditLeaseExpiresAt` y, si existe,
`creditPeriodId`. Las generaciones individuales, búsquedas y workers masivos intentan
reconciliar reservas vencidas antes de una nueva operación. La reconciliación vuelve a
leer el uso dentro de una transacción, exige el mismo tenant, estado `processing`,
crédito `reserved` y lease vencido; después devuelve el importe una sola vez, marca el
uso como `released` y crea su asiento de auditoría. Registros antiguos sin lease no se
liberan automáticamente.

`GET /api/catalog/product-image-credits` expone al owner/admin autenticado únicamente
el resumen de su restaurante. `POST` admite solo `reconcile_expired` con confirmación
explícita y obtiene siempre `restaurantId` del perfil del servidor. Ninguna de las dos
rutas permite asignar saldo ni recibir un tenant desde el navegador. Tanto el uso como
el libro de créditos permanecen sin acceso directo en Firestore Rules.

### H-021 - Un único trabajo masivo de imágenes activo por restaurante

**Estado:** aceptada.

“Completar imágenes del catálogo” admite como máximo un trabajo activo por tenant,
incluidos los estados `preparing`, `queued`, `running` y `paused`. La clave idempotente
de la petición sigue identificando un trabajo, pero la exclusión mutua se resuelve en
servidor mediante el puntero transaccional y server-only
`restaurants/{restaurantId}/catalogImageJobControls/active`. Dos confirmaciones
simultáneas con claves distintas reciben el mismo trabajo activo y no duplican llamadas
a proveedores ni consumo de créditos.

El puntero conserva el último trabajo para poder comprobar su estado. Cuando ese
trabajo ya es terminal (`completed`, `cancelled` o `failed`), la siguiente confirmación
puede sustituir el puntero y crear un trabajo nuevo. Durante la transición, si todavía
no existe el control, el servidor adopta antes cualquier trabajo legacy activo del
mismo restaurante. Una preparación interrumpida conserva un lease configurable: otra
confirmación devuelve el trabajo mientras el lease siga vivo y recupera ese mismo
`jobId`, sin crear otro, cuando haya caducado. El control nunca se recibe del navegador,
no cruza tenants y no amplía el acceso directo permitido por Firestore Rules.

### H-022 - Revisión monotónica para la continuidad de la cola de imágenes

**Estado:** aceptada.

Cada trabajo masivo persiste `queueRevision`, un contador monotónico independiente de
los timestamps. La clave idempotente de cada envío a Vercel Queues se deriva del
restaurante, el trabajo y esa revisión. Preparar el trabajo inicia la revisión; cada
elemento finalizado y cada reanudación o reintento efectivo la incrementan antes de
encadenar el siguiente mensaje.

No se utiliza `updatedAt` como versión de entrega: dos transiciones válidas pueden
ocurrir en el mismo milisegundo y no deben deduplicarse entre sí. Los trabajos legacy
sin el campo se leen como revisión cero y avanzan de forma compatible en su siguiente
transición. El contador no concede autoridad al cliente ni sustituye los leases por
producto; únicamente hace durable y determinista la continuidad de la cola.

### H-023 - Reentrega obligatoria mientras exista trabajo masivo activo

**Estado:** aceptada.

Un mensaje de la cola no se confirma cuando el trabajo sigue en estado `queued` o
`running`, conserva elementos pendientes o procesándose y el worker no ha podido
adquirir un elemento. Esta situación puede producirse durante una reentrega con un
lease de Firestore todavía activo. El consumidor lanza entonces un error recuperable
para que Vercel Queues mantenga el mensaje y lo vuelva a entregar con backoff; cuando
el lease vence, el mismo trabajo recupera el elemento sin duplicar el producto ni el
consumo.

Los mensajes estructuralmente inválidos son no recuperables y se confirman para no
crear un poison loop. Los fallos transitorios de infraestructura y los trabajos
activos sin progreso se reintentan durante la retención del mensaje. Firestore sigue
siendo la fuente de verdad y la reentrega nunca relaja el aislamiento por restaurante,
los permisos, la capacidad Ultra ni las claves idempotentes por producto.

### H-024 - Controles masivos serializados y recuperables

**Estado:** aceptada.

Pausar, reanudar, reintentar fallos y cancelar un trabajo de imágenes se decide con
una transacción sobre el documento del trabajo. Los controles que reescriben varios
elementos (`retry_failed` y `cancel`) levantan primero una barrera server-only llamada
`controlOperation`, dejan el trabajo en pausa y conservan el número de elementos que
debe reflejarse en los contadores. Mientras exista esa barrera ningún worker puede
adquirir un producto nuevo ni otro tipo de control puede adelantar la operación.

Los cambios de elementos se ejecutan después en lotes y una segunda transacción aplica
los contadores sobre la versión más reciente del trabajo, incrementando
`queueRevision` solamente una vez cuando el reintento queda listo. Repetir el mismo
control adopta la barrera existente: es seguro ante doble pulsación y permite terminar
una operación interrumpida entre los lotes y la actualización final. Cancelar o
reintentar mientras un elemento ya se procesa devuelve conflicto y conserva el lease;
no se sobrescribe progreso, no se reabre un fallo dos veces y una cancelación no puede
convertirse después en completada por una escritura antigua.

`controlOperation` nunca se acepta desde el cliente ni se expone como autoridad. Vive
dentro del trabajo aislado por `restaurantId`, permanece inaccesible por Firestore
Rules y no modifica los controles de plan, permisos, créditos o revisión humana.

### H-025 - Observabilidad estructurada de la cola masiva de imágenes

**Estado:** aceptada.

Cada entrega del consumidor de Vercel Queues emite eventos JSON correlacionables por
`restaurantId`, `jobId` y `messageId`: inicio, finalización, reintento programado,
descarte definitivo y proximidad al vencimiento de la retención. Los eventos incluyen
intento, consumidor, región, antigüedad, tiempo restante, duración y resultado del
trabajo. Una recuperación de control distingue si fue aplicada o si una operación más
nueva la dejó obsoleta.

La telemetría no serializa el mensaje completo ni registra nombres de producto, URLs,
resultados del proveedor o el token interno de la operación de control. Los IDs se
aceptan para logs únicamente si cumplen el formato seguro del dominio. Un fallo del
destino de logs nunca bloquea, reintenta ni confirma una operación de negocio.

Firestore continúa siendo la fuente de verdad del trabajo y Vercel Queues conserva la
entrega durable. La observabilidad describe lo ocurrido, pero no concede permisos, no
modifica estados y no sustituye los controles de tenant, plan, créditos o revisión.

---

## Decisiones pendientes de cierre

- Fuente Ãºnica definitiva de stock y costes.
- Fecha/criterio para retirar catÃ¡logo legacy local.
- PolÃ­tica final de roles granulares en perfiles Firestore.
- Estrategia de fuentes locales para builds reproducibles.
- Contrato persistente de salida del Asistente de Salas.
