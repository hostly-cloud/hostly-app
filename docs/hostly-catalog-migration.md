# Migración de catálogo operativo — Hostly

Documentación del paso de **localStorage legacy** (`hostly.platos.v1`) al **catálogo central en Firestore** (`restaurants/{restaurantId}/products`).

## Resumen

| Aspecto | Legacy | Central (objetivo) |
|--------|--------|---------------------|
| Almacenamiento | `localStorage` en un solo navegador | Firestore, multi-dispositivo |
| Edición en `/dashboard/productos` | Solo lectura (fase 10C) | CRUD Firestore (fase 10A) |
| TPV / lectura operativa | Central primario + fallback legacy (9A) | Solo central cuando hay productos |
| Importación IA | Ya no escribe localStorage (10B) | Publica en Firestore |

## Fases implementadas

### 9A — Lectura central primaria + fallback legacy

- Hook `useCentralProductsForCarta` escucha `restaurants/{id}/products`.
- Si hay productos centrales → `source: "central"`.
- Si central vacío o error → fallback a `hostly.platos.v1` (`legacy_local` / `legacy_fallback`).
- TPV y `/dashboard/productos` comparten esta lectura.

### 9B — Preview de migración (sin writes)

- `POST /api/catalog/migration-preview`
- Panel en productos: analiza platos legacy vs central, muestra duplicados/bloqueados/a crear.
- No escribe en Firestore ni modifica localStorage.

### 9C — Migración real idempotente

- `POST /api/catalog/migrate-legacy`
- Crea documentos en Firestore (`doc id = legacyPlatoId`), solo `.create()`.
- Estado en `restaurants/{id}/config/catalogMigration`.
- Rechaza re-migración si `status === "completed"`.
- **localStorage intacto** tras migrar (decisión consciente).

### 10A — CRUD central

- Si `operationalCatalog.source === "central"` → crear/editar/desactivar vía Firestore.
- Helpers en `lib/firestore/central-catalog-write.ts`.

### 10B — Retirada puente import IA → localStorage

- Import IA ya no sincroniza `hostly.platos.v1` tras publicar.
- Productos publicados visibles vía listener central.

### 10C — Legacy solo lectura + migración guiada

- En `legacy_local` / `legacy_fallback`: productos visibles pero **sin escritura** en localStorage.
- Banner + CTA “Previsualizar migración” / “Migrar catálogo”.
- Tras migrar, el listener pasa a `central` y se habilita edición Firestore.

### 11A — Archivo seguro de localStorage

- Helper `archiveLegacyPlatosLocalStorage()` en `lib/carta/archive-legacy-platos-local-storage.ts`.
- UI en `/dashboard/productos` cuando `source === "central"` y aún existe `hostly.platos.v1` con platos del tenant.
- **No archiva automáticamente** al migrar; requiere confirmación explícita.

## Flujo recomendado por restaurante

1. **Comprobar lectura central** — Abrir TPV y productos; verificar que los productos correctos aparecen.
2. **Preview (9B)** — “Previsualizar migración” y revisar totales.
3. **Migrar (9C)** — “Migrar catálogo” con confirmación.
4. **Validar multi-dispositivo** — Otro navegador/dispositivo con la misma cuenta debe ver los mismos productos sin depender de localStorage.
5. **Editar en central (10A)** — Crear/editar un producto de prueba en Firestore.
6. **Archivar local (11A)** — En el navegador donde quedó legacy, “Archivar copia local antigua”.

## Validar multi-dispositivo

1. Migrar catálogo en navegador A.
2. En navegador B (sin legacy o con legacy distinto), iniciar sesión en el mismo restaurante.
3. `/dashboard/productos` debe mostrar `source: central` y los mismos productos.
4. Crear producto en B → debe aparecer en A tras el listener (segundos).
5. TPV en ambos debe listar el catálogo central.

## Archivar localStorage (11A)

### Qué hace

1. Lee el valor completo de `hostly.platos.v1`.
2. Guarda copia en `hostly.platos.v1.archived.{timestamp}`.
3. Escribe metadata en `hostly.platos.v1.archiveMeta`:
   - `archivedAt` (ISO)
   - `count` (platos del restaurante archivado)
   - `reason`: `"catalog_migration_completed"`
   - `archiveKey`
4. **Solo si la copia verifica correctamente**, ejecuta `removeItem("hostly.platos.v1")`.
5. Dispara `hostly-platos-changed` para refrescar listeners.

### Qué NO hace

- No borra Firestore.
- No afecta TPV si ya usa central.
- No archiva en otros navegadores (solo el actual).
- No se ejecuta solo al completar migración 9C.

### Rollback básico (emergencia, consola del navegador)

Si necesitas recuperar la copia archivada **en el mismo navegador**:

```javascript
// 1. Localizar metadata
const meta = JSON.parse(localStorage.getItem("hostly.platos.v1.archiveMeta"));
console.log(meta); // meta.archiveKey → ej. hostly.platos.v1.archived.1716200000000

// 2. Restaurar key activa desde archivo
const backup = localStorage.getItem(meta.archiveKey);
if (backup) {
  localStorage.setItem("hostly.platos.v1", backup);
  window.dispatchEvent(new Event("hostly-platos-changed"));
}
```

Tras restaurar, recarga la app. El fallback legacy volverá a estar disponible hasta que vuelvas a archivar o migres de nuevo.

## Qué NO hacer

- **No** borrar `hostly.platos.v1` a mano sin copia archivada.
- **No** editar productos en localStorage tras 10C (está bloqueado en UI; evitar scripts ad hoc).
- **No** asumir que migrar en un navegador limpia legacy en otros dispositivos.
- **No** retirar el fallback de lectura 9A hasta que todos los tenants activos estén en central.
- **No** re-ejecutar migración 9C si `catalogMigration.status === "completed"` (API 409).

## Comandos de validación

```bash
npx tsc --noEmit
npm run build
```

## Pruebas manuales sugeridas

### Restaurante legacy (sin migrar)

- `/dashboard/productos`: listado visible, acciones de edición deshabilitadas, banner migración visible.
- TPV: productos desde legacy fallback.

### Restaurante central migrado

- CRUD productos funciona.
- Panel “Catálogo local antiguo detectado” si `hostly.platos.v1` sigue presente.
- Archivar → confirmación → key archivada + activa eliminada.
- Recargar → sin fallback legacy; TPV sigue con central.

## Archivos clave

| Área | Ruta |
|------|------|
| Lectura operativa | `lib/carta/use-central-products-for-carta.ts` |
| Legacy client | `lib/carta/legacy-platos-client.ts` |
| Archivo local | `lib/carta/archive-legacy-platos-local-storage.ts` |
| Persistencia legacy | `lib/platos-local.ts` |
| UI migración | `components/productos/catalog-migration-preview-panel.tsx` |
| UI archivo | `components/productos/legacy-platos-archive-panel.tsx` |
| UI productos | `components/productos/productos-management-page.tsx` |
| Migración server | `lib/server/catalog/migrate-legacy-catalog.ts` |
| CRUD central | `lib/firestore/central-catalog-write.ts` |

## Próximos pasos (fuera de 11A)

- **11B (opcional):** retirar fallback legacy de lectura cuando todos los tenants estén centralizados; limpieza de código muerto; feature flag por restaurante.
- Lectura client de `catalogMigration.status` desde Firestore (hoy parcialmente vía sessionStorage).
- Runbook operativo para soporte (restaurar archivo, detectar tenants híbridos).
