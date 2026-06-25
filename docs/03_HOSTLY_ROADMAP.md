# Hostly Roadmap

> Hoja de ruta técnica y de producto sin fechas artificiales.

**Estado:** vivo  
**Autoridad documental:** nivel 4  
**Regla:** cada misión debe ser pequeña, verificable y compatible con la arquitectura actual.

---

## Criterios de prioridad

- **CRÍTICO:** bloquea o pone en riesgo clientes reales.
- **ALTO:** reduce riesgo operativo o habilita crecimiento cercano.
- **MEDIO:** consolida calidad, mantenibilidad o experiencia.
- **BAJO:** mejora incremental sin riesgo operativo inmediato.

---

## Épica 1 — Hardening precomercial

### CRÍTICO

- Conseguir builds reproducibles sin depender de descargar Google Fonts.
- Mantener un smoke test obligatorio de login, TPV, KDS, cobro y cierre.
- Proteger o excluir rutas de diagnóstico en producción.
- Revisar logs de cliente y mensajes que puedan exponer contexto técnico.
- Definir criterios de “listo para cliente real”.

### ALTO

- Completar checklist de release y rollback.
- Medir incidencias y errores por módulo.
- Preparar restaurante de staging representativo.

---

## Épica 2 — Seguridad y multi-tenant

### CRÍTICO

- Auditar todas las APIs que aceptan `restaurantId` o `restauranteId`.
- Migrar endpoints sensibles al patrón de token verificado y tenant resuelto en servidor.
- Revisar qué campos pueden escribir los usuarios en sus perfiles.
- Confirmar roles reales existentes antes de modificar normalizaciones legacy.

### ALTO

- Definir una única política de autorización servidor.
- Añadir pruebas de aislamiento entre dos restaurantes.
- Revisar Storage y procesos IA con archivos de tenants distintos.

---

## Épica 3 — Firestore y localStorage

### CRÍTICO

- Declarar oficialmente el modelo canónico y las rutas legacy congeladas.
- Prohibir nuevo estado operativo persistente en localStorage.
- Separar preferencias UI locales de datos de negocio.

### ALTO

- Completar transición de catálogo central.
- Determinar la fuente canónica de stock, compras y escandallos.
- Medir lecturas/escrituras por servicio y dispositivo.

### MEDIO

- Planificar retirada de `restaurantes`, `usuarios`, `mesas` y otros mirrors solo
  cuando existan datos, consumidores y migración confirmados.

---

## Épica 4 — Modularización segura

### ALTO

- Caracterizar TPV antes de extraer responsabilidades.
- Extraer primero componentes presentacionales sin Firestore ni estado.
- Separar helpers puros y tipos después.
- Modularizar Productos y KDS con la misma disciplina.

### MEDIO

- Reducir páginas de más de 2.000 líneas por sesiones independientes.
- Tipar eventos globales y documentar emisores/receptores.

---

## Épica 5 — Consolidación visual pendiente

### MEDIO

- Migrar Login, Reservas, Análisis, Facturas y pantallas legacy al Design System.
- Reducir estilos inline seguros.
- Consolidar estados vacíos, errores, carga y permisos.
- Evitar nuevas clases locales que dupliquen tokens.

### BAJO

- Retirar aliases visuales deprecated cuando no tengan consumidores.

---

## Épica 6 — TPV/KDS Experience

### ALTO

- Validar TPV y KDS con personal de hostelería y escenarios de hora punta.
- Medir toques, tiempo de cobro y errores de comanda.
- Mejorar únicamente flujos observados, sin cambiar modelos por intuición.

### MEDIO

- Consolidar accesibilidad táctil.
- Reducir ambigüedad de estados.
- Mejorar recuperación ante pérdida de conexión.

---

## Épica 7 — Asistente de Salas

### MEDIO

- Cerrar el flujo completo en estado local.
- Dividir el asistente antes de que se convierta en megacomponente.
- Definir contrato de salida del asistente sin tocar aún FloorPlans.
- Diseñar revisión humana antes de cualquier publicación.

### BAJO

- Preparar IA de foto/plano como propuesta revisable.

---

## Épica 8 — IA aplicada

### ALTO

- Definir límites de coste, tamaño, frecuencia y reintentos.
- Mantener revisión humana en carta y facturas.
- Registrar fuente, warnings y confianza operacional.

### MEDIO

- Evaluar precisión con corpus representativo.
- Diseñar degradación cuando IA no esté disponible.
- Separar claramente demo/mock de extracción real.

---

## Épica 9 — Inventario, compras y escandallos

### ALTO

- Declarar fuente canónica de stock y costes.
- Evitar divergencia entre ledger central, movimientos legacy y localStorage.
- Garantizar idempotencia en recepciones y consumos.

### MEDIO

- Consolidar compras, recepciones, facturas y aliases.
- Aclarar qué cálculos son operativos y cuáles son estimaciones.
- Completar trazabilidad de coste.

---

## Épica 10 — Multi-restaurante y escalado

### ALTO

- Probar aislamiento, concurrencia y costes con múltiples tenants.
- Diseñar soporte, observabilidad y recuperación por restaurante.

### MEDIO

- Preparar gestión de varias ubicaciones sin romper la frontera tenant actual.
- Definir agregaciones y analítica sin listeners globales costosos.

### BAJO

- Automatizar informes internos de coste y salud por tenant.

---

## Regla de ejecución

No iniciar una épica de prioridad inferior si existe un riesgo crítico precomercial
sin propietario, criterio de cierre o validación.

