# TPV Map Delight — Referencia histórica de estilo

> **Estado:** propuesta visual histórica, **no integrada**.
> **Tipo:** documento de conservación / referencia de diseño.
> **No es CSS ejecutable** de la aplicación.

---

## 1. Contexto

| Campo | Valor |
| --- | --- |
| Origen | `stash@{2}` (e87ba64b7aee556297e0dbc9da57396b3ff72461) |
| Mensaje stash | On `cursor/carta-categorias-dnd-escandallos-kpis`: Trabajo pendiente antes del merge |
| Fecha aproximada | 2026-06-26 (timestamp del stash) |
| Rama base de origen | `cursor/carta-categorias-dnd-escandallos-kpis` @ `a759750` |
| Archivo fuente | `app/dashboard/carta/carta-page-content.tsx` (bloque embebido en `<style dangerouslySetInnerHTML>`) |
| Rango exacto en el blob del stash | líneas **14267–14504** (comentario Delight → cierre del `@media`) |
| Extracción | quirúrgica; **sin** `stash apply` / `pop` / `drop` |
| Fuera de alcance | lógica Carta, JSX, writers, pedidos, pagos, comanda, imports, `docs/HOSTLY_VISUAL_SYSTEM_V2.md` |

El mismo stash contenía un **recorte destructivo** de `docs/HOSTLY_VISUAL_SYSTEM_V2.md` (~443 líneas eliminadas). Ese cambio **no** se recupera aquí.

---

## 2. Intención visual

La propuesta “Delight” buscaba convertir el mapa TPV operativo en una **sala a pantalla completa**, con controles flotantes tipo glass y mesas como foco visual — sin tocar el editor de espacios.

- **Jerarquía:** mesas > superficie de sala > strips/pills flotantes > cabecera compacta (subtítulo oculto).
- **Densidad:** cabecera y métricas comprimidas; strip de ~54px (50px en móvil) superpuesto al mapa.
- **Legibilidad:** número de mesa grande (`clamp(25px, 5.4vw, 34px)`), peso tipográfico alto, label de estado con tracking.
- **Estados libres / ocupadas / reservadas:** gradientes pastel y bordes tintados por clase `--free` / `--occupied` / `--reserved`.
- **Cabecera compacta:** reduce padding del `.hostly-page-header`, achica título, oculta subtítulo cuando `data-carta-map="true"`.
- **Zonas / floor plans:** pills y cluster de planos en strip horizontal con scroll oculto; label/divider/badge “active” ocultos vía `--delight-hidden`.
- **Sensación premium:** `backdrop-filter: blur`, blancos semitransparentes, sombras suaves, `drop-shadow` en mesas, borde redondeado en grid/superficie.

El comentario original lo deja explícito: *“la sala ocupa la pantalla; nunca afecta al editor.”*

---

## 3. Dependencias

### 3.1 Clases y atributos requeridos

**Contenedores / shell**

- `.carta-table-map-shell--delight` (modifier sobre `.carta-table-map-shell`)
- `.carta-root` con `data-carta-map="true"`
- `data-carta-embedded="true"` + `data-carta-mobile="true"` (variante móvil del media query)
- `.carta-page-main--below-header`
- `.hostly-page-header`, `.hostly-page-title`, `.hostly-page-subtitle`

**Strip / pills / zonas / floor plan**

- `.carta-map-metrics-strip-host` (hijo directo del shell Delight)
- `.carta-map-top-strip-line`, `.carta-map-top-strip-main`
- `.carta-map-summary-pill`, `.carta-map-summary-pill--interactive` (+ `[aria-pressed="true"]`)
- `.carta-table-map-zone-btn`
- `.carta-tpv-floor-plan-seg-pill`, `.carta-tpv-floor-plan-trigger`
- `.carta-map-floor-plan-cluster`, `.carta-map-floor-plan-label`, `.carta-map-floor-plan-divider`
- `.carta-tpv-layout-active-badge--delight-hidden`
- `.carta-map-waiter-row`, `.carta-map-waiter-compact select`, `.carta-my-tables-map-scope`

**Mapa / mesas**

- `.carta-table-map-grid`
- `.carta-operational-floor-surface`
- `.hostly-map-table`
- `.hostly-map-table--free` / `--occupied` / `--reserved`
- `.hostly-map-table .table-number`
- `.hostly-map-table-status-label`
- `.hostly-map-table-alert-dot`

### 3.2 Tokens `--hostly-*` usados

- `--hostly-surface-page`
- `--hostly-ice-50`
- `--hostly-line-strong`
- `--hostly-navy-deep`

(Además colores rgba/hex literales en el bloque.)

### 3.3 Acoplamiento a componentes antiguos

El CSS vivía embebido en el megacomponente legacy `carta-page-content.tsx` (shell Carta/TPV monolítico), no en el renderer de mapa V2 actual. En el blob del stash, el markup activaba:

- `className="carta-table-map-shell carta-table-map-shell--delight"`
- `className="... carta-tpv-layout-active-badge--delight-hidden"`
- `data-carta-map={showTableMap ? "true" : undefined}`

Ese JSX **no** se conserva en este documento.

### 3.4 Presencia en `origin/main` (auditoría 2026-08-03)

| Selector / marca | En main |
| --- | --- |
| `carta-table-map-shell--delight` | **Ausente** |
| `data-carta-map` | **Ausente** |
| `carta-operational-floor-surface` | **Ausente** |
| `carta-tpv-layout-active-badge--delight-hidden` | **Ausente** |
| `hostly-map-table--free/occupied/reserved` | Presente (p. ej. `components/map/element-map-card.tsx`) |
| `carta-map-summary-pill` | Presente (legado parcial) |
| `carta-tpv-floor-plan-seg-pill` | Presente (legado parcial) |
| tokens `--hostly-surface-page`, `--hostly-navy-deep`, `--hostly-ice-*` | Presentes en Design System |

### 3.5 Riesgos si se aplicara tal cual sobre el TPV actual

- Selectores Delight / `data-carta-map` no existen en el shell moderno → CSS muerto o parcial.
- Muchos `!important` pelearían con estilos inline / Tailwind del renderer V2.
- Overlay absoluto del strip asume un árbol DOM hijo-directo (`> .carta-map-metrics-strip-host`) que puede no coincidir.
- Gradientes de estado podrían desalinearse de la paleta operativa vigente en `element-map-card`.
- `backdrop-filter` tiene coste en tablet y soporte desigual.
- Pegarlo en Carta o en TPV Block 1 mezclaría legado visual con núcleo autoritativo → **prohibido sin misión explícita de rediseño**.

---

## 4. CSS recuperado

Bloque único extraído del stash (sin TSX/JS, sin resto del `<style>` global de Carta, sin keyframes `fade-in` posteriores a la línea 14504).

```css
/* Mapa operativo Delight: la sala ocupa la pantalla; nunca afecta al editor. */
.carta-table-map-shell--delight {
  isolation: isolate;
  background: var(--hostly-surface-page);
}

.carta-root[data-carta-map="true"] .hostly-page-header {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.carta-root[data-carta-map="true"] .hostly-page-title {
  font-size: 15px;
  letter-spacing: -0.015em;
}

.carta-root[data-carta-map="true"] .hostly-page-subtitle {
  display: none;
}

.carta-root[data-carta-map="true"] .carta-page-main--below-header {
  margin-top: 2px;
}

.carta-table-map-shell--delight > .carta-map-metrics-strip-host {
  position: absolute !important;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 20;
  width: auto !important;
  height: 54px !important;
  min-height: 54px !important;
  max-height: 54px !important;
  padding: 4px 6px !important;
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.92) !important;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07) !important;
  backdrop-filter: blur(10px);
}

.carta-table-map-shell--delight .carta-map-top-strip-line,
.carta-table-map-shell--delight .carta-map-top-strip-main {
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.carta-table-map-shell--delight .carta-map-top-strip-main::-webkit-scrollbar {
  display: none;
}

.carta-table-map-shell--delight .carta-map-summary-pill,
.carta-table-map-shell--delight .carta-map-summary-pill--interactive,
.carta-table-map-shell--delight .carta-table-map-zone-btn,
.carta-table-map-shell--delight .carta-tpv-floor-plan-seg-pill {
  min-height: 44px !important;
  height: 44px !important;
  max-height: 44px !important;
  padding: 0 10px !important;
  border-radius: 999px !important;
  font-size: 11px !important;
  font-weight: 720 !important;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease,
    transform 120ms ease;
}

.carta-table-map-shell--delight .carta-map-summary-pill--interactive:active,
.carta-table-map-shell--delight .carta-table-map-zone-btn:active,
.carta-table-map-shell--delight .carta-tpv-floor-plan-seg-pill:active {
  transform: scale(0.98);
}

.carta-table-map-shell--delight
  .carta-map-summary-pill--interactive[aria-pressed="true"] {
  border-color: var(--hostly-line-strong);
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.07);
}

.carta-table-map-shell--delight .carta-map-floor-plan-label,
.carta-table-map-shell--delight .carta-map-floor-plan-divider,
.carta-table-map-shell--delight .carta-tpv-layout-active-badge--delight-hidden {
  display: none !important;
}

.carta-table-map-shell--delight .carta-map-floor-plan-cluster {
  max-width: min(430px, 42vw);
}

.carta-table-map-shell--delight > .carta-map-waiter-row,
.carta-table-map-shell--delight > .carta-my-tables-map-scope {
  position: absolute;
  top: 68px;
  left: 10px;
  z-index: 19;
  width: auto;
  max-width: calc(100% - 20px);
  min-height: 48px;
  padding: 4px 6px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(8px);
}

.carta-table-map-shell--delight .carta-map-waiter-compact select,
.carta-table-map-shell--delight
  > .carta-my-tables-map-scope
  .carta-table-map-zone-btn {
  min-height: 44px !important;
  height: 44px !important;
}

.carta-table-map-shell--delight .carta-table-map-grid {
  padding: 4px !important;
  border-radius: 16px;
  border-color: rgba(148, 163, 184, 0.2);
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.88), transparent 52%),
    linear-gradient(180deg, var(--hostly-ice-50) 0%, var(--hostly-surface-page) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.72),
    0 8px 28px rgba(15, 23, 42, 0.04);
  overscroll-behavior: contain;
}

.carta-table-map-shell--delight .carta-operational-floor-surface {
  border-radius: 12px;
}

.carta-table-map-shell--delight .hostly-map-table {
  min-width: 44px;
  min-height: 44px;
  border-width: 1.5px !important;
  filter: drop-shadow(0 7px 12px rgba(15, 23, 42, 0.09));
  -webkit-tap-highlight-color: transparent;
}

.carta-table-map-shell--delight .hostly-map-table--free {
  background: linear-gradient(180deg, #edf8f0 0%, #dff0e4 100%) !important;
  border-color: rgba(47, 93, 60, 0.3) !important;
}

.carta-table-map-shell--delight .hostly-map-table--occupied {
  background: linear-gradient(180deg, #e9f4f8 0%, #dcecf3 100%) !important;
  border-color: rgba(45, 82, 97, 0.34) !important;
  filter: drop-shadow(0 8px 14px rgba(37, 73, 90, 0.13));
}

.carta-table-map-shell--delight .hostly-map-table--reserved {
  background: linear-gradient(180deg, #f5f0fa 0%, #ebe4f4 100%) !important;
  border-color: rgba(81, 66, 95, 0.3) !important;
}

.carta-table-map-shell--delight .hostly-map-table .table-number {
  font-size: clamp(25px, 5.4vw, 34px) !important;
  font-weight: 850 !important;
  color: var(--hostly-navy-deep) !important;
}

.carta-table-map-shell--delight .hostly-map-table-status-label {
  font-size: 11px !important;
  font-weight: 780 !important;
  letter-spacing: 0.06em !important;
  color: #40586a !important;
}

.carta-table-map-shell--delight .hostly-map-table-alert-dot {
  width: 12px !important;
  height: 12px !important;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.94) !important;
}

.carta-table-map-shell--delight .hostly-map-table:focus-visible {
  outline: 3px solid rgba(56, 189, 248, 0.38) !important;
  outline-offset: 3px;
}

@media (max-width: 767px) {
  .carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
    .carta-table-map-shell--delight
    > .carta-map-metrics-strip-host,
  .carta-table-map-shell--delight > .carta-map-metrics-strip-host {
    top: 4px !important;
    left: 4px !important;
    right: 4px !important;
    height: 50px !important;
    min-height: 50px !important;
    max-height: 50px !important;
    padding: 3px 4px !important;
    border-width: 1px !important;
    border-radius: 12px !important;
  }

  .carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
    .carta-table-map-shell--delight
    .carta-map-summary-pill,
  .carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
    .carta-table-map-shell--delight
    .carta-map-summary-pill--interactive,
  .carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
    .carta-table-map-shell--delight
    .carta-table-map-zone-btn,
  .carta-root[data-carta-embedded="true"][data-carta-mobile="true"]
    .carta-table-map-shell--delight
    .carta-tpv-floor-plan-trigger,
  .carta-table-map-shell--delight .carta-map-summary-pill,
  .carta-table-map-shell--delight .carta-map-summary-pill--interactive,
  .carta-table-map-shell--delight .carta-table-map-zone-btn,
  .carta-table-map-shell--delight .carta-tpv-floor-plan-trigger {
    min-height: 44px !important;
    height: 44px !important;
    max-height: 44px !important;
    padding: 0 9px !important;
    font-size: 10px !important;
  }

  .carta-table-map-shell--delight > .carta-map-waiter-row,
  .carta-table-map-shell--delight > .carta-my-tables-map-scope {
    top: 58px;
    left: 6px;
    max-width: calc(100% - 12px);
  }

  .carta-table-map-shell--delight .carta-table-map-grid {
    border-radius: 12px !important;
  }
}
```

---

## 5. Estado actual

- **NO** está aplicado en la aplicación.
- **NO** se ha tocado `app/globals.css`, `carta-page-content.tsx` ni código de producto.
- Requiere **adaptación** al renderer / shell V2 actual (clases, layout, tokens operativos).
- **No** debe pegarse directamente sobre Carta ni sobre TPV Block 1.

---

## 6. Recomendación futura

1. Usar este documento **solo como referencia de diseño**.
2. Rediseñar sobre componentes actuales del mapa (p. ej. `element-map-card`, shell de Operación/TPV), no reinyectar el monolito Carta.
3. Respetar la paleta operativa vigente y el Design System.
4. Mantener las **mesas como foco visual**; strips y pills como soporte, no como protagonistas.
5. Si se reimplementa, hacerlo en CSS/módulo del mapa actual con selectores nuevos o adaptados — sin `stash apply`.

---

## 7. Notas de extracción

- Descartado del mismo stash: lógica completa de `carta-page-content.tsx`, markup Delight, y el recorte de `HOSTLY_VISUAL_SYSTEM_V2.md`.
- Descartado del mismo `<style>` embebido: miles de reglas Carta/TPV no Delight (urgencias, comanda, productos, mobile shell genérico, etc.) y el bloque `@keyframes fade-in` / `.animate-fade-in` inmediato posterior (no marcado como Delight).
