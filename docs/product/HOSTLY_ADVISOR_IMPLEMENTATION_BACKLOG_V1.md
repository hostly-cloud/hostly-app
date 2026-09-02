# HOSTLY — ADVISOR & PERSONALIZATION IMPLEMENTATION BACKLOG V1

Estado: ideas aprobadas para implementar más adelante. No tocar producción desde esta rama.

## Prioridad 1

### Hostly Setup Advisor
- Mostrar nivel de preparación del restaurante.
- Detectar productos sin imagen.
- Detectar productos sin destino cocina/barra.
- Detectar mesas sin capacidad/configuración.
- Detectar estaciones incompletas.
- Detectar configuración pendiente relevante.
- CTA directo para corregir cada punto.
- Enfoque útil, no punitivo.

### Recomendaciones inteligentes dentro de Hostly
- Bloque contextual con sugerencias basadas en uso real.
- Una recomendación principal por vez.
- Explicar por qué se propone.
- Llevar al usuario directamente a la acción.

### Onboarding adaptativo por tipo de negocio
- Restaurante con sala.
- Bar/cafetería.
- Beach club/terraza.
- Grupo de restauración.
- Prioridades, checklist y ejemplos diferentes según contexto.

## Prioridad 2

### Preparar temporada / Preparar servicio
- Asistente para revisar carta, precios, imágenes, categorías, terrazas, mesas, estaciones, empleados, reservas, stock y escandallos.
- Generar checklist personalizada.
- Especialmente relevante para negocios estacionales como Ibiza.
- Futuro CTA: “Prepáramelo”.

### Detección de funciones no utilizadas
- Detectar funciones incluidas en el plan pero apenas usadas.
- Mostrar explicación breve y contextual.
- CTA “Enséñame”.

### Plan recomendado según uso
- Mostrar si Básico sigue siendo suficiente.
- Recomendar Pro solo cuando haya razones concretas.
- Explicar qué funciones justifican el cambio.
- Evitar presión comercial genérica.

### Hitos del restaurante
- Primer servicio.
- Primer mes.
- 1.000 comandas.
- 100 reservas.
- Temporada completada.
- Presentación sobria y profesional.

## Prioridad 3

### Hostly Advisor
- Centro de atención proactiva.
- “Hostly ha encontrado 3 cosas que merecen tu atención.”
- Configuración, operación, rentabilidad y automatización.
- Explicar siempre la causa de cada recomendación.
- No ejecutar cambios críticos sin confirmación.

### Asistente contextual “¿Quieres que lo haga por ti?”
- Generar imágenes pendientes.
- Proponer reorganización de categorías.
- Preparar configuraciones seguras.
- Mostrar vista previa antes de aplicar cambios relevantes.

### Centro “Mejorar mi restaurante”
Agrupar recomendaciones en:
- Preparación.
- Operación.
- Rentabilidad.
- Automatización.

## Comunicaciones personalizadas conectadas al producto

### Regla global
Cada correo debe poder responder:

> “¿Por qué este restaurante recibe este mensaje precisamente ahora?”

### Ejemplos
- Productos sin imagen -> sugerir IA de imágenes.
- Uso frecuente de análisis -> recomendar funciones avanzadas relevantes.
- Función Pro intentada varias veces -> explicar esa función concreta.
- Configuración incompleta -> ayudar antes de vender.
- Cambio de temporada -> revisión personalizada de terraza, carta, equipo y configuración.

### Upsell Básico -> Pro
- No usar únicamente día 30.
- Combinar antigüedad + señales de uso.
- Una sola recomendación principal por email.
- Valor antes que precio.
- Puede decir “tu plan actual sigue siendo suficiente” cuando sea verdad.

## Filosofía de producto derivada

**Hostly no solo debe registrar lo que pasa en el restaurante. Debe ayudar a que el restaurante funcione cada vez mejor.**

**Hostly no espera a que algo esté mal para ayudarte. Te ayuda a dejarlo bien antes del servicio.**

## Reglas de implementación futura

- Mantener aislamiento absoluto por restaurantId.
- No usar datos de un restaurante para recomendaciones de otro.
- No exponer datos sensibles innecesariamente en emails.
- Explicar por qué se genera una recomendación.
- Evitar recomendaciones agresivas o constantes.
- No ejecutar acciones destructivas o críticas sin confirmación explícita.
- Priorizar utilidad real sobre monetización.
- Instrumentar eventos para medir si la recomendación aporta valor.
