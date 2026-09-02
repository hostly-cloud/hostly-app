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

---

## Decisiones pendientes de cierre

- Fuente Ãºnica definitiva de stock y costes.
- Fecha/criterio para retirar catÃ¡logo legacy local.
- PolÃ­tica final de roles granulares en perfiles Firestore.
- Estrategia de fuentes locales para builds reproducibles.
- Contrato persistente de salida del Asistente de Salas.
