# HOSTLY — CUSTOMER SUCCESS & SETUP ADVISOR V1

Estado: concepto de producto/CRM. No activar automatizaciones ni envíos todavía.

## Idea central

Hostly no debe limitarse a entregar un TPV. Debe ayudar activamente a cada restaurante a dejarlo bien configurado y preparado para trabajar.

La filosofía es:

> **No queremos que simplemente tengas Hostly. Queremos ayudarte a dejar Hostly perfecto para tu restaurante.**

Esto debe sentirse como un manager experto revisando la configuración y diciendo: "he visto tres cosas que podemos mejorar antes del próximo servicio".

## Nombre de trabajo

**Hostly Setup Advisor**

Alternativas:
- Hostly Ready
- Hostly Checkup
- Tu Hostly, listo para servicio
- Revisión de configuración

## Qué debe analizar

Siempre por restaurantId y sin mezclar información entre restaurantes.

### Carta y productos
- productos sin imagen;
- productos sin categoría;
- categorías demasiado extensas o vacías;
- precios/costes incompletos cuando corresponda;
- productos inactivos o duplicados potenciales;
- carta sin ordenar;
- alérgenos/datos opcionales relevantes pendientes;
- modificadores no utilizados o configuraciones inconsistentes.

### Sala / mesas
- mesas sin zona;
- numeración incoherente;
- planos incompletos;
- terraza sin configurar cuando el negocio indica que la tiene;
- capacidad de mesas pendiente;
- mesas fuera de encuadre o layout poco práctico;
- zonas sin uso.

### Cocina / barra / estaciones
- productos sin destino;
- estaciones sin productos asociados;
- impresoras/KDS incompletos;
- configuración potencialmente ambigua entre cocina y barra;
- pases sin revisar.

### Reservas
- zonas sin capacidad clara;
- horarios/configuración incompletos;
- mesas no disponibles para asignación cuando deberían estarlo;
- datos básicos pendientes.

### Equipo
- usuarios/invitaciones pendientes;
- roles poco definidos;
- empleados que todavía no han accedido;
- configuración que puede dificultar onboarding.

### Analítica y gestión
- módulos que no se están usando pese a tener datos disponibles;
- informes útiles que el negocio todavía no ha descubierto;
- escandallos incompletos;
- inventario sin mínimos/costes cuando aplique.

## Cómo presentar las recomendaciones

No mostrar 20 errores.

Hostly debe priorizar **máximo 3 recomendaciones por ciclo**.

Ejemplo:

### Tu Hostly está casi listo

**87% preparado para servicio**

He encontrado 3 cosas que merece la pena revisar:

1. **42 productos no tienen imagen**
   Añadirlas hará que el TPV sea más visual y rápido para el equipo.
   [Revisar productos]

2. **6 productos no tienen destino de cocina/barra**
   Configurarlo evita dudas cuando se envíen comandas.
   [Configurar destinos]

3. **La terraza tiene 8 mesas sin capacidad definida**
   Añadirla ayudará a reservas y asignación de mesa.
   [Completar terraza]

CTA secundario:
**Hazlo por mí** — cuando Hostly pueda automatizar la corrección de forma segura y reversible.

## Principio de recomendación

Cada recomendación debe incluir:
- qué ha detectado Hostly;
- por qué importa;
- qué beneficio obtiene el restaurante;
- una acción directa;
- nunca lenguaje de culpa.

Evitar:
"Tienes mal configurados 42 productos."

Preferir:
"Hay 42 productos que podemos dejar más visuales añadiendo imagen."

## Momentos de activación

### Durante onboarding
Después de importar/configurar datos, Hostly revisa qué falta para abrir servicio.

### Antes del primer servicio
Checklist final:
- TPV;
- carta;
- destinos;
- mesas;
- KDS/impresión;
- empleados;
- cobros.

Resultado:
**Hostly está listo para servicio**.

### Después de 7 días
Revisión basada en uso real:
"Después de vuestra primera semana hemos encontrado 3 ajustes que pueden hacer el servicio más cómodo."

### Después de 30 días
Revisión de optimización, no onboarding:
"Ya conocemos mejor cómo usáis Hostly. Estas son las 3 mejoras que más sentido tienen ahora."

### Estacional
Especialmente útil para Ibiza y negocios de temporada:
- apertura de terraza;
- reapertura del restaurante;
- nueva carta;
- cambio de temporada;
- nuevo equipo;
- nueva distribución de mesas.

Ejemplo:
"La temporada empieza pronto. ¿Quieres que revisemos contigo carta, terraza y equipo antes de abrir?"

## Email personalizado de ayuda

Asunto: **He encontrado 3 cosas para dejar {{restaurant_name}} mejor preparado**

Hola {{first_name}},

he revisado cómo tenéis configurado Hostly y hay tres ajustes que pueden haceros el próximo servicio más cómodo:

{{recommendation_1}}
{{recommendation_2}}
{{recommendation_3}}

No es necesario hacerlo todo ahora. Si quieres, puedes ir directamente a cada ajuste desde Hostly.

**Revisar mi configuración**

Un saludo,
Hostly

## Mensaje más humano del fundador / customer success

"He trabajado muchos años en hostelería y sé que configurar un TPV suele acabar dejándose para cuando hay tiempo. La idea de Hostly es justo la contraria: ayudarte a dejarlo bien desde el principio para que durante el servicio no tengas que pensar en el software."

## Modo "Prepáramelo"

Evolución futura especialmente potente.

El restaurante puede pedir:

**"Ayúdame a dejar Hostly listo para esta temporada."**

Hostly analiza configuración y prepara un plan:
- carta;
- imágenes;
- categorías;
- plano;
- estaciones;
- empleados;
- reservas;
- analítica;
- escandallos.

Las acciones automáticas se separan en:

### Seguras/autorizables en bloque
Ejemplos futuros:
- proponer imágenes;
- ordenar categorías;
- detectar campos vacíos;
- sugerir destinos;
- generar checklist.

### Requieren confirmación
- cambiar precios;
- desactivar productos;
- modificar reglas operativas;
- cambiar asignaciones importantes;
- cualquier acción que pueda alterar un servicio real.

## Health Score de configuración

Crear un indicador interno de preparación, no gamificado en exceso.

Dimensiones posibles:
- Carta: 0–100
- Sala: 0–100
- Cocina/barra: 0–100
- Equipo: 0–100
- Reservas: 0–100
- Gestión: 0–100

Resultado:
**Preparación para servicio: 92%**

No convertirlo en una nota punitiva. Su función es priorizar ayuda.

## Diferencia respecto a soporte tradicional

Soporte tradicional:
"Escríbenos si tienes un problema."

Hostly:
"He visto algo que podemos mejorar antes de que se convierta en un problema."

Ese debe ser uno de los rasgos de la nueva generación de software de hostelería.

## Relación con planes

La ayuda básica para dejar Hostly funcional no debe convertirse artificialmente en un paywall.

### Básico
- checklist de configuración;
- recomendaciones esenciales;
- alertas de datos incompletos;
- guía para dejar el sistema listo.

### Pro
- recomendaciones inteligentes basadas en uso;
- IA para acelerar configuración;
- generación individual de activos/contenido si corresponde al plan;
- optimizaciones avanzadas.

### Ultra
- automatización en lote;
- análisis más profundo;
- preparación asistida masiva;
- optimizaciones multiárea/multilocal cuando exista.

Regla: primero ayudar; después demostrar por qué una capacidad Pro/Ultra puede ahorrar más trabajo.

## Métricas de éxito

No medir solo upsell.

Medir:
- tiempo hasta "listo para servicio";
- porcentaje de configuración completada;
- adopción de módulos;
- reducción de incidencias de configuración;
- acciones recomendadas completadas;
- retención a 30/90 días;
- satisfacción después del onboarding;
- conversión a Pro cuando exista una razón real de valor.

## Frase de producto

**Hostly no espera a que algo esté mal para ayudarte. Te ayuda a dejarlo bien antes del servicio.**

## Regla final

La mejor configuración no es la que tiene más campos completos. Es la que hace que el equipo piense menos en el TPV cuando el restaurante está lleno.
