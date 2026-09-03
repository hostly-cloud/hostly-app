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

## Fase posterior

Cuando Hostly esté funcionalmente cerrado se realizará una revisión comercial específica para decidir:

- qué funciones incluye cada plan;
- límites y cuotas;
- costes de IA y automatizaciones;
- precios mensuales/anuales;
- pruebas, upgrades y downgrades;
- integración de facturación y cobros.

Hasta esa revisión, `featureAssignmentStatus` y `pricingStatus` permanecen en `pending` para los tres planes.
