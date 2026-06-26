# Hostly Roadmap

> Hoja de ruta tÃ©cnica y de producto sin fechas artificiales.

**Estado:** vivo
**Autoridad documental:** nivel 4
**Regla:** cada misiÃ³n debe ser pequeÃ±a, verificable y compatible con la arquitectura actual.

---

## Criterios de prioridad

- **CRÃTICO:** bloquea o pone en riesgo clientes reales.
- **ALTO:** reduce riesgo operativo o habilita crecimiento cercano.
- **MEDIO:** consolida calidad, mantenibilidad o experiencia.
- **BAJO:** mejora incremental sin riesgo operativo inmediato.

---

## Ã‰pica 1 â€” Hardening precomercial

### CRÃTICO

- Conseguir builds reproducibles sin depender de descargar Google Fonts.
- Mantener un smoke test obligatorio de login, TPV, KDS, cobro y cierre.
- Proteger o excluir rutas de diagnÃ³stico en producciÃ³n.
- Revisar logs de cliente y mensajes que puedan exponer contexto tÃ©cnico.
- Definir criterios de â€œlisto para cliente realâ€.

### ALTO

- Completar checklist de release y rollback.
- Medir incidencias y errores por mÃ³dulo.
- Preparar restaurante de staging representativo.

---

## Ã‰pica 2 â€” Seguridad y multi-tenant

### CRÃTICO

- Auditar todas las APIs que aceptan `restaurantId` o `restauranteId`.
- Migrar endpoints sensibles al patrÃ³n de token verificado y tenant resuelto en servidor.
- Revisar quÃ© campos pueden escribir los usuarios en sus perfiles.
- Confirmar roles reales existentes antes de modificar normalizaciones legacy.

### ALTO

- Definir una Ãºnica polÃ­tica de autorizaciÃ³n servidor.
- AÃ±adir pruebas de aislamiento entre dos restaurantes.
- Revisar Storage y procesos IA con archivos de tenants distintos.

---

## Ã‰pica 3 â€” Firestore y localStorage

### CRÃTICO

- Declarar oficialmente el modelo canÃ³nico y las rutas legacy congeladas.
- Prohibir nuevo estado operativo persistente en localStorage.
- Separar preferencias UI locales de datos de negocio.

### ALTO

- Completar transiciÃ³n de catÃ¡logo central.
- Determinar la fuente canÃ³nica de stock, compras y escandallos.
- Medir lecturas/escrituras por servicio y dispositivo.

### MEDIO

- Planificar retirada de `restaurantes`, `usuarios`, `mesas` y otros mirrors solo
  cuando existan datos, consumidores y migraciÃ³n confirmados.

---

## Ã‰pica 4 â€” ModularizaciÃ³n segura

### ALTO

- Caracterizar TPV antes de extraer responsabilidades.
- Extraer primero componentes presentacionales sin Firestore ni estado.
- Separar helpers puros y tipos despuÃ©s.
- Modularizar Productos y KDS con la misma disciplina.

### MEDIO

- Reducir pÃ¡ginas de mÃ¡s de 2.000 lÃ­neas por sesiones independientes.
- Tipar eventos globales y documentar emisores/receptores.

---

## Ã‰pica 5 â€” ConsolidaciÃ³n visual pendiente

### MEDIO

- Migrar Login, Reservas, AnÃ¡lisis, Facturas y pantallas legacy al Design System.
- Reducir estilos inline seguros.
- Consolidar estados vacÃ­os, errores, carga y permisos.
- Evitar nuevas clases locales que dupliquen tokens.

### BAJO

- Retirar aliases visuales deprecated cuando no tengan consumidores.

---

## Ã‰pica 6 â€” TPV/KDS Experience

### ALTO

- Validar TPV y KDS con personal de hostelerÃ­a y escenarios de hora punta.
- Medir toques, tiempo de cobro y errores de comanda.
- Mejorar Ãºnicamente flujos observados, sin cambiar modelos por intuiciÃ³n.

### MEDIO

- Consolidar accesibilidad tÃ¡ctil.
- Reducir ambigÃ¼edad de estados.
- Mejorar recuperaciÃ³n ante pÃ©rdida de conexiÃ³n.

---

## Ã‰pica 7 â€” Asistente de Salas

### MEDIO

- Cerrar el flujo completo en estado local.
- Dividir el asistente antes de que se convierta en megacomponente.
- Definir contrato de salida del asistente sin tocar aÃºn FloorPlans.
- DiseÃ±ar revisiÃ³n humana antes de cualquier publicaciÃ³n.

### BAJO

- Preparar IA de foto/plano como propuesta revisable.

---

## Ã‰pica 8 â€” IA aplicada

### ALTO

- Definir lÃ­mites de coste, tamaÃ±o, frecuencia y reintentos.
- Mantener revisiÃ³n humana en carta y facturas.
- Registrar fuente, warnings y confianza operacional.

### MEDIO

- Evaluar precisiÃ³n con corpus representativo.
- DiseÃ±ar degradaciÃ³n cuando IA no estÃ© disponible.
- Separar claramente demo/mock de extracciÃ³n real.

---

## Ã‰pica 9 â€” Inventario, compras y escandallos

### ALTO

- Declarar fuente canÃ³nica de stock y costes.
- Evitar divergencia entre ledger central, movimientos legacy y localStorage.
- Garantizar idempotencia en recepciones y consumos.

### MEDIO

- Consolidar compras, recepciones, facturas y aliases.
- Aclarar quÃ© cÃ¡lculos son operativos y cuÃ¡les son estimaciones.
- Completar trazabilidad de coste.

---

## Ã‰pica 10 â€” Multi-restaurante y escalado

### ALTO

- Probar aislamiento, concurrencia y costes con mÃºltiples tenants.
- DiseÃ±ar soporte, observabilidad y recuperaciÃ³n por restaurante.

### MEDIO

- Preparar gestiÃ³n de varias ubicaciones sin romper la frontera tenant actual.
- Definir agregaciones y analÃ­tica sin listeners globales costosos.

### BAJO

- Automatizar informes internos de coste y salud por tenant.

---

## Regla de ejecuciÃ³n

No iniciar una Ã©pica de prioridad inferior si existe un riesgo crÃ­tico precomercial
sin propietario, criterio de cierre o validaciÃ³n.
