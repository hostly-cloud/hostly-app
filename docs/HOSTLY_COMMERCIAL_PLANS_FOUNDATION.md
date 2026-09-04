# Hostly Commercial Plans Foundation

**Estado:** activo como fundamento comercial; contenido y precios pendientes.

Hostly reconoce tres planes comerciales estables, en este orden:

1. Básico (`basic`)
2. Pro (`pro`)
3. Ultra (`ultra`)

## Decisión de producto

Los tres planes se crean ahora como identidades comerciales reales, pero Hostly no cerrará todavía la matriz definitiva de funcionalidades, límites ni precios de cada uno.

La asignación final se realizará cuando el producto esté suficientemente terminado y se pueda evaluar el conjunto completo de módulos, costes operativos, valor para el restaurante y diferenciación comercial sin tomar decisiones prematuras.

## Reglas durante el desarrollo

- No asignar nuevas funcionalidades a Básico, Pro o Ultra solo porque se implemente una capacidad nueva.
- No fijar precios provisionales en componentes, contratos o políticas técnicas.
- No usar el plan para limitar TPV, KDS, Reservas, Análisis u otros módulos salvo decisión comercial explícita posterior.
- Mantener `restaurants/{restaurantId}.subscription.plan` como identificador canónico del plan del restaurante.
- Mantener separados el concepto de plan comercial y los roles/permisos de usuarios del restaurante.
- Las restricciones de imágenes ya implementadas se conservan por compatibilidad con el trabajo existente, pero no constituyen la matriz comercial definitiva de Hostly.

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

## Activación futura de una prestación

Cuando se apruebe comercialmente una función concreta:

1. definir su política con asignaciones explícitas para Básico, Pro y Ultra;
2. marcarla como `active`;
3. conectar el guard del servidor antes de cualquier operación con coste o acceso restringido;
4. usar la misma decisión para presentar límites y propuesta de upgrade en la interfaz;
5. añadir pruebas de acceso, límite alcanzado, configuración incompleta y transición entre planes.

No se debe inferir ninguna asignación ni precio a partir de la mera existencia de este motor.

## Fase posterior

Cuando Hostly esté funcionalmente cerrado se realizará una revisión comercial específica para decidir:

- qué funciones incluye cada plan;
- límites y cuotas;
- costes de IA y automatizaciones;
- precios mensuales/anuales;
- pruebas, upgrades y downgrades;
- integración de facturación y cobros.

Hasta esa revisión, `featureAssignmentStatus` y `pricingStatus` permanecen en `pending` para los tres planes.
