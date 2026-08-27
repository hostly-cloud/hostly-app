# HOSTLY — CRM & FUNNEL BLUEPRINT V1

Estado: preparación previa al lanzamiento. No iniciar outreach masivo todavía.

## Objetivo

Crear una única fuente de verdad comercial para saber quién es cada lead, de dónde viene, qué problema tiene, qué acción toca después y qué canal termina generando clientes.

## Entidades mínimas

### Account / negocio
- accountId
- nombre comercial
- web
- ciudad
- provincia
- país
- tipo de negocio
- nº aproximado de locales
- tamaño / volumen aproximado
- TPV actual si es público o declarado
- stack conocido: reservas / delivery / KDS / pagos
- fitScore 0–100
- owner comercial
- fecha de creación

### Contacto
- contactId
- accountId
- nombre
- cargo
- email profesional
- teléfono profesional si es público o aportado
- linkedin / fuente pública
- canal preferido
- estado de consentimiento cuando aplique

### Lead / oportunidad
- leadId
- accountId
- contactId opcional
- source
- medium
- campaign
- content
- term
- landing
- painPrimary
- status
- lastTouchAt
- nextActionAt
- nextActionType
- estimatedValue
- lostReason

## Pipeline

1. identificado
2. contactable
3. contactado
4. respondió
5. cualificado
6. demo solicitada
7. demo agendada
8. demo realizada
9. acceso anticipado
10. prueba
11. activación pendiente
12. cliente
13. expansión

Estados laterales:
- no ahora
- sin respuesta
- no encaja
- perdido
- baja / no contactar

## Lead scoring inicial

Puntuación orientativa:
- +25: restaurante con servicio en mesa
- +15: más de un punto operativo (sala/barra/terraza)
- +15: varios locales
- +15: usa varias herramientas separadas
- +10: responsable identificado
- +10: interacción con demo / producto
- +10: visita repetida de alta intención

Restar:
- -20: negocio sin servicio operativo relevante para Hostly
- -30: no contactar / rechazo expreso

## SLA comercial

- Lead inbound con demo: responder en horario comercial lo antes posible.
- Acceso anticipado: contacto humano antes de entrar en automatizaciones de venta agresivas.
- No enviar más de una secuencia activa por contacto.
- Si responde una persona, detener automatizaciones y pasar a conversación humana.

## Eventos CRM

- lead_created
- lead_qualified
- demo_requested
- demo_booked
- demo_completed
- early_access_added
- trial_started
- restaurant_activated
- converted_customer
- lost

## Atribución

Guardar siempre:
- first_touch_source
- first_touch_campaign
- last_touch_source
- last_touch_campaign
- original_landing
- converting_landing

No sobreescribir el primer origen cuando vuelva a visitar.

## Reglas de datos

- Marketing separado de datos operativos de restaurantes.
- No incluir tickets, empleados, comandas, clientes finales ni datos sensibles en plataformas publicitarias.
- Minimización de datos.
- Derecho a baja y supresión.
- No comprar listas de emails dudosas.
- Registrar fuente del contacto y base de contacto cuando proceda.

## Dashboard comercial

KPIs iniciales:
- leads nuevos
- leads cualificados
- demos solicitadas
- demos realizadas
- tasa landing -> lead
- tasa lead -> demo
- tasa demo -> acceso anticipado/prueba
- coste por lead por canal cuando haya gasto
- coste por demo
- CAC cuando exista volumen suficiente

Segmentar por:
- canal
- campaña
- ciudad
- tipo de negocio
- tamaño
- mensaje / pain point
