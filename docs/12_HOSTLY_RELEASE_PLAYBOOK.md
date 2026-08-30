# Hostly Release Playbook

> Procedimiento oficial de releases de Hostly para desarrolladores, Cursor, Codex, ChatGPT y futuras IAs.

**Estado:** oficial
**Versión:** 1.0
**Autoridad documental:** nivel 2 (operaciones y release)
**Ámbito:** Git, validación, merge, deploy Vercel, deploy Firebase, rollback e incidencias
**Subordinado a:** `00_HOSTLY_PRODUCT_BIBLE.md`, `11_HOSTLY_ENGINEERING_CONSTITUTION.md`

**Documentos complementarios (no sustitutos):**

- `docs/hostly-release-checklist.md` — checklist operativo detallado por módulo
- `docs/hostly-qa-smoke-tests.md` — smoke tests exhaustivos
- `docs/07_HOSTLY_OPERATIONS_GUIDE.md` — contexto operativo de restaurante

---

# 1. Objetivo

## 1.1 Qué es una Release en Hostly

Una **release** es la publicación controlada de un conjunto de cambios — frontend (Vercel), reglas Firebase (Firestore/Storage), índices o configuración — hacia un entorno donde operan restaurantes reales.

No es “hacer push y esperar”. Es un acto **deliberado**, **trazable** y **reversible** que debe poder ejecutar cualquier miembro del equipo (humano o IA asistida) sin omitir pasos críticos.

## 1.2 Principios

| Principio | Significado en Hostly |
| --- | --- |
| **Seguridad** | Tenant aislado, permisos correctos, sin secretos en git, rules desplegadas antes o junto al frontend que las requiere |
| **Trazabilidad** | Cada producción ligada a commit SHA, PR y responsable; incidencias documentadas |
| **Reproducibilidad** | Mismos comandos, mismos checklists, mismo orden de deploy |
| **Mínimo riesgo** | Cambios pequeños, una capa crítica por release cuando sea posible, smoke test antes y después |

---

# 2. Flujo oficial Git

## 2.1 Ciclo completo

```text
crear rama → desarrollo → validación → commit → push → merge → producción
```

| Fase | Acción | Responsable |
| --- | --- | --- |
| **Crear rama** | `git checkout -b feat/nombre-corto` desde `main` actualizado | Dev / IA |
| **Desarrollo** | Cambios acotados; un objetivo principal por iteración | Dev / Cursor |
| **Validación** | tsc, build, lint (archivos tocados), smoke según dominio | Dev / IA |
| **Commit** | Mensaje claro; solo archivos de la iteración | Dev (IA propone, humano aprueba) |
| **Push** | `git push -u origin <rama>` | Dev |
| **Merge** | PR → revisión → merge a `main` | Dev + revisor |
| **Producción** | Vercel auto-deploy + Firebase manual si aplica | Release Manager |

## 2.2 Cuándo usar cada estrategia de rama

### `main`

- Rama de **producción**
- Siempre desplegable
- Protegida: no push directo salvo hotfix acordado con guardia
- Vercel despliega automáticamente al merge/push

### Feature branch

**Usar cuando:**

- Nueva funcionalidad o mejora multi-commit
- Cambio en TPV, KDS, Carta, pagos, rules o inventario
- Se requiere revisión en PR

**Convención de nombre:**

```text
feat/<dominio>-<descripcion-corta>
fix/<dominio>-<descripcion-corta>
chore/<descripcion-corta>
docs/<descripcion-corta>
```

**Ejemplo:** `feat/empresa-logo-storage`, `fix/tpv-line-cancel`

### Hotfix

**Usar cuando:**

- Incidencia en producción que no puede esperar al siguiente ciclo
- Fix mínimo, aislado, con smoke test acotado al síntoma

**Flujo:**

1. Rama desde commit de producción: `hotfix/<incidencia>`
2. Fix mínimo + validación
3. Merge rápido a `main`
4. Deploy + smoke inmediato
5. Documentar en incidencia / `04_HOSTLY_DECISIONS_LOG.md` si la decisión es permanente

**No usar hotfix para:** refactors, features nuevas, cambios de rules sin plan de rollback.

---

# 3. Flujo Cursor

## 3.1 Antes de modificar código

Cursor debe (según `.cursor/rules/hostly.mdc` y `06_HOSTLY_AI_GUIDELINES.md`):

1. Leer documentación canónica relevante (`00`, `11`, `01`, `02` mínimo)
2. Indicar: rol, entendimiento, riesgo, solución mínima, archivos a tocar / no tocar
3. Identificar dominio (TPV, Carta, KDS, Empresa, Firebase…)
4. Confirmar estado git si la tarea implica commit o release

## 3.2 Qué debe validar

| Validación | Cuándo |
| --- | --- |
| `npx tsc --noEmit` | Cambios TypeScript |
| `npm run build` | Cambios en rutas, imports, SSR, env |
| ESLint archivos tocados | Siempre que sea viable |
| `git diff --check` | Antes de commit |
| Smoke manual del dominio | TPV, KDS, Storage, rules… |

Separar errores **introducidos** de deuda lint/build preexistente.

## 3.3 Qué debe entregar al terminar

- Qué cambió / qué no cambió
- Archivos modificados
- Riesgos pendientes
- Qué validar manualmente
- Resultado tsc y build (o motivo)
- Si afecta Firebase: comandos de deploy y validación

## 3.4 Cuándo proponer commit

Proponer commit cuando:

- La iteración está completa y validada
- El diff es coherente (un propósito)
- No incluye secretos ni archivos accidentales

**Formato sugerido:**

```text
feat(empresa): allow logo upload via Storage
fix(storage): deploy restaurant-logos rules
docs: integrate Engineering Constitution
chore(cursor): add Hostly project rules
```

**Nunca** commit, push ni deploy automáticos salvo petición expresa del usuario.

---

# 4. Flujo Codex

## 4.1 Cuándo utilizar Codex

- Scripts de repo, hooks (`.codex/hooks/`)
- Tareas batch acotadas con guardrails
- Automatizaciones repetibles (auditorías, diagnósticos)
- Operaciones en terminal con alcance definido

## 4.2 Qué tareas debe asumir

- Ejecutar comandos de validación (`tsc`, `build`, `firebase deploy --dry-run`)
- Aplicar cambios en archivos explícitamente listados
- Respetar hooks de pre-tool-use y stop-summary
- Informar salida verificable (exit code, SHA, URLs)

## 4.3 Qué tareas NO debe asumir

- Merge o push a `main` sin autorización
- Deploy Firebase o Vercel en producción sin autorización
- Cambios en `firestore.rules` / `storage.rules` sin revisión humana
- Refactors masivos de TPV/KDS
- Borrado de datos Firestore en producción
- Rotación de secretos o credenciales

---

# 5. Flujo ChatGPT

## 5.1 Qué tareas corresponden a ChatGPT

| Ámbito | Ejemplos |
| --- | --- |
| **Arquitectura** | Evaluar enfoques, revisar ADR, detectar riesgos multi-tenant |
| **Producto** | Refinar flujos, copy operativo, criterios de aceptación |
| **Revisión** | Leer specs, detectar huecos en checklist, simular operador de sala |
| **Planificación** | Descomponer fases, roadmaps, criterios de Done |

## 5.2 Qué NO sustituye ChatGPT

- No confirma estado del código sin ver el repo
- No despliega ni ejecuta comandos
- No es fuente de verdad sobre rules desplegadas en Firebase

**División recomendada:**

```text
ChatGPT  → pensar, especificar, revisar, documentar
Cursor   → implementar en el repo
Codex    → automatizar y ejecutar con hooks
Humano   → aprobar merge, deploy, rules, producción
```

---

# 6. Checklist antes del commit

Marcar antes de cada commit que vaya hacia PR o `main`.

### TypeScript

- [ ] `npx tsc --noEmit` — OK en archivos/cambios relevantes

### Build

- [ ] `npm run build` — OK (o motivo documentado si fallo externo, p. ej. fonts)

### Lint

- [ ] Sin errores nuevos en archivos tocados
- [ ] Deuda global documentada si no se corrige en esta iteración

### Firestore

- [ ] Si tocó `firestore.rules`: diff revisado, tenant-safe, plan de deploy
- [ ] Si tocó queries: índices en `firestore.indexes.json`
- [ ] Sin writes peligrosos ni mezcla de tenants en código nuevo

### Storage

- [ ] Si tocó `storage.rules` o paths Storage: plan de `firebase deploy --only storage`
- [ ] Paths con `{restaurantId}` coherentes con rules
- [ ] Bucket env: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `{projectId}.firebasestorage.app`

### Documentación

- [ ] Decisiones permanentes reflejadas en doc canónico pertinente
- [ ] Entrada en `04_DECISIONS_LOG` si aplica

### UI

- [ ] Touch targets ≥ 44px en acciones frecuentes
- [ ] Smoke visual rápido si cambió UI operativa

### Permisos

- [ ] Capabilities / roles respetados en UI
- [ ] Writes sensibles protegidos en rules (no solo en cliente)

### restaurantId

- [ ] Mismo tenant en auth, queries, Storage paths y rules
- [ ] Sin hardcode de IDs salvo tests

### Git hygiene

- [ ] `git diff --check` — OK
- [ ] Solo archivos de la iteración en staging
- [ ] Sin `.env`, secrets ni `firebase-debug.log`

---

# 7. Checklist antes del merge

## 7.1 Validaciones obligatorias

- [ ] PR con descripción: qué, por qué, riesgos, cómo validar
- [ ] tsc + build verdes en la rama
- [ ] Revisión humana para dominios críticos (TPV, KDS, pagos, rules)
- [ ] Sin conflictos con `main`

## 7.2 Smoke test (staging o local production-like)

Mínimo según dominio tocado — ver `docs/hostly-qa-smoke-tests.md`:

| Dominio tocado | Smoke mínimo |
| --- | --- |
| TPV / Carta | Login, listar productos, abrir mesa, añadir línea |
| KDS | Enviar comanda, ver línea en estación correcta |
| Empresa / Storage | Subir logo, guardar perfil |
| Rules | Operación permitida tenant correcto; denegada otro tenant |
| Config mapas | Editor carga, guardar plano |

## 7.3 Riesgos — cuándo NO mergear

- Build o tsc rojos
- Rules/índices cambiados sin plan de deploy Firebase
- Víspera de festivo / hora punta sin guardia
- Mezcla de varias capas críticas sin smoke previo
- Incidencia abierta en producción sin root cause

> Ver también: **Cuándo NO desplegar** en `docs/hostly-release-checklist.md`

---

# 8. Checklist después del merge

## 8.1 GitHub

- [ ] PR mergeado; rama feature eliminable
- [ ] Commit SHA en `main` anotado (release log)
- [ ] Tags opcionales para hitos: `vYYYY.MM.DD` o checkpoint interno

## 8.2 Vercel

- [ ] Deployment de `main` iniciado automáticamente
- [ ] Build Vercel **Ready** (ver §10)
- [ ] URL de producción responde 200
- [ ] Variables de entorno verificadas si el release las tocó

## 8.3 Firebase

Ejecutar **solo si el release tocó** rules, índices o contratos Storage:

- [ ] Firestore Rules desplegadas (si diff en `firestore.rules`)
- [ ] Storage Rules desplegadas (si diff en `storage.rules`)
- [ ] Índices READY (si diff en `firestore.indexes.json`)
- [ ] Timestamp en Firebase Console → Rules actualizado

**Orden recomendado:** rules/índices Firebase **antes o en la misma ventana** que el frontend que depende de ellos.

## 8.4 Producción

- [ ] Smoke post-deploy (§14 Release Checklist)
- [ ] Consola navegador sin `permission-denied` masivo
- [ ] Restaurante de prueba operativo
- [ ] Incidencias registradas; rollback plan listo

---

# 9. Firebase

## 9.1 Cuándo desplegar

| Recurso | Archivo | Desplegar cuando |
| --- | --- | --- |
| **Firestore Rules** | `firestore.rules` | Cambió acceso, roles, tenant gates |
| **Storage Rules** | `storage.rules` | Cambió paths, `sameRestaurant()`, nuevos buckets lógicos |
| **Indexes** | `firestore.indexes.json` | Nueva query compuesta o cambio de campos indexados |

**Vercel NO despliega Firebase.** Un deploy frontend exitoso no implica rules actualizadas.

## 9.2 Comandos oficiales

Proyecto: `hostly-app-8b902` (ver `.firebaserc`)

```bash
# Dry-run (recomendado primero)
npx firebase deploy --only firestore:rules --dry-run
npx firebase deploy --only storage --dry-run

# Deploy producción
npx firebase deploy --only firestore:rules
npx firebase deploy --only storage
npx firebase deploy --only firestore:indexes

# Combinado (solo si el release tocó varios)
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 9.3 Cómo validar

1. Firebase Console → Firestore / Storage → **Rules** → timestamp reciente
2. Firebase Console → Firestore → **Indexes** → estado **Enabled** / **Ready**
3. Smoke con usuario real del tenant:
   - operación permitida → OK
   - otro tenant o sin auth → denegado
4. Consola cliente sin `storage/unauthorized` ni `permission-denied` inesperados

**Bucket canónico:** `hostly-app-8b902.firebasestorage.app`
Verificar `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` en Vercel coincide.

---

# 10. Vercel

## 10.1 Cómo validar un deployment

1. Vercel Dashboard → proyecto `hostly-app` → Deployments
2. Último deployment de `main`: estado **Ready**
3. Abrir URL de producción
4. Login con cuenta de prueba
5. Navegar a ruta afectada por el release

Las Functions se ejecutan primariamente en `cdg1` (París), cerca del tenant de
Firebase `eur3`, con `fra1` (Fráncfort) como región de failover. Esta decisión
vive en `vercel.json`; no debe volver al valor por defecto `iad1` sin medir el
impacto sobre TPV, importación y el resto de APIs que acceden a Firestore.

## 10.2 Qué revisar

| Área | Qué mirar |
| --- | --- |
| Build log | Errores TypeScript, missing env, fallo fonts |
| Runtime log | 500 en API routes |
| Env vars | `NEXT_PUBLIC_FIREBASE_*`, keys IA, bucket Storage |
| Funcional | TPV carga, dashboard, módulo del release |

## 10.3 Qué hacer si falla

| Fallo | Acción |
| --- | --- |
| Build failed | Corregir en rama, nuevo merge; no forzar deploy roto |
| Runtime 500 API | Revisar logs Vercel + variables server-side |
| Pantalla blanca | Consola navegador; rollback frontend (§11) |
| Env missing | Restaurar variable en Vercel → Redeploy |

---

# 11. Rollback

## 11.1 Cómo actuar

1. **Confirmar síntoma** — ¿frontend, rules, índices o datos?
2. **Comunicar** — operación en pausa si afecta TPV/KDS/cobros
3. **Rollback frontend** — Vercel → Promote previous deployment (deployment N-1 estable)
4. **Rollback Firebase** — solo si el release desplegó rules/índices:
   ```bash
   git checkout <commit-anterior> -- firestore.rules storage.rules
   npx firebase deploy --only firestore:rules,storage
   ```
5. **Verificar** — smoke mínimo post-rollback
6. **Documentar** — hora, SHA bueno vs malo, `restaurantId` afectado

## 11.2 Qué comprobar

- ¿El rollback de frontend basta o rules también hay que revertir?
- ¿Hay datos ya escritos con schema nuevo? → no borrar a ciegas
- ¿Incidencia aislada a un tenant o global?

## 11.3 Cómo minimizar impacto

- Releases pequeñas y reversibles
- Deploy rules antes del frontend cuando añaden permisos (nunca al revés para restricciones)
- Mantener SHA del último deploy bueno anotado
- No rollback destructivo de catálogo (`docs/hostly-catalog-migration.md`)

---

# 12. Incidencias

## 12.1 Errores frecuentes y resolución

| Incidencia | Causa probable | Resolución |
| --- | --- | --- |
| `permission-denied` masivo Firestore | Rules desincronizadas o índice faltante | Console → Rules/Indexes; deploy rules; crear índice |
| `storage/unauthorized` | Storage Rules no desplegadas o path sin match | `firebase deploy --only storage`; verificar path y `sameRestaurant()` |
| TPV vacío | Catálogo vacío o `restaurantId` distinto | Perfil auth vs productos `source: central` |
| Vercel build OK, feature rota | Env distinta local vs prod | Comparar env Vercel |
| PR bloqueado | Conflictos o checks | Rebase `main`, resolver conflictos, re-validar |
| Push rechazado GitHub | Permisos o branch protection | Verificar acceso repo `hostly-cloud/hostly-app` |
| Logo no sube (Empresa) | Rules `restaurant-logos` no en producción | Deploy Storage rules; verificar bucket env |

## 12.2 Ejemplos reales del proyecto

### Permisos GitHub

- Síntoma: push rechazado a `main`
- Causa: branch protection
- Acción: PR desde feature branch; no bypass salvo hotfix acordado

### PR

- Síntoma: merge bloqueado por conflictos
- Acción: `git fetch origin && git rebase origin/main`, resolver, push, re-validar tsc/build

### Vercel

- Síntoma: deploy Ready pero pantalla antigua
- Causa: caché CDN o deployment no promovido
- Acción: verificar commit SHA en deployment; hard refresh; comprobar rama desplegada = `main`

### Storage Rules — logo Empresa

- Síntoma: `Firebase Storage: User does not have permission to access restaurant-logos/{id}/logo.png`
- Causa: regla en repo pero **no desplegada** en Firebase (Vercel ≠ rules)
- Acción: `npx firebase deploy --only storage`; validar subida logo + `getDownloadURL`
- Prevención: incluir Storage en checklist si el release toca `storage.rules`

### Firestore Rules

- Síntoma: TPV/KDS dejan de escribir tras release
- Causa: rules más restrictivas desplegadas antes que app compatible, o viceversa
- Acción: alinear orden deploy; rollback rules si necesario; smoke por rol

---

# 13. Definition of Done

Una tarea puede darse por **terminada** cuando:

1. **Objetivo cumplido** — criterio de aceptación verificado
2. **Código validado** — tsc OK; build OK si aplica
3. **Sin regresión obvia** — smoke del dominio tocado
4. **Tenant seguro** — `restaurantId` y permisos intactos
5. **Firebase al día** — rules/índices desplegados si cambiaron
6. **Documentación** — actualizada si la decisión es permanente
7. **Entrega clara** — qué cambió, riesgos, qué validar (humano o IA)
8. **Commit/PR** — en repo o propuesto; no deuda de “falta commitear” sin avisar

**No está Done** si: build rojo, rules pendientes de deploy, smoke fallido en producción, o incidencia abierta sin documentar.

---

# 14. Release Checklist

Plantilla reutilizable — copiar por release.

```markdown
## Hostly Release — ____________

| Campo | Valor |
| --- | --- |
| Responsable | |
| Commit SHA | |
| PR | |
| Entorno | staging / production |
| restaurantId prueba | |

### Pre-merge
- [ ] tsc OK
- [ ] build OK
- [ ] lint archivos tocados OK
- [ ] git diff --check OK
- [ ] Smoke dominio: ____________
- [ ] Rules/índices: N/A / desplegar planificado

### Deploy Firebase (si aplica)
- [ ] firestore:rules
- [ ] storage
- [ ] firestore:indexes
- [ ] Console timestamp verificado

### Post-deploy Vercel
- [ ] Deployment Ready
- [ ] Login OK
- [ ] Módulo release OK: ____________
- [ ] Consola sin permission-denied

### Post-deploy producción
- [ ] TPV / KDS / Carta según alcance
- [ ] Multi-dispositivo (opcional)
- [ ] Rollback necesario: sí / no

### Cierre
- [ ] Incidencias: ____________
- [ ] Docs actualizados: ____________
- [ ] Hora fin: ____________
```

---

# 15. Filosofía

Hostly **publica poco. Pero publica bien.**

Cada release debe ser:

- **Estable** — funciona en servicio real, no solo en local
- **Revisada** — ojos humanos en lo crítico; checklists en lo repetible
- **Documentada** — SHA, decisiones, incidencias
- **Reversible** — sabemos volver al deployment N-1

Preferimos:

- una release pequeña el martes
- antes que un monolito el viernes

Preferimos:

- decir “no desplegamos hoy”
- antes que arreglar producción un sábado noche

La hostelería no pausa porque el deploy fue apresurado. Nosotros tampoco deberíamos apresurar el deploy.

---

## Mantenimiento de este documento

Actualizar cuando:

- cambie el flujo Git, Vercel o Firebase del proyecto;
- un incidente de producción revele un hueco en el playbook;
- se añadan entornos (staging dedicado, preview policies).

**Propietario sugerido:** DevOps Lead / Release Manager.

**Última revisión:** 2026-06-26 · v1.0
