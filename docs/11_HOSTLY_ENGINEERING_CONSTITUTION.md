# Hostly Engineering Constitution

> Constitución Técnica de Hostly. Referencia suprema para construir, evolucionar y mantener el producto durante años.

**Estado:** oficial  
**Versión:** 1.0  
**Autoridad documental:** nivel 1 (ingeniería)  
**Ámbito:** arquitectura, código, Firebase, Git, calidad, seguridad, IA y evolución técnica  
**Stack:** Next.js App Router · React · TypeScript · Tailwind · Firebase Auth · Firestore · Firebase Storage · Vercel

---

## Jerarquía documental

Cuando dos documentos parezcan contradecirse durante el **desarrollo de nuevas funcionalidades**, prevalece el que esté más arriba en esta lista:

| Prioridad | Documento | Ámbito |
| --- | --- | --- |
| 1 | `00_HOSTLY_PRODUCT_BIBLE.md` | Producto, experiencia, visión, criterio de negocio |
| 2 | **`11_HOSTLY_ENGINEERING_CONSTITUTION.md`** | **Ingeniería, arquitectura, calidad, Firebase, Git, IA** |
| 3 | `01_HOSTLY_ARCHITECTURE_GUIDE.md` | Arquitectura detallada y estado actual/objetivo |
| 4 | `02_HOSTLY_DESIGN_SYSTEM.md` | UI, tokens, componentes Hostly |
| 5 | `03_HOSTLY_ROADMAP.md` | Planificación y fases |
| 6 | `04_HOSTLY_DECISIONS_LOG.md` | Decisiones cerradas |
| 7 | `05_HOSTLY_STATE_AUDIT.md` | Auditoría de estado |
| 8 | `06_HOSTLY_AI_GUIDELINES.md` | Contrato operativo para IAs |
| 9 | `07_HOSTLY_OPERATIONS_GUIDE.md` | Operación real de restaurante |
| 8–10 | `08`–`10` | Bootstrap, patrones, deuda técnica |

**Regla de oro:** la Product Bible manda en *qué* construimos y *por qué*. Esta Constitución manda en *cómo* lo construimos sin comprometer operación, tenant, seguridad ni mantenibilidad.

Los documentos especializados en `docs/` (roles, stock, catálogo, KDS, release, etc.) desarrollan dominios concretos y **no sustituyen** esta jerarquía.

---

# 1. Propósito

## 1.1 Qué significa desarrollar Hostly

Desarrollar Hostly no es implementar pantallas. Es **extender un sistema operativo para hostelería** que participa en servicios reales: apertura de mesas, comandas, cocina, cobros, inventario, configuración del negocio y aprendizaje continuo.

Cada línea de código puede afectar a un restaurante en hora punta. Por tanto, ingeniería en Hostly implica:

- **Respetar el servicio** por encima de la elegancia interna.
- **Proteger el tenant** (`restaurantId`) como frontera de seguridad y datos.
- **Preferir cambios pequeños, reversibles y verificables** en módulos operativos (TPV, KDS, Carta, Cobros).
- **Documentar decisiones permanentes** para que el equipo — humano o IA — no tenga que redescubrirlas.

## 1.2 Valores técnicos que perseguimos

| Valor | Significado en Hostly |
| --- | --- |
| **Claridad operativa** | El personal entiende qué hacer sin manual técnico |
| **Integridad** | Los datos económicos, de stock y de servicio son coherentes |
| **Aislamiento multi-tenant** | Ningún restaurante ve ni modifica datos de otro |
| **Estabilidad en producción** | Lo que funciona un sábado lleno debe seguir funcionando |
| **Evolución incremental** | Mejoras por iteraciones acotadas, no big bangs |
| **Honestidad arquitectónica** | Legacy documentado; no convertido en patrón nuevo |
| **Velocidad de entrega responsable** | Entregar rápido sin hipotecar el futuro |
| **Legibilidad a largo plazo** | Código que otro ingeniero entienda en seis meses |

---

# 2. Filosofía de Ingeniería

### Simplicidad

La solución más simple que cumple el objetivo es la preferida. La complejidad debe justificarse con un riesgo real (operación, escala, seguridad), no con anticipación especulativa.

### Estabilidad

Los runtimes operativos (TPV, Cocina, Barra, KDS, Sala) son sistemas sensibles al tiempo. Un bug en configuración es molesto; un bug en cobro o en una comanda activa es crítico.

### Escalabilidad

Hostly es multi-restaurante desde el diseño. Escalamos en número de tenants, volumen de documentos, listeners concurrentes y equipos de desarrollo — no solo en tráfico web.

### Mantenibilidad

Preferimos módulos acotados, nombres explícitos y fronteras claras entre UI, lógica de dominio y persistencia. Un archivo de mil líneas es deuda, no un trofeo.

### Legibilidad

TypeScript estricto, funciones con responsabilidad única, convenciones consistentes. El código se lee más veces de las que se escribe.

### Rendimiento

Optimizar donde duele: listeners Firestore, renders en TPV, listas largas, imágenes, cold starts. No micro-optimizar prematuramente en pantallas de configuración ocasionales.

### Seguridad

Seguridad por tenant, reglas en servidor (Firestore/Storage Rules), permisos por rol, validación en cliente como UX — nunca como única barrera.

### Experiencia de usuario

La UX es parte de la ingeniería. Touch first, pocos clics, feedback inmediato, estados vacíos útiles y errores comprensibles para personal no técnico.

---

# 3. Principios Arquitectónicos

### Separación de responsabilidades

| Capa | Responsabilidad | Ubicación típica |
| --- | --- | --- |
| Presentación | Render, interacción, estados locales de UI | `app/`, `components/` |
| Dominio / orquestación | Reglas de negocio, composición de flujos | hooks, lib de dominio |
| Persistencia | Firestore, Storage, Auth | `lib/firestore/`, `lib/firebase/` |
| Infra / servidor | Admin SDK, APIs, jobs | `app/api/`, `lib/server/` |

Los componentes **no** construyen rutas Firestore ni contienen lógica de permisos de servidor.

### Reutilización

Antes de crear componentes, hooks, utilidades, tipos, estilos o servicios, buscar equivalentes existentes. El Design System (`components/ui/hostly/`) y `lib/` son el primer destino.

### Composición frente a duplicación

Preferir componer piezas pequeñas y probadas antes de copiar bloques. La duplicación deliberada es deuda documentada, no un atajo aceptable.

### Mínimo acoplamiento

Los módulos no deben importar detalles internos de TPV desde Inventario, ni viceversa. Compartir a través de contratos estables (`lib/firestore/*`, tipos compartidos, eventos bien definidos).

### Máxima cohesión

Agrupar por dominio (mesas, productos, pedidos, pagos), no por tipo técnico genérico. Un cambio en Carta debe localizarse principalmente en Carta.

### Evolución incremental

Un cambio importante por iteración. Fases separadas: datos → lógica → UI → polish. No mezclar refactor masivo con feature nueva.

### Compatibilidad hacia atrás

Los clientes en producción, datos legacy y flujos activos importan. Romper compatibilidad exige decisión explícita, migración, pruebas y entrada en `04_HOSTLY_DECISIONS_LOG.md`.

---

# 4. Principios de Producto

> Subordinados a la Product Bible; reforzados aquí desde ingeniería.

Pensar **siempre primero como un restaurante real**: camarero con prisa, jefe de sala coordinando, cocina bajo presión, propietario configurando entre servicios.

Priorizar:

- **Rapidez** — cada segundo en TPV cuenta
- **Pocos clics** — la acción frecuente debe estar a un toque
- **Uso táctil** — tablet y móvil antes que ratón; objetivos 44–48 px
- **Onboarding sencillo** — nadie debería necesitar un manual para empezar
- **IA que elimine trabajo** — no IA que añada pantallas

**Prohibido:** implementar una solución solo porque sea técnicamente elegante si empeora la operación, añade pasos o introduce ambigüedad en servicio.

---

# 5. Reglas de Código

## 5.1 TypeScript

- Modo estricto; evitar `any` salvo frontera documentada
- Tipos de dominio en `lib/`; no duplicar shapes entre módulos
- Preferir tipos explícitos en APIs públicas y contratos Firestore
- Validar entradas externas (formularios, APIs, imports)

## 5.2 React

- Componentes funcionales
- Estado lo más local posible; contexto solo para datos verdaderamente transversales (auth, tenant)
- Evitar efectos duplicados; consolidar suscripciones Firestore
- `"use client"` solo cuando haya interactividad, browser APIs o listeners
- No meter lógica de persistencia en JSX

## 5.3 Next.js App Router

- Server Components por defecto donde no haga falta cliente
- Rutas en `app/`; layouts compartidos con cuidado de no romper shells operativos
- API routes en `app/api/` para operaciones servidor, Admin SDK y secretos
- No exponer claves privadas en cliente

## 5.4 Tailwind y estilos

- Tokens y clases `hostly-*` definidos en `app/globals.css`
- Componentes Hostly antes que estilos ad hoc
- Prohibido: magic numbers arbitrarios, glassmorphism decorativo en dashboard operacional, duplicar radios/sombras fuera del sistema

## 5.5 Firebase (cliente)

- Acceso Firestore/Storage solo vía módulos `lib/firestore/` y `lib/firebase/`
- `restaurantId` siempre desde perfil autenticado o contrato servidor — nunca hardcodeado salvo tests
- Refrescar token Auth antes de operaciones Storage sensibles cuando aplique

## 5.6 Buenas prácticas obligatorias

- Cambio mínimo acotado al objetivo
- Reutilizar convenciones del archivo y módulo circundante
- Comentarios solo para lógica de negocio no obvia
- Eliminar imports y código muerto introducido en la misma iteración
- Informar al terminar: qué cambió, qué no, archivos, riesgos, validación

## 5.7 Patrones prohibidos

- Componentes gigantes (> ~400 líneas) sin plan de extracción
- Firestore queries inline en páginas o componentes de UI
- Duplicación de lógica tenant / permisos
- Nuevo sistema paralelo cuando existe patrón oficial (p. ej. segundo Design System)
- Refactors masivos mezclados con features
- Commits, push o deploy sin autorización explícita
- Borrar código “porque parece muerto” sin verificación
- Convertir compatibilidad legacy en patrón recomendado para código nuevo

---

# 6. Firestore

## 6.1 Modelado de datos

- **Un restaurante = un tenant.** La mayoría de colecciones llevan `restaurantId` o viven bajo `restaurants/{restaurantId}/…`
- Campos explícitos, nombres estables, timestamps cuando el orden importa
- Evitar documentos monolíticos que mezclen configuración, operación y analítica
- Estados de dominio como enums/strings cerrados documentados

## 6.2 restaurantId

- Frontera de **seguridad**, no filtro cosmético
- Debe coincidir entre: perfil Auth (`users/{uid}` / `usuarios/{uid}`), queries cliente, Storage paths y Firestore Rules
- Resolución canónica en cliente: perfil autenticado (`resolveAuthenticatedRestaurantId`, auth context)
- Nunca mezclar datos de dos restaurantes en una misma query o listener

## 6.3 Multi-tenant

- Rules: función `sameRestaurant()` y variantes documentadas en `firestore.rules`
- Perfiles multi-restaurante: `restaurantId`, `restaurantIds` (list/map) — reglas y cliente deben alinearse
- Admin SDK en servidor: validar tenant en cada operación

## 6.4 Listeners

- Preferir listeners acotados por `restaurantId` e índices
- Cancelar suscripciones al desmontar
- Evitar listeners globales sin filtro tenant
- TPV/KDS: minimizar re-render; estabilizar referencias

## 6.5 Consultas

- Queries compuestas requieren índices en `firestore.indexes.json`
- Paginar listas largas; no traer colecciones enteras al cliente
- Fallbacks legacy documentados; no extenderlos sin decisión

## 6.6 Índices

- Todo índice nuevo: entrada en `firestore.indexes.json` + deploy explícito
- Comando: `npx firebase deploy --only firestore:indexes`
- Validar en consola Firebase y con smoke test del módulo afectado

---

# 7. Firebase

## 7.1 Storage

- Paths con tenant explícito: p. ej. `restaurants/{restaurantId}/…`, `restaurant-logos/{restaurantId}/…`
- Bucket canónico: `{projectId}.firebasestorage.app` (verificar env `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`)
- Subidas desde `lib/firebase/*-storage.ts`; no lógica dispersa en páginas

## 7.2 Rules

| Recurso | Archivo | Deploy |
| --- | --- | --- |
| Firestore | `firestore.rules` | `npx firebase deploy --only firestore:rules` |
| Storage | `storage.rules` | `npx firebase deploy --only storage` |

**Vercel no despliega reglas.** Un deploy de frontend exitoso no implica reglas actualizadas.

Las Storage Rules pueden usar `firestore.get()` / `firestore.exists()` para `sameRestaurant()` — requiere plan Blaze y perfil coherente en `users`/`usuarios`.

## 7.3 Deploys

Secuencia recomendada cuando un release toca infraestructura Firebase:

1. Dry-run: `npx firebase deploy --only firestore:rules --dry-run` (y/o storage)
2. Deploy reglas e índices **antes** o **junto** al frontend que dependa de ellos
3. Verificar timestamp en Firebase Console → Rules
4. Smoke test manual del flujo afectado

## 7.4 Validaciones post-deploy

- Operación permitida para rol/tenant correcto
- Operación denegada para otro tenant o sin auth
- Paths Storage coinciden con reglas
- Consola sin `permission-denied` inesperados

---

# 8. Git

## 8.1 Flujo oficial

- **`main`** — rama de producción; siempre desplegable
- Trabajo en ramas feature cuando el cambio sea amplio o revisable
- PR o revisión humana recomendada para TPV, rules, pagos e inventario

## 8.2 Branches

- Nombre descriptivo: `feat/`, `fix/`, `chore/`, `docs/`
- Una intención principal por rama
- Mantener al día con `main` antes de merge

## 8.3 Commits

- Mensajes en imperativo, claros: `feat(tpv): …`, `fix(firestore): …`, `chore(cursor): …`
- Un commit = un propósito coherente
- **No commit automático** salvo petición expresa
- Proponer: nombre, alcance, riesgos y validaciones cuando se sugiera commit

## 8.4 Merge

- CI verde cuando exista (tsc, build, lint relevante)
- Separar deuda lint preexistente de errores nuevos
- No mergear con reglas/índices desplegados en orden incorrecto respecto al frontend

## 8.5 Releases

- Seguir `docs/hostly-release-checklist.md`
- Tag o deploy Vercel asociado a commit conocido
- Rollback: frontend primero; rules solo si el release las cambió

---

# 9. Calidad

## 9.1 TypeScript

```bash
npx tsc --noEmit
```

Debe pasar antes de considerar terminado un cambio de código. Informar resultado o motivo de no ejecución.

## 9.2 Build

```bash
npm run build
```

Validación obligatoria para cambios que afecten rutas, imports, env o SSR. Indicar si falla por causa externa (p. ej. fonts).

## 9.3 Lint

```bash
npm run lint
```

Separar errores introducidos de deuda global. No añadir warnings evitables en archivos tocados.

## 9.4 Pruebas manuales

Hostly depende fuertemente de smoke tests operativos documentados en `docs/hostly-qa-smoke-tests.md`. Como mínimo, validar el flujo del dominio tocado en:

- móvil / tablet / escritorio cuando aplique
- usuario con permisos correctos
- tenant correcto (`restaurantId`)

## 9.5 Checklist antes de merge

- [ ] Objetivo de la iteración cumplido sin scope creep
- [ ] `restaurantId` y permisos intactos
- [ ] Sin regresión obvia en TPV / Carta / KDS (si aplica)
- [ ] tsc OK
- [ ] build OK (o motivo documentado)
- [ ] Firestore/Storage rules desplegadas si cambiaron
- [ ] Documentación actualizada si la decisión es permanente (§13)
- [ ] Deuda nueva registrada en `10_HOSTLY_TECHNICAL_DEBT.md` si procede

---

# 10. Rendimiento

## 10.1 Lazy loading

- Code-splitting en módulos pesados no críticos para arranque TPV
- Imágenes: tamaños adecuados, Storage + URLs cacheables
- Evitar importar librerías grandes en runtimes operativos sin necesidad

## 10.2 Client Components

- Limitar `"use client"` al subárbol que lo requiera
- No convertir layouts enteros en cliente por comodidad

## 10.3 Server Components

- Preferir fetch servidor y render estático donde no haya interactividad
- No duplicar fetch cliente + servidor sin motivo

## 10.4 Firestore

- Índices correctos; evitar scans
- Batch writes donde tenga sentido
- Debounce en búsquedas de usuario

## 10.5 Renderizados

- Memoización selectiva en listas calientes (TPV, KDS)
- Keys estables en listas
- Evitar state global que fuerce re-render de toda la app

---

# 11. Seguridad

## 11.1 Firestore Rules

- Fuente de verdad para acceso a datos
- `sameRestaurant()`, roles (`owner`, `staff`, `viewer`) y gates por dominio (TPV, inventario, settings)
- Cambios en rules: revisión explícita + deploy + smoke de permisos

## 11.2 Storage Rules

- Misma filosofía tenant; paths con `{restaurantId}`
- Verificar bucket de producción vs reglas desplegadas

## 11.3 Roles

- Definidos en perfil usuario; capabilities en cliente como UX — **no** como única seguridad
- Endurecer writes sensibles en rules (cobros, cancelaciones, inventario)

## 11.4 Permisos

- Principio de mínimo privilegio
- Pantallas de solo lectura cuando el rol no puede editar
- Confirmación para acciones destructivas o económicas

---

# 12. Deuda Técnica

## 12.1 Cómo gestionarla

- Aceptar deuda consciente cuando acelera validación de producto **si** está documentada y clasificada
- No aceptar deuda que comprometa tenant, cobros, stock o servicio en hora punta

## 12.2 Cómo documentarla

- Registrar en `docs/10_HOSTLY_TECHNICAL_DEBT.md` con nivel: Crítico / Alto / Medio / Bajo
- Incluir: síntoma, causa, riesgo, módulo, propuesta de resolución

## 12.3 Cuándo resolverla

| Nivel | Cuándo |
| --- | --- |
| Crítico | Antes de ampliar el módulo afectado o en la siguiente ventana de estabilización |
| Alto | En roadmap próximo; no ignorar más de un trimestre |
| Medio | Ventanas planificadas; no bloquear features salvo dependencia |
| Bajo | Oportunista al tocar el mismo archivo |

La deuda no es excusa para refactors masivos no solicitados.

---

# 13. Documentación

Cuando una decisión afecte al producto o a la arquitectura de forma **permanente**, indicar y actualizar los documentos pertinentes:

| Decisión | Documento(s) |
| --- | --- |
| Visión, principios, alcance producto | `00_HOSTLY_PRODUCT_BIBLE.md` |
| Capas, módulos, persistencia, runtime | `01_HOSTLY_ARCHITECTURE_GUIDE.md` |
| UI, tokens, componentes | `02_HOSTLY_DESIGN_SYSTEM.md` |
| Planificación | `03_HOSTLY_ROADMAP.md` |
| Decisión cerrada irreversible | `04_HOSTLY_DECISIONS_LOG.md` |
| Estado actual del sistema | `05_HOSTLY_STATE_AUDIT.md` |
| Contrato IA | `06_HOSTLY_AI_GUIDELINES.md` |
| Operación / deploy | `07_HOSTLY_OPERATIONS_GUIDE.md` |
| Bootstrap repo | `08_HOSTLY_BOOTSTRAP.md` |
| Patrón UX reutilizable | `09_HOSTLY_PATTERNS.md` |
| Deuda nueva o resuelta | `10_HOSTLY_TECHNICAL_DEBT.md` |
| Principio ingeniería nuevo | **`11_HOSTLY_ENGINEERING_CONSTITUTION.md`** |

No duplicar páginas enteras entre documentos: enlazar y mantener una sola fuente de verdad por tema.

---

# 14. Inteligencia Artificial

## 14.1 Principio general

Las IAs aceleran Hostly; **no** gobiernan arquitectura ni producción. Toda IA debe obedecer esta Constitución, la Product Bible y `.cursor/rules/hostly.mdc`.

## 14.2 Cursor

**Cuándo usarlo:** desarrollo diario en el IDE, iteraciones UI/UX, integración en el repo, refactors acotados, debugging con contexto de archivos abiertos.

**Responsabilidades:**

- Leer documentación canónica antes de actuar
- Explicar rol, riesgo, archivos a tocar/no tocar
- Cambios mínimos; validar tsc/build cuando proceda
- No commit/push/deploy sin petición expresa

## 14.3 Codex

**Cuándo usarlo:** tareas autónomas acotadas, scripts, hooks de repo, análisis batch, operaciones con guardrails (p. ej. `.codex/hooks/`).

**Responsabilidades:**

- Respetar hooks y restricciones del entorno
- No operaciones destructivas en producción sin autorización
- Entregables verificables y trazables

## 14.4 ChatGPT (u otros asistentes conversacionales)

**Cuándo usarlo:** exploración de ideas, redacción documental, revisión de arquitectura, preguntas estratégicas, diseño de flujos antes de codificar.

**Responsabilidades:**

- No afirmar estado del código sin verificación
- Producir specs y checklists que Cursor/Codex ejecuten
- Mantener coherencia con documentación oficial

## 14.5 División de trabajo recomendada

```text
ChatGPT  → pensar, especificar, documentar
Cursor   → implementar, integrar, validar en repo
Codex    → automatizar, batch, tareas acotadas con hooks
Humano   → aprobar rules, merges, deploys, decisiones producto
```

---

# 15. Visión a largo plazo

## 15.1 Hacia dónde evoluciona Hostly

En los próximos años, Hostly debe consolidarse como:

- **El TPV más rápido e intuitivo** para hostelería europea
- **El más estable** en servicio real — no solo en demo
- **El más fácil de aprender** para equipos rotativos
- **El que menos clics necesita** en acciones frecuentes
- **El que más trabajo elimina** con IA aplicada (carta, espacios, compras, insights) — sin sustituir criterio humano en decisiones irreversibles

## 15.2 Evolución técnica esperada

- Modularización progresiva de megacomponentes **sin** big bang
- Catálogo y operación 100 % centralizados por tenant
- Rules y permisos cada vez más explícitos por dominio
- Menos legacy documentado y retirado con migraciones controladas
- Observabilidad operativa (errores, latencia Firestore, coste) integrada en operaciones
- IA como capa de asistencia, no como caja negra que escribe en producción sin supervisión

## 15.3 Lo que no debe cambiar

- `restaurantId` como frontera de seguridad
- Prioridad operación > elegancia técnica
- Touch first en runtimes de servicio
- Evolución incremental en TPV, KDS y cobros
- Jerarquía documental y decisiones trazables

## 15.4 Criterio de éxito de una decisión técnica

Una decisión cumple esta Constitución si:

1. Un restaurante real puede usarla en servicio sin formación extra.
2. No aumenta el riesgo multi-tenant.
3. Puede mantenerse y extenderse por el equipo (humano + IA) dentro de seis meses.
4. Está documentada si es permanente.
5. Acerca el producto a la visión del §15.1 — no solo al repositorio a una “arquitectura ideal”.

---

## Mantenimiento de este documento

Actualizar cuando:

- cambie el stack principal;
- se establezcan reglas nuevas de Firebase, Git o calidad;
- una lección de producción deba convertirse en principio permanente;
- evolucione el contrato de colaboración con IAs.

**Propietario sugerido:** Chief Software Architect / responsable técnico del repo.

**Última revisión:** 2026-06-26 · v1.0
