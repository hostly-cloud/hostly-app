# Hostly KDS — Operational Intelligence

Capa de **inteligencia operativa** sobre el tablero KDS existente (Cocina, Barra, Coctelería). Mejora lectura, priorización y gestos táctiles **sin alterar** writers Firestore, estados de comanda ni routing por estación.

**Complementa:** smoke tests §14 en [hostly-qa-smoke-tests.md](./hostly-qa-smoke-tests.md) · routing base §5 del mismo runbook.

| Campo | Valor |
|-------|--------|
| **Alcance** | UI + helpers puros en cliente |
| **Vistas** | `/dashboard/operacion/cocina` · `barra` · `cocteleria` |
| **Componente principal** | `components/kds/order-items-board.tsx` |
| **Helpers** | `lib/kds/kds-sla.ts` · `kds-heat-state.ts` · `kds-batch-group.ts` · `kds-smart-collapse.ts` · `kds-focus-ticket.ts` |

---

## Objetivo de la capa

Reducir carga cognitiva en hora punta cuando hay muchas líneas pendientes:

1. **Priorizar** tickets y líneas críticas (SLA + focus).
2. **Agrupar visualmente** repeticiones del mismo plato/bebida dentro de un pase.
3. **Adaptar densidad** del tablero según saturación (normal → ocupado → rush).
4. **Acelerar acciones** con gestos y menú contextual sin cambiar la semántica de `handleMarkNext`.

Todo es **derivado en cliente** a partir del snapshot de `orders` que ya consume el KDS. No introduce colecciones, campos ni reglas nuevas.

---

## Batching visual (sin fusionar Firestore)

### Qué hace

Dentro de cada **pase** (chunk agrupado por envío, bucket ~2 s), líneas con el mismo:

- nombre de producto (normalizado),
- curso (`course`),
- subtítulo de modificadores,
- nota de línea,
- bucket de `sentAt` (~2 s),

se muestran en un **resumen batch** (`2x Gin Tonic`, `3x Croquetas`, …) mediante `buildKdsVisualBatchLines()`.

### Qué NO hace

- **No** fusiona documentos ni líneas en Firestore.
- **No** cambia `orderId` / `itemId`; cada línea sigue marcándose individualmente con `handleMarkNext(orderId, itemId, next)`.
- **No** altera cantidades en comanda; solo la presentación.

### UI

- Si hay **≥ 2 batches visuales** en un pase, aparece `KdsVisualBatchSummary` (“Resumen batch” / “Ver detalle”).
- El operador puede expandir/colapsar el detalle línea a línea (ver [Collapse](#collapse-sessionstorage)).

**Archivos:** `lib/kds/kds-batch-group.ts` · `components/kds/kds-batch-lines.tsx`

---

## SLA por estación

Umbrales desde `sentAt` hasta “ahora” (`resolveKdsSlaLevel`):

| Estación | Atención | Crítico |
|----------|----------|---------|
| **Cocina** (`kitchen`) | ≥ 8 min | ≥ 15 min |
| **Barra** (`bar`) | ≥ 3 min | ≥ 6 min |
| **Coctelería** (`cocktail`) | ≥ 3 min | ≥ 6 min |

### Indicadores en línea

- Pill **Atención** / **Crítico** (`kdsSlaLevelLabel`).
- Barra de progreso hacia el umbral crítico (`kdsSlaProgressRatio`).
- Pulso visual en nivel crítico (CSS `hostly-kds-critical-pulse`).

Los umbrales alimentan también el **heat state**, el **orden de tickets** (`getGroupUrgencyScore`) y el **focus ticket**.

**Archivo:** `lib/kds/kds-sla.ts`

---

## Heat state (normal / busy / rush)

Cabecera `KdsHeatHeader` con KPIs: pendientes, preparados, críticos, SLA medio, batches abiertos.

Modo calculado en `computeKdsHeatSnapshot()`:

| Modo | Etiqueta UI | Condiciones (primera que aplique gana hacia arriba) |
|------|-------------|------------------------------------------------------|
| **normal** | Normal | Por debajo de umbrales busy |
| **busy** | Ocupado | ≥ 12 pendientes **o** ≥ 2 críticos **o** ≥ 6 en atención **o** SLA medio ≥ 65 % del crítico de estación |
| **rush** | Rush | ≥ **24** pendientes **o** ≥ 5 críticos **o** SLA medio ≥ umbral crítico de estación |

Además, **aviso de saturación** (banner opcional) si hay tendencia de cola, SLA o batches abiertos (p. ej. ≥ 18 pendientes y ≥ 4 batches).

### Efecto en UI (rush)

- Atributo `data-kds-rush="true"` en `.hostly-kds-board`.
- Menos padding/gap en pases y chips batch (`kdsRushMode`).
- **Solo densidad visual** — ver [Qué NO toca](#qué-no-toca).

**Archivos:** `lib/kds/kds-heat-state.ts` · `components/kds/kds-heat-header.tsx`

---

## Focus ticket (máximo 2)

`pickKdsFocusTableKeys()` elige hasta **2 mesas/tickets** (`tableKey`) con líneas en `sent`:

1. Puntuación por peor SLA entre sus líneas pendientes.
2. **Prioridad manual** (desde menú rápido) fuerza score alto.
3. Desempate por antigüedad (`oldestSentAtMs`).

### Efectos UI

- Clase `hostly-kds-focus-ticket` en el ticket.
- Boost en ordenación de columnas (+4 en score de grupo).
- Atributo `data-kds-focus-table="{tableKey}"` para scroll automático.

**Archivo:** `lib/kds/kds-focus-ticket.ts`

---

## Collapse (sessionStorage)

Estado de pase/batch colapsado persistido **por sesión de pestaña**:

| Clave | Formato |
|-------|---------|
| Prefijo | `hostly.kds.collapsed` |
| Scope | `{restaurantId}:{kdsStationKind}` (p. ej. `abc123:kitchen`) |
| Batch | `{tableKey}-pase-{index}` |
| Valores | `"1"` colapsado · `"0"` expandido |

### Comportamiento por defecto

- Pase **totalmente preparado** → colapsado por defecto (`defaultCollapsed = true`).
- Toggle manual → `writeKdsBatchCollapsed()`; sobrevive **F5** en la misma pestaña.
- **No** persiste entre pestañas distintas ni tras cerrar navegador (sessionStorage).

**Archivo:** `lib/kds/kds-smart-collapse.ts`

---

## Gestos y quick actions táctiles

Implementados en `KdsLineGestureRow` (solo columnas con acción activa, p. ej. Pendiente → Preparado):

| Gesto | Umbral | Acción |
|-------|--------|--------|
| **Swipe derecha** | ≥ 64 px | Marca línea con el mismo flujo que el botón (`handleMarkNext`) |
| **Doble tap** | ≤ 280 ms entre taps | Igual que swipe |
| **Long press** | 520 ms, sin movimiento > 8 px | Abre menú contextual en coordenadas del dedo |

### Menú rápido (long press)

Opciones **solo cliente**:

1. **Marcar preparado** — delega en `handleMarkNext`.
2. **Prioridad manual** — toggle en `manualPriorityKeys` (afecta focus).
3. **Nota rápida** — `prompt()`; guardada en memoria (`lineQuickNotes`), **no** en Firestore.

Backdrop cierra el menú. Movimiento durante long press cancela el timer (no bloquea scroll del tablero).

**Archivo:** `components/kds/kds-line-gesture-row.tsx`

---

## Auto-focus scroll

Cuando cambia el conjunto de focus tickets, el tablero intenta `scrollIntoView({ behavior: "smooth", block: "nearest" })` hacia el **primer** ticket focus.

### Guardas (no interrumpir al operador)

Scroll automático **solo si**:

1. Hay al menos un focus ticket.
2. `userInteractingRef` es falso (sin pointer activo reciente).
3. Scroll del board **cerca del top** (`scrollTop < 120`).
4. Han pasado **4 s** desde la última interacción (`focusScrollGuardUntilRef`).

Tras `pointerdown`, guardia de 4 s; `pointerup` + 800 ms libera interacción.

---

## Límites conocidos

| Tema | Limitación |
|------|------------|
| **Batching** | Solo dentro del mismo pase/chunk; líneas en pases distintos no se agrupan aunque sean idénticas. |
| **Bucket sentAt** | ~2 s; envíos casi simultáneos en ventanas distintas no batchan juntos. |
| **Rush** | Umbral principal 24 pendientes (30+ en QA garantiza activación); también rush por SLA/críticos. |
| **Focus** | Máx. 2 tickets; sin SLA en atención/crítico y sin prioridad manual → ticket puede no entrar en focus. |
| **Notas rápidas** | Memoria de sesión React; se pierden al recargar (no sessionStorage). |
| **Prioridad manual** | Memoria de sesión; no sincroniza entre dispositivos. |
| **Collapse** | sessionStorage por pestaña; otra tablet no comparte estado. |
| **Gestos** | Optimizado para touch; en desktop el botón clásico sigue siendo la vía principal. |
| **Devolver a pending** | **No implementado** a propósito (fuera de alcance). |
| **Barra / Coctelería** | Agrupación por pases puede estar desactivada según vista; batch visual aplica donde hay chunks de pase. |

---

## Qué NO toca

Esta capa **no modifica**:

| Área | Detalle |
|------|---------|
| **Firestore writers** | `handleMarkNext`, `handlePreparePassChunk`, `applyKitchenMarkNextToRawItems` |
| **Esquema `orders`** | Sin campos nuevos (SLA, focus, notas, collapse) |
| **Routing KDS** | `resolveKdsDestination`, filtros por `station` |
| **TPV** | Envío, cancelación, precios |
| **Stock / ledger** | Movimientos al enviar o cancelar |
| **printJobs** | Impresión cocina/barra |
| **Pagos** | Cobros, cierre de mesa |
| **Lógica de negocio en rush** | Rush no cambia orden Firestore ni auto-marca líneas |

La capa es **presentación + heurísticas cliente** sobre el mismo pipeline operativo documentado en §5 del runbook QA.

---

## Mapa de archivos

```
lib/kds/
  kds-sla.ts              # Umbrales y niveles SLA
  kds-heat-state.ts       # normal / busy / rush
  kds-batch-group.ts      # Agrupación visual por pase
  kds-smart-collapse.ts   # sessionStorage collapse
  kds-focus-ticket.ts     # Selección focus (max 2)

components/kds/
  kds-heat-header.tsx     # Cabecera KPIs + modo
  kds-line-gesture-row.tsx
  kds-batch-lines.tsx     # Resumen batch clickable
  order-items-board.tsx   # Integración
  kitchen-view.tsx        # kdsStationKind="kitchen"
  bar-view.tsx            # kdsStationKind="bar"
  cocktail-view.tsx       # kdsStationKind="cocktail"

app/globals.css           # Clases hostly-kds-*
```

---

## Mantenimiento

| Evento | Acción |
|--------|--------|
| Cambio de umbrales SLA | Actualizar `kds-sla.ts`, este doc y §14.5–14.6 del runbook |
| Cambio de umbrales rush/busy | Actualizar `kds-heat-state.ts`, §14.1 y §14.12 |
| Nuevo gesto o menú | Documentar aquí y añadir caso en §14 |
| Regresión en writers | **Fuera** de esta capa — revisar handlers, no estos helpers |

**Relacionado:** [hostly-qa-smoke-tests.md §14](./hostly-qa-smoke-tests.md#14-kds-operational-intelligence) · [hostly-qa-smoke-tests.md §5](./hostly-qa-smoke-tests.md#5-kds-routing-por-station)
