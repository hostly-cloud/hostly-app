# Layouts versionados del plano (Hostly)

Nota operativa interna para el equipo. Describe cómo usar los **presets de layout** en el editor de mesas (`Configuración → Mesas`).

## Qué es un layout

Un **layout** es una **instantánea (preset)** de la geometría del plano: posición y forma de mesas, zonas y dimensiones del canvas. Se guarda en `restaurants/{id}/floorPlanSnapshots` con `kind: preset`.

No es un plano distinto ni una copia del restaurante: es un **estado guardado** que se puede **restaurar sobre el plano en vivo** cuando haga falta cambiar la distribución.

Los **tableIds no se regeneran** al activar un layout. El restore actualiza geometría y metadatos de mesas/zonas existentes, crea las que falten y desactiva las que ya no estén en el snapshot; los IDs de mesa se mantienen para no romper comandas, uniones (`tableGroups`) ni el TPV.

## Cuándo guardar uno

Guarda un layout cuando quieras **conservar la distribución actual** antes de un cambio grande o como referencia recurrente:

- Antes de reorganizar mesas para una temporada o un evento.
- Cuando tengas una disposición estable que quieras recuperar más adelante.
- Tras terminar una configuración que el equipo usará a menudo.

En el editor: **Guardar layout** → nombre obligatorio, descripción opcional. El preset aparece en la lista del toolbar del plano.

## Cuándo activar uno

**Activa** un layout cuando quieras **aplicar esa distribución al plano en vivo** (por ejemplo, al abrir terraza en verano o al volver al salón de invierno).

Al activar:

1. Se restaura la geometría del snapshot sobre el estado Firestore actual.
2. Se actualiza el puntero de layout activo del plano.
3. El **TPV refleja los cambios en realtime** (listeners de mesas, zonas y planos); no hace falta recargar la app.

**Importante:** activar un layout **no borra comandas ni pedidos**. Solo cambia la distribución del mapa.

## Qué significa archivar

**Archivar** oculta el preset de la lista del editor. **No modifica el TPV ni el plano en vivo** si ese layout no está activo. Sirve para limpiar presets obsoletos sin perder historial en Firestore.

## Por qué no se puede activar con servicio activo

Si hay **mesas con servicio activo** en el plano (misma regla que la ocupación del mapa en TPV: líneas de pedido activas), **Activar está bloqueado**.

Motivo: cambiar posiciones o desactivar mesas con comanda abierta generaría inconsistencias visuales y operativas. Cierra o finaliza el servicio en esas mesas y usa **Recomprobar** en el toolbar antes de activar.

## Ejemplos de uso

| Escenario | Acción típica |
|-----------|----------------|
| **Verano / terraza** | Guardar layout «Invierno salón»; reorganizar y guardar «Verano terraza»; activar el de verano al abrir temporada. |
| **Invierno** | Activar el preset de salón interior guardado en otoño. |
| **Evento privado** | Guardar layout habitual; montar mesas para el evento; guardar «Evento 20 mayo»; tras el evento, activar el layout habitual. |
| **Terraza parcial** | Variante con menos mesas en exterior; alternar con el layout de terraza completa según aforo o clima. |

## Despliegue del índice Firestore

La lista de presets usa una query filtrada por `floorPlanId`, `isArchived` y orden `updatedAt` desc. Sin el índice compuesto, la app cae a un listen global con filtro en cliente (más lento en restaurantes con muchos snapshots).

Índice en `firestore.indexes.json`:

- Colección: `floorPlanSnapshots` (subcolección de `restaurants/{id}`)
- Campos: `floorPlanId` ASC, `isArchived` ASC, `updatedAt` DESC

Desplegar:

```bash
firebase deploy --only firestore:indexes
```

Tras el despliegue, el índice puede tardar unos minutos en pasar a **Enabled** en la consola de Firebase.

## Referencia técnica (solo lectura)

- Dominio: `lib/firestore/floor-plan-layouts.ts`, `lib/map/layout-restore-plan.ts`
- Editor: toolbar en `components/map/floor-plan-layout-toolbar.tsx`, hook `hooks/useFloorPlanLayouts.ts`
- TPV: badge y listeners realtime en `app/dashboard/carta/carta-page-content.tsx`
