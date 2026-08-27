# HOSTLY — EMAIL OUTBOUND SYSTEM V1

Estado: preparado para revisión. No enviar automáticamente todavía.

## Objetivo

Crear un sistema de outbound que parezca humano, relevante y útil. No hacer spam masivo. Priorizar negocios con buen fit y personalización basada en información pública.

## Principios

- 1 restaurante = 1 mensaje con contexto.
- No fingir que conocemos problemas internos que no conocemos.
- No usar lenguaje agresivo ni presión artificial.
- CTA pequeño: conversación o demo breve.
- Detener automatización en cuanto haya respuesta humana.
- Mantener una lista de exclusión y bajas.

## Segmentos

### S1 — Restaurante independiente con sala
Dolor probable: demasiados pasos, poca visibilidad del servicio, herramientas desconectadas.

### S2 — Bar / cafetería de alto volumen
Dolor probable: velocidad, barra, cobro, errores y entrenamiento del equipo.

### S3 — Beach club / terraza compleja
Dolor probable: múltiples zonas, movilidad, reservas, barra y operación visual.

### S4 — Grupo pequeño
Dolor probable: consistencia operativa, visibilidad y estandarización sin software pesado.

## Secuencia recomendada

### Email 1 — Contexto
Asunto: Una pregunta sobre {{company}}

Hola {{first_name}},

estamos construyendo Hostly para restaurantes que quieren conectar TPV, sala, cocina/barra, reservas y gestión sin hacer más pesado el servicio.

Vi {{public_context}} y pensé que podía tener sentido enseñártelo.

¿Te encaja una demo breve y me dices si tendría utilidad para un negocio como {{company}}?

Un saludo,
Hostly

### Email 2 — Problema concreto — +3 días
Asunto: Sala y cocina, mismo contexto

Hola {{first_name}},

una de las cosas que más estamos cuidando en Hostly es que sala, cocina y barra trabajen sobre la misma operación, sin obligar al equipo a saltar entre herramientas.

Si ahora mismo tenéis fricción en alguno de esos puntos, puedo enseñarte el flujo en unos minutos.

¿Te interesa verlo?

### Email 3 — Producto visible — +4 días
Asunto: Te enseño el flujo

Hola {{first_name}},

te dejo la idea en una frase: Hostly está pensado para que desde la mesa hasta el cobro todo mantenga contexto.

TPV, mapa, KDS, reservas, carta y gestión operativa en la misma plataforma.

Si quieres, te enseño solo el flujo que más te interese.

### Email 4 — Cierre — +5 días
Asunto: ¿Lo dejamos aquí?

Hola {{first_name}},

cierro por aquí para no insistir de más.

Si en algún momento quieres ver cómo estamos planteando Hostly para servicio real, encantado de enseñártelo.

Un saludo.

## Variables de personalización permitidas

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

Antes de activar:
1. verificar dominio de envío;
2. SPF, DKIM y DMARC;
3. mailbox separado para outbound si se decide;
4. warming progresivo;
5. volúmenes pequeños al inicio;
6. emails verificados;
7. incluir mecanismo claro de baja cuando corresponda;
8. revisar legalidad y base de interés legítimo / normativa aplicable antes de escalar.

## Métricas

Prioridad:
- reply rate real;
- positive reply rate;
- demo booked rate;
- bounce rate;
- unsubscribe / complaint rate.

Secundario:
- open rate, con cautela por limitaciones de tracking.

## Experimentos

A. asunto directo vs curioso
B. demo vs feedback de producto
C. 45 palabras vs 75 palabras
D. fundador / producto vs marca
E. problema sala-cocina vs fragmentación total

No cambiar múltiples variables en el mismo test.
