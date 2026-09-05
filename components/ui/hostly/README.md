# Hostly Design System v1

Este directorio es la implementación canónica y única del sistema visual de Hostly.
La denominación histórica “Visual System v2” describe fases técnicas anteriores;
desde ahora el contrato de producto es **Hostly Design System v1**.

## Familias cerradas

- Botones: `HostlyButton` (`primary`, `secondary`, `ghost`, `destructive`, `icon`, `tableAction`, `drawerAction`).
- Cards: `HostlyCard` (`operation`, `configuration`, `kpi`, `action`).
- Filtros métricos: `HostlyFilterCard` (selección neutra y tonos semánticos discretos).
- Formularios: `HostlyField`, `HostlyInput`, `HostlySelect`, `HostlyTextarea` y `HostlyFormToggle`.
- Estados: `HostlyAlert`, `HostlyLoadingState`, `HostlyPermissionState`, `HostlyOperationalEmptyState`.
- Identidad de plan: `HostlyPlanIdentity` (`basic`, `pro`, `ultra`), siempre informativa y sin conceder permisos.
- Overlays: `HostlyDrawer`, siempre con header, body desplazable y footer estable.
- Tablas: familia `HostlyDataTable`, `HostlyMobileList`, `HostlyStatusBadge` y `HostlyRowActions`.

No se deben crear variantes locales cuando una de estas familias cubra el caso.

## Estado de migración

| Área | Componente canónico |
| --- | --- |
| Shell y headers | `ModulePageShell`, `HostlyPageHeader`, `HostlySectionHeader` |
| Acciones | `HostlyButton`, `HostlyRowActionButton` |
| Superficies | `HostlyCard`, `HostlySurface`, `HostlyKpiCard` |
| Formularios | `HostlyField`, controles `Hostly*`, `HostlyFormToggle` |
| Estados | `HostlyAlert`, `HostlyLoadingState`, `HostlyPermissionState`, `HostlyOperationalEmptyState` |
| Identidad de suscripción | `HostlyPlanIdentity` |
| Listados | `HostlyDataTable`, `HostlyMobileList`, `HostlyStatusBadge` |
| Overlays | `HostlyDrawer` |

Los estilos `.hostly-button-*`, `.hostly-input`, `.hostly-select` y demás clases
históricas se mantienen como capa de compatibilidad. No deben originar nuevas
variantes; las pantallas se migran progresivamente a los componentes anteriores.

## Tipografía

Hostly utiliza una única familia: **Geist**, cargada en el layout raíz. `Inter`
permanece únicamente como fallback compatible. La escala semántica es:

- `hostly-type-page-title`
- `hostly-type-section-title`
- `hostly-type-card-title`
- `hostly-type-product-name`
- `hostly-type-body`
- `hostly-type-caption`
- `hostly-type-button`
- `hostly-type-kpi-value` / `hostly-kpi-label`
- `hostly-type-table-cell` / `hostly-type-table-header`

## Iconografía y espaciado

Los iconos usan cuatro tamaños: `--hostly-icon-sm`, `md`, `lg` y `xl`. Acciones
de tabla: 32 px en escritorio y 44 px táctiles. El ritmo de pantalla procede de
`--hostly-space-control`, `--hostly-space-content-stack` y
`--hostly-space-page-section`.

Declarative building blocks wired to **`app/globals.css`** tokens (`--hostly-*`) and Tailwind arbitrary values where needed.

## Cuándo usar qué

| Necesidad | Preferir |
| --- | --- |
| Column layout + ritmo vertical | `HostlySection` (`stack="sm"|"md"|"lg"` → `.hostly-stack-*`) |
| Panel / tarjeta con borde y sombra canónicos | `HostlySurface` (`variant`) |
| Título + subtítulo meta + slots de acciones | `HostlySectionHeader` |
| Métricas compactas con acento opcional | `HostlyKpiCard` |
| Métrica u opción que además filtra | `HostlyFilterCard` + `.hostly-filter-card-grid` |

## Superficies

`HostlySurface` aplica estas clases: `flat` → `hostly-surface-flat`, `soft`, `ice`, `elevated`. El modificador **`interactive`** añade `hostly-surface--interactive`.

La clase legacy **`.hostly-surface`** (sin sufijo) sigue disponible solo por compatibilidad; en pantallas nuevas usar `HostlySurface`.

## Tokens

Fuente única en `:root` dentro de `globals.css`; el bloque lleva índice de secciones (`[A]` … `[K]`).

Ritmo vertical de listados: `--hostly-stack-gap-sm/md/lg` gobiernan `.hostly-stack-*` (véase `HostlySection`); **`--hostly-m-stack-gap`** puede quedar ligeramente más holgado en móvil para shells que lo opt‑in sin perder táctiles.

Radio canónico adicional **`--hostly-radius-sm`** y **`--hostly-radius-xl`**; los prefijos **`--hostly-m-*`** reutilizan esos valores (alias) para que no diverjan.
