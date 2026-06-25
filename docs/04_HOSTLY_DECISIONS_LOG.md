# Hostly Decisions Log

> Registro de decisiones permanentes o de largo alcance.

**Estado:** oficial y acumulativo  
**Autoridad documental:** nivel 5  
**Regla:** no borrar decisiones antiguas; marcarlas como sustituidas y enlazar la nueva.

---

## Formato

Cada nueva decisión debe incluir:

- identificador;
- estado: propuesta, aceptada, sustituida o retirada;
- contexto;
- decisión;
- consecuencias;
- documentos y código relacionados.

---

## Decisiones aceptadas

### H-001 — Hostly es SaaS multi-restaurante

**Estado:** aceptada.

Hostly se diseña como SaaS B2B para múltiples restaurantes. Toda capacidad nueva debe
considerar aislamiento, permisos, coste y operación concurrente.

### H-002 — `restaurantId` es frontera de seguridad

**Estado:** aceptada.

`restaurantId` no es un filtro de interfaz. Determina el tenant de cada lectura,
escritura, listener, archivo y proceso servidor.

### H-003 — Operación y Configuración son módulos separados

**Estado:** aceptada.

Operación prioriza rapidez y continuidad del servicio. Configuración define estructura
y comportamiento. Una no debe convertirse en una segunda implementación de la otra.

### H-004 — Carta visible y producto interno son conceptos distintos

**Estado:** aceptada.

La carta representa lo que se vende y cómo se presenta. El producto interno puede
incluir receta, inventario, estación, coste y configuración no visible al cliente.

### H-005 — TPV y KDS son runtimes críticos

**Estado:** aceptada.

TPV, Cocina, Barra, Coctelería y Sala evolucionan mediante cambios pequeños,
caracterizados y verificables. No se reescriben durante limpiezas visuales.

### H-006 — Enviar no significa Marchar

**Estado:** aceptada.

Enviar registra y comunica la comanda. Marchar libera un pase o curso para producción.
No deben tratarse como la misma acción.

### H-007 — Hostly Design System v1 es contrato

**Estado:** aceptada.

Los componentes, tokens y patrones canónicos se reutilizan. No se crean variantes
locales equivalentes.

### H-008 — Geist es la tipografía principal

**Estado:** aceptada.

Geist es la familia visual de Hostly. Otras familias solo pueden actuar como fallback
compatible.

### H-009 — Asistente de Salas como flujo principal futuro

**Estado:** aceptada.

La creación inicial de espacios debe ser guiada. El usuario no debe enfrentarse primero
a un lienzo vacío.

### H-010 — Editor avanzado como herramienta secundaria

**Estado:** aceptada.

El editor existente se conserva para precisión y ajustes avanzados. No es la experiencia
recomendada para una primera configuración.

### H-011 — La IA propone y el humano confirma

**Estado:** aceptada.

La IA puede extraer, sugerir, ordenar y detectar. Nunca publica, cobra, elimina,
migra o confirma automáticamente.

### H-012 — No reescribir megacomponentes sin caracterización

**Estado:** aceptada.

El tamaño de un archivo no autoriza una reescritura. Primero se documentan contratos,
flujos, consumidores e invariantes.

### H-013 — Orden de modularización

**Estado:** aceptada.

El orden recomendado es:

1. presentación;
2. helpers puros;
3. estado;
4. persistencia.

No se mezclan estas fases en una única misión crítica.

### H-014 — La arquitectura canónica no amplía legacy

**Estado:** aceptada.

`restaurantes`, `usuarios`, `mesas` y localStorage operativo pueden mantenerse por
compatibilidad, pero ninguna funcionalidad nueva debe elegirlos como patrón por defecto.

### H-015 — Operación antes que decoración

**Estado:** aceptada.

Toda decisión visual debe responder primero a velocidad, comprensión, prevención de
errores y uso táctil.

---

## Decisiones pendientes de cierre

- Fuente única definitiva de stock y costes.
- Fecha/criterio para retirar catálogo legacy local.
- Política final de roles granulares en perfiles Firestore.
- Estrategia de fuentes locales para builds reproducibles.
- Contrato persistente de salida del Asistente de Salas.

