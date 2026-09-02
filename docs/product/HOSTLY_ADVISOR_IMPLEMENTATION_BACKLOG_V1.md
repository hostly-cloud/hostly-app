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

## Política de calma: ayudar sin saturar

Hostly Advisor no debe comportarse como un sistema de notificaciones constante. La ayuda debe estar disponible y ser proactiva cuando aporta valor, pero permanecer silenciosa cuando el gerente está conforme.

### Principio

> **Hostly sugiere. El restaurante decide cuánto quiere que le ayuden.**

### Niveles de visibilidad

#### 1. Crítico
Solo para incidencias que puedan afectar al servicio, seguridad, cobro o funcionamiento esencial.
- Puede usar aviso visible.
- No se mezcla con recomendaciones comerciales.
- Debe ser poco frecuente y accionable.

#### 2. Importante
Mejoras con impacto operativo claro pero no urgentes.
- Se agrupan en un único bloque de “Merece tu atención”.
- No usar popups repetitivos.
- Máximo una interrupción visible hasta que cambie la situación.

#### 3. Sugerencia
Optimización, configuración, aprendizaje o funciones recomendadas.
- Se muestran en el centro Advisor, dashboard o pantalla relacionada.
- No generan notificación push por defecto.
- No requieren badge rojo ni sensación de error.

#### 4. Descubrimiento
Consejos, funciones no utilizadas, hitos, Pro y nuevas capacidades.
- Completamente no intrusivos.
- Aparecen solo en espacios apropiados o mediante email autorizado.

### Controles para gerente

Debe existir una preferencia simple de ayuda, por ejemplo:
- **Solo avisos importantes**
- **Ayuda equilibrada** — recomendado
- **Quiero que Hostly me ayude a optimizar**

Además:
- “No volver a sugerirme esto”.
- “Recordármelo más adelante”.
- “Estoy conforme con esta configuración”.
- Silenciar una categoría concreta de recomendaciones.

Las decisiones de silencio deben recordarse por restaurantId y respetarse en futuras recomendaciones equivalentes.

### Presupuesto de atención

- No mostrar varias tarjetas nuevas a la vez si no son críticas.
- Agrupar recomendaciones relacionadas.
- Priorizar por impacto y relevancia.
- Si hay 15 posibles mejoras, enseñar primero 1–3.
- No repetir una recomendación descartada salvo que la situación cambie de forma material.
- Evitar interrumpir durante horas de servicio con sugerencias no urgentes.
- Preferir un resumen periódico frente a múltiples avisos separados.

### Contexto por rol

El camarero no debe recibir recomendaciones de gestión que no necesita.

- Empleado operativo: solo información necesaria para ejecutar su trabajo.
- Manager/encargado: configuración y operación relevante.
- Propietario/admin: visión completa, rentabilidad, plan y mejoras estructurales.

### Estado “Estoy conforme”

Un restaurante puede decidir que una configuración incompleta es intencionada. Hostly debe permitir marcarla como aceptada.

Ejemplo:
“8 productos no tienen imagen.”
Acciones:
- Añadir imágenes
- Más tarde
- **Está bien así**

Una vez elegido “Está bien así”, deja de aparecer como problema salvo que el usuario lo reactive o cambie el contexto.

### Diseño visual

- Recomendaciones: tonos neutros/azules, no rojos.
- Rojo solo para verdaderos problemas críticos.
- Sin contadores enormes de pendientes.
- Mensajes breves y concretos.
- Mostrar beneficio, no culpa.

No decir:
“Tu configuración está incompleta.”

Preferir:
“Hay 2 cosas que podrías mejorar antes del próximo servicio.”

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

**La mejor ayuda de Hostly también sabe cuándo quedarse en silencio.**

## Reglas de implementación futura

- Mantener aislamiento absoluto por restaurantId.
- No usar datos de un restaurante para recomendaciones de otro.
- No exponer datos sensibles innecesariamente en emails.
- Explicar por qué se genera una recomendación.
- Evitar recomendaciones agresivas o constantes.
- Respetar preferencias y silencios del restaurante.
- No ejecutar acciones destructivas o críticas sin confirmación explícita.
- Priorizar utilidad real sobre monetización.
- Instrumentar eventos para medir si la recomendación aporta valor.
