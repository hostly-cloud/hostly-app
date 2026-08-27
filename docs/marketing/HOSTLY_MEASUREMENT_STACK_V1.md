# HOSTLY — MEASUREMENT STACK V1

Fecha de auditoría: 2026-08-27

Estado: preparación previa al lanzamiento. Este documento no activa publicidad, pixels ni gasto.

## Objetivo

Construir una medición comercial separada de la operación del restaurante para responder cinco preguntas:

1. ¿De dónde llega cada lead?
2. ¿Qué mensaje y creatividad generan intención real?
3. ¿Qué leads terminan en demo?
4. ¿Qué demos terminan en prueba/activación?
5. ¿Qué canal genera clientes con un CAC sostenible?

## Estado observado

### GA4 — Hostly

Propiedad conectada:
- `hostly-app-8b902`
- zona horaria: Europe/Madrid
- moneda: EUR
- industria configurada: Technology

La propiedad está enlazada con un Google Ads customer ID. Sin embargo, el conector de Google Ads disponible para auditoría no expone actualmente ninguna cuenta directa. Tratarlo como una diferencia de conexión/configuración hasta verificar la cuenta desde Google Ads.

La propiedad GA4 expone como key events, entre otros:
- `qualify_lead`
- `close_convert_lead`
- `purchase`

Auditoría de los últimos 30 días: no devuelve filas de eventos en el acceso de reporting utilizado. Antes de lanzar campañas hay que comprobar que la web pública está enviando eventos a esta propiedad y que no existe un stream distinto o un problema de despliegue/tagging.

No existen custom dimensions ni custom metrics configuradas actualmente.

### Meta Ads

Cuenta publicitaria conectada y accesible en EUR / Europe-Madrid.

Estado actual observado:
- campañas: 0
- pixels/datasets accesibles: 0
- Facebook/Instagram Pages accesibles desde esta conexión: 0

Esto es un buen estado para preparar la arquitectura sin riesgo de activar campañas accidentalmente, pero bloquea medición y lead ads reales hasta configurar activos.

### TikTok

No existe conexión operativa en las herramientas disponibles para esta auditoría. La arquitectura prevista debe contemplar TikTok Pixel + Events API con deduplicación cuando se configure la cuenta.

### CRM / outbound

Apollo está disponible para estructurar prospección, pero se mantiene separado del dato operativo de Hostly. Ver `HOSTLY_OUTBOUND_APOLLO_READINESS_V1.md`.

---

## Taxonomía de conversión recomendada

### Nivel 1 — intención web

- `view_marketing_page`
- `view_product`
- `demo_intent`
- `contact_click`
- `generate_lead`
- `early_access_signup`

### Nivel 2 — cualificación comercial

- `qualify_lead`
- `demo_requested`
- `demo_booked`
- `demo_completed`

### Nivel 3 — producto / revenue

- `trial_started`
- `restaurant_activated`
- `converted_customer`
- `subscription_started`

### Nivel 4 — expansión

- `second_location_added`
- `plan_upgraded`

No enviar a plataformas publicitarias datos internos como comandas, tickets, empleados, clientes finales del restaurante, inventario, facturas o información sensible.

---

## Modelo de fuente de verdad

### GA4
Uso: comportamiento web y análisis de adquisición.

Guardar:
- page/session
- source / medium
- campaign
- landing
- eventos de intención

### CRM
Uso: verdad comercial del lead y su estado.

Guardar:
- first touch
- last touch
- negocio
- decisor
- fit
- estado del pipeline
- demo
- prueba
- conversión

### Plataformas Ads
Uso: optimización y atribución publicitaria.

Enviar únicamente eventos aprobados y minimizados. Las plataformas no son la fuente de verdad comercial.

---

## UTM estándar

Formato:

`utm_source` = plataforma/origen

Valores:
- google
- meta
- instagram
- facebook
- tiktok
- youtube
- linkedin
- outbound
- partner
- organic

`utm_medium`:
- cpc
- paid_social
- organic_social
- video
- email
- referral
- outbound

`utm_campaign`:
`ES_<funnel>_<audience>_<angle>_<yyyy-mm>`

Ejemplos:
- `ES_PROSPECTING_OWNERS_SERVICECONTROL_2026-09`
- `ES_SEARCH_HIGHINTENT_TPV_2026-09`
- `ES_REMARKETING_DEMO_2026-09`

`utm_content`:
`<format>_<hook>_<variant>`

Ejemplos:
- `reel_menosclics_a`
- `static_restauranteentero_b`
- `rsa_tpvrestaurant_a`

`utm_term`: keyword cuando aplique.

Nunca incluir nombres, emails, teléfonos ni PII en UTMs.

---

## Arquitectura por plataforma

### Google / GA4

Fase de lanzamiento:
1. verificar stream web de Hostly;
2. verificar que `generate_lead` y conversiones comerciales llegan a GA4;
3. revisar enlace con Google Ads;
4. importar/usar conversiones solo cuando los eventos estén validados;
5. preparar enhanced conversions con consentimiento y tratamiento legal correcto;
6. para conversiones de lead/offline usar el flujo moderno de Data Manager / enhanced conversions for leads cuando corresponda.

### Meta

Fase de lanzamiento:
1. asociar Página/Instagram correctos al negocio;
2. crear Dataset/Pixel;
3. validar PageView/ViewContent/Lead;
4. añadir Conversions API si se implementa servidor a servidor;
5. usar un `event_id` común para deduplicar browser/server;
6. crear Custom Audiences solo con base legítima y respetando bajas/opt-out;
7. no activar campañas hasta comprobar Events Manager.

### TikTok

Fase de lanzamiento:
1. crear Pixel;
2. instalar base code / integration;
3. configurar ViewContent y SubmitForm/Lead equivalente;
4. añadir Events API;
5. deduplicar browser/server;
6. validar en Events Manager antes de optimizar campañas a conversiones.

---

## QA antes de gastar 1 €

- [ ] El dominio de marketing carga sin errores.
- [ ] Consentimiento funciona antes de tags no esenciales cuando corresponda.
- [ ] GA4 recibe PageView y eventos de marketing.
- [ ] `generate_lead` solo se dispara tras envío válido.
- [ ] UTMs llegan al lead almacenado/CRM.
- [ ] First-touch no se pierde en visitas posteriores.
- [ ] Meta Pixel/Dataset recibe evento de prueba.
- [ ] Conversions API deduplica correctamente si se usa.
- [ ] TikTok Pixel/Events API recibe evento de prueba si se usa.
- [ ] Google Ads conversiones apuntan a eventos comerciales reales.
- [ ] No se envía PII en URL, UTMs ni parámetros de evento no permitidos.
- [ ] Lead de prueba aparece en CRM con source/campaign/content correctos.
- [ ] Se puede trazar lead -> demo -> activación.

## Métrica norte de adquisición inicial

Mientras no exista volumen suficiente de clientes:

**Demos/accesos anticipados cualificados por cada 100 visitas relevantes.**

Después:
- coste por lead cualificado;
- coste por demo realizada;
- demo -> trial;
- trial -> restaurant_activated;
- CAC;
- payback;
- retención.
