# HOSTLY TECHNICAL DEBT

> Documento ejecutivo de deuda tÃ©cnica y plan de ejecuciÃ³n progresivo de Hostly.

**Autoridad documental:** nivel 2. Este documento complementa a `01_HOSTLY_ARCHITECTURE_GUIDE.md`, `03_HOSTLY_ROADMAP.md` y `05_HOSTLY_STATE_AUDIT.md`.
**Estado:** oficial
**VersiÃ³n:** 1.0
**Ãmbito:** deuda tÃ©cnica de arquitectura, Firestore, rendimiento, seguridad, consistencia y escalabilidad

---

## 1. IntroducciÃ³n

La deuda tÃ©cnica de Hostly no es un error aislado ni un indicador de mala calidad. Es la consecuencia normal de un producto SaaS que ya cubre operaciÃ³n real, mÃºltiples mÃ³dulos y varios runtimes sensibles.

En Hostly, la deuda tÃ©cnica aparece principalmente cuando:

- una funcionalidad crece mÃ¡s rÃ¡pido que su modularizaciÃ³n;
- conviven patrones nuevos y legacy durante una transiciÃ³n;
- un mÃ³dulo operativo prioriza velocidad de entrega sobre limpieza interna;
- un flujo tÃ¡ctico funciona correctamente, pero todavÃ­a no estÃ¡ preparado para escalar.

No toda deuda debe resolverse inmediatamente.

La prioridad no es â€œdejar el cÃ³digo perfectoâ€. La prioridad es:

1. proteger la operaciÃ³n del restaurante;
2. reducir riesgos en los mÃ³dulos mÃ¡s sensibles;
3. mejorar el coste y la escalabilidad;
4. preparar el producto para crecer sin bloquear futuras misiones.

Este documento convierte la auditorÃ­a tÃ©cnica existente en un plan de ejecuciÃ³n realista, incremental y compatible con la arquitectura actual de Hostly.

---

## 2. ClasificaciÃ³n

La deuda tÃ©cnica se organiza en cuatro niveles:

- ðŸ”´ **CrÃ­tico**: puede comprometer operaciÃ³n, coste, seguridad o escalabilidad a corto plazo.
- ðŸŸ  **Alto**: no rompe hoy, pero ya estÃ¡ frenando velocidad de desarrollo o robustez del producto.
- ðŸŸ¡ **Medio**: conviene resolverlo en ventanas planificadas antes de seguir ampliando alcance.
- ðŸŸ¢ **Bajo**: deuda controlable, de ergonomÃ­a o consolidaciÃ³n, Ãºtil pero no urgente.

---

## 3. Deuda tÃ©cnica priorizada

### ðŸ”´ CrÃ­tico

#### 3.1 Megacomponentes en rutas y mÃ³dulos core

- **Problema:** existen archivos con demasiadas responsabilidades mezcladas: UI, estado, Firestore, lÃ³gica de dominio, interacciÃ³n tÃ¡ctil y flujos secundarios.
- **Impacto:** eleva el riesgo de regresiÃ³n, ralentiza revisiones, dificulta onboarding tÃ©cnico y vuelve inseguro cualquier cambio pequeÃ±o.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** alto, pero abordable por fases si se hace por responsabilidad y no por reescritura.
- **Prioridad:** mÃ¡xima.
- **CuÃ¡ndo resolverlo:** despuÃ©s del Asistente de Salas y antes de ampliar mÃ¡s mÃ³dulos operativos.
- **MÃ³dulos afectados:** Carta, Editor Visual, Productos, Recepciones, KDS, Salas.
- **SoluciÃ³n mÃ­nima recomendada:** extraer primero helpers puros, constantes, transformadores de datos y subcomponentes presentacionales sin tocar el flujo general.
- **Riesgo de no hacerlo:** cada nueva iteraciÃ³n serÃ¡ mÃ¡s lenta, mÃ¡s cara y mÃ¡s frÃ¡gil.

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
- **Prioridad:** mÃ¡xima.
- **CuÃ¡ndo resolverlo:** antes de escalar a 100 restaurantes activos.
- **MÃ³dulos afectados:** TPV, Cocina, Barra, Sala, Carta operativa, KDS.
- **SoluciÃ³n mÃ­nima recomendada:** revisar listener por listener, reducir superficie de consulta, separar vistas calientes de vistas histÃ³ricas y endurecer lÃ­mites, filtros y ciclos de vida.
- **Riesgo de no hacerlo:** crecimiento de coste por local, degradaciÃ³n del runtime y peor experiencia en horas punta.

#### 3.3 Convivencia prolongada de esquemas legacy y nuevos

- **Problema:** conviven rutas, colecciones y naming duplicados como `users/usuarios`, `tables/mesas`, `config/configuracion`, `products/productos`, `restaurants/restaurantes`.
- **Impacto:** duplica esfuerzo mental, favorece errores de consistencia y dificulta decisiones de arquitectura.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** medio-alto.
- **Prioridad:** mÃ¡xima.
- **CuÃ¡ndo resolverlo:** antes de la beta pÃºblica y antes de ampliar mÃ¡s integraciones.
- **MÃ³dulos afectados:** autenticaciÃ³n de perfiles, configuraciÃ³n, catÃ¡logo, operaciÃ³n, inventario, permisos.
- **SoluciÃ³n mÃ­nima recomendada:** congelar oficialmente el naming objetivo, documentar quÃ© rutas siguen siendo compatibles legacy y evitar crear nuevos consumidores sobre las variantes antiguas.
- **Riesgo de no hacerlo:** la deuda deja de ser transiciÃ³n y pasa a convertirse en arquitectura permanente.

#### 3.4 Ãndices insuficientes para el volumen de consultas actual

- **Problema:** el nÃºmero de Ã­ndices compuestos visibles es bajo respecto a la variedad de queries detectadas.
- **Impacto:** riesgo de errores de consulta, degradaciÃ³n de rendimiento y dependencia de scans o soluciones parciales.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo-medio.
- **Prioridad:** muy alta.
- **CuÃ¡ndo resolverlo:** antes de aumentar trÃ¡fico real y antes de lanzar beta pÃºblica.
- **MÃ³dulos afectados:** Ã³rdenes, order items, stock, actividad, snapshots, compras, reservas.
- **SoluciÃ³n mÃ­nima recomendada:** inventario de queries activas por dominio y alta de Ã­ndices estrictamente necesarios, sin sobreindexar.
- **Riesgo de no hacerlo:** errores en producciÃ³n bajo carga real y aumento de coste por consultas ineficientes.

---

### ðŸŸ  Alto

#### 3.5 Exceso de Client Components

- **Problema:** hay una dependencia alta de `"use client"` incluso en zonas que podrÃ­an descargar parte del trabajo a capas mÃ¡s estables.
- **Impacto:** bundles mÃ¡s grandes, mÃ¡s trabajo en cliente y menor margen de optimizaciÃ³n futura.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **CuÃ¡ndo resolverlo:** despuÃ©s del Editor Visual y antes de optimizaciÃ³n seria de rendimiento.
- **MÃ³dulos afectados:** dashboard, configuraciÃ³n, inventario, carta, editor.
- **SoluciÃ³n mÃ­nima recomendada:** revisar archivos de alto peso y separar presentaciones puras y shells donde sea seguro, sin tocar runtime sensible.
- **Riesgo de no hacerlo:** peor rendimiento percibido y mayor dificultad para introducir optimizaciones de App Router.

#### 3.6 Ausencia visible de lazy loading en mÃ³dulos pesados

- **Problema:** no hay evidencia clara de carga diferida en componentes y pantallas especialmente grandes.
- **Impacto:** penaliza tiempo de carga inicial y hace que mÃ³dulos secundarios pesen incluso cuando el usuario no los necesita.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **CuÃ¡ndo resolverlo:** antes de optimizar experiencia en tablet y redes medias.
- **MÃ³dulos afectados:** Carta, Editor Visual, OCR/importaciÃ³n, anÃ¡lisis, KDS.
- **SoluciÃ³n mÃ­nima recomendada:** introducir lazy loading solo en zonas no crÃ­ticas y visualmente desacopladas.
- **Riesgo de no hacerlo:** Hostly seguirÃ¡ cargando demasiado trabajo demasiado pronto.

#### 3.7 Acoplamiento fuerte entre pantallas y acceso a datos

- **Problema:** varios mÃ³dulos siguen resolviendo Firestore y lÃ³gica de transformaciÃ³n directamente dentro de pÃ¡ginas o megacomponentes.
- **Impacto:** mÃ¡s fragilidad, menos reutilizaciÃ³n y mayor dificultad para auditar edge cases.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **CuÃ¡ndo resolverlo:** despuÃ©s del Asistente de Salas y en paralelo a modularizaciones seguras.
- **MÃ³dulos afectados:** TPV, Carta, Mesas, Inventario, Productos.
- **SoluciÃ³n mÃ­nima recomendada:** extraer selectores, mapeadores y acceso a datos repetido a utilidades o repositorios existentes, sin reescribir flujos.
- **Riesgo de no hacerlo:** cada mejora funcional seguirÃ¡ aumentando la deuda en vez de reducirla.

#### 3.8 CSS global demasiado grande

- **Problema:** `app/globals.css` ha crecido hasta absorber demasiadas reglas, excepciones y capas histÃ³ricas.
- **Impacto:** aumenta complejidad visual, riesgo de colisiones y coste de mantenimiento del Design System.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** alta.
- **CuÃ¡ndo resolverlo:** despuÃ©s del Editor Visual y tras estabilizar las pantallas mÃ¡s sensibles.
- **MÃ³dulos afectados:** toda la aplicaciÃ³n.
- **SoluciÃ³n mÃ­nima recomendada:** auditar bloques muertos o redundantes, mover solo lo seguro hacia tokens o componentes Hostly ya consolidados.
- **Riesgo de no hacerlo:** mayor fragilidad visual y mÃ¡s dificultad para mantener coherencia premium.

#### 3.9 Inconsistencias de naming en variables de entorno y restaurant scope

- **Problema:** existen seÃ±ales de naming inconsistente como `RESTAURANT` frente a `RESTAURANTE`.
- **Impacto:** riesgo de fallback incorrecto, comportamiento distinto por entorno y diagnÃ³sticos difÃ­ciles.
- **Probabilidad:** media-alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** alta.
- **CuÃ¡ndo resolverlo:** antes de beta pÃºblica.
- **MÃ³dulos afectados:** scoping de restaurante, configuraciÃ³n de entorno, runtime de servidor/cliente.
- **SoluciÃ³n mÃ­nima recomendada:** documentar el naming canÃ³nico y aÃ±adir normalizaciÃ³n defensiva donde ya exista lectura de entorno.
- **Riesgo de no hacerlo:** fallos intermitentes difÃ­ciles de reproducir.

---

### ðŸŸ¡ Medio

#### 3.10 Duplicidad de rutas funcionales y navegaciÃ³n histÃ³rica

- **Problema:** existen Ã¡reas que representan conceptos cercanos o idÃ©nticos con rutas distintas.
- **Impacto:** complica descubrimiento interno, mantenimiento y consistencia de navegaciÃ³n.
- **Probabilidad:** alta.
- **Coste de resolverlo:** medio.
- **Prioridad:** media.
- **CuÃ¡ndo resolverlo:** antes de consolidar definitivamente navegaciÃ³n comercial.
- **MÃ³dulos afectados:** configuraciÃ³n, mesas, usuarios, catÃ¡logo.
- **SoluciÃ³n mÃ­nima recomendada:** inventario de rutas activas y definiciÃ³n explÃ­cita de rutas canÃ³nicas sin eliminar compatibilidad todavÃ­a.
- **Riesgo de no hacerlo:** la estructura seguirÃ¡ creciendo en paralelo en vez de converger.

#### 3.11 Logging tÃ©cnico prescindible en cliente

- **Problema:** hay logs de diagnÃ³stico en cliente sobre configuraciÃ³n Firebase.
- **Impacto:** ruido en consola, menor limpieza operativa y exposiciÃ³n innecesaria de seÃ±ales internas.
- **Probabilidad:** media.
- **Coste de resolverlo:** bajo.
- **Prioridad:** media.
- **CuÃ¡ndo resolverlo:** en una pasada de hardening previa a beta.
- **MÃ³dulos afectados:** bootstrap Firebase cliente.
- **SoluciÃ³n mÃ­nima recomendada:** reducir logging a entornos realmente necesarios o encapsularlo detrÃ¡s de flags.
- **Riesgo de no hacerlo:** no rompe, pero empeora higiene tÃ©cnica.

#### 3.12 Ausencia de una polÃ­tica visible de tamaÃ±o mÃ¡ximo por archivo

- **Problema:** el proyecto ha permitido crecer varios archivos hasta tamaÃ±os muy difÃ­ciles de gobernar.
- **Impacto:** deuda recurrente y revisiones de bajo rendimiento.
- **Probabilidad:** muy alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** media.
- **CuÃ¡ndo resolverlo:** inmediatamente a nivel de criterio; progresivamente a nivel de ejecuciÃ³n.
- **MÃ³dulos afectados:** todo mÃ³dulo nuevo o en crecimiento.
- **SoluciÃ³n mÃ­nima recomendada:** adoptar un umbral interno de alerta y obligar a modularizaciÃ³n preventiva antes de superar tamaÃ±os crÃ­ticos.
- **Riesgo de no hacerlo:** la deuda actual se repetirÃ¡ en nuevas Ã¡reas.

#### 3.13 PreparaciÃ³n IA aÃºn dependiente de contexto disperso

- **Problema:** la base para IA existe, pero el contexto de negocio aÃºn estÃ¡ muy repartido entre componentes, queries y transformaciones locales.
- **Impacto:** encarece futuras funciones de IA y dificulta evaluaciones reproducibles.
- **Probabilidad:** media.
- **Coste de resolverlo:** medio.
- **Prioridad:** media.
- **CuÃ¡ndo resolverlo:** despuÃ©s de estabilizar Editor Visual y antes de ampliar IA mÃ¡s allÃ¡ de importaciones.
- **MÃ³dulos afectados:** OCR, importaciÃ³n de carta, asistentes, recomendaciones futuras.
- **SoluciÃ³n mÃ­nima recomendada:** formalizar contratos de contexto por dominio y centralizar transformaciones reutilizables.
- **Riesgo de no hacerlo:** las funciones de IA crecerÃ¡n sobre terreno heterogÃ©neo.

---

### ðŸŸ¢ Bajo

#### 3.14 Meta de aplicaciÃ³n todavÃ­a genÃ©rica

- **Problema:** el metadata raÃ­z mantiene valores de plantilla genÃ©ricos.
- **Impacto:** afecta percepciÃ³n de producto y pulido tÃ©cnico, no al runtime principal.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo.
- **Prioridad:** baja.
- **CuÃ¡ndo resolverlo:** en una pasada de calidad de producto previa a salida pÃºblica.
- **MÃ³dulos afectados:** layout global.
- **SoluciÃ³n mÃ­nima recomendada:** alinear metadata, tÃ­tulos y descripciones con la identidad real de Hostly.
- **Riesgo de no hacerlo:** sensaciÃ³n de producto menos cerrado.

#### 3.15 Workflow CI aÃºn muy focalizado

- **Problema:** el repositorio muestra automatizaciÃ³n visible principalmente para evaluaciÃ³n de importaciÃ³n de carta.
- **Impacto:** cobertura operativa limitada para otras Ã¡reas crÃ­ticas.
- **Probabilidad:** media.
- **Coste de resolverlo:** medio.
- **Prioridad:** baja-media.
- **CuÃ¡ndo resolverlo:** antes de escalar ritmo de cambios concurrentes.
- **MÃ³dulos afectados:** todo el proyecto.
- **SoluciÃ³n mÃ­nima recomendada:** ampliar validaciones gradualmente empezando por checks ligeros y dominios sensibles.
- **Riesgo de no hacerlo:** mÃ¡s dependencia de revisiÃ³n manual en un producto cada vez mÃ¡s amplio.

#### 3.16 Presencia de carpetas o capas experimentales no consolidadas

- **Problema:** existen restos o Ã¡reas no centrales para la arquitectura dominante, como `_legacy/` o `supabase/`.
- **Impacto:** genera ruido y posibles malentendidos para nuevos colaboradores.
- **Probabilidad:** alta.
- **Coste de resolverlo:** bajo-medio.
- **Prioridad:** baja.
- **CuÃ¡ndo resolverlo:** cuando exista inventario claro de uso real.
- **MÃ³dulos afectados:** arquitectura global y onboarding tÃ©cnico.
- **SoluciÃ³n mÃ­nima recomendada:** documentar explÃ­citamente quÃ© es experimental, quÃ© es legado y quÃ© sigue vivo.
- **Riesgo de no hacerlo:** mayor confusiÃ³n y decisiones inconsistentes.

---

## 4. Roadmap tÃ©cnico

### DespuÃ©s del Asistente de Salas

- congelar naming objetivo de rutas, colecciones y perfiles;
- inventariar listeners Firestore por mÃ³dulo operativo;
- extraer lÃ³gica segura de megacomponentes ya tocados recientemente;
- documentar lÃ­mites de tamaÃ±o y criterios de modularizaciÃ³n.

### DespuÃ©s del Editor Visual

- reducir acoplamientos directos entre pÃ¡gina, editor y seed;
- introducir modularizaciÃ³n segura en `EditableFloorMap` y flujos auxiliares;
- empezar saneamiento de `globals.css`;
- revisar `use client` y detectar oportunidades de separaciÃ³n sin tocar runtime delicado.

### DespuÃ©s de IA

- formalizar contratos de contexto por dominio;
- consolidar pipelines de importaciÃ³n y evaluaciÃ³n;
- aislar helpers de transformaciÃ³n reutilizables para futuras funciones asistidas;
- evitar que la IA dependa de rutas o esquemas legacy.

### Antes de lanzar beta pÃºblica

- revisar naming de variables de entorno y restaurant scope;
- endurecer Ã­ndices Firestore necesarios;
- reducir logging tÃ©cnico innecesario en cliente;
- documentar oficialmente colecciones canÃ³nicas y legacy soportado;
- revisar reglas Firebase y Storage con foco de producto comercial.

### Antes de escalar a 100 restaurantes

- reducir listeners amplios en Ã³rdenes, pagos y producciÃ³n;
- separar vistas calientes de vistas histÃ³ricas;
- medir coste de lecturas por flujo operativo;
- cerrar los primeros megacomponentes mÃ¡s crÃ­ticos por fases mÃ­nimas.

### Antes de escalar a 500 restaurantes

- consolidar definitivamente el modelo de datos canÃ³nico;
- reducir drÃ¡sticamente duplicidad conceptual de colecciones y rutas;
- introducir carga diferida en mÃ³dulos pesados;
- ampliar validaciones automatizadas para Ã¡reas crÃ­ticas.

### Antes de escalar a 1000 restaurantes

- asegurar que ningÃºn runtime sensible dependa de listeners demasiado amplios;
- terminar la transiciÃ³n fuera de naming y schemas legacy;
- establecer presupuesto tÃ©cnico por mÃ³dulo: bundle, listeners, Ã­ndices y tamaÃ±o de archivos;
- revisar capacidad operativa global del producto como plataforma multi-restaurante real.

---

## 5. Checklist permanente

Utilizar esta checklist en futuras auditorÃ­as o antes de iniciar cambios relevantes.

### Arquitectura

- [ ] Â¿Existen archivos por encima del umbral interno de complejidad?
- [ ] Â¿Se estÃ¡n mezclando UI, persistencia y lÃ³gica de negocio en el mismo archivo?
- [ ] Â¿Se estÃ¡ creando una nueva duplicidad de rutas, naming o colecciones?
- [ ] Â¿Se estÃ¡ tocando un megacomponente sin aislar primero el cambio?

### Firestore

- [ ] Â¿Cada query estÃ¡ claramente acotada por `restaurantId`?
- [ ] Â¿Existe algÃºn listener amplio sobre colecciones calientes?
- [ ] Â¿La consulta requiere Ã­ndice compuesto no documentado?
- [ ] Â¿La nueva lectura puede crecer de forma peligrosa con el nÃºmero de restaurantes?
- [ ] Â¿Se estÃ¡ ampliando legacy en vez de migrar hacia el modelo canÃ³nico?

### Next.js y frontend

- [ ] Â¿El archivo necesita realmente `"use client"`?
- [ ] Â¿Existe oportunidad segura de lazy loading?
- [ ] Â¿La pÃ¡gina estÃ¡ empujando demasiado trabajo al cliente?
- [ ] Â¿Se estÃ¡ manteniendo una separaciÃ³n razonable entre shell y componentes interactivos?

### UI, UX y Design System

- [ ] Â¿La pantalla reutiliza el Hostly Design System?
- [ ] Â¿Se estÃ¡n aÃ±adiendo estilos globales cuando deberÃ­a usarse un componente existente?
- [ ] Â¿La navegaciÃ³n sigue el patrÃ³n oficial de Hostly?
- [ ] Â¿La interacciÃ³n es tÃ¡ctil, clara y consistente?
- [ ] Â¿La UX ahorra tiempo real durante un servicio?

### Seguridad

- [ ] Â¿Las Firebase Rules siguen protegiendo el caso nuevo?
- [ ] Â¿Storage mantiene aislamiento por tenant?
- [ ] Â¿Las variables de entorno estÃ¡n nombradas de forma consistente?
- [ ] Â¿Hay logging tÃ©cnico innecesario en cliente o rutas sensibles?

### Rendimiento y escalabilidad

- [ ] Â¿El cambio aumenta lecturas Firestore por pantalla?
- [ ] Â¿El bundle o el CSS global crecen innecesariamente?
- [ ] Â¿Se estÃ¡ ampliando un archivo ya demasiado grande?
- [ ] Â¿El mÃ³dulo seguirÃ­a funcionando igual con 10 veces mÃ¡s datos?

### Calidad general

- [ ] Â¿Existen duplicaciones evidentes que deberÃ­an resolverse antes de seguir?
- [ ] Â¿El cambio crea deuda nueva o reduce deuda existente?
- [ ] Â¿La soluciÃ³n mÃ­nima respeta la arquitectura actual?
- [ ] Â¿El riesgo de tocarlo es menor que el riesgo de dejarlo igual?

---

## Regla final

La deuda tÃ©cnica de Hostly debe gestionarse como un backlog estratÃ©gico, no como una cruzada estÃ©tica.

Primero se corrige lo que:

1. protege al restaurante;
2. reduce riesgo operativo;
3. evita costes crecientes;
4. prepara la siguiente etapa del producto.

Todo lo demÃ¡s debe abordarse solo cuando exista una ventana clara y una misiÃ³n acotada.
