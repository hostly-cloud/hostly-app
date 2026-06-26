# HOSTLY TECHNICAL DEBT

> Documento ejecutivo de deuda técnica y plan de ejecución progresivo de Hostly.

**Autoridad documental:** nivel 2. Este documento complementa a `01_HOSTLY_ARCHITECTURE_GUIDE.md`, `03_HOSTLY_ROADMAP.md` y `05_HOSTLY_STATE_AUDIT.md`.  
**Estado:** oficial  
**Versión:** 1.0  
**Ámbito:** deuda técnica de arquitectura, Firestore, rendimiento, seguridad, consistencia y escalabilidad

---

## 1. Introducción

La deuda técnica de Hostly no es un error aislado ni un indicador de mala calidad. Es la consecuencia normal de un producto SaaS que ya cubre operación real, múltiples módulos y varios runtimes sensibles.

En Hostly, la deuda técnica aparece principalmente cuando:

- una funcionalidad crece más rápido que su modularización;
- conviven patrones nuevos y legacy durante una transición;
- un módulo operativo prioriza velocidad de entrega sobre limpieza interna;
- un flujo táctico funciona correctamente, pero todavía no está preparado para escalar.

No toda deuda debe resolverse inmediatamente.

La prioridad no es “dejar el código perfecto”. La prioridad es:

1. proteger la operación del restaurante;
2. reducir riesgos en los módulos más sensibles;
3. mejorar el coste y la escalabilidad;
4. preparar el producto para crecer sin bloquear futuras misiones.

Este documento convierte la auditoría técnica existente en un plan de ejecución realista, incremental y compatible con la arquitectura actual de Hostly.

---

## 2. Clasificación

La deuda técnica se organiza en cuatro niveles:

- 🔴 **Crítico**: puede comprometer operación, coste, seguridad o escalabilidad a corto plazo.
- 🟠 **Alto**: no rompe hoy, pero ya está frenando velocidad de desarrollo o robustez del producto.
- 🟡 **Medio**: conviene resolverlo en ventanas planificadas antes de seguir ampliando alcance.
- 🟢 **Bajo**: deuda controlable, de ergonomía o consolidación, útil pero no urgente.

---

## 3. Deuda técnica priorizada

### 🔴 Crítico

#### 3.1 Megacomponentes en rutas y módulos core

- **Problema:** existen archivos con demasiadas responsabilidades mezcladas: UI, estado, Firestore, lógica de dominio, interacción táctil y flujos secundarios.
- **Impacto:** eleva el riesgo de regresión, ralentiza revisiones, dificulta onboarding técnico y vuelve inseguro cualquier cambio pequeño.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** alto, pero abordable por fases si se hace por responsabilidad y no por reescritura.
- **Prioridad:** máxima.
- **Cuándo resolverlo:** después del Asistente de Salas y antes de ampliar más módulos operativos.
- **Módulos afectados:** Carta, Editor Visual, Productos, Recepciones, KDS, Salas.
- **Solución mínima recomendada:** extraer primero helpers puros, constantes, transformadores de datos y subcomponentes presentacionales sin tocar el flujo general.
- **Riesgo de no hacerlo:** cada nueva iteración será más lenta, más cara y más frágil.

Archivos especialmente sensibles:

- `app/dashboard/carta/carta-page-content.tsx`
- `app/dashboard/config/mesas/page.tsx`
- `components/productos/productos-management-page.tsx`
- `app/dashboard/recepciones/page.tsx`
- `components/kds/order-items-board.tsx`
- `components/map/EditableFloorMap.tsx`

#### 3.2 Listeners Firestore amplios sobre colecciones calientes

- **Problema:** existen listeners en tiempo real sobre `orders`, `orderItems`, `tables` y `payments` con alcance amplio por restaurante.
- **Impacto:** aumenta lecturas, coste Firestore, re-renders, latencia percibida y complejidad operativa.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** máxima.
- **Cuándo resolverlo:** antes de escalar a 100 restaurantes activos.
- **Módulos afectados:** TPV, Cocina, Barra, Sala, Carta operativa, KDS.
- **Solución mínima recomendada:** revisar listener por listener, reducir superficie de consulta, separar vistas calientes de vistas históricas y endurecer límites, filtros y ciclos de vida.
- **Riesgo de no hacerlo:** crecimiento de coste por local, degradación del runtime y peor experiencia en horas punta.

#### 3.3 Convivencia prolongada de esquemas legacy y nuevos

- **Problema:** conviven rutas, colecciones y naming duplicados como `users/usuarios`, `tables/mesas`, `config/configuracion`, `products/productos`, `restaurants/restaurantes`.
- **Impacto:** duplica esfuerzo mental, favorece errores de consistencia y dificulta decisiones de arquitectura.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** medio-alto.
- **Prioridad:** máxima.
- **Cuándo resolverlo:** antes de la beta pública y antes de ampliar más integraciones.
- **Módulos afectados:** autenticación de perfiles, configuración, catálogo, operación, inventario, permisos.
- **Solución mínima recomendada:** congelar oficialmente el naming objetivo, documentar qué rutas siguen siendo compatibles legacy y evitar crear nuevos consumidores sobre las variantes antiguas.
- **Riesgo de no hacerlo:** la deuda deja de ser transición y pasa a convertirse en arquitectura permanente.

#### 3.4 Índices insuficientes para el volumen de consultas actual

- **Problema:** el número de índices compuestos visibles es bajo respecto a la variedad de queries detectadas.
- **Impacto:** riesgo de errores de consulta, degradación de rendimiento y dependencia de scans o soluciones parciales.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo-medio.
- **Prioridad:** muy alta.
- **Cuándo resolverlo:** antes de aumentar tráfico real y antes de lanzar beta pública.
- **Módulos afectados:** órdenes, order items, stock, actividad, snapshots, compras, reservas.
- **Solución mínima recomendada:** inventario de queries activas por dominio y alta de índices estrictamente necesarios, sin sobreindexar.
- **Riesgo de no hacerlo:** errores en producción bajo carga real y aumento de coste por consultas ineficientes.

---

### 🟠 Alto

#### 3.5 Exceso de Client Components

- **Problema:** hay una dependencia alta de `"use client"` incluso en zonas que podrían descargar parte del trabajo a capas más estables.
- **Impacto:** bundles más grandes, más trabajo en cliente y menor margen de optimización futura.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **Cuándo resolverlo:** después del Editor Visual y antes de optimización seria de rendimiento.
- **Módulos afectados:** dashboard, configuración, inventario, carta, editor.
- **Solución mínima recomendada:** revisar archivos de alto peso y separar presentaciones puras y shells donde sea seguro, sin tocar runtime sensible.
- **Riesgo de no hacerlo:** peor rendimiento percibido y mayor dificultad para introducir optimizaciones de App Router.

#### 3.6 Ausencia visible de lazy loading en módulos pesados

- **Problema:** no hay evidencia clara de carga diferida en componentes y pantallas especialmente grandes.
- **Impacto:** penaliza tiempo de carga inicial y hace que módulos secundarios pesen incluso cuando el usuario no los necesita.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **Cuándo resolverlo:** antes de optimizar experiencia en tablet y redes medias.
- **Módulos afectados:** Carta, Editor Visual, OCR/importación, análisis, KDS.
- **Solución mínima recomendada:** introducir lazy loading solo en zonas no críticas y visualmente desacopladas.
- **Riesgo de no hacerlo:** Hostly seguirá cargando demasiado trabajo demasiado pronto.

#### 3.7 Acoplamiento fuerte entre pantallas y acceso a datos

- **Problema:** varios módulos siguen resolviendo Firestore y lógica de transformación directamente dentro de páginas o megacomponentes.
- **Impacto:** más fragilidad, menos reutilización y mayor dificultad para auditar edge cases.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **Cuándo resolverlo:** después del Asistente de Salas y en paralelo a modularizaciones seguras.
- **Módulos afectados:** TPV, Carta, Mesas, Inventario, Productos.
- **Solución mínima recomendada:** extraer selectores, mapeadores y acceso a datos repetido a utilidades o repositorios existentes, sin reescribir flujos.
- **Riesgo de no hacerlo:** cada mejora funcional seguirá aumentando la deuda en vez de reducirla.

#### 3.8 CSS global demasiado grande

- **Problema:** `app/globals.css` ha crecido hasta absorber demasiadas reglas, excepciones y capas históricas.
- **Impacto:** aumenta complejidad visual, riesgo de colisiones y coste de mantenimiento del Design System.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **Cuándo resolverlo:** después del Editor Visual y tras estabilizar las pantallas más sensibles.
- **Módulos afectados:** toda la aplicación.
- **Solución mínima recomendada:** auditar bloques muertos o redundantes, mover solo lo seguro hacia tokens o componentes Hostly ya consolidados.
- **Riesgo de no hacerlo:** mayor fragilidad visual y más dificultad para mantener coherencia premium.

#### 3.9 Inconsistencias de naming en variables de entorno y restaurant scope

- **Problema:** existen señales de naming inconsistente como `RESTAURANT` frente a `RESTAURANTE`.
- **Impacto:** riesgo de fallback incorrecto, comportamiento distinto por entorno y diagnósticos difíciles.
- **Probabilidad:** media-alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** alta.
- **Cuándo resolverlo:** antes de beta pública.
- **Módulos afectados:** scoping de restaurante, configuración de entorno, runtime de servidor/cliente.
- **Solución mínima recomendada:** documentar el naming canónico y añadir normalización defensiva donde ya exista lectura de entorno.
- **Riesgo de no hacerlo:** fallos intermitentes difíciles de reproducir.

---

### 🟡 Medio

#### 3.10 Duplicidad de rutas funcionales y navegación histórica

- **Problema:** existen áreas que representan conceptos cercanos o idénticos con rutas distintas.
- **Impacto:** complica descubrimiento interno, mantenimiento y consistencia de navegación.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** media.
- **Cuándo resolverlo:** antes de consolidar definitivamente navegación comercial.
- **Módulos afectados:** configuración, mesas, usuarios, catálogo.
- **Solución mínima recomendada:** inventario de rutas activas y definición explícita de rutas canónicas sin eliminar compatibilidad todavía.
- **Riesgo de no hacerlo:** la estructura seguirá creciendo en paralelo en vez de converger.

#### 3.11 Logging técnico prescindible en cliente

- **Problema:** hay logs de diagnóstico en cliente sobre configuración Firebase.
- **Impacto:** ruido en consola, menor limpieza operativa y exposición innecesaria de señales internas.
- **Probabilidad:** media.
- **Coste de resolverlo:** bajo.
- **Prioridad:** media.
- **Cuándo resolverlo:** en una pasada de hardening previa a beta.
- **Módulos afectados:** bootstrap Firebase cliente.
- **Solución mínima recomendada:** reducir logging a entornos realmente necesarios o encapsularlo detrás de flags.
- **Riesgo de no hacerlo:** no rompe, pero empeora higiene técnica.

#### 3.12 Ausencia de una política visible de tamaño máximo por archivo

- **Problema:** el proyecto ha permitido crecer varios archivos hasta tamaños muy difíciles de gobernar.
- **Impacto:** deuda recurrente y revisiones de bajo rendimiento.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** media.
- **Cuándo resolverlo:** inmediatamente a nivel de criterio; progresivamente a nivel de ejecución.
- **Módulos afectados:** todo módulo nuevo o en crecimiento.
- **Solución mínima recomendada:** adoptar un umbral interno de alerta y obligar a modularización preventiva antes de superar tamaños críticos.
- **Riesgo de no hacerlo:** la deuda actual se repetirá en nuevas áreas.

#### 3.13 Preparación IA aún dependiente de contexto disperso

- **Problema:** la base para IA existe, pero el contexto de negocio aún está muy repartido entre componentes, queries y transformaciones locales.
- **Impacto:** encarece futuras funciones de IA y dificulta evaluaciones reproducibles.
- **Probabilidad:** media.
- **Coste de resolverlo:** medio.
- **Prioridad:** media.
- **Cuándo resolverlo:** después de estabilizar Editor Visual y antes de ampliar IA más allá de importaciones.
- **Módulos afectados:** OCR, importación de carta, asistentes, recomendaciones futuras.
- **Solución mínima recomendada:** formalizar contratos de contexto por dominio y centralizar transformaciones reutilizables.
- **Riesgo de no hacerlo:** las funciones de IA crecerán sobre terreno heterogéneo.

---

### 🟢 Bajo

#### 3.14 Meta de aplicación todavía genérica

- **Problema:** el metadata raíz mantiene valores de plantilla genéricos.
- **Impacto:** afecta percepción de producto y pulido técnico, no al runtime principal.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** baja.
- **Cuándo resolverlo:** en una pasada de calidad de producto previa a salida pública.
- **Módulos afectados:** layout global.
- **Solución mínima recomendada:** alinear metadata, títulos y descripciones con la identidad real de Hostly.
- **Riesgo de no hacerlo:** sensación de producto menos cerrado.

#### 3.15 Workflow CI aún muy focalizado

- **Problema:** el repositorio muestra automatización visible principalmente para evaluación de importación de carta.
- **Impacto:** cobertura operativa limitada para otras áreas críticas.
- **Probabilidad:** media.
- **Coste de resolverlo:** medio.
- **Prioridad:** baja-media.
- **Cuándo resolverlo:** antes de escalar ritmo de cambios concurrentes.
- **Módulos afectados:** todo el proyecto.
- **Solución mínima recomendada:** ampliar validaciones gradualmente empezando por checks ligeros y dominios sensibles.
- **Riesgo de no hacerlo:** más dependencia de revisión manual en un producto cada vez más amplio.

#### 3.16 Presencia de carpetas o capas experimentales no consolidadas

- **Problema:** existen restos o áreas no centrales para la arquitectura dominante, como `_legacy/` o `supabase/`.
- **Impacto:** genera ruido y posibles malentendidos para nuevos colaboradores.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo-medio.
- **Prioridad:** baja.
- **Cuándo resolverlo:** cuando exista inventario claro de uso real.
- **Módulos afectados:** arquitectura global y onboarding técnico.
- **Solución mínima recomendada:** documentar explícitamente qué es experimental, qué es legado y qué sigue vivo.
- **Riesgo de no hacerlo:** mayor confusión y decisiones inconsistentes.

---

## 4. Roadmap técnico

### Después del Asistente de Salas

- congelar naming objetivo de rutas, colecciones y perfiles;
- inventariar listeners Firestore por módulo operativo;
- extraer lógica segura de megacomponentes ya tocados recientemente;
- documentar límites de tamaño y criterios de modularización.

### Después del Editor Visual

- reducir acoplamientos directos entre página, editor y seed;
- introducir modularización segura en `EditableFloorMap` y flujos auxiliares;
- empezar saneamiento de `globals.css`;
- revisar `use client` y detectar oportunidades de separación sin tocar runtime delicado.

### Después de IA

- formalizar contratos de contexto por dominio;
- consolidar pipelines de importación y evaluación;
- aislar helpers de transformación reutilizables para futuras funciones asistidas;
- evitar que la IA dependa de rutas o esquemas legacy.

### Antes de lanzar beta pública

- revisar naming de variables de entorno y restaurant scope;
- endurecer índices Firestore necesarios;
- reducir logging técnico innecesario en cliente;
- documentar oficialmente colecciones canónicas y legacy soportado;
- revisar reglas Firebase y Storage con foco de producto comercial.

### Antes de escalar a 100 restaurantes

- reducir listeners amplios en órdenes, pagos y producción;
- separar vistas calientes de vistas históricas;
- medir coste de lecturas por flujo operativo;
- cerrar los primeros megacomponentes más críticos por fases mínimas.

### Antes de escalar a 500 restaurantes

- consolidar definitivamente el modelo de datos canónico;
- reducir drásticamente duplicidad conceptual de colecciones y rutas;
- introducir carga diferida en módulos pesados;
- ampliar validaciones automatizadas para áreas críticas.

### Antes de escalar a 1000 restaurantes

- asegurar que ningún runtime sensible dependa de listeners demasiado amplios;
- terminar la transición fuera de naming y schemas legacy;
- establecer presupuesto técnico por módulo: bundle, listeners, índices y tamaño de archivos;
- revisar capacidad operativa global del producto como plataforma multi-restaurante real.

---

## 5. Checklist permanente

Utilizar esta checklist en futuras auditorías o antes de iniciar cambios relevantes.

### Arquitectura

- [ ] ¿Existen archivos por encima del umbral interno de complejidad?
- [ ] ¿Se están mezclando UI, persistencia y lógica de negocio en el mismo archivo?
- [ ] ¿Se está creando una nueva duplicidad de rutas, naming o colecciones?
- [ ] ¿Se está tocando un megacomponente sin aislar primero el cambio?

### Firestore

- [ ] ¿Cada query está claramente acotada por `restaurantId`?
- [ ] ¿Existe algún listener amplio sobre colecciones calientes?
- [ ] ¿La consulta requiere índice compuesto no documentado?
- [ ] ¿La nueva lectura puede crecer de forma peligrosa con el número de restaurantes?
- [ ] ¿Se está ampliando legacy en vez de migrar hacia el modelo canónico?

### Next.js y frontend

- [ ] ¿El archivo necesita realmente `"use client"`?
- [ ] ¿Existe oportunidad segura de lazy loading?
- [ ] ¿La página está empujando demasiado trabajo al cliente?
- [ ] ¿Se está manteniendo una separación razonable entre shell y componentes interactivos?

### UI, UX y Design System

- [ ] ¿La pantalla reutiliza el Hostly Design System?
- [ ] ¿Se están añadiendo estilos globales cuando debería usarse un componente existente?
- [ ] ¿La navegación sigue el patrón oficial de Hostly?
- [ ] ¿La interacción es táctil, clara y consistente?
- [ ] ¿La UX ahorra tiempo real durante un servicio?

### Seguridad

- [ ] ¿Las Firebase Rules siguen protegiendo el caso nuevo?
- [ ] ¿Storage mantiene aislamiento por tenant?
- [ ] ¿Las variables de entorno están nombradas de forma consistente?
- [ ] ¿Hay logging técnico innecesario en cliente o rutas sensibles?

### Rendimiento y escalabilidad

- [ ] ¿El cambio aumenta lecturas Firestore por pantalla?
- [ ] ¿El bundle o el CSS global crecen innecesariamente?
- [ ] ¿Se está ampliando un archivo ya demasiado grande?
- [ ] ¿El módulo seguiría funcionando igual con 10 veces más datos?

### Calidad general

- [ ] ¿Existen duplicaciones evidentes que deberían resolverse antes de seguir?
- [ ] ¿El cambio crea deuda nueva o reduce deuda existente?
- [ ] ¿La solución mínima respeta la arquitectura actual?
- [ ] ¿El riesgo de tocarlo es menor que el riesgo de dejarlo igual?

---

## Regla final

La deuda técnica de Hostly debe gestionarse como un backlog estratégico, no como una cruzada estética.

Primero se corrige lo que:

1. protege al restaurante;
2. reduce riesgo operativo;
3. evita costes crecientes;
4. prepara la siguiente etapa del producto.

Todo lo demás debe abordarse solo cuando exista una ventana clara y una misión acotada.
