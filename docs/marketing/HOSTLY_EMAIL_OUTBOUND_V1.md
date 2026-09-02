# HOSTLY — EMAIL OUTBOUND SYSTEM V1

Estado: preparado para revisión. No enviar automáticamente todavía.

## Objetivo

Crear un sistema de email que parezca humano, relevante y útil. No hacer spam masivo. Priorizar negocios con buen fit y personalización basada en información pública o, cuando ya sean clientes, en su uso real de Hostly.

## Principio global de email Hostly

**No enviar correos genéricos cuando tengamos contexto suficiente para ser relevantes.**

La personalización debe aplicarse a todo el ciclo de vida:
- prospección;
- bienvenida;
- onboarding;
- activación;
- educación de producto;
- recomendaciones de uso;
- upsell Básico -> Pro;
- retención;
- recuperación de clientes inactivos;
- avisos de novedades relevantes.

La regla es:

> **Cada correo debe responder a la pregunta: "¿Por qué este cliente recibe este mensaje precisamente ahora?"**

Si no podemos responderla con una señal real, el correo probablemente no merece enviarse.

## Niveles de personalización

### 1. Prospecto
Usar únicamente contexto público o proporcionado voluntariamente:
- nombre del negocio;
- ciudad;
- tipo de establecimiento;
- número de locales si es público;
- terraza / beach club / hotel si es evidente;
- reservas online públicas;
- expansión o noticia pública;
- rol profesional del contacto.

### 2. Lead / demo
Personalizar según intención explícita:
- módulo consultado;
- página de entrada;
- campaña / UTM;
- tipo de negocio declarado;
- problema que ha dicho querer resolver;
- preguntas realizadas durante demo o contacto.

### 3. Cliente activo
Aquí la personalización debe basarse en señales de producto útiles y no invasivas:
- antigüedad en Hostly;
- plan actual;
- módulos usados;
- módulos apenas usados;
- configuración incompleta;
- volumen de acciones relevante para una función;
- intentos de usar una función Pro;
- productos sin imagen;
- frecuencia de uso de análisis;
- uso de reservas, KDS, carta, productos, etc.;
- hitos de adopción.

No incluir datos sensibles o detalles operativos innecesarios en el cuerpo del email.

## Personalización para upsell Básico -> Pro

No enviar simplemente "sube a Pro" a los 30 días.

El sistema debe decidir **qué beneficio Pro tiene sentido para ese restaurante**.

Ejemplos:

- Muchos productos sin imagen -> destacar generación de imágenes con IA.
- Consulta frecuente de analítica -> destacar análisis avanzado.
- Uso intenso de carta/productos -> destacar automatizaciones y funciones avanzadas de catálogo.
- Intentos repetidos sobre una función bloqueada -> explicar esa función concreta y por qué Pro la desbloquea.
- Restaurante con varias áreas operativas -> destacar funciones Pro relacionadas con coordinación/gestión, si están disponibles en ese plan.

Estructura recomendada:

**Asunto:** {{beneficio_relevante}}, sin cambiar cómo trabajáis

Hola {{first_name}},

lleváis {{days_active}} días usando Hostly y hay algo que puede tener sentido para {{company}}.

{{usage_based_observation}}

Con Hostly Pro podéis {{specific_pro_benefit}}.

{{concrete_value_explanation}}

No hace falta cambiar vuestra forma de trabajar: simplemente Hostly puede encargarse de una parte más del trabajo.

**Ver esta función en Pro**

Un saludo,
Hostly

### Ejemplo — productos sin imagen

Asunto: Tus productos pueden quedar listos mucho más rápido

Hola {{first_name}},

lleváis unas semanas trabajando con Hostly y todavía tenéis productos sin imagen configurada.

Con Hostly Pro podéis generar imágenes de producto con IA directamente desde la carta, sin tener que buscar, editar y subir cada imagen manualmente.

Si esa es una tarea que todavía os queda pendiente, puede ahorraros bastante trabajo de configuración.

**Ver generación de imágenes con IA**

### Ejemplo — analítica

Asunto: Ya utilizáis los datos de Hostly. Podéis sacarles más partido.

Hola {{first_name}},

hemos visto que la parte de análisis forma parte habitual de vuestro uso de Hostly.

Con Hostly Pro podéis acceder a herramientas de análisis más avanzadas y obtener más contexto sobre la operación sin tener que preparar informes fuera de la plataforma.

**Ver análisis Pro**

## Cuándo enviar

No usar únicamente fechas fijas.

Combinar:
- tiempo desde alta;
- nivel de adopción;
- uso de funciones;
- intentos de acceder a capacidades Pro;
- hitos completados;
- señales de inactividad;
- cambios relevantes del producto.

Ejemplos:
- Día 3: ayuda solo si onboarding no está completo.
- Día 7–14: recomendación de una función que todavía no ha descubierto y que encaje con su uso.
- Día 30: resumen personalizado de valor + una sola recomendación Pro relevante.
- Antes de 30 días: si intenta varias veces usar una función Pro, explicar esa función sin esperar al calendario.
- 60–90 días: revisar si existe otra oportunidad real de valor; no repetir el mismo upsell.

## Principios

- 1 restaurante = 1 mensaje con contexto.
- No fingir que conocemos problemas internos que no conocemos.
- No usar lenguaje agresivo ni presión artificial.
- CTA pequeño y específico.
- Detener automatización comercial en cuanto haya respuesta humana cuando corresponda.
- Mantener una lista de exclusión y bajas.
- Una recomendación principal por email; evitar catálogos de funciones.
- Explicar valor antes que plan o precio.
- No usar datos de uso para avergonzar o presionar al cliente.
- No convertir cada interacción en una oportunidad de venta.

## Segmentos outbound

### S1 — Restaurante independiente con sala
Dolor probable: demasiados pasos, poca visibilidad del servicio, herramientas desconectadas.

### S2 — Bar / cafetería de alto volumen
Dolor probable: velocidad, barra, cobro, errores y entrenamiento del equipo.

### S3 — Beach club / terraza compleja
Dolor probable: múltiples zonas, movilidad, reservas, barra y operación visual.

### S4 — Grupo pequeño
Dolor probable: consistencia operativa, visibilidad y estandarización sin software pesado.

## Secuencia outbound recomendada

### Email 1 — Contexto
Asunto: Una pregunta sobre {{company}}

Hola {{first_name}},

estamos construyendo Hostly para restaurantes que quieren conectar TPV, sala, cocina/barra, reservas y gestión sin hacer más pesado el servicio.

Vi {{public_context}} y pensé que podía tener sentido enseñártelo.

¿Te encaja una demo breve y me dices si tendría utilidad para un negocio como {{company}}?

Un saludo,
Hostly

### Email 2 — Problema concreto — +3 días
Asunto: {{relevant_operational_area}}

Hola {{first_name}},

por {{public_or_declared_context}}, hay una parte de Hostly que creo que puede ser especialmente interesante para {{company}}: {{specific_flow}}.

{{short_relevance_explanation}}

Si quieres, te enseño únicamente ese flujo en unos minutos.

### Email 3 — Producto visible — +4 días
Asunto: Te enseño el flujo de {{specific_flow}}

Hola {{first_name}},

no quiero mandarte una lista de funciones. La parte que creo que merece la pena que veas en vuestro caso es {{specific_flow}}.

{{one_sentence_product_value}}

Si quieres, te lo enseño directamente sobre Hostly.

### Email 4 — Cierre — +5 días
Asunto: ¿Lo dejamos aquí?

Hola {{first_name}},

cierro por aquí para no insistir de más.

Si en algún momento quieres ver cómo estamos planteando {{relevant_area}} en Hostly para un negocio como {{company}}, encantado de enseñártelo.

Un saludo.

## Variables de personalización permitidas en outbound

- nombre del negocio;
- ciudad;
- tipo de restaurante;
- nº de locales si es público;
- terraza / beach club / hotel si es evidente;
- reserva online pública;
- horarios o servicios públicos;
- noticia o expansión pública reciente.

No inferir:
- problemas financieros;
- nivel de ventas;
- conflictos internos;
- software actual salvo evidencia pública;
- datos personales no profesionales.

## Reglas de envío

Antes de activar outbound:
1. verificar dominio de envío;
2. SPF, DKIM y DMARC;
3. mailbox separado para outbound si se decide;
4. warming progresivo;
5. volúmenes pequeños al inicio;
6. emails verificados;
7. incluir mecanismo claro de baja cuando corresponda;
8. revisar legalidad y base de interés legítimo / normativa aplicable antes de escalar.

Para lifecycle de clientes:
- respetar preferencias de comunicaciones;
- separar mensajes operativos/transaccionales de marketing;
- permitir controlar comunicaciones comerciales;
- minimizar los datos mostrados en el email;
- mantener aislamiento multi-tenant en cualquier sistema de personalización.

## Métricas

Outbound:
- reply rate real;
- positive reply rate;
- demo booked rate;
- bounce rate;
- unsubscribe / complaint rate.

Lifecycle / upsell:
- feature adoption after email;
- click-to-feature rate;
- Pro trial / upgrade rate;
- unsubscribe rate;
- complaint rate;
- incremental conversion vs grupo de control;
- revenue expansion sin degradar retención.

Secundario:
- open rate, con cautela por limitaciones de tracking.

## Experimentos

A. asunto directo vs curioso
B. demo vs feedback de producto
C. 45 palabras vs 75 palabras
D. fundador / producto vs marca
E. problema sala-cocina vs fragmentación total
F. fecha fija vs señal de uso
G. upsell genérico vs recomendación basada en uso
H. CTA "Ver Pro" vs CTA a función concreta

No cambiar múltiples variables en el mismo test.

## Regla final

**Hostly no debe tener "campañas de correo" que traten a todos los restaurantes igual. Debe tener conversaciones automatizadas que utilizan contexto real para ser útiles.**
