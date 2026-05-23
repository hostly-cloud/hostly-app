# Hostly — Release checklist

Runbook operativo para despliegues del SaaS TPV. Usar en cada release que toque operación en restaurante (TPV, KDS, catálogo, pagos, mapas).

| Campo | Valor |
|-------|--------|
| **Versión / checkpoint** | `____________` (tag, commit SHA o build ID) |
| **Fecha** | `____________` |
| **Responsable** | `____________` |
| **Entorno** | `staging` / `production` |
| **Restaurante de prueba** | `restaurantId`: `____________` |

---

## Cuándo NO desplegar

No desplegar si se cumple **cualquiera** de estas condiciones:

- `npx tsc --noEmit` o `npm run build` fallan en la rama a desplegar.
- Cambios en `firestore.rules` o `firestore.indexes.json` sin plan de despliegue Firebase coordinado (rules + índices + app en ventana corta).
- Viernes tarde / víspera de festivo local sin equipo de guardia (operación en sala activa).
- Release mezcla **varias capas críticas** a la vez (catálogo + pagos + layouts + KDS) sin smoke test previo en staging.
- Incidencia abierta en producción sin root cause (despliegue encima empeora diagnóstico).
- Variables de entorno críticas no verificadas en el entorno destino (Firebase, API keys IA, tenant lock server).

> **Warning:** Un deploy con rules/índices desincronizados produce `permission-denied` masivo en TPV y KDS. Peor que un rollback de frontend.

---

## Checklist antes de deploy

Marcar cada ítem. Si falla, **parar** y corregir antes de continuar.

### Build y tipos

- [ ] `npx tsc --noEmit` — sin errores
- [ ] `npm run build` — compilación Next.js OK
- [ ] Changelog interno / PR revisado: sin cambios accidentales en `firestore.rules`, `firestore.indexes.json`, env

### Firebase

- [ ] `firestore.rules` — diff revisado; acceso `restaurants/{restaurantId}/...` tenant-safe
- [ ] `firestore.indexes.json` — índices nuevos o modificados listados; plan de `firebase deploy --only firestore:indexes` si aplica
- [ ] Si el release toca queries compuestas: índices **desplegados y en estado READY** antes del frontend

### Variables de entorno críticas

Comprobar en el entorno destino (Vercel / hosting / `.env.production`):

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_FIREBASE_*` | Auth, Firestore, Storage cliente |
| `FIREBASE_ADMIN_*` / service account | API routes server-side |
| `OPENAI_API_KEY` (o equivalente) | Import IA carta, resúmenes |
| `HOSTLY_SERVER_RESTAURANTE_ID` | Lock tenant en servidor (si definido) |
| `NEXT_PUBLIC_HOSTLY_RESTAURANTE_ID` | Fallback dev; no sustituir perfil auth en prod |

- [ ] Ningún secret commiteado en git
- [ ] API keys de IA con cuota suficiente para el día de release

### API y rutas

- [ ] Endpoints nuevos o modificados documentados en PR (`/api/catalog/*`, `/api/menu-imports/*`, etc.)
- [ ] Rutas protegidas: dashboard y APIs exigen auth / `restaurantId` server-side donde corresponda
- [ ] Tenant safety: ningún write acepta `restaurantId` arbitrario sin validación en servidor

### Realtime y costes

- [ ] Sin listeners duplicados obvios en pantallas críticas (un `listenCentralProducts` por vista montada)
- [ ] Cambios en hooks de catálogo/TPV revisados: sin loops `setState` en snapshot
- [ ] Batch writes con chunking en migraciones/import (sin merge peligroso masivo)

### Catálogo / KDS / import IA (si el release los toca)

- [ ] Productos con `station` y `preparationArea` coherentes (`kitchen`/`bar`/`cocktail` ↔ `cocina`/`barra`/`cocteleria`)
- [ ] Tras enviar comanda: `orders.items[]` incluye `station` + `preparationArea` en líneas nuevas
- [ ] Smoke routing: kitchen → Cocina · bar → Barra · cocktail → Coctelería (Barra **sin** cócteles)
- [ ] Import IA: ítems cocktail publican con `station: cocktail` cuando aplique

### UI operativa

- [ ] Smoke visual rápido en viewport móvil (~390px) y tablet (~768px) en TPV y KDS
- [ ] Targets táctiles ≥ 44px en acciones frecuentes del TPV

### Flows críticos (staging, 10–15 min)

Ejecutar `docs/hostly-qa-smoke-tests.md` — al menos bloques **Catálogo central**, **TPV**, **KDS (routing por station)**, **Realtime multi-dispositivo**.

- [ ] Login + carga dashboard
- [ ] TPV abre y lista productos (`source: central`)
- [ ] KDS recibe línea enviada (cocina + barra + coctelería)
- [ ] Catálogo: crear/editar/desactivar producto

**Nota operativa:** Anotar hora de inicio/fin del pre-deploy y cualquier warning en consola.

---

## Checklist después de deploy

Ejecutar en **producción** (o staging si es release de validación) con restaurante real de prueba.

### Acceso y shell

- [ ] Login con usuario operativo real
- [ ] Dashboard carga sin spinner infinito
- [ ] Consola navegador: sin `permission-denied`, sin `INTERNAL ASSERTION FAILED`

### Módulos operativos

| Módulo | Ruta / área | OK |
|--------|-------------|-----|
| TPV | `/dashboard/operacion/tpv` o `/dashboard/carta` | [ ] |
| KDS cocina | `/dashboard/operacion/cocina` | [ ] |
| KDS barra | `/dashboard/operacion/barra` | [ ] |
| KDS coctelería | `/dashboard/operacion/cocteleria` | [ ] |
| Sala | `/dashboard/operacion/sala` | [ ] |
| Catálogo | `/dashboard/productos` — `source: central` | [ ] |
| Import IA | `/dashboard/configuracion/carta/importacion` | [ ] |
| Pagos | Cobro parcial en mesa con servicio | [ ] |
| Joins | Unir mesa ocupada + libre | [ ] |
| Layouts | Toolbar mapas / activar layout | [ ] |

### Multi-dispositivo (2 min)

- [ ] Navegador A: editar precio de un producto
- [ ] Navegador B (misma cuenta/restaurante): TPV refleja cambio sin F5

### Post-deploy registrado

| Campo | Valor |
|-------|--------|
| Hora fin smoke | `____________` |
| Incidencias | `____________` |
| Rollback necesario | sí / no |

---

## Si falla un deploy

### Síntomas frecuentes

| Síntoma | Causa probable | Acción inmediata |
|---------|----------------|------------------|
| TPV vacío o menú legacy antiguo | Catálogo central vacío + fallback; o `restaurantId` distinto | Verificar `source` en productos; perfil auth vs `hostly.restauranteId` |
| `permission-denied` masivo | Rules desplegadas antes que app, o índice faltante | Revisar Firebase Console → Rules / Indexes |
| Productos no sincronizan | Listener caído o tenant distinto | Consola red/Firestore; mismo `restaurantId` en TPV y CRUD |
| KDS sin líneas | Estación / `preparationArea` o pedido no enviado | Reenviar línea; comprobar estación del producto |
| Cóctel en Barra, no en Coctelería | `station` ausente o `bar` en producto/línea | Catálogo: `station: cocktail`; reenviar comanda |
| Gin Tonic / bebida mezclada en Barra | Legacy sin station, categoría “Bebidas” | Configurar `station: cocktail` en catálogo central |
| Import IA 500 | API key o cuota OpenAI | Logs `/api/menu-imports/process` |

### Rollback básico

1. **Frontend:** revertir al deployment anterior en el hosting (Vercel → Promote previous deployment / redeploy tag estable).
2. **Firestore rules/índices:** solo revertir si el release las cambió; `firebase deploy --only firestore:rules` con commit anterior.
3. **No** borrar colección `restaurants/{id}/products` ni hacer hard delete de productos por rollback de UI.
4. Comunicar a operación: “usar deployment N-1 hasta nuevo fix”.
5. Abrir incidencia con: hora, `restaurantId`, pantalla, error consola, commit roto vs commit bueno.

### Escalación

- Datos corruptos en mesa/comanda: **no** tocar `tableIds` ni regenerar IDs; capturar `orderId` / `tableId` y escalar a desarrollo.
- Catálogo: ver `docs/hostly-catalog-migration.md` (archivo legacy, re-migración bloqueada si `completed`).

---

## Mantenimiento de este documento

Actualizar cuando:

- Se añadan módulos críticos nuevos (nueva ruta operativa o API de pagos).
- Cambie el flujo de deploy Firebase (rules, índices, functions).
- Tras un incidente de producción: añadir síntoma + acción a la tabla de fallos.

**Relacionado:** `docs/hostly-qa-smoke-tests.md`, `docs/hostly-catalog-migration.md`
