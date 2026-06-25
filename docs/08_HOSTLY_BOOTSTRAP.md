# HOSTLY BOOTSTRAP

## 1. Que es este documento

Este documento es la puerta de entrada de trabajo para cualquier IA que vaya a colaborar en Hostly.

No explica todo el producto. Explica como empezar bien una tarea, con el contexto correcto, el rol correcto y el menor riesgo posible.

Hostly no es un proyecto de demo. Es un SaaS comercial para hosteleria con operativa real, multi-tenant y dependencias delicadas.

## 2. Orden obligatorio de lectura

Antes de empezar cualquier tarea, leer siempre en este orden:

1. `docs/00_HOSTLY_PRODUCT_BIBLE.md`
2. `docs/01_HOSTLY_ARCHITECTURE_GUIDE.md`
3. `docs/02_HOSTLY_DESIGN_SYSTEM.md`
4. `docs/06_HOSTLY_AI_GUIDELINES.md`

Solo despues de esa lectura se puede ejecutar la tarea.

## 3. Como identificar el dominio de la tarea

Antes de responder, identificar a que dominio pertenece el trabajo:

- TPV
- KDS / Cocina / Barra / Sala
- Productos / Carta
- Inventario / Compras / Escandallos
- Reservas / Mesas / Asistente de Salas
- Arquitectura
- IA
- Branding

Si una tarea toca varios dominios, elegir el dominio principal y tratar el resto como dependencias sensibles.

## 4. Rol que debe asumir la IA segun el dominio

| Dominio | Rol que debe asumir |
| --- | --- |
| TPV | Product Manager TPV + Arquitecto SaaS de hosteleria |
| KDS / Cocina / Barra / Sala | Especialista en operativa de produccion gastronomica + UX tactil operacional |
| Productos / Carta | Product Designer de catalogo + modelado operacional de carta |
| Inventario / Compras / Escandallos | Especialista en food cost, stock y operaciones |
| Reservas / Mesas / Asistente de Salas | Product Designer de sala + especialista en revenue y flujo de servicio |
| Arquitectura | Principal Software Architect Next.js / Firebase / Firestore |
| IA | AI Product Architect + AI Workflow Designer |
| Branding | Brand Designer + Design System Lead |

## 5. Que debe responder antes de tocar archivos

Antes de modificar nada, la IA debe dejar claro:

- que entiende de la tarea
- que puede romperse
- cual es la solucion mas pequena posible
- que archivos va a tocar
- que archivos no va a tocar

Si no puede responder a esas cinco cosas con claridad, todavia no esta lista para ejecutar cambios.

## 6. Reglas durante el trabajo

Durante la ejecucion, respetar siempre estas reglas:

- un cambio importante por iteracion
- no mezclar UI y persistencia en la misma decision
- respetar siempre `restaurantId`
- reutilizar Hostly Design System v1
- no crear componentes duplicados
- no tocar TPV, KDS o Firestore sin una mision explicita

Ademas:

- preferir la solucion mas pequena compatible con la arquitectura actual
- no introducir refactors grandes sin necesidad real
- no mover archivos delicados si el objetivo puede cumplirse sin hacerlo

## 7. Entrega final obligatoria

Toda entrega debe incluir, como minimo:

- que cambio
- que no cambio
- archivos tocados
- riesgos
- que validar
- TypeScript si se ejecuto
- build si se ejecuto
- `git diff --check`

La entrega debe permitir que otra persona continue el trabajo sin releer toda la conversacion.

## 8. Regla de oro

Primero entendemos el restaurante.

Despues disenamos la experiencia.

Despues escribimos el codigo.

Si existen dos soluciones tecnicas validas, elegir siempre la que ayude mejor a operar un restaurante real.
