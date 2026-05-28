# Hostly Visual System v2

**Constitución visual centralizada** para Hostly (SaaS TPV multi-restaurante).

Este documento **no rediseña pantallas**. Define las reglas que toda UI nueva o migrada debe seguir. La fuente técnica de tokens y clases vive en `app/globals.css`; los componentes compartidos en `components/ui/hostly/` y shells en `components/module-page-shell.tsx`, `components/hostly/page-header.tsx`.

---

## 1. Propósito

| Objetivo | Descripción |
| --- | --- |
| **Unificar** | Una sola escala de alturas, gaps, paddings, radios y tipografía. |
| **Evitar drift** | Prohibir magic numbers, estilos inline arbitrarios y duplicados visuales. |
| **Separar fases** | Polish visual ≠ cambios de lógica / Firestore / realtime. |
| **Preservar marca** | Premium claro: azul hielo, blanco, bordes finos, sombras mínimas. |

---

## 2. Principios inmutables

1. **Tokens primero** — Si no existe token o clase `hostly-*`, no se inventa en JSX.
2. **Componentes antes que CSS local** — Reutilizar `HostlySurface`, `HostlyKpiCard`, `HostlySegmentedControl`, etc.
3. **Un cambio global por fase** — Migraciones visuales incrementales; no mezclar con refactors de datos.
4. **Táctil sin marketing** — Densidad operacional (Toast / Square / Linear), no cards tipo landing.
5. **Sin glassmorphism ni gradientes decorativos** en dashboard operacional (salvo tokens ya definidos como `--hostly-surface-ice-bg`).

---

## 3. Escalas cerradas (permitidas)

### 3.1 Alturas (`min-height` / targets táctiles)

| Token / clase | Valor | Uso |
| --- | --- | --- |
| `--hostly-m-touch-target` | `44px` | Mínimo accesible táctil (referencia) |
| `--hostly-mobile-input-min-h` | `48px` | Inputs, selects |
| `--hostly-mobile-cta-min-h` | `48px` | `.hostly-button-primary\|secondary\|ghost` |
| `--hostly-op-button-compact-min-h` | `40px` | `.hostly-button-compact` |
| `--hostly-op-tab-min-h` | `36px` | Tabs desktop operacional |
| `--hostly-op-tab-min-h-touch` | `42px` | Tabs en `[data-hostly-touch]` |
| `--hostly-m-header-min-h` | `52px` | Cabecera mobile shell |
| `--hostly-op-launcher-height-mobile` | `84px` | Cards launcher `/dashboard/operacion` |
| `--hostly-op-launcher-height-desktop` | `92px` | Cards launcher desktop |

**Regla:** no usar `min-h-[73px]`, `h-[120px]` ni alturas sueltas en Tailwind/inline salvo excepción documentada y aprobada para migración legacy.

### 3.2 Gaps (espaciado entre elementos)

| Token | Valor | Uso |
| --- | --- | --- |
| `--hostly-op-gap-xs` | `6px` | Micro separación |
| `--hostly-op-gap-sm` | `8px` | Acciones header, icono+texto |
| `--hostly-op-gap-md` | `12px` | Grid launcher, stacks operacionales |
| `--hostly-op-gap-lg` | `16px` | Separación sección desktop |
| `--hostly-op-gap-xl` | `20px` | Bloques amplios |
| `--hostly-stack-gap-sm` | `7px` | `.hostly-stack-sm` |
| `--hostly-stack-gap-md` | `10px` | `.hostly-stack-md` |
| `--hostly-stack-gap-lg` | `16px` | `.hostly-stack-lg` |
| `--hostly-section-header-gap` | `10px` | `HostlySectionHeader` fila exterior |
| `--hostly-section-header-title-gap` | `4px` | Título + descripción |
| `--hostly-op-section-gap` | `10px` | Stacks operacionales unificados |
| `--hostly-op-launcher-gap` | `10px` | Grid launcher |
| `--hostly-m-stack-gap` | `12px` | Mobile stack alias |
| `--hostly-m-section-gap` | `clamp(14px, 3.2vw, 20px)` | Secciones mobile |

**Regla:** preferir `gap-[var(--hostly-op-gap-sm)]` o clases `.hostly-stack-*`. Prohibido `gap-[13px]`, `gap-5` arbitrario en UI nueva.

### 3.3 Paddings

| Token | Valor | Uso |
| --- | --- | --- |
| `--hostly-page-pad-x` | `clamp(12px, 2.2vw, 22px)` | Contenedor página |
| `--hostly-page-pad-y` | `clamp(10px, 1.9vw, 20px)` | Contenedor página |
| `--hostly-mobile-pad-x` | `clamp(14px, 4.2vw, 22px)` | Shell mobile |
| `--hostly-mobile-panel-pad` | `16px` | Paneles mobile |
| `--hostly-m-card-pad-compact` | `12px 14px` | Cards compactas mobile |
| `--hostly-m-card-pad-comfortable` | `18px 16px` | Cards cómodas mobile |
| `--hostly-op-kpi-pad-y/x` | `9px` / `12px` | `.hostly-kpi-card` |
| `--hostly-op-tab-pad-x/y` | `12px` / `6px` | Tabs unificados |
| `--hostly-op-button-compact-pad-x` | `14px` | Botones compactos |
| `--hostly-op-launcher-padding` | `12px 14px` | Launcher operación |
| `--hostly-op-header-pad-y` | `8px` | Header operacional mobile |
| `--hostly-op-header-pad-y-compact` | `5px` | Header ultra compacto |
| `--hostly-op-dashboard-header-pad-y` | `var(--hostly-op-header-pad-y)` | `.hostly-page-header--dashboard-module` |
| `--hostly-op-dashboard-content-gap` | `var(--hostly-op-gap-md)` | `.hostly-module-content--dashboard` |

Botones estándar: `padding: 0 18px` (definido en `.hostly-button-*`, no duplicar).

### 3.4 Radios (border-radius)

| Token | Valor | Uso |
| --- | --- | --- |
| `--hostly-radius-sm` | `12px` | KPI, tabs, compact buttons, launcher |
| `--hostly-radius-md` | `14px` | Paneles medianos |
| `--hostly-radius-lg` | `18px` | Tarjetas amplias |
| `--hostly-radius-xl` | `22px` | Énfasis puntual |
| `--hostly-radius-input` | `17px` | `.hostly-input`, `.hostly-select` |
| `--hostly-radius-button` | `14px` | Botones CTA estándar |
| `--hostly-config-radius` | `10px` | Workbench configuración |
| `--hostly-op-launcher-radius` | `var(--hostly-radius-sm)` | Launcher |
| `--hostly-m-drawer-radius` | `20px 20px 0 0` | Drawer mobile |

**Regla:** prohibido `rounded-[17px]`, `borderRadius: 24` en código nuevo. Usar token más cercano.

### 3.5 Tipografía permitida

| Clase / token | Tamaño | Peso | Uso |
| --- | --- | --- | --- |
| `.hostly-page-title` | `18px` | 600 | Título página (shell) |
| `.hostly-page-subtitle` | `12px` | normal | Subtítulo página |
| `--hostly-op-module-title-size` | `clamp(17px, 4.1vw, 20px)` | 650 | Título módulo (mobile + dashboard shell) |
| `--hostly-op-module-subtitle-size` | `11px` | — | Subtítulo módulo (mobile + dashboard shell) |
| `.hostly-heading` | `clamp(16px, 2.1vw, 20px)` | 700 | Sección / bloque |
| `.hostly-section-label` | `11px` uppercase | 700 | Label sección |
| `.hostly-form-label` | `11px` uppercase | 600 | Label formulario |
| `.hostly-kpi-label` | `11px` uppercase | 700 | Label KPI |
| `.hostly-kpi-value` | `clamp(16px, 2.35vw, 21px)` | 800 | Valor KPI |
| `.hostly-muted` | `13px` | 500 | Texto secundario |
| `.hostly-muted--section-lead` | `12px` | 500 | Lead bajo título sección |
| `--hostly-op-tab-font-size` | `12px` | 650 | Tabs unificados |
| `--hostly-op-launcher-title-size` | `clamp(14px, 3.6vw, 16px)` | 700 | Launcher |
| `--hostly-op-launcher-subtitle-size` | `11px` | 500 | Launcher meta |
| Botones estándar | `15px` | 650 | CTA principal |
| `.hostly-button-compact` | `13px` | hereda | Acciones header/listado |

**Fuente:** `Arial, Helvetica, sans-serif` (body global). No introducir familias nuevas sin decisión de producto.

### 3.6 Colores y sombras (solo tokens)

**Tintas:** `--hostly-ink`, `--hostly-ink-strong`, `--hostly-ink-muted`, `--hostly-ink-soft`, `--hostly-ink-faint`.

**Marca:** `--hostly-navy-deep`, `--hostly-navy-mid`, `--hostly-accent`, `--hostly-accent-soft`, escala `--hostly-ice-*`.

**Superficies:** `--hostly-surface-page`, `--hostly-surface-card-solid`, `--hostly-surface-operational`, variantes `HostlySurface`.

**Sombras:** `--hostly-shadow-card`, `--hostly-shadow-float`, `--hostly-shadow-hairline`, `--hostly-shadow-elevated`.

**Tablas:** `--hostly-table-divider`, `--hostly-table-divider-soft`, `--hostly-table-divider-faint`, `--hostly-table-head-surface`, `--hostly-table-row-hover`.

**Estados semánticos (botones):** `.hostly-button-success`, `.hostly-button-danger` (colores fijos ya centralizados).

---

## 4. Densidad por contexto

### 4.1 Mobile (`max-width: 767px` / `[data-hostly-touch]`)

- Shell: `.hostly-module-shell--mobile`, padding bottom `--hostly-op-shell-pad-bottom-mobile`.
- Header: `.hostly-page-header--mobile`, títulos `.hostly-page-title--module-mobile`.
- Tabs: `--hostly-op-tab-min-h-touch`, scroll horizontal en tablists.
- KPI: grid `.hostly-kpi-grid-unified` (2 columnas).
- Launcher: altura `--hostly-op-launcher-height-mobile`, grid 2 columnas.
- Inputs: mínimo `--hostly-mobile-input-min-h`.

### 4.2 Tablet (`768px – 1024px`)

- KPI grid: 3 columnas (`.hostly-kpi-grid-unified`).
- Launcher: 3 columnas, altura `--hostly-op-launcher-height-desktop`.
- Mantener tabs scrollables si overflow.

### 4.3 Desktop (`> 1024px`)

- Contenedores: `--hostly-content-max` (1180px) o `--hostly-content-max-wide` (1400px).
- Headers sticky opcional (`.hostly-page-header`) en shells no operacionales fullscreen.
- Densidad operacional vía `ModulePageShell`: `compactLayout`, `operationalFocus`, `denseWorkbench`.

**Mapa de props `ModulePageShell` (solo presentación):**

| Prop | Efecto visual |
| --- | --- |
| `compactLayout` | Menos aire cabecera/contenido |
| `operationalFocus` | Cabecera discreta, más área útil |
| `denseWorkbench` | Aún más compacto (listado + panel) |
| `denseInventoryHeader` | Header inventario/config carta |
| `lockViewport` | Viewport fijo, scroll interno |
| `shellSurface="configLight"` | Shell claro tipo configuración |

---

## 5. Jerarquías y patrones por pieza

### 5.1 Headers

| Nivel | Componente | Cuándo |
| --- | --- | --- |
| Página | `ModulePageShell` + `HostlyPageHeader` | Toda pantalla dashboard |
| Sección | `HostlySectionHeader` | Bloques dentro de página (listados, paneles) |
| Mobile inmersivo | `.hostly-mobile-header` | Shells TPV/mobile legacy |

**Orden visual:** título fuerte → subtítulo/meta suave → franja `headerBelow` (tabs) → contenido.

### 5.2 Botones

| Jerarquía | Clase | Contexto |
| --- | --- | --- |
| Primaria | `.hostly-button-primary` | Acción principal (guardar, crear) |
| Secundaria | `.hostly-button-secondary` | Cancelar, recargar, secundarias |
| Ghost | `.hostly-button-ghost` | Acciones terciarias / enlaces fuertes |
| Compacta | `.hostly-button-compact` (+ primary/secondary) | Headers, toolbars, listados |
| Peligro | `.hostly-button-danger` | Eliminar, acciones destructivas |
| Éxito | `.hostly-button-success` | Confirmaciones positivas puntuales |

**Regla:** no crear `<button>` con padding/fontSize inline. Combinar clases existentes.

### 5.3 Cards y superficies

| Necesidad | Usar |
| --- | --- |
| Panel genérico | `HostlySurface` `variant="flat\|soft\|ice\|elevated"` |
| Card legacy | `.hostly-card`, `.hostly-panel` (no en pantallas nuevas) |
| KPI | `HostlyKpiCard` + `.hostly-kpi-card` |
| Launcher operación | `.hostly-op-launcher-card` |
| Mobile card | `.hostly-mobile-card`, `--compact`, `--comfortable` |
| Layout columna | `HostlySection` `stack="sm\|md\|lg"` |

### 5.4 KPIs

- **Siempre** `HostlyKpiCard` en dashboards operacionales migrados.
- Grid: `.hostly-kpi-grid-unified`.
- Acento opcional: prop `accentColor` (barra superior 2px).
- No duplicar estructura label/value/helper con divs sueltos.

### 5.5 Segmented controls / tabs

- **Contenedor:** `HostlySegmentedControl` (`aria-label` obligatorio).
- **Hijos:** `button` / `Link` / `a` con `hostlySegmentTabClassName()` o `hostlySegmentPillClassName()`.
- **Estado:** `aria-selected="true"` o `data-active="true"` (ambos soportados en CSS).
- **Hub inventario:** `InventarioRouteTabs` (patrón referencia).
- **Prohibido:** `<div className="hostly-segmented">` suelto sin `--unified` en código nuevo.

### 5.6 Formularios

- Inputs: `.hostly-input`, `.hostly-select`, `.hostly-textarea`.
- Labels: `.hostly-form-label`.
- Focus: `--hostly-focus-ring`.
- Agrupación: `HostlySection` + `HostlySurface variant="soft"`.
- No estilos inline en `padding`/`borderRadius` de campos.

### 5.7 Tablas y listas

- Tabla inventario premium: `.hostly-inv-native-table` + celdas `.hostly-inv-td-*`.
- Divisores: tokens `--hostly-table-divider-*`.
- Hover fila: `--hostly-table-row-hover`.
- Listados mobile: `.hostly-mobile-card`, empty state `.hostly-mobile-empty-state`.

---

## 6. Auditoría — tokens existentes (`app/globals.css`)

Índice de secciones en `:root`:

| Sección | Contenido |
| --- | --- |
| **[A–B]** | Canvas, tintas, superficies base |
| **[D]** | Sombras |
| **[E]** | Gradientes ice (superficies) |
| **[F]** | Stacks verticales |
| **[G]** | Radios canónicos, navy/ice, focus |
| **[H]** | Tablas premium |
| **[I]** | Controles táctiles mobile |
| **[J]** | Aliases mobile `--hostly-m-*` |
| **[K]** | Config dashboard |
| **[L]** | Operacional `--hostly-op-*` + launcher |

Clases operacionales unificadas (post-[L]):

- `.hostly-module-shell--mobile`
- `.hostly-page-header--mobile`, `--compact`
- `.hostly-page-title--module-mobile`, `.hostly-page-subtitle--module-mobile`
- `.hostly-segmented--unified`, `.hostly-tab--unified`, `.hostly-pill--unified`
- `.hostly-segmented-scroll`
- `.hostly-kpi-card`, `.hostly-kpi-grid-unified`
- `.hostly-button-compact`, `.hostly-button-success`, `.hostly-button-danger`
- `.hostly-op-launcher-grid`, `.hostly-op-launcher-card`, `.hostly-op-launcher-*`
- `.hostly-page-header--dashboard-module`, `.hostly-page-title--dashboard-module`, `.hostly-page-subtitle--dashboard-module`
- `.hostly-module-content--dashboard`, `.hostly-back-button--module`
- `.hostly-language-switch`, `.hostly-language-switch__button`, `.hostly-language-switch__button--active`
- `.hostly-analytics-stack`, `.hostly-analytics-panel`, `.hostly-analytics-toolbar*`
- `.hostly-kpi-grid-unified--analytics`, `.hostly-input--toolbar-compact`, `.hostly-select--toolbar-compact`
- Tokens: `--hostly-op-analytics-section-gap`, `--hostly-op-analytics-panel-pad`
- **Dashboard home (`/dashboard`, v2.3):** `.hostly-dashboard-stack*`, `.hostly-kpi-grid-unified--dashboard`, `.hostly-dashboard-op-launcher*`, `.hostly-dashboard-panels-grid`, `.hostly-dashboard-panel*`, `.hostly-dashboard-alert-item[data-tone]`, `.hostly-dashboard-activity-*`, `.hostly-dashboard-module-grid`, `.hostly-dashboard-module-card*`, `.hostly-dashboard-onboarding*`, `.hostly-dashboard-owner-panel`
- Tokens dashboard home: `--hostly-op-dashboard-section-gap`, `--hostly-op-dashboard-panel-pad`, `--hostly-op-dashboard-op-min-h`, `--hostly-op-dashboard-header-pad-y`, `--hostly-op-dashboard-content-gap`

---

## 7. Auditoría — componentes compartidos

| Componente | Ruta | Uso |
| --- | --- | --- |
| `HostlySurface` | `components/ui/hostly/HostlySurface.tsx` | Paneles con borde/sombra canónicos |
| `HostlySection` | `components/ui/hostly/HostlySection.tsx` | Layout columna + stack gap |
| `HostlySectionHeader` | `components/ui/hostly/HostlySectionHeader.tsx` | Título sección + acciones |
| `HostlyKpiCard` | `components/ui/hostly/HostlyKpiCard.tsx` | Métricas compactas |
| `HostlySegmentedControl` | `components/ui/hostly/HostlySegmentedControl.tsx` | Tabs/filtros unificados |
| `hostlySegmentTabClassName` | export en `index.ts` | Clase tab hijo |
| `hostlySegmentPillClassName` | export en `index.ts` | Clase pill hijo |
| `hostlyCx` | `components/ui/hostly/hostly-cx.ts` | Merge classNames |
| `ModulePageShell` | `components/module-page-shell.tsx` | Shell página dashboard |
| `HostlyPageHeader` | `components/hostly/page-header.tsx` | Cabecera título/subtítulo/below; prop `dashboardModule` |
| `HostlyBackButton` | `components/hostly/back-button.tsx` | Volver; prop `moduleChrome` en shell dashboard |
| `LanguageSwitcher` | `components/language-switcher.tsx` | Selector ES/EN utilitario (`.hostly-language-switch`) |
| `HostlyPageContainer` | `components/hostly/page-container.tsx` | Ancho + padding página |
| `InventarioRouteTabs` | `components/inventario/inventario-route-tabs.tsx` | Referencia tabs hub |
| `AnalyticsDateRangeFields` | `components/analysis/AnalyticsDateRangeFields.tsx` | Fechas desde/hasta en toolbar analytics |
| README UI | `components/ui/hostly/README.md` | Guía rápida componentes |

**Export barrel:** `import { … } from "@/components/ui/hostly"`.

---

## 8. Prohibido (lista cerrada)

### Valores y estilos

- `rounded-[Npx]`, `px-[Npx]`, `py-[Npx]`, `min-h-[Npx]`, `gap-[Npx]` con N arbitrario.
- `style={{ padding: …, minHeight: …, borderRadius: … }}` en UI nueva.
- Sombras CSS sueltas (`boxShadow: "0 12px 34px …"`) fuera de tokens.
- Colores hex/rgba inline no mapeados a `--hostly-*`.
- Gradientes decorativos en cards/botones dashboard (salvo tokens [E] en superficies).
- Glassmorphism ad-hoc (`backdrop-filter` fuera de `.hostly-page-header` legacy).

### Componentes y duplicación

- Tabs hechas a mano con botones + padding inline.
- KPI cards custom con estructura paralela a `HostlyKpiCard`.
- Tercera variante de botón “compacto” local.
- Copiar/pegar bloques `hostly-segmented` sin `HostlySegmentedControl`.

### Proceso

- Mezclar polish visual con cambios Firestore/realtime en la misma fase.
- Más de un cambio visual global por fase.
- Rediseñar pantallas completas “de paso” al migrar un control.

---

## 9. Permitido

- Tokens `--hostly-*` y `--hostly-op-*` existentes.
- Clases `.hostly-*` existentes.
- **Nueva clase centralizada** en `globals.css` + entrada en este documento (no en módulo aislado).
- **Nuevo componente** en `components/ui/hostly/` si el patrón se repite ≥2 veces.
- Modificadores Tailwind **semánticos** (`shrink-0`, `min-w-0`, `truncate`) sin sustituir tokens de spacing.
- Tintes contextuales **solo** vía utilidades sobre clases base ya existentes (ej. `!border-emerald-400/35` sobre `.hostly-button-secondary`) en migraciones puntuales — objetivo: eliminar en fases futuras.

---

## 10. Reglas obligatorias para Cursor

1. **Antes de crear UI nueva**, buscar componente `hostly` equivalente (`Glob` / `Grep` en `components/ui/hostly`, `globals.css`).
2. **Si existe**, reutilizarlo. No fork visual local.
3. **Si no existe**, proponer componente reutilizable + token en `globals.css`. No estilos one-off en la página.
4. **No magic numbers** — ni en Tailwind arbitrary ni en `style={}`.
5. **No duplicar** tabs, buttons, cards, KPI grids.
6. **No tocar lógica** al hacer visual polish (handlers, estado, queries, hooks intactos).
7. **No mezclar** refactors visuales con Firestore, auth, onboarding data, TPV/KDS realtime.
8. **Un cambio visual global por fase** (ej. “migrar tabs inventario”, “densidad launcher operación”).
9. **Un cambio lógico crítico por fase** — nunca ambos en el mismo PR/prompt si se puede evitar.
10. **Mantener estética Hostly:** azul hielo, blanco, bordes finos (`--hostly-table-divider-soft`), sombras mínimas (`--hostly-shadow-card`).
11. **Validar** `npm run build` tras cambios visuales; comprobar overflow horizontal mobile.
12. **Actualizar este documento** cuando se añadan tokens o clases nuevas (parte de la misma PR de sistema, no opcional).

### Plantilla de prompt recomendada

```text
Migración visual Hostly Visual System v2 — Fase [N].
Alcance: [módulo/archivo].
Usar: docs/HOSTLY_VISUAL_SYSTEM_V2.md.
NO tocar: lógica, Firestore, [módulos excluidos].
Solo: [tabs | botones | KPI | densidad].
Validar: npm run build.
```

---

## 11. Fases de adopción (roadmap, no ejecutar aún)

| Fase | Alcance | Estado |
| --- | --- | --- |
| **v2.0** | Constitución + tokens documentados | ✅ Este documento |
| **v2.1** | Analytics hub — toolbar + KPI densidad (`hostly-analytics-*`) | ✅ Analytics ventas + tabs análisis |
| **v2.1b** | Tabs/botones sueltos → `HostlySegmentedControl` / `hostly-button-compact` | Parcial (inventario, recepciones…) |
| **v2.2** | Shell dashboard unificado + launcher operación + ES/EN discreto | ✅ `ModulePageShell` + `/dashboard/operacion` |
| **v2.3** | Dashboard home compacto — KPI densos, launcher operación, paneles alertas/actividad, módulos secundarios | ✅ `/dashboard` + clases `.hostly-dashboard-*` |
| **v2.4** | Eliminar inline legacy + skins locales (`.hostly-*-skin`) | Pendiente |
| **v2.5** | Formularios y tablas 100% tokenizados | Pendiente |

---

## 12. Referencias cruzadas

- Tokens fuente: `app/globals.css` (buscar `[L]`, `hostly-op-`, `hostly-button-`).
- Componentes UI: `components/ui/hostly/README.md`.
- QA visual: revisar mobile 767px, tablet 768–1024px, desktop 1280px+.
- Otros docs operativos: `docs/hostly-kds-operational-intelligence.md`, `docs/hostly-release-checklist.md`.

---

*Última actualización: Hostly Visual System v2 — fase 2.3 (dashboard home compacto).*
