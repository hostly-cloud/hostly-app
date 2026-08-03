# AUDITORÍA MAESTRA HOSTLY

- Fecha: 2026-08-03
- Baseline auditado: origin/main @ 3588059
- Método: inventario Git, comparación de ramas, exploración de módulos y validaciones técnicas selectivas
- Alcance: estado de main y ramas publicadas relevantes
- Naturaleza: fotografía técnica previa a integración; no representa todavía producción desplegada

> Una funcionalidad existente en una rama no se considera integrada en Hostly hasta llegar a main y superar sus validaciones de integración.

---

## 1. Resumen ejecutivo

Hostly es un **SaaS TPV multi-restaurante operativo real** (Next 16 / React 19 / Firebase 12), con superficie amplia en main: TPV/Carta, KDS, reservas, catálogo, inventario, Editor V2, importación de carta, analytics y config.

La tensión central: **main funciona, pero el núcleo autoritativo del TPV y la publicación de mapa V2 viven fuera de main**, en ramas publicadas y validadas. Mezclar “existe en el repo” con “está en main” sería un error de producto.

| Capas | Realidad |
| --- | --- |
| Producto usable en main | Sí, con writers cliente y megacomponente Carta |
| Arquitectura TPV objetivo | En `tpv-authoritative-core-block-1` (13 commits, tests verdes) |
| Mapa/publicación V2 | En stack map-publication (+diagnostics), ~60 commits |
| Docs ingeniería 11–15 | En `wire-hostly-master-docs`, no en main |
| Madurez precomercial (doc junio) | ~6.8/10 — sigue vigente como orden de magnitud |

---

## 2. Fotografía Git global

**Baseline:** `origin/main` = `3588059` (2026-07-05) — *fix(editor-v2): increase table resize visual limits*

**Stashes:** vacíos

**Worktrees activos al momento de la auditoría:** principal (contention), map×2, tpv-block-1, docs×2, firebase, delight, master-audit.

```
main (3588059)
├── +13  tpv-authoritative-core-block-1 (92ce7ca)     [DIVERGENT vs map stack]
├── +60  fix-editor-v2-map-publication (c97c6fa)
│        └── +1  …-with-diagnostics (9916efc)
├── +58  audit/firestore-contention-tests (a0ae75d)  [fork cercano al map stack]
├── +1→+2  recover-docs → wire-hostly-master-docs
├── +1  recover-firebase-dev-env
└── +1  recover-tpv-map-delight-reference
Ancestors (ahead=0): carta-categorias…, tpv-stable-june
```

Todas las ramas pendientes están **0 behind** main → rebase no necesario por retraso; el riesgo es **conflicto entre stacks hermanos**.

---

## 3. Main actual

| Aspecto | Estado |
| --- | --- |
| Stack | Next 16.2.1 · React 19.2.4 · Firebase 12.15 · Admin 13.7 · TS 5 |
| Rutas | ~69 pages · 7 layouts · **23** API routes |
| Scripts test en package | Solo `eval:menu-import` (+v2); **no** `test:tpv-*` |
| Docs numerados | 00–10 + **16**; **faltan 11–15** |
| TPV | Cliente SDK + `carta-page-content.tsx` monolito |
| Editor V2 | Presente (draft/publish legacy paths) |
| Rules | `firestore.rules` + `storage.rules` presentes |
| Validación esta auditoría | `node_modules` ausente en worktree de auditoría → **tsc/build no ejecutados en main** |

---

## 4. Funcionalidades fuera de main

| Ref | SHA | Ahead | Clase | ¿En la app “real”? |
| --- | --- | ---: | --- | --- |
| TPV Block 1 | `92ce7ca` | 13 | **PUBLICADO EN RAMA, PENDIENTE** | No en main |
| Map publication | `c97c6fa` | 60 | PUBLICADO EN RAMA, PENDIENTE | No |
| Map + diagnostics | `9916efc` | 61 | PUBLICADO EN RAMA, PENDIENTE (canónica map) | No |
| Contention tests | `a0ae75d` | 58 | Tests + bulk compartido | No |
| Wire docs | `a08481b` | 2 | Docs canónicos candidatos | No |
| Recover docs | `cd69608` | 1 | Docs (subconjunto de wire) | No |
| Firebase stub | `8dfe3ea` | 1 | Dev DX | No |
| Delight CSS ref | `8c54101` | 1 | **HISTÓRICO / REFERENCIA** | No |
| Carta KPIs / tpv-stable-june | — | 0 | Ya en main (históricos) | Sí (integrados) |

---

## 5. Arquitectura

- **Multi-tenant:** frontera `restaurantId`; coexisten `restaurants/{id}/…` canónico y raíces legacy (`restaurantes`, `usuarios`, `mesas`, `productos`).
- **Cliente/servidor en main:** UI escribe mucho vía SDK; Admin en menú-import, invites, printing, OCR.
- **Cliente/servidor en Block1:** mutaciones TPV core → `/api/tpv/**` + Admin txn + locks; UI lee listeners.
- **Runtimes:** Operación (TPV/KDS/Sala/Reservas), Config (carta/espacios/empleados), Inventario, Marketing.
- **Riesgo estructural:** dos stacks grandes (Block1 vs map-publication) tocan TPV/lib/api sin ser linealmente el mismo tip.

---

## 6. Fuentes de verdad

| Entidad | Fuente de verdad (objetivo) | Writers permitidos hoy | Readers | Proyección | Riesgo |
| --- | --- | --- | --- | --- | --- |
| `orders` | Activa por mesa/`tableId` | **main:** cliente · **Block1:** API Admin | TPV/KDS/analytics | items embebidos + orderItems | Alto en main |
| `orderItems` | Proyección de líneas enviadas | **main:** cliente KDS · **Block1:** server | KDS boards | desde sale-lines | Alto en main |
| `tableGroups` | Topology uniones | **main:** cliente · **Block1:** API merge/split | Mapa/TPV | — | Carreras en main |
| `tables` | Layout + occupancy UX | Cliente (ambos) | Mapa/TPV | — | Medio |
| `salaEditorMaps/draft` | Editor | Cliente draft store | Editor | — | Medio |
| `salaEditorMaps/published` | Publish V2 | **Block1/map:** API Admin preferido | TPV readonly | → tables/zones | Medio |
| `floorPlans` / snapshots | Legacy publish | Cliente layouts | TPV legacy | — | Dual con V2 |
| `payments` | Cobros | Cliente (parcial incluso Block1) | Caja/analytics | — | Medio |
| `products` | Catálogo central | Cliente catalog write + APIs | TPV/carta | — | Bajo-medio |
| `reservations` | Reservas | Cliente | Reservas UI | — | Medio |
| inventory movements | Ledger | Cliente | Inventario | — | Deuda |
| `users`/`usuarios` | Perfiles duales | Auth/invites | Gates | — | Legacy dual |
| locks / releaseEffects | Solo Block1 | Server | Server | — | No en main |

**Duplicidades detectadas:** catálogo dual, planos legacy vs published V2, profiles ES/EN, stock localStorage + Firestore.

---

## 7. Módulos (síntesis)

| # | Módulo | Estado | En main | En rama | Notas |
| --- | --- | --- | --- | --- | --- |
| 1 | Auth/sesión | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | Firebase Auth + gates |
| 2 | Usuarios/roles | PARCIAL | Sí | — | Empleados incompletos; capabilities + rules parciales |
| 3 | Multi-tenant | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | Legacy dual |
| 4 | TPV/Carta | FUNCIONAL EN MAIN / core en rama | Monolito cliente | Block1 autoritativo | P0 integración |
| 5 | Mapa operativo | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | map/Block1 | Paridad visual pendiente |
| 6 | Editor V2 | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | map stack | Oval/assets deuda |
| 7 | Publish Editor→TPV | PARCIAL en main / fuerte en rama | Legacy | map+Block1 | Canónica: diagnostics |
| 8–11 | Cocina/Barra/Cóctel/Sala | FUNCIONAL EN MAIN | Sí | Block1 API KDS | Writers cliente en main |
| 12 | Reservas | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | Client writers |
| 13 | Pagos | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | Block1 pay-table | Parciales aún cliente |
| 14 | Caja | PARCIAL | Sesiones/summary | — | Sin módulo caja dedicado |
| 15–17 | Productos/familias/escandallos | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | UX móvil débil |
| 18–19 | Inventario/proveedores | PARCIAL | Sí | — | Híbrido legacy |
| 20 | Onboarding | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | |
| 21 | Import carta / IA | PARCIAL | Pipeline + doc 16 | Doc 13 en wire | Sin “motor” completo |
| 22 | Analítica | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | |
| 23 | Config | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | |
| 24 | Landing | CONSOLIDADO EN MAIN | Sí | — | |
| 25 | Print/activity | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | |
| 26 | Rules/seguridad | PARCIAL | Sí | map stack rules diffs | Capabilities incompletas en orders |
| 27 | Docs internas | PARCIAL en main | 00–10+16 | wire 11–15 | Canónica: wire |

Categorías usadas (exactas):

- CONSOLIDADO EN MAIN
- FUNCIONAL EN MAIN CON OBSERVACIONES
- PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR
- EN DESARROLLO
- PARCIAL
- DEUDA TÉCNICA
- NO INICIADO
- HISTÓRICO / REFERENCIA

---

## 8. TPV

### En main

Ciclo completo **usable** vía cliente: abrir → carrito → persist → send (batch) → KDS update → pay/close. Sin locks, sin `updatedAtMs` CAS, sin release-effects exactly-once, sin join/split atómico con provenance.

### En Block1 (`92ce7ca`) — terminado pero no integrado

14 rutas `/api/tpv/**`: create-open, persist-draft, upsert-sale-lines, cancel, transitions, close/reopen, resolve-active, pay-table, merge/split, release-effects claim/complete.

Confirmado en Block1: lifecycle autoritativo, `tableId`, `updatedAtMs`, KDS API, join/split atómico, provenance, published V2 + cámara, sale-line autoritativa, permisos publish (`settings.manage`).

### Huecos post-Block1

Notas / `paymentRequestedAt`, operator assignment dual, pagos parciales/vouchers, campos UX de `tables`, rules/indexes de locks/effects, docs de contrato en bible.

### Calidad Block1 (ejecutado en esta auditoría)

- `tsc --noEmit`: **0**
- `test:tpv-unit`: **399 pass / 0 fail**
- `test:tpv-server` / build: **no ejecutados** en esta pasada (alcance)

---

## 9. KDS y Sala

- **Main:** boards con writers cliente a `orderItems`; vistas cocina/barra/cóctel/sala operativas.
- **Block1:** avance vía API; listeners read-only.
- **Sala:** ready-to-close + mapa; paridad visual y mesas realistas = P2.
- Legacy `dashboard/cocina` convive con `operacion/cocina`.

---

## 10. Editor V2

| Línea | Rol |
| --- | --- |
| main | Editor + publish legacy / layouts cliente |
| map-publication | Stack grande publicación + TPV readonly map |
| **with-diagnostics** | = publication + 1 commit contexto publisher (**línea canónica futura del mapa**) |
| Block1 | Publish Admin + load published + cámara TPV (overlap con map) |

**Canónica futura recomendada:** integrar **map-publication-with-diagnostics** como base de mapa/publish, y **reconciliar** con Block1 (no merge ciego de ambos tips).

Deuda: oval/visual assets, materiales, snap/resize edge cases.

**TPV Block 1 y map-publication siguen siendo stacks pendientes de reconciliar.**

---

## 11. Productos e inventario

- Catálogo central + APIs familias/categorías; DnD/KPIs ya absorbidos en main (rama histórica).
- Escandallos en productos; UX móvil: botones dominan (pendiente conocido).
- Inventario híbrido (Firestore + local); compras/recepciones/OCR proveedores parciales.
- Import carta: pipeline server + corpus CI; arquitectura doc 16 en main; motor IA doc 13 solo en wire.

---

## 12. Pagos, caja y reservas

- Pagos en TPV (main cliente; Block1 pay-table API).
- Caja = turnos/sesiones + summaries, no módulo caja fiscal completo.
- Reservas funcionales con picker de mapa; writers cliente; consolidación visual pendiente.

---

## 13. Usuarios, roles y permisos

- Capabilities: owner/admin/manager/waiter/kitchen/viewer.
- Invites server; empleados UI incompleta.
- Rules: matriz amplia pero comentarios de gaps en orders/payments/KDS.
- Riesgo: endpoints sin permiso fino + writers cliente = bypass potencial de intención de capabilities.

---

## 14. Firebase y Rules

- Presentes en main; stacks map/audit también tocan rules/indexes.
- Block1 introduce colecciones operativas (`tableOrderLocks`, `tpvReleaseEffects`) → **validar rules/deploy** al integrar.
- `recover-firebase-dev-env`: stub local sin env (DX); no es prod.
- **Sin escrituras Firebase** en esta auditoría.

---

## 15. Writers cliente

**Main (deuda operativa):** orders/orderItems/payments/tableGroups/tables concentrados en Carta + hooks + KDS.

**Block1:** core lifecycle migrado; residual: tables UX, vouchers, notas, operator assign, `persistTableGroups` huérfano.

**Permitidos (por ahora):** catálogo, inventario ledger, reservas, editor draft, auth/billing/print server.

---

## 16. Tests y calidad

| Ref | tsc | unit TPV | server/emulator | build | Notas |
| --- | --- | --- | --- | --- | --- |
| main | no ejec. (sin `node_modules` en wt de auditoría) | N/A scripts | N/A | no ejec. | Solo menu-import eval |
| Block1 | **OK** | **399 OK** | no ejec. | no ejec. | Scripts presentes |
| diagnostics | **OK** | (scripts sí) | no ejec. | no ejec. | |
| wire/docs/delight/firebase | N/A docs/dev | — | — | — | |

Flakiness: contention suite existe en rama audit (aislada); no corrida aquí.

**Huecos de pruebas no ejecutadas (explícitos):** `test:tpv-server`, `npm run build` en main/Block1/diagnostics; suite de contention completa.

---

## 17. UX desktop/tablet/móvil

| Superficie | Lectura |
| --- | --- |
| Desktop | Más madura; Design System parcial vs inline legacy |
| Tablet TPV | Prioritaria; mapa/Delight histórico como referencia |
| Móvil/PDA | Productos botones confusos/colores antiguos; escandallos botones > producto; TPV móvil a revisar; empleados incompleto |
| Mapa TPV | Paridad visual mejorable; mesas realistas/configurables pendientes |
| Editor | Oval/assets deuda |

No se afirma “terminado” sin evidencia de campo.

Pendientes conocidos registrados expresamente:

- Productos móvil/PDA: botones superiores confusos y colores antiguos.
- Escandallos móvil: botones dominan sobre el producto.
- Empleados: módulo incompleto.
- TPV móvil: requiere revisión.
- Mapa TPV: paridad visual todavía mejorable.
- Mesas realistas/configurables: pendiente de evolución.
- Oval / Visual Assets: deuda del Editor V2.

---

## 18. Documentación

| Ubicación | Contenido |
| --- | --- |
| main | 00–10 + 16 menu import; `hostly.mdc` sin 11–15 |
| recover-docs | Añade 11–15 |
| **wire-hostly-master-docs** | 11–15 + cableado jerarquía en 00/01/06/08 + `hostly.mdc` → **rama documental canónica** |
| Delight | `docs/recovered/TPV_MAP_DELIGHT_STYLE_REFERENCE.md` histórico |

**Conflicto numeración:** 15 = Data Model (wire); 16 = Intelligent Menu Import (main). Dentro de 14/15 hay refs aspiracionales a docs 15/16 AI/Firestore **inexistentes**.

---

## 19. Deuda técnica

- Megacomponente Carta (~18k).
- Writers cliente en operación.
- Dualidad legacy/canónica Firestore.
- Dos stacks TPV/mapa divergentes.
- Docs 11–15 fuera de main + refs rotas internas.
- UX móvil/PDA en productos/escandallos/empleados.
- Inventario híbrido.
- Caja incompleta.
- Rules no alineadas del todo con capabilities.

---

## 20. Riesgos P0/P1

| Pri | Riesgo |
| --- | --- |
| **P0** | Mutaciones TPV concurrentes en main sin locks (pérdida/doble envío/cobro) |
| **P0** | Integrar Block1 y map-stack a ciegas → regresiones operativas |
| **P1** | Client writers vs capabilities/rules (superficie de abuso) |
| **P1** | Publish mapa dual (legacy vs V2) hasta unificar |
| **P1** | Colecciones nuevas Block1 sin rules deploy al merge |
| **P2** | UX móvil productos/escandallos/TPV |
| **P2** | Empleados incompletos |
| **P3** | Docs wiring + Delight + firebase stub |

---

## 21. Matriz maestra

| Módulo | Estado | Main | Rama | Tests | Riesgo | Pri | Próximo paso |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TPV core | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR | Parcial cliente | Block1 | Unit 399 OK | Alto | P0 | PR Block1 → main (o base map reconciliada) |
| Map publish V2 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR | Legacy | diagnostics | tsc OK | Alto | P0 | Unificar con Block1 |
| KDS | FUNCIONAL EN MAIN / API en rama | Sí | Block1 | Parcial | Alto | P0 | Va con Block1 |
| Editor V2 | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | map | — | Medio | P1 | Integrar publish canónico |
| Pagos | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | Block1 parcial | — | Medio | P1 | Autoritar parciales |
| Productos | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | — | Medio | P2 | UX móvil |
| Escandallos | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | — | Medio | P2 | UX móvil |
| Empleados | PARCIAL | Sí | — | — | Medio | P2 | Completar módulo |
| Inventario | PARCIAL | Sí | — | — | Medio | P2 | Unificar ledger |
| Reservas | FUNCIONAL EN MAIN CON OBSERVACIONES | Sí | — | — | Medio | P2 | Consolidar |
| Docs 11–15 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR | No | wire | — | Bajo | P3 | PR wire → main |
| Firebase stub | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR | No | recover-firebase | unit en rama | Bajo | P3 | PR → main |
| Delight CSS | HISTÓRICO / REFERENCIA | No | delight | — | Nulo | P4 | Merge docs only |
| Contention | EN DESARROLLO | No | audit | suite propia | Bajo | P3 | Archivar/integrar tests |

Prioridades:

- P0: seguridad, pérdida de datos, operación rota
- P1: bloqueo operativo importante
- P2: producto/UX relevante
- P3: mejora/deuda
- P4: histórico o experimental

---

## 22. Plan de integración de ramas

Orden propuesto (**sin ejecutar**):

1. **`wire-hostly-master-docs` → main**
   Bajo riesgo, desbloquea autoridad documental. Validar enlaces 11–15; no renumerar 16 aún.

2. **`recover-tpv-map-delight-reference` → main**
   Solo docs recovered. Sin CSS ejecutable.

3. **`recover-firebase-dev-env` → main**
   DX local; validar stub no altera prod paths; tests client-config.

4. **Reconciliar mapa + TPV (bloque crítico)**
   - Base preferida de mapa: `fix-editor-v2-map-publication-with-diagnostics`
   - Portar/rebasar **TPV Block 1** sobre esa base (o viceversa tras análisis de overlap)
   - **No** merge directo de ambos tips a main en paralelo
   - Validaciones: tsc, `test:tpv-unit`, `test:tpv-server`, build, smoke TPV/KDS/join-split/publish
   - Esperar conflictos en `carta-page-content`, `lib/tpv`, `app/api`, rules

5. **`audit/firestore-contention-tests`**
   Extraer suite de tests útil sobre la base reconciliada; no integrar tip fork completo a ciegas.

6. **Históricas** (`carta-categorias…`, `tpv-stable-june`)
   No requieren acción (ya en main).

---

## 23. Roadmap recomendado

1. Integrar docs + firebase stub (rápido).
2. **Bloque único:** TPV autoritativo + publish V2 canónico.
3. Rules/indexes para locks/effects.
4. Autoritar residuales (notas, operator, pagos parciales).
5. UX móvil productos/escandallos/empleados/TPV.
6. Unificar inventario/legacy.
7. Caja y analytics de cierre.
8. Reducir monolito Carta tras estabilizar APIs.

---

## 24. Qué NO debe rehacerse

- Reescribir TPV Block 1 desde cero (ya tiene tests estructurales y APIs).
- Reaplicar stashes (vacíos; valor preservado en ramas).
- Pegar CSS Delight sobre Carta/Block1.
- Renumerar doc 16 menú import “para hacer sitio” sin misión.
- Convertir legacy `restaurantes/*` en patrón nuevo.
- Big-bang merge de map-stack + Block1 sin reconciliación.
- Tratar `carta-categorias…` como trabajo pendiente (ya integrado).

---

## 25. Veredicto global

**¿Estado real de Hostly?**

Producto operativo amplio en main, con arquitectura de operación **a medias**: usable en sala, pero el modelo autoritativo (locks, sale-lines, KDS API, join/split, release-effects, publish V2) está **terminado en ramas**, no en main.

**¿Qué está en main?**

App completa legacy-moderna: TPV/KDS/reservas/catálogo/inventario/editor/import/landing; writers cliente; docs 00–10+16; sin `/api/tpv`.

**¿Qué está terminado pendiente de integrar?**

TPV Block 1; map-publication-with-diagnostics; wire docs 11–15; firebase stub; Delight reference (histórico).

**¿Qué está incompleto?**

Empleados, caja, UX móvil, inventario unificado, capabilities↔rules, paridad visual mapa, assets Editor V2, motor IA completo.

**¿Qué impide considerar el producto listo para producción robusta?**

Concurrent writes TPV en main (P0), stacks divergentes sin reconciliar (P0), gaps de seguridad rules/capabilities (P1), deuda de dualidad de datos.

**Esta auditoría no afirma que Hostly esté listo para producción.**

**¿Siguiente bloque de trabajo?**

1. PR docs wire (+ delight + firebase stub).
2. **Bloque de integración TPV+mapa:** reconciliar `with-diagnostics` ↔ Block1 y abrir PR único/secuenciado hacia main con batería TPV.

---

## Apéndice — Referencias Git auditadas

| Ref | SHA corto | Ahead vs main | Clasificación |
| --- | --- | ---: | --- |
| `origin/main` | `3588059` | 0 | Baseline |
| `origin/cursor/tpv-authoritative-core-block-1` | `92ce7ca` | 13 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR |
| `origin/cursor/fix-editor-v2-map-publication` | `c97c6fa` | 60 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR |
| `origin/cursor/fix-editor-v2-map-publication-with-diagnostics` | `9916efc` | 61 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR |
| `origin/audit/firestore-contention-tests` | `a0ae75d` | 58 | EN DESARROLLO / tests |
| `origin/cursor/recover-hostly-master-docs` | `cd69608` | 1 | Docs |
| `origin/cursor/wire-hostly-master-docs` | `a08481b` | 2 | Docs (canónica documental) |
| `origin/cursor/recover-firebase-dev-env` | `8dfe3ea` | 1 | PUBLICADO EN RAMA, PENDIENTE DE INTEGRAR |
| `origin/cursor/recover-tpv-map-delight-reference` | `8c54101` | 1 | HISTÓRICO / REFERENCIA |
| `origin/cursor/carta-categorias-dnd-escandallos-kpis` | `a759750` | 0 | HISTÓRICO (integrado) |
| `origin/tpv-stable-june` | `a952e11` | 0 | HISTÓRICO (integrado) |

### Confirmaciones de método

- Auditoría solo lectura.
- Sin modificación de código de producto.
- Sin push / deploy / merge.
- Stashes vacíos al cierre de la auditoría.
- Validaciones ejecutadas: Block1 `tsc` OK + `test:tpv-unit` 399/399; diagnostics `tsc` OK.
- Validaciones no ejecutadas: build, `test:tpv-server`, suite contention, tsc/build de main en este worktree.
