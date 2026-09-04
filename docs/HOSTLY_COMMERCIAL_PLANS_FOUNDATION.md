# Hostly Commercial Plans Foundation

**Estado técnico:** activo como fundamento comercial.  
**Estado comercial:** propuesta V1, todavía no vinculante ni aplicada como bloqueo de runtime.  
**Versión de propuesta:** `2026-09-04.v1`.

Hostly reconoce tres planes comerciales estables, en este orden:

1. Básico (`basic`)
2. Pro (`pro`)
3. Ultra (`ultra`)

## Principio de seguridad comercial

La propuesta comercial vive en `lib/subscription/hostly-commercial-proposal.ts` y está marcada explícitamente como `proposed`.

Esto permite preparar pricing, copy, límites, venta y futura facturación sin convertir una hipótesis comercial en un bloqueo de producción. El runtime sigue usando las fuentes de autorización existentes (`hostly-entitlements.ts`, `hostly-commercial-policy.ts` y los guards de servidor).

No se debe usar `HOSTLY_COMMERCIAL_PROPOSAL` directamente para autorizar o denegar una operación hasta que la política concreta de esa función haya sido aprobada y activada.

## Propuesta V1 de precios

Precios por local, sin IVA:

| Plan | Mensual | Anual | Equivalencia anual |
| --- | ---: | ---: | --- |
| Básico | 39 € | 390 € | 12 meses por el precio de 10 |
| Pro | 79 € | 790 € | 12 meses por el precio de 10 |
| Ultra | 139 € | 1.390 € | 12 meses por el precio de 10 |

Reglas propuestas:

- precio por local, no por camarero ni por dispositivo TPV;
- sin comisión de Hostly sobre la facturación del restaurante;
- costes de proveedor de pagos, hardware y servicios de terceros se facturan aparte cuando existan;
- prueba de 30 días sobre Pro, sin método de pago obligatorio;
- onboarding self-service gratuito;
- onboarding remoto asistido: 199 €;
- onboarding remoto incluido con Ultra anual;
- descuento multi-local propuesto: 10 % para 2–4 locales, 15 % para 5–9 y condiciones a medida desde 10;
- lanzamiento `Hostly Founders`: 20 % durante 12 meses para un máximo inicial de 50 locales, no acumulable al descuento anual.

## Propuesta V1 de segmentación

### Básico — 39 €/mes

Pensado para bar, cafetería o restaurante pequeño que necesita operar correctamente sin complejidad administrativa.

Propuesta de alcance:

- TPV, mesas y comandas;
- cocina/barra y KDS operativo;
- reservas esenciales;
- carta, categorías, productos y modificadores;
- imágenes manuales;
- inventario esencial;
- análisis esencial;
- hasta 5 empleados;
- dispositivos TPV sin coste adicional;
- sin generación de imágenes IA ni importaciones IA incluidas en la propuesta.

### Pro — 79 €/mes

Plan recomendado y principal motor comercial de Hostly. Pensado para un restaurante profesional que quiere controlar operación, costes, compras, equipo y carta desde una única herramienta.

Todo Básico más, en propuesta:

- inventario completo;
- escandallos y control de margen;
- proveedores, compras y recepciones;
- reservas avanzadas;
- análisis avanzado;
- RRHH, turnos, fichajes y documentación;
- importación de carta con IA;
- hasta 100 generaciones de imagen IA de producto al mes, una a una;
- hasta 5 importaciones de carta IA al mes;
- hasta 25 empleados;
- soporte prioritario.

### Ultra — 139 €/mes

Pensado para restaurantes de alto volumen, operaciones exigentes y grupos hosteleros que quieren aprovechar automatización, IA y visión multi-local.

Todo Pro más, en propuesta:

- hasta 500 generaciones de imagen IA al mes;
- generación de imágenes IA en lote;
- hasta 20 importaciones de carta IA al mes;
- empleados sin límite comercial;
- analítica consolidada multi-local;
- automatizaciones y alertas operativas;
- auditoría avanzada;
- funciones IA premium como maridaje y Sommelier IA;
- soporte prioritario.

## Criterio para IA y costes variables

Los números de IA de esta propuesta son límites comerciales iniciales, no promesas de uso ilimitado. Antes de activar cuotas reales deben medirse los costes efectivos por operación en producción y definir margen mínimo por plan.

La activación de cualquier prestación de coste variable debe cumplir:

1. coste unitario medido o acotado;
2. límite explícito por plan;
3. metering fiable y server-side;
4. comportamiento definido al alcanzar el límite;
5. upgrade o compra de capacidad adicional cuando proceda;
6. pruebas de carrera/idempotencia si el consumo se registra en Firestore.

## Infraestructura comercial preparada

Hostly dispone de un evaluador común en `lib/subscription/hostly-commercial-policy.ts` para que las futuras decisiones comerciales no se implementen de forma distinta en cada módulo.

El contrato permite expresar, por función y por plan:

- inclusión o exclusión;
- uso ilimitado;
- límites cuantitativos por día, mes o periodo de facturación;
- consumo ya realizado y uso restante;
- bloqueo por límite alcanzado;
- siguiente plan capaz de cubrir la función o el uso requerido.

La política tiene dos estados:

- `pending`: no aplica ningún bloqueo y conserva el comportamiento existente;
- `active`: aplica la asignación aprobada y, para límites cuantitativos, exige datos de uso fiables.

Una política activa con configuración incompleta falla de forma cerrada para evitar consumos de coste sin control. Una política pendiente o un plan todavía no asignado permanece en modo de compatibilidad y no desactiva funcionalidades existentes por accidente.

Este motor no sustituye los permisos por rol de usuario. Los permisos personales siguen viviendo en `lib/auth/hostly-capabilities.ts`; las políticas comerciales determinan únicamente lo contratado por el restaurante.

## Flujo para convertir propuesta en producto cobrado

No activar todos los límites a la vez. Para cada función comercial:

1. confirmar que el módulo existe y está estable en producción;
2. aprobar su asignación Básico/Pro/Ultra;
3. definir si el uso es ilimitado o medido;
4. convertir su política de `pending` a `active`;
5. aplicar guard server-side antes de la operación restringida;
6. usar la misma decisión para UI, mensaje de límite y upgrade;
7. añadir pruebas de acceso, límite y transición;
8. solo entonces conectar esa función a la página de planes y facturación.

## Facturación futura

La futura integración de cobro deberá modelar por separado:

- plan actual;
- periodicidad mensual/anual;
- periodo de prueba;
- precio contratado y moneda;
- promociones con fecha de inicio/fin;
- número de locales facturables;
- upgrades y downgrades con reglas de prorrateo;
- estado de pago;
- cancelación al final del periodo;
- histórico/auditoría de cambios comerciales.

Nunca se derivará el acceso únicamente del estado visual de una pantalla de pricing ni de datos controlables por cliente.

## Puntos todavía por validar antes del lanzamiento comercial

- coste real de IA por 100 y 500 imágenes/mes;
- coste de OCR/importación de cartas reales;
- coste de mensajería/telefonía cuando se activen automatizaciones externas;
- si 5 y 25 empleados generan el escalado comercial correcto;
- fiscalidad final de precios y textos de IVA según país;
- proveedor de pagos y costes de cobro de suscripciones;
- condiciones de soporte prioritario y SLA;
- política final para grupos de 10+ locales;
- precio de extras de IA si se decide permitir compras adicionales.

Hasta que esos puntos estén aprobados, la matriz V1 es una propuesta de negocio versionada, no una política de acceso automática.
