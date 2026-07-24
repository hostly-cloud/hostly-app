# Hostly — QA smoke tests operativos

Runbook de pruebas manuales en restaurante real (o staging con datos operativos). No sustituye pruebas automatizadas; valida lo que un camarero/encargado notaría en servicio.

| Campo | Valor |
|-------|--------|
| **Versión / checkpoint** | `____________` |
| **Fecha / hora inicio** | `____________` |
| **Tester** | `____________` |
| **Restaurante** | `restaurantId`: `____________` |
| **Dispositivos** | A: `____________` / B: `____________` |
| **Navegadores** | A: `____________` / B: `____________` |

**Duración orientativa:** 30–45 min (completo) · 15–18 min (mínimo pre-release: Catálogo + TPV + KDS station + Realtime).

**Routing KDS (referencia):** `resolveKdsDestination` — `kitchen` → Cocina · `bar` → Barra · `cocktail` → Coctelería · `none` → ninguna vista · legacy sin station → heurística (cóctel → Coctelería, bebida → Barra, resto → Cocina).

> **Warning:** Ejecutar con servicio simulado o en horario bajo. Evitar cambiar layout activo o migrar catálogo en hora punta sin backup operativo.

---

## Convenciones

| Columna | Significado |
|---------|-------------|
| **Escenario** | Situación de sala real |
| **Pasos** | Secuencia táctil (tablet/TPV) |
| **Resultado esperado** | Comportamiento correcto |
| **Errores típicos** | Qué suele fallar y dónde mirar |

Marcar: `[ ]` pendiente · `[x]` OK · `[!]` fallo (anotar en notas al final).

---

## 1. Catálogo central

### 1.1 Crear producto manual

| | |
|--|--|
| **Escenario** | Encargado añade plato nuevo del día |
| **Pasos** | 1. `/dashboard/productos` → comprobar banner sin “solo lectura legacy”<br>2. Crear producto: nombre, precio, categoría, estación cocina / barra / coctelería<br>3. Guardar y verificar `station` + `preparationArea` en Firestore |
| **Resultado esperado** | Documento en `restaurants/{id}/products`; lista gestión actualiza; `source: central` |
| **Errores típicos** | `permission-denied` (rules); producto en otro `restaurantId` (perfil ≠ localStorage) |

- [ ] OK

### 1.2 Editar precio y categoría

| | |
|--|--|
| **Escenario** | Subida de precio antes del servicio |
| **Pasos** | 1. Editar producto existente<br>2. Cambiar precio y categoría<br>3. Guardar |
| **Resultado esperado** | Mismo `productId`; TPV muestra precio nuevo sin recargar (ver §8) |
| **Errores típicos** | Se crea doc nuevo (bug CRUD); TPV sigue precio viejo (listener/tenant) |

- [ ] OK

### 1.3 Desactivar producto (soft delete)

| | |
|--|--|
| **Escenario** | Plato agotado — no debe venderse en TPV |
| **Pasos** | 1. Desactivar/eliminar producto en gestión<br>2. Abrir TPV (`/dashboard/carta` o operación TPV) |
| **Resultado esperado** | Desaparece del menú TPV; sigue visible en gestión (inactivo) si scope management |
| **Errores típicos** | Sigue en TPV (fallback legacy); solo `active:false` pero `visibleOnMenu:true` |

- [ ] OK

### 1.4 Reactivar venta sin forzar carta

| | |
|--|--|
| **Escenario** | Producto inactivo en venta pero fuera de carta digital |
| **Pasos** | 1. Producto inactivo (`isActive`)<br>2. Acción “reactivar venta” (no toggle carta)<br>3. Comprobar flags en gestión y TPV |
| **Resultado esperado** | `active: true`; visibilidad carta/TPV **sin cambio** respecto al estado previo |
| **Errores típicos** | Aparece en TPV al reactivar cuando estaba fuera de carta |

- [ ] OK

### 1.5 Archivar localStorage legacy

| | |
|--|--|
| **Escenario** | Tenant ya migrado; queda copia `hostly.platos.v1` en un navegador |
| **Pasos** | 1. Panel “Catálogo local antiguo detectado”<br>2. Archivar con confirmación<br>3. Recargar TPV y productos |
| **Resultado esperado** | `hostly.platos.v1` archivado; TPV solo central; sin regresión de menú |
| **Errores típicos** | Menú legacy reaparece si central vacío y fallback; archivo sin verificar copia |

- [ ] OK

**Referencias:** `docs/hostly-catalog-migration.md`

---

## 2. Migración legacy

### 2.1 Preview sin writes

| | |
|--|--|
| **Escenario** | Restaurante aún en `legacy_local` |
| **Pasos** | 1. `/dashboard/productos` → “Previsualizar migración”<br>2. Revisar totales: crear / duplicados / bloqueados |
| **Resultado esperado** | JSON preview coherente; **ningún** cambio en Firestore ni localStorage |
| **Errores típicos** | Duplicados no detectados (categoría sin `categoryName` en índice server) |

- [ ] OK

### 2.2 Migración idempotente

| | |
|--|--|
| **Escenario** | Primera migración del tenant |
| **Pasos** | 1. Confirmar migración<br>2. Esperar fin (batch)<br>3. Comprobar `source: central`<br>4. Intentar migrar de nuevo |
| **Resultado esperado** | Productos en central; segunda migración rechazada (`ALREADY_MIGRATED`); legacy localStorage intacto hasta archivo manual |
| **Errores típicos** | Platos legacy inactivos aparecen activos en TPV (revisar `legacyActivo`); duplicados por re-ejecutar con otro navegador |

- [ ] OK

### 2.3 Legacy solo lectura post-migración

| | |
|--|--|
| **Escenario** | Otro navegador aún con `hostly.platos.v1` |
| **Pasos** | 1. Editar producto en UI legacy<br>2. Guardar |
| **Resultado esperado** | Bloqueado / sin escritura localStorage; CTA migración o mensaje solo lectura |
| **Errores típicos** | `savePlatos` escribe en local y desincroniza percepción del menú |

- [ ] OK

---

## 3. Import IA de carta

### 3.1 Publicar borrador

| | |
|--|--|
| **Escenario** | Nueva carta temporada desde foto/PDF |
| **Pasos** | 1. `/dashboard/configuracion/carta/importacion`<br>2. Procesar → revisar → wizard categorías → publicar preview → publicar |
| **Resultado esperado** | Productos en Firestore central; visibles en TPV **sin** sync `hostly.platos.v1`; categoría y estación correctas |
| **Errores típicos** | 500 en `/api/menu-imports/process`; productos en categoría “General” por categorías no creadas |

- [ ] OK

### 3.2 Duplicado con producto existente

| | |
|--|--|
| **Escenario** | Ítem importado ya existe (activo o desactivado) |
| **Pasos** | 1. Importar ítem con mismo nombre normalizado + categoría<br>2. Publicar sin confirmar duplicados |
| **Resultado esperado** | Bloqueo o aviso duplicado; requiere `confirmDuplicates`; no segundo doc con nuevo id |
| **Errores típicos** | Duplica si producto estaba `active: false` y matcher lo ignoraba (regresión) |

- [ ] OK

### 3.3 Re-publicar idempotente

| | |
|--|--|
| **Escenario** | Reintentar publish del mismo draft |
| **Pasos** | 1. Publicar mismo borrador dos veces |
| **Resultado esperado** | Misma cantidad de productos; claves `importedFromMenuDraftId` / `importedMenuItemId` respetadas |
| **Errores típicos** | Duplicados por merge o segundo `addDoc` |

- [ ] OK

---

## 4. TPV

### 4.1 Abrir mesa y añadir líneas

| | |
|--|--|
| **Escenario** | Mesa libre, comanda nueva |
| **Pasos** | 1. Mapa sala → mesa libre<br>2. Añadir 2–3 productos de categorías distintas<br>3. Enviar a cocina/barra |
| **Resultado esperado** | Líneas en comanda; estaciones correctas; totales coherentes |
| **Errores típicos** | Menú vacío (`source` legacy fallback); productos sin `preparationArea` |

- [ ] OK

### 4.2 Cancelar línea ya enviada

| | |
|--|--|
| **Escenario** | Error de pedido en mesa ocupada |
| **Pasos** | 1. Mesa con líneas enviadas<br>2. Cancelar una línea enviada<br>3. Confirmar |
| **Resultado esperado** | Línea cancelada en comanda; KDS refleja anulación; totales actualizados |
| **Errores típicos** | KDS sigue mostrando línea; doble cancelación |

- [ ] OK

### 4.3 Catálogo realtime en TPV

| | |
|--|--|
| **Escenario** | Cambio de carta durante servicio |
| **Pasos** | 1. TPV abierto en mesa<br>2. En otro dispositivo: desactivar un producto visible<br>3. Volver al TPV (misma mesa) |
| **Resultado esperado** | Producto desaparece del selector sin F5; sin flicker prolongado |
| **Errores típicos** | Spinner infinito; menú legacy sustituye central |

- [ ] OK

### 4.4 Enviar producto cocktail desde comanda

| | |
|--|--|
| **Escenario** | Cóctel de carta con `station: cocktail` |
| **Pasos** | 1. TPV → mesa → añadir producto coctelería (p. ej. Mojito)<br>2. Enviar comanda<br>3. Firestore: `orders.items[]` con `station: cocktail` y `preparationArea: cocteleria` |
| **Resultado esperado** | Línea persistida con metadata station; visible solo en Coctelería (§5.4), no en Barra |
| **Errores típicos** | Falta `station` en línea (solo heurística); cóctel cae en Barra |

- [ ] OK

---

## 5. KDS (routing por station)

Tableros operativos: **Cocina** (`/dashboard/operacion/cocina`) · **Barra** (`/dashboard/operacion/barra`) · **Coctelería** (`/dashboard/operacion/cocteleria`).

> **Errores típicos (routing):**
> - Cóctel aparece en **Barra** → revisar `station` / `preparationArea` en producto y en `orders.items[]` tras enviar.
> - Legacy “Gin Tonic” en **Barra** con categoría “Bebidas” y sin station → esperado por heurística; configurar `station: cocktail` en catálogo para forzar Coctelería.
> - Misma línea en dos tableros → duplicado de routing; comprobar `resolveKdsDestination` y que Barra no filtre `cocktail`.

### 5.1 Cocina — solo `station: kitchen`

| | |
|--|--|
| **Escenario** | Plato cocina |
| **Pasos** | 1. Producto con `station: kitchen` (o `preparationArea: cocina`)<br>2. Enviar desde TPV<br>3. Abrir `/dashboard/operacion/cocina` |
| **Resultado esperado** | Ticket solo en Cocina; **no** en Barra ni Coctelería |
| **Errores típicos** | Categoría “bebida” sin station pisa cocina; línea sin `station` en Firestore |

- [ ] OK

### 5.2 Barra — solo `station: bar`

| | |
|--|--|
| **Escenario** | Bebida rápida (cerveza, vino, refresco) |
| **Pasos** | 1. Producto con `station: bar`<br>2. Enviar<br>3. `/dashboard/operacion/barra` |
| **Resultado esperado** | Ticket en Barra; no en Cocina ni Coctelería; **cócteles no aparecen aquí** |
| **Errores típicos** | `preparationArea` mal mapeada; cóctel con `station: cocktail` aún visible en Barra (regresión) |

- [ ] OK

### 5.3 Coctelería — solo `station: cocktail`

| | |
|--|--|
| **Escenario** | Cóctel de carta |
| **Pasos** | 1. Producto con `station: cocktail` (o `preparationArea: cocteleria`)<br>2. Enviar desde TPV<br>3. `/dashboard/operacion/cocteleria` |
| **Resultado esperado** | Ticket solo en Coctelería; badge “Cóctel” opcional; no en Barra ni Cocina |
| **Errores típicos** | Cóctel sigue en Barra (filtro antiguo); falta ruta en hub Operación |

- [ ] OK

### 5.4 Legacy — categoría Cócteles sin station

| | |
|--|--|
| **Escenario** | Producto antiguo sin `station` en línea |
| **Pasos** | 1. Producto legacy categoría “Cócteles” / nombre con “Mojito”<br>2. Enviar<br>3. Revisar Coctelería y Barra |
| **Resultado esperado** | Heurística → **Coctelería**; Barra vacía para esa línea |
| **Errores típicos** | Solo `isBarItem` sin paso cóctel → cae en Barra |

- [ ] OK

### 5.5 Preparar / listo / servido conserva station

| | |
|--|--|
| **Escenario** | Flujo completo en Coctelería |
| **Pasos** | 1. Línea cocktail en pendiente<br>2. Marcar preparado → servido<br>3. Inspeccionar `orders.items[]` en consola o Firestore |
| **Resultado esperado** | `station` y `preparationArea` intactos tras cada transición; recarga KDS → misma vista |
| **Errores típicos** | `applyKitchenMarkNext` pierde metadata (regresión) |

- [ ] OK

### 5.6 Cancelar línea cocktail enviada

| | |
|--|--|
| **Escenario** | Anulación cóctel |
| **Pasos** | 1. Mesa con cóctel enviado<br>2. Cancelar línea desde TPV<br>3. Revisar Coctelería |
| **Resultado esperado** | Línea fuera de activos / anulada como en Cocina-Barra |
| **Errores típicos** | Fantasma en Coctelería; cancelación solo en `orders` sin reflejo |

- [ ] OK

### 5.7 Cancelación desde TPV (cocina / barra)

| | |
|--|--|
| **Escenario** | Anulación tras envío en otras estaciones |
| **Pasos** | 1. Tras §4.2, revisar KDS cocina y barra afectados |
| **Resultado esperado** | Línea anulada o desaparece del tablero activo |
| **Errores típicos** | Estado fantasma en KDS |

- [ ] OK

---

## 6. Pagos

### 6.1 Cobro parcial

| | |
|--|--|
| **Escenario** | Mesa divide cuenta |
| **Pasos** | 1. Mesa ocupada con varias líneas<br>2. Cobrar importe parcial (no total)<br>3. Comprobar saldo pendiente |
| **Resultado esperado** | Registro de pago parcial; resto pendiente; mesa sigue ocupada si hay saldo |
| **Errores típicos** | Mesa cerrada por error; doble cobro; total a cero incorrecto |

- [ ] OK

### 6.2 Cobro total y cierre

| | |
|--|--|
| **Escenario** | Cierre de mesa |
| **Pasos** | 1. Completar cobros hasta total<br>2. Cerrar mesa |
| **Resultado esperado** | Mesa libre en mapa; comanda cerrada; sin líneas colgadas en KDS |
| **Errores típicos** | Mesa sigue ocupada; orden abierta en Firestore |

- [ ] OK

---

## 7. Layouts (mapas)

### 7.1 Activar layout con servicio activo — guard

| | |
|--|--|
| **Escenario** | Cambio de plano con mesas ocupadas |
| **Pasos** | 1. `/dashboard/config/mesas` o configuración espacios<br>2. Intentar activar otro layout versionado con mesas ocupadas |
| **Resultado esperado** | Precheck bloquea o advierte; no rompe `tableIds` ni comandas abiertas |
| **Errores típicos** | Regeneración tableIds; reservas/joins rotos |

- [ ] OK

### 7.2 Restore in-place

| | |
|--|--|
| **Escenario** | Revertir edición de mapa sin servicio crítico |
| **Pasos** | 1. Editar layout en mesas vacías<br>2. Restore versión anterior in-place |
| **Resultado esperado** | `tableIds` preservados; ocupación intacta en mesas con servicio |
| **Errores típicos** | Mesas duplicadas; pérdida de joins |

- [ ] OK

**Referencias:** `docs/hostly-floor-plan-layouts.md`

---

## 8. Joins de mesas

### 8.1 Unir mesa ocupada + libre

| | |
|--|--|
| **Escenario** | Ampliar servicio a mesa contigua |
| **Pasos** | 1. Mesa A ocupada con comanda<br>2. Mesa B libre<br>3. Join A+B |
| **Resultado esperado** | Grupo con comanda unificada; mapa muestra join; TPV opera sobre grupo |
| **Errores típicos** | Dos comandas; B sigue libre en mapa; `tableGroups` inconsistente |

- [ ] OK

### 8.2 Separar join con servicio

| | |
|--|--|
| **Escenario** | Separar mesas al final del servicio parcial |
| **Pasos** | 1. Deshacer join según UI<br>2. Comprobar estados A y B |
| **Resultado esperado** | Estados coherentes; una comanda activa donde corresponda |
| **Errores típicos** | Líneas huérfanas; pagos en mesa equivocada |

- [ ] OK

---

## 9. Realtime multi-dispositivo

### 9.1 Catálogo — editar en A, ver en B

| | |
|--|--|
| **Escenario** | Encargado en office + TPV en tablet sala |
| **Pasos** | 1. Dispositivo A: editar precio producto<br>2. Dispositivo B: TPV abierto (sin recargar) |
| **Resultado esperado** | Precio nuevo en ≤5 s; mismo `restaurantId` (perfil auth) |
| **Errores típicos** | B usa browser id distinto; listener duplicado con flicker |

- [ ] OK

### 9.2 Comanda — línea en A, mapa en B

| | |
|--|--|
| **Escenario** | Sala y barra coordinados |
| **Pasos** | 1. A: añadir línea y enviar<br>2. B: vista mapa/sala misma zona |
| **Resultado esperado** | Mesa ocupada / estado actualizado en B sin F5 |
| **Errores típicos** | Snapshot retrasado; reglas lectura zona |

- [ ] OK

### 9.3 Consola limpia (ambos dispositivos)

| | |
|--|--|
| **Escenario** | Sesión prolongada 15 min |
| **Pasos** | 1. Dejar TPV + productos abiertos<br>2. Inspeccionar consola |
| **Resultado esperado** | Sin `permission-denied`; sin `FIREBASE INTERNAL ASSERTION FAILED`; warnings legacy catalog solo en dev |
| **Errores típicos** | Loop de listeners; fallback legacy en prod con central poblado |

- [ ] OK

### 9.4 KDS — tres tableros sin duplicados

| | |
|--|--|
| **Escenario** | Routing realtime multi-estación |
| **Pasos** | 1. Abrir 3 pestañas: `/dashboard/operacion/cocina`, `.../barra`, `.../cocteleria`<br>2. TPV: enviar 1 producto kitchen, 1 bar, 1 cocktail (misma mesa o mesas distintas)<br>3. Sin recargar, observar cada tablero |
| **Resultado esperado** | Cada línea en **un solo** tablero; ningún duplicado entre Barra y Coctelería |
| **Errores típicos** | Cóctel en Barra y Coctelería; kitchen en barra por categoría sin station |

- [ ] OK

---

## 10. Facturas proveedor OCR

Ruta: `/dashboard/inventario/facturas-proveedor/nueva` · Listado: `/dashboard/inventario/facturas-proveedor`

**Referencias:** `docs/hostly-supplier-invoices-ocr.md`

> **Precondiciones:** usuario autenticado con `restaurantId` válido; productos de inventario existentes (p. ej. Tónica, Coca-Cola); entorno no-producción para demo.

### 10.1 Usar factura demo

| | |
|--|--|
| **Escenario** | QA rápido sin OCR real |
| **Pasos** | 1. Abrir `/dashboard/inventario/facturas-proveedor/nueva`<br>2. Pulsar **Usar factura demo** (solo visible si `NODE_ENV !== production`)<br>3. Comprobar banner *Modo demo QA* y badge *Demo QA* |
| **Resultado esperado** | Borrador cargado con 4 líneas; vista previa SVG; sin subida Storage; botón *Extraer datos* deshabilitado |
| **Errores típicos** | Botón visible en producción; demo sin líneas |

- [ ] OK

### 10.2 Validar KPIs y estados IA

| | |
|--|--|
| **Escenario** | Revisión operativa tras extracción |
| **Pasos** | 1. Con demo o OCR real cargado<br>2. Revisar KPIs: Líneas / Listas / Pendientes / Excluidas / Total<br>3. Comprobar pills por fila: Aprendido, Coincidencia alta, Pendiente, Sin producto, etc.<br>4. Confirmar que **no** se muestran % de confidence |
| **Resultado esperado** | KPIs coherentes con líneas incluidas; estados legibles; pendientes con borde ámbar |
| **Errores típicos** | KPIs desincronizados al excluir líneas; estados genéricos verde/amarillo/rojo sin label |

- [ ] OK

### 10.3 Corregir línea manualmente

| | |
|--|--|
| **Escenario** | Producto OCR sin match automático |
| **Pasos** | 1. Elegir línea pendiente<br>2. Buscar y enlazar producto Hostly<br>3. Ajustar cantidad, unidad o precio unitario si necesario<br>4. Comprobar pill → *Revisado manualmente* o *Lista* |
| **Resultado esperado** | Línea pasa a válida; total recalculado; foco avanza a siguiente pendiente |
| **Errores típicos** | Producto no guardado; unidad incompatible con inventario |

- [ ] OK

### 10.4 Aplicar a líneas similares

| | |
|--|--|
| **Escenario** | Varias líneas OCR con texto parecido |
| **Pasos** | 1. Enlazar producto en una línea fuente<br>2. Aceptar banner *Aplicar a N similares*<br>3. Observar animación cascade en filas afectadas |
| **Resultado esperado** | Líneas similares pendientes heredan mismo producto; KPI *Pendientes* baja |
| **Errores típicos** | Banner no aparece; similares con texto distinto enlazados por error |

- [ ] OK

### 10.5 Registrar factura (modal confirmado)

| | |
|--|--|
| **Escenario** | Cierre operativo con todas las líneas incluidas válidas |
| **Pasos** | 1. Pulsar **Registrar factura** (o Ctrl/Cmd + Enter)<br>2. Revisar resumen en modal: proveedor, total, líneas válidas<br>3. Confirmar registro<br>4. Observar transición success en footer |
| **Resultado esperado** | Modal confirma; feedback *Factura registrada*; sin auto-registro previo |
| **Errores típicos** | Registro con líneas inválidas incluidas; doble clic crea duplicado |

- [ ] OK

### 10.6 Ver supplierInvoice `recorded`

| | |
|--|--|
| **Escenario** | Trazabilidad post-registro |
| **Pasos** | 1. Ir a `/dashboard/inventario/facturas-proveedor`<br>2. Localizar factura recién creada<br>3. Firestore: `restaurants/{id}/supplierInvoices/{invoiceId}` |
| **Resultado esperado** | Documento con `status: "recorded"`; líneas con costes reales; demo con número `DEMO-F-*` si aplica |
| **Errores típicos** | Factura queda en `draft`; registro parcial sin `recordSupplierInvoice` |

- [ ] OK

### 10.7 Ver `unitCost` actualizado

| | |
|--|--|
| **Escenario** | Impacto en coste futuro de inventario |
| **Pasos** | 1. Anotar `inventory.unitCost` previo del producto enlazado<br>2. Tras registro, abrir producto en inventario / Firestore<br>3. Comparar `inventory.unitCost`, `unitCostUnit`, `purchaseCost` |
| **Resultado esperado** | `unitCost` refleja coste real de la línea facturada; línea factura guarda `previousUnitCost` y `updatedInventoryUnitCost` |
| **Errores típicos** | `cost_apply_failed` por unidad incompatible; coste no cambia si línea excluida |

- [ ] OK

### 10.8 Confirmar ventas históricas no cambian

| | |
|--|--|
| **Escenario** | Garantía de histórico inmutable |
| **Pasos** | 1. Identificar venta/cierre **anterior** al registro de factura<br>2. Revisar margen o coste snapshot de esa venta (informe / ticket / Firestore según disponibilidad)<br>3. Registrar factura que altera `unitCost` del producto<br>4. Volver a consultar la venta antigua |
| **Resultado esperado** | Margen/coste de venta histórica **sin cambio**; solo ventas nuevas usan coste actualizado |
| **Errores típicos** | Confundir recálculo de informes agregados con mutación de tickets cerrados |

- [ ] OK

### 10.9 Confirmar alias creado

| | |
|--|--|
| **Escenario** | Aprendizaje persistente entre facturas |
| **Pasos** | 1. Tras enlazar producto manualmente, comprobar panel sesión *Hostly ha aprendido*<br>2. Firestore: `restaurants/{id}/supplierProductAliases` con `normalizedText` del OCR<br>3. (Opcional) Nueva factura con mismo texto → pill *Aprendido* o match automático |
| **Resultado esperado** | Alias con `inventoryProductId`, `usageCount` ≥ 1; match más rápido en siguiente factura |
| **Errores típicos** | Alias no creado si texto OCR vacío; alias erróneo no corregido antes de registrar |

- [ ] OK

### 10.10 Confirmar producción no muestra demo

| | |
|--|--|
| **Escenario** | Seguridad release producción |
| **Pasos** | 1. Desplegar / abrir build con `NODE_ENV=production`<br>2. Ir a `/dashboard/inventario/facturas-proveedor/nueva`<br>3. Buscar botón *Usar factura demo* |
| **Resultado esperado** | Botón demo **ausente**; solo upload + extracción real |
| **Errores típicos** | Demo habilitada en prod por misconfiguración de build |

- [ ] OK

---

## 11. Aliases OCR proveedor

Ruta: `/dashboard/inventario/aliases-proveedor` · Tab hub Inventario: *Aliases OCR*

**Referencias:** `docs/hostly-supplier-invoices-ocr.md` → [Aliases aprendidos](./hostly-supplier-invoices-ocr.md#aliases-aprendidos)

> **Precondiciones:** al menos un alias existente (ejecutar §10.3 + §10.9 antes, o usar factura demo + corrección manual). Productos de inventario cargados.

### 11.1 Alias aprendido tras corregir línea

| | |
|--|--|
| **Escenario** | Primer aprendizaje desde revisión OCR |
| **Pasos** | 1. En `/dashboard/inventario/facturas-proveedor/nueva`, enlazar producto Hostly a línea con texto OCR distintivo<br>2. Ir a `/dashboard/inventario/aliases-proveedor`<br>3. Buscar el `rawText` OCR |
| **Resultado esperado** | Alias listado; estado *Activo*; tipo *Aprendido automáticamente*; `usageCount` ≥ 1 |
| **Errores típicos** | Alias ausente si `rawText` vacío; doc en otro `restaurantId` |

- [ ] OK

### 11.2 Alias usado en siguiente factura

| | |
|--|--|
| **Escenario** | Reutilización del aprendizaje |
| **Pasos** | 1. Tras §11.1, cargar nueva factura (demo u OCR) con **mismo texto OCR**<br>2. Extraer y abrir revisión<br>3. Comprobar pill *Aprendido* y producto pre-enlazado |
| **Resultado esperado** | Match automático vía alias; `usageCount` incrementa en panel aliases |
| **Errores típicos** | Heurística gana por alias inactivo; texto OCR ligeramente distinto sin normalizar igual |

- [ ] OK

### 11.3 Desactivar alias

| | |
|--|--|
| **Escenario** | Pausar auto-match sin borrar |
| **Pasos** | 1. En panel aliases, pulsar **Desactivar** en un alias activo<br>2. Cargar factura con ese texto OCR<br>3. Comprobar que **no** aparece pill *Aprendido* ni pre-match por alias |
| **Resultado esperado** | Estado *Desactivado*; matching OCR ignora el alias; facturas ya registradas intactas |
| **Errores típicos** | Sigue matcheando (alias no refrescado en listener OCR) |

- [ ] OK

### 11.4 Eliminar alias (soft delete)

| | |
|--|--|
| **Escenario** | Retirada operacional del matching |
| **Pasos** | 1. Pulsar **Eliminar** en un alias<br>2. Firestore: comprobar `active: false` y `deletedAt` presente<br>3. Confirmar doc **no** borrado físicamente |
| **Resultado esperado** | Alias desaparece de candidatos matching; documento persiste para auditoría |
| **Errores típicos** | Confundir soft delete con borrado real |

- [ ] OK

### 11.5 Reactivar alias

| | |
|--|--|
| **Escenario** | Recuperar alias desactivado o eliminado |
| **Pasos** | 1. Filtrar estado *Desactivados*<br>2. Pulsar **Activar**<br>3. Repetir §11.2 con mismo texto OCR |
| **Resultado esperado** | `active: true`, `deletedAt` limpio; match *Aprendido* vuelve en OCR |
| **Errores típicos** | Reactivado pero producto enlazado obsoleto |

- [ ] OK

### 11.6 Bulk desactivar

| | |
|--|--|
| **Escenario** | Limpieza masiva |
| **Pasos** | 1. Seleccionar 2+ aliases (checkbox o Espacio)<br>2. Toolbar bulk → **Desactivar**<br>3. Comprobar estado en tabla |
| **Resultado esperado** | Todos pasan a *Desactivado*; ninguno usado en matching posterior |
| **Errores típicos** | Selección parcial; toolbar no sticky en móvil |

- [ ] OK

### 11.7 Cambiar producto enlazado

| | |
|--|--|
| **Escenario** | Corrección duradera de alias erróneo |
| **Pasos** | 1. Abrir panel lateral del alias<br>2. Cambiar producto Hostly en select<br>3. Confirmar modal *“Cambiar este alias afectará futuros matches automáticos.”*<br>4. Nueva factura con mismo OCR |
| **Resultado esperado** | Tipo *Corregido manualmente*; siguiente factura enlaza al **nuevo** producto |
| **Errores típicos** | Cambio sin confirmación; producto incompatible con unidad inventario |

- [ ] OK

### 11.8 Confirmar facturas antiguas no cambian

| | |
|--|--|
| **Escenario** | Inmutabilidad histórica |
| **Pasos** | 1. Anotar `supplierInvoice` ya `recorded` con línea que usó el alias<br>2. Desactivar, eliminar o cambiar producto del alias<br>3. Releer la factura registrada en listado / Firestore |
| **Resultado esperado** | Líneas y costes de factura histórica **sin cambio** |
| **Errores típicos** | Esperar que editar alias retroactivamente modifique facturas pasadas |

- [ ] OK

### 11.9 Confirmar matching ignora inactive/deleted

| | |
|--|--|
| **Escenario** | Filtro de seguridad en pipeline OCR |
| **Pasos** | 1. Tener alias activo que matchea texto OCR conocido (§11.2 OK)<br>2. Desactivar o soft-delete<br>3. Extraer misma factura de nuevo<br>4. Verificar: sin pill *Aprendido*; match solo por heurística o pendiente |
| **Resultado esperado** | `mapSupplierProductAliasesToMatchCandidates` excluye alias; OCR no auto-enlaza |
| **Errores típicos** | Cache local de aliases en sesión OCR sin recargar |

- [ ] OK

### 11.10 Panel similares

| | |
|--|--|
| **Escenario** | Auditoría de aliases parecidos |
| **Pasos** | 1. Crear 2 aliases con textos OCR similares (ej. `TONICA SCHW` y `TONICA SCHWEPPES`)<br>2. Abrir panel lateral de uno<br>3. Revisar sección *Coincidencias similares* |
| **Resultado esperado** | Lista otros aliases activos con score de similitud; ayuda a detectar duplicados |
| **Errores típicos** | Similares incluye aliases desactivados (debe filtrar solo activos) |

- [ ] OK

---

## 12. Timeline producto / auditoría inventario

Ruta: `/dashboard/inventario/productos/{productId}/timeline`

**Referencias:** [hostly-stock-flow.md → Timeline operacional por producto](./hostly-stock-flow.md#timeline-operacional-por-producto) · [Deep-links y export](./hostly-stock-flow.md#deep-links-y-exportación-del-timeline) · `lib/inventory/product-timeline.ts`

> **Precondiciones:** restaurante con inventario activo; productos con escandallo/modificador configurados (§ Flujo TPV en stock-flow); acceso a Inventario, Compras inteligentes y Facturas proveedor.

### 12.1 Venta recipe_sale → consumo recipe

| | |
|--|--|
| **Escenario** | Consumo por escandallo al enviar comanda |
| **Pasos** | 1. Configurar producto vendido con `recipe.enabled` e ingrediente inventario (ej. Ginebra 50 ml)<br>2. TPV → enviar comanda con ese producto<br>3. Abrir timeline del ingrediente (`/dashboard/inventario/productos/{productId}/timeline`) |
| **Resultado esperado** | Evento tipo `recipe_consumption`; título con nombre del plato vendido; Δ negativo en unidad del ingrediente; panel lateral con `movementId`, `orderId`/`lineId` si aplican |
| **Errores típicos** | Sin evento (recipe deshabilitado); movimiento fuera de ventana **50** docs |

- [ ] OK

### 12.2 Venta modifier_sale → consumo modifier

| | |
|--|--|
| **Escenario** | Consumo por modificador enlazado a inventario |
| **Pasos** | 1. Venta con modificador que descuenta producto inventario (ej. Tónica −1 ud)<br>2. Timeline del producto Tónica |
| **Resultado esperado** | Evento `modifier_consumption`; subtítulo con opción modificador; severity info |
| **Errores típicos** | Modificador sin `productId` inventario; confundir con `recipe_consumption` |

- [ ] OK

### 12.3 Cancelación sent/preparing → reversión

| | |
|--|--|
| **Escenario** | Devolución stock tras cancelar línea enviada |
| **Pasos** | 1. Tras §12.1 o §12.2, anotar stock del ingrediente<br>2. TPV → cancelar línea en `sent` o `preparing`<br>3. Refrescar timeline (realtime ≤5 s) |
| **Resultado esperado** | Evento `stock_reversal` con Δ positivo; stock restaurado coherente con movimiento original `applied: true` |
| **Errores típicos** | Cancelar en `prepared` → **sin** reversión (esperado); filtro “Reversión” vacío si no hubo cancelación elegible |

- [ ] OK

### 12.4 Recepción purchase_receipt → entrada stock

| | |
|--|--|
| **Escenario** | Entrada por recepción de compra |
| **Pasos** | 1. Registrar recepción de pedido que incluya el producto (flujo pedidos/recepciones existente)<br>2. Timeline del producto recibido |
| **Resultado esperado** | Evento `stock_in` (source `purchase_receipt`); título “+N ud recibidas”; enlace **Pedido** si `purchaseOrderId` presente |
| **Errores típicos** | Solo evento `purchase_order_received` sin movimiento ledger si recepción no aplicó stock |

- [ ] OK

### 12.5 Factura proveedor → cost_updated

| | |
|--|--|
| **Escenario** | Cambio de coste tras factura registrada |
| **Pasos** | 1. Anotar `inventory.unitCost` previo<br>2. Registrar factura proveedor (`status: recorded`) con línea del producto (§10)<br>3. Timeline del producto |
| **Resultado esperado** | Evento `cost_updated` con “Coste actualizado X → Y €/ud”; `invoiceId` en panel lateral; KPI “Último coste” coherente |
| **Errores típicos** | Factura fuera de ventana **100** docs; línea sin cambio de coste → sin evento |

- [ ] OK

### 12.6 Stock bajo / sin stock → alerta derivada

| | |
|--|--|
| **Escenario** | Cruce de umbral operativo |
| **Pasos** | 1. Producto con `minStock` > 0 configurado<br>2. Consumir hasta quedar ≤ minStock o a 0 (TPV o ajuste)<br>3. Timeline → filtro **Alertas** |
| **Resultado esperado** | Evento `low_stock` y/o `out_of_stock` derivado del movimiento; posible evento sintético “Stock bajo/sin stock actual” si estado vivo coincide |
| **Errores típicos** | Esperar documento Firestore de alerta (no existe); confundir alerta histórica con estado actual |

- [ ] OK

### 12.7 Filtros timeline

| | |
|--|--|
| **Escenario** | Segmentar auditoría por tipo |
| **Pasos** | 1. Con datos de §12.1–12.6, probar filtros: **Todos**, **Consumo**, **Compras**, **Costes**, **Alertas**, **Reversión**<br>2. Añadir rango fechas (desde/hasta) y **Limpiar fechas** |
| **Resultado esperado** | Cada filtro muestra solo tipos correspondientes; rango acota por `timestamp`; vacío amigable si no hay coincidencias |
| **Errores típicos** | `stock_in` visible en Compras pero no en Consumo; fechas TZ desalineadas un día |

- [ ] OK

### 12.8 Panel lateral — payload operacional

| | |
|--|--|
| **Escenario** | Trazabilidad al abrir un evento |
| **Pasos** | 1. Clic en evento de movimiento TPV, factura y pedido<br>2. Revisar panel lateral |
| **Resultado esperado** | Campos visibles: `Tipo`, `Fuente`, `movementId`, `invoiceId`, `purchaseOrderId`, `orderId`, `lineId`, `applied`, `applyError`, `sourceDocumentId`, stock/coste antes→después, timestamp absoluto; enlaces contexto (Pedido / Facturas / TPV) |
| **Errores típicos** | `applied: false` con `applyError` en movimiento pendiente; panel no visible en móvil sin scroll |

- [ ] OK

### 12.9 Accesos desde otras pantallas

| | |
|--|--|
| **Escenario** | Navegación operativa al timeline |
| **Pasos** | 1. **Inventario** → seleccionar producto → **Ver timeline** (bloque movimientos)<br>2. **Compras inteligentes** → columna **Timeline**<br>3. **Facturas proveedor** → enlace **Timeline** en línea de producto |
| **Resultado esperado** | Misma ruta `/dashboard/inventario/productos/{productId}/timeline`; KPIs cabecera cargados; producto correcto |
| **Errores típicos** | `productId` mal codificado en URL; producto sin inventario activo → mensaje “no encontrado” |

- [ ] OK

### 12.10 Límites de historial documentados

| | |
|--|--|
| **Escenario** | Conciencia de truncado en auditoría larga |
| **Pasos** | 1. Producto con >50 movimientos centrales históricos (o >100 pedidos/facturas en restaurante)<br>2. Comparar timeline vs Firestore directo en documento más antiguo fuera de ventana |
| **Resultado esperado** | Timeline **no** muestra eventos fuera de límites (**50** movimientos central · **20** legacy · **100** facturas/pedidos restaurante); KPI consumo 14d usa solo movimientos cargados |
| **Errores típicos** | Reportar “falta historial” como bug sin conocer límites; mezclar truncado con fallo de listener |

- [ ] OK

---

## 13. Timeline deep-links y export auditoría

Ruta timeline: `/dashboard/inventario/productos/{productId}/timeline`

**Referencias:** [hostly-stock-flow.md → Deep-links y exportación del Timeline](./hostly-stock-flow.md#deep-links-y-exportación-del-timeline) · `lib/inventory/product-timeline.ts` · `lib/inventory/product-timeline-export.ts` · `lib/ui/scroll-and-highlight.ts`

> **Precondiciones:** producto con historial mixto (ventas TPV, recepción, factura registrada); al menos una factura **fuera** de las 100 más recientes del restaurante; comanda TPV activa y otra ya cerrada; permisos lectura inventario + operación.

### 13.1 Timeline → factura reciente

| | |
|--|--|
| **Escenario** | Enlace contextual a factura dentro de ventana listener |
| **Pasos** | 1. Timeline producto con evento `cost_updated` reciente<br>2. Panel lateral → enlace **Factura**<br>3. Comprobar URL `?invoiceId=` y scroll |
| **Resultado esperado** | Listado facturas proveedor; fila de factura visible; flash `.hostly-context-highlight` ~2 s; **sin** banner “fuera de ventana” |
| **Errores típicos** | Enlace sin `invoiceId`; highlight antes de render (reintentos fallidos) |

- [ ] OK

### 13.2 Timeline → factura fuera de 100 recientes

| | |
|--|--|
| **Escenario** | Factura antigua no presente en listener |
| **Pasos** | 1. Identificar `invoiceId` fuera del top 100 (`updatedAt`)<br>2. Abrir timeline → enlace **Factura** o URL directa `/dashboard/inventario/facturas-proveedor?invoiceId=…`<br>3. Esperar carga |
| **Resultado esperado** | Banner *Documento enlazado cargado fuera de la ventana reciente*; factura insertada temporalmente en lista; highlight en fila |
| **Errores típicos** | Factura ausente (ID erróneo); `permission-denied` silencioso; desaparece al F5 |

- [ ] OK

### 13.3 Timeline → pedido compra

| | |
|--|--|
| **Escenario** | Enlace a detalle de pedido |
| **Pasos** | 1. Evento `purchase_order_created` o `purchase_order_received` en timeline<br>2. Panel lateral → **Pedido** (sin `receiptId` en URL) |
| **Resultado esperado** | Ruta `/dashboard/inventario/pedidos-compra/{purchaseOrderId}`; detalle pedido cargado |
| **Errores típicos** | Pedido fuera de ventana 100 → timeline no muestra evento (limitación agregación, no deep-link destino) |

- [ ] OK

### 13.4 Timeline → recepción concreta

| | |
|--|--|
| **Escenario** | Deep-link a recepción dentro del pedido |
| **Pasos** | 1. Evento con `purchaseReceiptId` en timeline<br>2. Enlace **Recepción** → URL con `?receiptId=`<br>3. Si recepción no está en listener del pedido, repetir con fetch puntual |
| **Resultado esperado** | Bloque recepciones muestra la fila; highlight en tarjeta; banner fuera de ventana si aplicaba fetch puntual |
| **Errores típicos** | `receiptId` de otro pedido → no insertada; highlight en ID incorrecto |

- [ ] OK

### 13.5 Timeline → TPV orderId + lineId activo

| | |
|--|--|
| **Escenario** | Trazabilidad venta → comanda en servicio |
| **Pasos** | 1. Evento `recipe_consumption` / `modifier_consumption` con `orderId` + `lineId`<br>2. Enlace **TPV** → `/dashboard/operacion/tpv?orderId=…&lineId=…`<br>3. Comanda aún activa (`sent` / `preparing` / …) |
| **Resultado esperado** | Modo TPV; líneas cargadas; scroll + highlight en línea (`hostly-highlight-order-line-{lineId}`); **sin** aviso “Comanda no está activa” |
| **Errores típicos** | Comanda de otro restaurante; línea cancelada sin aviso |

- [ ] OK

### 13.6 Timeline → TPV orderId cerrado

| | |
|--|--|
| **Escenario** | Comanda ya cobrada/cerrada |
| **Pasos** | 1. Enlace TPV a `orderId` con `status: paid` o `closed`<br>2. Observar panel comanda |
| **Resultado esperado** | Aviso *Comanda no está activa*; pantalla estable (no crash); comanda vacía; **no** reconstrucción operativa completa |
| **Errores típicos** | Intentar editar comanda cerrada; spinner infinito |

- [ ] OK

### 13.7 Export CSV respeta filtros

| | |
|--|--|
| **Escenario** | Auditoría acotada por tipo |
| **Pasos** | 1. Timeline → filtro **Consumo** (o **Costes**)<br>2. Opcional: rango fechas<br>3. **Export CSV**<br>4. Abrir CSV |
| **Resultado esperado** | Cabecera indica filtro y rango; filas solo tipos visibles en UI; metadato *Exporta los eventos cargados actualmente*; separador `;` |
| **Errores típicos** | CSV incluye tipos filtrados fuera; BOM ausente en Excel |

- [ ] OK

### 13.8 Export PDF respeta filtros

| | |
|--|--|
| **Escenario** | Informe imprimible acotado |
| **Pasos** | 1. Mismo filtro/rango que §13.7<br>2. **Export PDF** → diálogo impresión<br>3. Revisar vista previa |
| **Resultado esperado** | KPIs cabecera; tabla coincide con lista filtrada; footer con aviso de alcance cargado |
| **Errores típicos** | Popup bloqueado; PDF incluye todos los tipos |

- [ ] OK

### 13.9 Cargar más + export incluye más eventos

| | |
|--|--|
| **Escenario** | Paginación movimientos antes de export |
| **Pasos** | 1. Producto con >50 movimientos centrales<br>2. Anotar contador eventos<br>3. **Cargar más** (una o más veces)<br>4. Export CSV o PDF |
| **Resultado esperado** | Contador sube; export incluye eventos nuevos visibles; metadato menciona movimientos central cargados |
| **Errores típicos** | Export solo listener 50; “Cargar más” deshabilitado sin más docs |

- [ ] OK

### 13.10 Highlight contextual visible

| | |
|--|--|
| **Escenario** | Flash visual coherente en todos los destinos |
| **Pasos** | 1. Repetir §13.1, §13.2, §13.4 y §13.5<br>2. Observar scroll automático y borde/flash ~2 s (`.hostly-context-highlight`) |
| **Resultado esperado** | Elemento destino centrado en viewport; clase removida tras animación; funciona tras fetch puntual async |
| **Errores típicos** | Highlight sin scroll (elemento off-screen); doble highlight en navegación rápida |

- [ ] OK

---

## 14. KDS Operational Intelligence

Rutas: `/dashboard/operacion/cocina` · `barra` · `cocteleria`

**Referencias:** [hostly-kds-operational-intelligence.md](./hostly-kds-operational-intelligence.md) · `lib/kds/*` · `components/kds/order-items-board.tsx` · `kds-line-gesture-row.tsx`

> **Precondiciones:** tablet o touch emulado; comandas con líneas `sent` en la estación bajo prueba; permisos operación KDS. Cocina con agrupación por pases activa (`groupSentPasses`). Para casos de carga, usar staging o servicio bajo (no hora punta real sin acuerdo).

### 14.1 Rush mode — carga alta en cocina

| | |
|--|--|
| **Escenario** | Saturación visual en hora punta |
| **Pasos** | 1. Acumular **30+ líneas pendientes** (`sent`) en Cocina (varias mesas/comandas)<br>2. Observar cabecera `KdsHeatHeader` y badge de modo |
| **Resultado esperado** | Modo **Rush** activo (etiqueta “Rush”, `data-kds-rush="true"` en tablero); densidad reducida (menos padding/gap); **sin** cambio en orden Firestore ni auto-preparación |
| **Errores típicos** | Rush no aparece con ≥ 24 pendientes (regresión heat); cambia lógica de marcar preparado |

- [ ] OK

### 14.2 Batch visual — mismo producto / modifiers / pase

| | |
|--|--|
| **Escenario** | Repeticiones del mismo ítem en un pase |
| **Pasos** | 1. Enviar 2× (o 3×) el **mismo producto** con mismos modificadores y nota en el **mismo envío/pase** (~2 s)<br>2. Abrir ticket en Cocina → columna Pendiente |
| **Resultado esperado** | Resumen batch `2x …` / `3x …` en `KdsVisualBatchSummary`; al expandir, **N líneas** con `orderId:itemId` distintos |
| **Errores típicos** | Una sola fila Firestore fusionada (bug grave); batches en pases distintos agrupados juntos |

- [ ] OK

### 14.3 Preparar una línea dentro de batch

| | |
|--|--|
| **Escenario** | Marcar parcialmente un batch |
| **Pasos** | 1. Batch con ≥ 2 líneas pendientes<br>2. Marcar **solo una** línea preparada (botón o swipe)<br>3. Observar batch y columna Listo |
| **Resultado esperado** | **Solo** esa línea pasa a Listo; el resto sigue Pendiente; resumen batch actualiza cantidad (p. ej. `2x` → `1x` + otra línea suelta) |
| **Errores típicos** | Todo el batch preparado de golpe; IDs mezclados |

- [ ] OK

### 14.4 Preparar pase completo — batch colapsa

| | |
|--|--|
| **Escenario** | Cierre visual de pase |
| **Pasos** | 1. Pase con varias líneas pendientes<br>2. Preparar **todas** (línea a línea o botón pase completo)<br>3. Observar UI del pase |
| **Resultado esperado** | Pase marcado completado (✓, opacidad reducida); detalle **colapsado por defecto**; resumen batch en modo colapsado |
| **Errores típicos** | Pase expandido tras completar; líneas vuelven a Pendiente |

- [ ] OK

### 14.5 SLA cocina — atención y crítico

| | |
|--|--|
| **Escenario** | Umbrales SLA cocina |
| **Pasos** | 1. Línea cocina `sent` con `sentAt` simulado o espera real<br>2. Comprobar pill/barra a **> 8 min** y **> 15 min** |
| **Resultado esperado** | **> 8 min** → pill **Atención**; **> 15 min** → **Crítico** + pulso; barra progreso hacia 15 min |
| **Errores típicos** | Umbrales de barra aplicados en cocina; sin indicador SLA |

- [ ] OK

### 14.6 SLA barra / coctelería — atención y crítico

| | |
|--|--|
| **Escenario** | Umbrales SLA bebidas |
| **Pasos** | 1. Repetir §14.5 en **Barra** y **Coctelería** con líneas `station` correctas<br>2. Esperar o ajustar reloj de prueba **> 3 min** y **> 6 min** |
| **Resultado esperado** | **> 3 min** → Atención; **> 6 min** → Crítico; heat/KPIs usan mismos umbrales |
| **Errores típicos** | SLA cocina (8/15) en barra; línea en tablero equivocado (ver §5) |

- [ ] OK

### 14.7 Focus ticket — máximo 2

| | |
|--|--|
| **Escenario** | Priorización visual de mesas |
| **Pasos** | 1. ≥ 3 mesas con líneas en atención/crítico (o prioridad manual)<br>2. Contar tickets con clase `hostly-kds-focus-ticket` |
| **Resultado esperado** | **Como máximo 2** tickets focus; los de peor SLA (o prioridad manual) destacados; orden de columna favorece focus |
| **Errores típicos** | > 2 focus; ningún focus con cola crítica |

- [ ] OK

### 14.8 Swipe prepara línea

| | |
|--|--|
| **Escenario** | Gesto rápido en tablet |
| **Pasos** | 1. Columna Pendiente, línea con acción activa<br>2. **Swipe derecha** ≥ 64 px sobre la fila |
| **Resultado esperado** | Misma transición que botón “Preparado” (`handleMarkNext`); feedback de guardado; línea en Listo |
| **Errores típicos** | Swipe scrolla tablero sin marcar; doble disparo |

- [ ] OK

### 14.9 Long press — menú sin romper scroll

| | |
|--|--|
| **Escenario** | Menú contextual táctil |
| **Pasos** | 1. Mantener **long press** ~0,5 s sobre línea pendiente<br>2. Mover dedo ligeramente (> 8 px) antes de soltar<br>3. Repetir long press sin mover → menú con Marcar preparado / Prioridad / Nota |
| **Resultado esperado** | Movimiento cancela menú y permite **scroll normal**; long press estático abre menú flotante; backdrop cierra |
| **Errores típicos** | Scroll bloqueado; menú bajo el dedo ilegible |

- [ ] OK

### 14.10 Auto-scroll — no salta si operador interactúa

| | |
|--|--|
| **Escenario** | Focus automático vs uso manual |
| **Pasos** | 1. Estar scrolleado abajo en tablero **o** mantener pointer/touch activo<br>2. Provocar cambio de focus (nueva mesa crítica o prioridad manual)<br>3. Repetir con scroll cerca del top y sin interacción 4+ s |
| **Resultado esperado** | **Sin** salto brusco mientras interactúa o lejos del top; **con** scroll suave al primer focus solo si cerca del top y guardia de 4 s cumplida |
| **Errores típicos** | scrollIntoView interrumpe preparación; nunca hace focus scroll |

- [ ] OK

### 14.11 Collapse persiste al recargar

| | |
|--|--|
| **Escenario** | sessionStorage por estación |
| **Pasos** | 1. Colapsar manualmente un pase (toggle “Ver detalle” / resumen batch)<br>2. **F5** en la misma pestaña<br>3. Comprobar clave scope `{restaurantId}:{station}` |
| **Resultado esperado** | Estado colapsado/expandido **igual** tras recarga; pase ya completado sigue colapsado por defecto |
| **Errores típicos** | Estado perdido; otra estación (barra vs cocina) comparte clave incorrecta |

- [ ] OK

### 14.12 Rush — solo densidad visual, no lógica

| | |
|--|--|
| **Escenario** | Regresión lógica vs UI |
| **Pasos** | 1. Con modo Rush activo (§14.1)<br>2. Marcar preparado, preparar pase, cancelar desde TPV<br>3. Comparar comportamiento con modo Normal (pocas líneas) |
| **Resultado esperado** | Mismas transiciones Firestore y routing; solo cambian clases CSS, padding y `data-kds-rush`; writers idénticos |
| **Errores típicos** | Auto-preparación en rush; campos nuevos en `orders` |

- [ ] OK

---

## 15. Roles y permisos

**Referencias:** [hostly-roles-permissions.md](./hostly-roles-permissions.md) · `lib/auth/hostly-capabilities.ts` · `firestore.rules`

> **Precondiciones:** staging o restaurante de prueba; acceso consola Firebase para ajustar `users/{uid}.role`; **app 5E/5F** desplegada; rules **Fase 5B + 5C + 5D** desplegadas (`firebase deploy --only firestore:rules`).  
> **Duración orientativa:** 50–70 min (5B + 5C + **5D–5F** TPV refunds/cancelledLineIds).

### Preparación de cuentas de prueba

| Cuenta | `users/{uid}.role` sugerido | Rol normalizado |
|--------|----------------------------|-----------------|
| A — Owner | `owner` | owner |
| B — Staff histórico | `staff` | waiter |
| C — Waiter | `waiter` | waiter |
| D — Kitchen | `kitchen` | kitchen |
| E — Viewer | `viewer` | viewer |
| F — Manager | `manager` | manager |

Mismo `restaurantId` en todas las cuentas. Cerrar sesión / login entre casos o usar navegadores distintos.

Marcar: `[ ]` pendiente · `[x]` OK · `[!]` fallo.

---

### 15.1 Owner/admin — inventario, compras, facturas, config

| | |
|--|--|
| **Escenario** | Propietario con acceso completo |
| **Pasos** | 1. Login cuenta A (`owner`)<br>2. Inventario → editar stock → **Guardar cambios**<br>3. Compras inteligentes → **Crear borrador** → **Convertir en pedido**<br>4. Facturas proveedor → **Registrar factura** (o flujo OCR)<br>5. Configuración → cambiar plano activo o impresoras |
| **Resultado esperado** | Todo OK en UI; **sin** `permission-denied` en consola; writes Firestore exitosos |
| **Errores típicos** | Rules no desplegadas; perfil sin `restaurantId`; mezcla de tenants |

- [ ] OK

---

### 15.2 Staff histórico — mínimo privilegio operativo

| | |
|--|--|
| **Escenario** | Perfil histórico `staff` interpretado como `waiter` |
| **Pasos** | 1. Login cuenta B (`staff`)<br>2. Abrir TPV, vender y cobrar<br>3. Intentar inventario, compras, factura, devolución y unir mesas |
| **Resultado esperado** | TPV básico disponible; acciones gerenciales ausentes o `permission-denied` |
| **Errores típicos** | `staff` todavía normalizado a manager; rules antiguas sin desplegar |

- [ ] OK

---

### 15.3 Manager explícito — NO config sensible

| | |
|--|--|
| **Escenario** | Encargado sin `settings.manage` |
| **Pasos** | 1. Login cuenta F (`manager`)<br>2. Dashboard → tile **Configuración** ausente o acceso restringido<br>3. URL directa `/dashboard/configuracion`<br>4. Intentar activar layout distinto en impresoras/planos (si UI accesible) |
| **Resultado esperado** | UI: mensaje *No tienes permiso* o shell restringido; write Firestore a `config/floorPlanLayouts` o `config/printers` → **`permission-denied`** si se fuerza desde consola |
| **Errores típicos** | Manager aún ve config por bug UI; rules permiten write (no desplegadas) |

- [ ] OK

---

### 15.4 Waiter — NO escribe inventario/compras/facturas

| | |
|--|--|
| **Escenario** | Camarero sin permisos back-office |
| **Pasos** | 1. Login cuenta C (`waiter`)<br>2. Inventario → **Guardar cambios** disabled o error al guardar<br>3. Compras inteligentes → botones crear/convertir disabled<br>4. Facturas → **Registrar factura** disabled<br>5. (Opcional) Consola Firestore / SDK: intentar create en `purchaseOrders` → deny |
| **Resultado esperado** | UI bloqueada; consola `permission-denied` en writes protegidos |
| **Errores típicos** | `staff` todavía se comporta como manager; rules sin deploy |

- [ ] OK

---

### 15.5 Waiter — TPV operativo (UI)

| | |
|--|--|
| **Escenario** | Camarero en sala |
| **Pasos** | 1. Login cuenta C<br>2. Operación → TPV → abrir mesa, añadir productos, enviar<br>3. Cobrar si botón habilitado (`tpv.charge`)<br>4. Cancelar línea enviada si menú lo permite |
| **Resultado esperado** | Flujo TPV básico OK; inventario/compras inaccesibles (§15.4) |
| **Errores típicos** | Cobro bloqueado por UI; `permission-denied` en `payments` create con rol incorrecto (Fase 5C) |

- [ ] OK

---

### 15.6 Kitchen — solo KDS

| | |
|--|--|
| **Escenario** | Usuario cocina |
| **Pasos** | 1. Login cuenta D (`kitchen`)<br>2. Dashboard → solo **Operación** (KDS), sin Inventario/Config<br>3. Abrir `/dashboard/operacion/cocina` (o barra/coctelería)<br>4. Marcar línea preparada |
| **Resultado esperado** | KDS operativo; sin acceso escritura inventario/compras; TPV cobro no expuesto |
| **Errores típicos** | Kitchen ve tiles de inventario (bug filtro dashboard) |

- [ ] OK

---

### 15.7 ActivityLogs — siguen creando

| | |
|--|--|
| **Escenario** | Trazabilidad operacional intacta |
| **Pasos** | 1. Cualquier cuenta con acceso TPV<br>2. Cobrar mesa o cancelar línea (acción que genera log)<br>3. `/dashboard/operacion/activity` → nuevo evento<br>4. Firestore: `restaurants/{rid}/activityLogs` nuevo doc |
| **Resultado esperado** | Append-only sin capability extra; sin regresión Fase 1 |
| **Errores típicos** | Rules activityLogs no desplegadas; índice faltante (solo afecta query UI) |

- [ ] OK

---

### 15.8 TablePresence — sigue actualizando

| | |
|--|--|
| **Escenario** | Soft locks multi-tablet |
| **Pasos** | 1. Dos tablets mismo tenant → TPV misma mesa<br>2. Observar indicadores presencia<br>3. Firestore: `tablePresence` heartbeat `updatedAt` |
| **Resultado esperado** | Presencia visible; writes permitidos (sin capability gate) |
| **Errores típicos** | Heartbeat detenido por offline UX; reglas no desplegadas |

- [ ] OK

---

### 15.9 ActiveSessions — sigue actualizando

| | |
|--|--|
| **Escenario** | Sesiones activas Fase 3 |
| **Pasos** | 1. Login dashboard<br>2. `/dashboard/operacion/sesiones` → sesión listed<br>3. Simular offline/online → eventos sesión<br>4. Firestore: `activeSessions/{id}` update |
| **Resultado esperado** | Heartbeat y logs sesión OK; rules permisivas por diseño |
| **Errores típicos** | Confundir con activityLogs duplicados |

- [ ] OK

---

### 15.10 TPV cobro — no se rompe

| | |
|--|--|
| **Escenario** | Regresión crítica post-rules |
| **Pasos** | 1. Login owner o manager<br>2. Mesa con comanda → **Cobrar** → confirmar pago total<br>3. Comprobar mesa libre, doc en `payments`, sin error consola |
| **Resultado esperado** | Cobro completo OK; doc en `payments` con `canChargeTpv()` satisfecho (owner/manager/waiter) |
| **Errores típicos** | `permission-denied` en `payments` create con rol kitchen/viewer; orders bloqueados por error |

- [ ] OK

---

### 15.11 Rules dry-run OK

| | |
|--|--|
| **Escenario** | CI / pre-deploy |
| **Pasos** | 1. `npx firebase deploy --only firestore:rules --dry-run`<br>2. Revisar salida |
| **Resultado esperado** | `compiled successfully`; warnings `Unused function: hasOperationalRole` / `canManageUsers` aceptables |
| **Errores típicos** | Syntax error rules; proyecto Firebase incorrecto; variable count > 10 en helper (regresión 5D) |

- [ ] OK

---

### 15.12 Deploy rules OK

| | |
|--|--|
| **Escenario** | Publicación producción/staging |
| **Pasos** | 1. `firebase deploy --only firestore:rules`<br>2. Consola Firebase → Rules → verificar timestamp<br>3. Re-ejecutar §15.1 mínimo post-deploy |
| **Resultado esperado** | Deploy exitoso; smoke owner OK inmediatamente después |
| **Errores típicos** | Deploy sin permisos IAM; rules locales ≠ consola |

- [ ] OK

---

### 15.13 Fase 5C — Owner/admin cobra OK (rules)

| | |
|--|--|
| **Escenario** | Backend autoriza create payment |
| **Pasos** | 1. Login cuenta A (`owner`)<br>2. TPV → mesa con comanda → **Cobrar** total<br>3. Consola: nuevo doc en `payments/{id}` sin error<br>4. (Opcional) Rules Playground: create `payments` simulado → allow |
| **Resultado esperado** | Cobro OK; `permission-denied` ausente; payment persistido |
| **Errores típicos** | Rules 5C no desplegadas; `restaurantId` distinto en payment vs perfil |

- [ ] OK

---

### 15.14 Fase 5C — Staff histórico cobra como waiter

| | |
|--|--|
| **Escenario** | Legacy staff = waiter en rules |
| **Pasos** | 1. Login cuenta B (`staff`)<br>2. Repetir cobro total TPV (§15.13)<br>3. Verificar payment en Firestore |
| **Resultado esperado** | `canChargeTpv()` OK para waiter; cobro sin regresión |
| **Errores típicos** | Perfil `staff` denegado por error; UI bloquea aunque rules permiten cobro |

- [ ] OK

---

### 15.15 Fase 5C — Waiter cobra según tpv.charge

| | |
|--|--|
| **Escenario** | Camarero con capability cobro |
| **Pasos** | 1. Login cuenta C (`waiter`)<br>2. TPV → cobrar mesa (botón habilitado en UI)<br>3. Confirmar pago<br>4. Firestore: `payments` create OK |
| **Resultado esperado** | UI + rules alineados; waiter puede crear payment |
| **Errores típicos** | Botón disabled en UI aunque la capability `tpv.charge` está presente |

- [ ] OK

---

### 15.16 Fase 5C — Kitchen NO puede crear payment

| | |
|--|--|
| **Escenario** | Cocina sin tpv.charge |
| **Pasos** | 1. Login cuenta D (`kitchen`)<br>2. UI: botón cobrar no disponible / sin acceso TPV cobro<br>3. (Opcional) SDK/consola: intentar **create** en `payments` con mismo `restaurantId` |
| **Resultado esperado** | **`permission-denied`** en create payment; KDS sigue usable |
| **Errores típicos** | Kitchen con rol `staff` por error; rules sin deploy 5C |

- [ ] OK

---

### 15.17 Fase 5C — Viewer NO puede crear payment

| | |
|--|--|
| **Escenario** | Rol solo lectura |
| **Pasos** | 1. Login cuenta E (`viewer`)<br>2. Sin acceso operación cobro en UI<br>3. (Opcional) create `payments` forzado → deny |
| **Resultado esperado** | Denegado en rules; sin docs payment nuevos |
| **Errores típicos** | Viewer sin campo role → rules lo tratan como owner (legacy); usar `viewer` explícito |

- [ ] OK

---

### 15.18 Fase 5C — Waiter cancela línea (tpv.cancel_line)

| | |
|--|--|
| **Escenario** | Cancelación enviada en orderItems |
| **Pasos** | 1. Login cuenta C<br>2. TPV → mesa → enviar comanda → **Cancelar producto** en línea `sent`/`preparing`<br>3. Firestore: `orderItems/{id}` con `status: cancelled`, `cancelledAt`<br>4. Firestore: `orders/{id}` con `cancelledLineIds` contiene `lineId` (5E)<br>5. Consola sin `permission-denied` |
| **Resultado esperado** | Update orderItems + orders OK; KDS deja de mostrar línea activa |
| **Errores típicos** | App 5E no desplegada (sin `cancelledLineIds`); rules 5D sin deploy (gate orders inactivo); línea pending eliminada local sin orderItem |

- [ ] OK

---

### 15.19 Fase 5C — Kitchen NO cancela línea

| | |
|--|--|
| **Escenario** | Cocina sin tpv.cancel_line |
| **Pasos** | 1. Login cuenta D<br>2. UI: sin acción cancelar en TPV<br>3. (Opcional) update `orderItems` con diff a `status: cancelled` → **`permission-denied`** |
| **Resultado esperado** | Backend bloquea cancel; KDS mark prepared/served sigue OK (§15.20) |
| **Errores típicos** | Confundir deny cancel con deny KDS status |

- [ ] OK

---

### 15.20 Fase 5C — KDS preparing / ready / served OK

| | |
|--|--|
| **Escenario** | Updates operativos cocina no son cancel |
| **Pasos** | 1. Cuenta D o B en `/dashboard/operacion/cocina` (o barra/coctelería)<br>2. Línea `sent` pendiente → marcar **preparado** → **servido**<br>3. Alternativa: cocina legacy `/dashboard/cocina` → preparing → ready → served<br>4. Sin `permission-denied` en consola |
| **Resultado esperado** | Transiciones KDS OK; `isCancellingOrderLine()` no dispara |
| **Errores típicos** | Regresión rules bloquea todo update orderItems; KDS nuevo escribe solo `orders` (también debe OK) |

- [ ] OK

---

### 15.21 Fase 5C — orderItems metadata sin bloqueo

| | |
|--|--|
| **Escenario** | Update benigno (no cancel) |
| **Pasos** | 1. Durante servicio normal, observar updates `orderItems` con `updatedAt` / timestamps cocina<br>2. Confirmar que envío comanda (create orderItems) sigue OK<br>3. Ningún `permission-denied` en flujo estándar TPV→KDS |
| **Resultado esperado** | Solo cancel exige `canCancelTpvLine()`; resto permisivo |
| **Errores típicos** | Falso positivo si quantity baja a 0 en otro flujo |

- [ ] OK

---

### 15.22 Fase 5C — Cobro TPV real end-to-end

| | |
|--|--|
| **Escenario** | Regresión crítica servicio |
| **Pasos** | 1. Owner o manager en hora simulada<br>2. Mesa → comanda → enviar → cobrar total → mesa libre<br>3. Segundo tablet: mapa actualiza ocupación sin F5<br>4. §6.2 cobro total coherente con §15.10 |
| **Resultado esperado** | Sin rotura multi-tablet; payment + cierre mesa OK post-rules 5C |
| **Errores típicos** | Deny payment deja mesa ocupada con comanda cerrada parcial |

- [ ] OK

---

### 15.23 Fase 5D — Manager refund / anula pago OK

| | |
|--|--|
| **Escenario** | Encargado con `tpv.refund` |
| **Pasos** | 1. Login cuenta F (`manager`)<br>2. TPV → mesa con cobro parcial `split_by_items` pagado<br>3. **Anular** pago parcial (`handleCancelPartialPayment`)<br>4. Firestore: `payments/{id}` → `status: cancelled`<br>5. Consola sin `permission-denied` |
| **Resultado esperado** | Update payment OK; `canRefundTpv()` satisfecho |
| **Errores típicos** | Rules 5D no desplegadas; UI oculta acción pero rules deberían permitir manager |

- [ ] OK

---

### 15.24 Fase 5D — Waiter refund denied

| | |
|--|--|
| **Escenario** | Camarero sin `tpv.refund` |
| **Pasos** | 1. Login cuenta C (`waiter`)<br>2. UI: acción anular pago parcial disabled o ausente<br>3. (Opcional) SDK/consola: **update** `payments/{id}` con diff `status: cancelled` → **`permission-denied`** |
| **Resultado esperado** | Backend bloquea refund; cobro create (5C) sigue OK para waiter |
| **Errores típicos** | `staff` todavía obtiene `tpv.refund`; rules 5D sin deploy |

- [ ] OK

---

### 15.25 Fase 5D — Kitchen refund denied

| | |
|--|--|
| **Escenario** | Cocina sin acceso TPV refund |
| **Pasos** | 1. Login cuenta D (`kitchen`)<br>2. Sin UI anular pago<br>3. (Opcional) update `payments` a `status: cancelled` → **`permission-denied`** |
| **Resultado esperado** | Denegado; KDS usable (§15.20) |
| **Errores típicos** | Kitchen con `staff` por error |

- [ ] OK

---

### 15.26 Fase 5E — Cancel línea enviada → `cancelledLineIds`

| | |
|--|--|
| **Escenario** | Trazabilidad explícita en order doc |
| **Pasos** | 1. Login owner o waiter con cancel<br>2. Mesa → enviar → **Cancelar producto** (`handleCancelSentOrderLine`)<br>3. Consola Firestore: `orders/{orderId}` → campo `cancelledLineIds` array con `lineId`<br>4. Línea en `items[]` con `status: cancelled` |
| **Resultado esperado** | Campo presente; `arrayUnion` sin duplicar en reintento |
| **Errores típicos** | App pre-5E; campo ausente |

- [ ] OK

---

### 15.27 Fase 5F — Quitar 1 de qty 2 → NO `cancelledLineIds`

| | |
|--|--|
| **Escenario** | Decremento sin cancelación |
| **Pasos** | 1. Línea enviada con **quantity = 2**<br>2. Menú línea → **Quitar 1 unidad** (`handleRemoveOneUnitFromLine`)<br>3. Firestore: `orders/{id}` → `items[]` qty = 1; **`cancelledLineIds` sin cambio / ausente nuevo id** |
| **Resultado esperado** | Solo decremento; rules no exigen cancel capability en orders |
| **Errores típicos** | Bug 5F escribe `cancelledLineIds` en decremento |

- [ ] OK

---

### 15.28 Fase 5F — Quitar 1 de qty 1 → `cancelledLineIds`

| | |
|--|--|
| **Escenario** | Remove-one equivale a cancel |
| **Pasos** | 1. Línea enviada **quantity = 1**<br>2. **Quitar 1 unidad** → línea `cancelled`<br>3. Firestore: `cancelledLineIds` contiene `lineId`; `items[]` status cancelled |
| **Resultado esperado** | Mismo efecto rules que §15.26; `arrayUnion` idempotente |
| **Errores típicos** | Solo UI cancelada sin write Firestore; app pre-5F |

- [ ] OK

---

### 15.29 Fase 5D — Usuario sin `tpv.cancel_line` → orders update denied

| | |
|--|--|
| **Escenario** | Gate `orders` vía `cancelledLineIds` |
| **Pasos** | 1. Login cuenta D (`kitchen`) o E (`viewer`)<br>2. UI: sin cancelar línea en TPV<br>3. SDK/consola: update `orders/{id}` simulando cancel — `items[]` con línea cancelled **y** `cancelledLineIds: arrayUnion(lineId)` |
| **Resultado esperado** | **`permission-denied`** — `isCancellingOrderItemsArray()` + `canCancelTpvLine()` false |
| **Errores típicos** | Update solo `items[]` sin `cancelledLineIds` (bypass parcial); app 5E no desplegada |

- [ ] OK

---

### 15.30 Fase 5D–5F — KDS prepared / served sigue OK (orders)

| | |
|--|--|
| **Escenario** | KDS no toca `cancelledLineIds` |
| **Pasos** | 1. Cuenta D en KDS (§15.20)<br>2. Marcar **preparado** → **servido** en línea activa<br>3. Firestore: `orders/{id}.items[]` actualizado; **`cancelledLineIds` sin cambio**<br>4. Sin `permission-denied` |
| **Resultado esperado** | KDS OK; `isCancellingOrderItemsArray()` false |
| **Errores típicos** | Regresión rules bloquea todo update orders |

- [ ] OK

---

### 15.31 Fase 5E — Pedido legacy sin `cancelledLineIds` carga OK

| | |
|--|--|
| **Escenario** | Compatibilidad pedidos antiguos |
| **Pasos** | 1. Abrir mesa con order creado **antes** de 5E (sin campo `cancelledLineIds`)<br>2. TPV carga comanda, totales y líneas correctos<br>3. Enviar / cobrar / KDS sin error |
| **Resultado esperado** | Campo ausente no rompe hidratación; cancel nueva añade `arrayUnion` |
| **Errores típicos** | Parser exige campo; UI vacía |

- [ ] OK

---

### 15.32 Deploy coordinado app + rules (5D–5F)

| | |
|--|--|
| **Escenario** | Release staging/producción TPV hardening |
| **Pasos** | 1. Deploy app (5E/5F) a staging<br>2. `firebase deploy --only firestore:rules` (5D)<br>3. Verificar timestamp rules en consola<br>4. Re-ejecutar mínimo: §15.23, §15.26, §15.28, §15.30<br>5. §15.11 dry-run en CI |
| **Resultado esperado** | Refunds + cancel orders gate activos; KDS y cobros sin regresión |
| **Errores típicos** | Solo rules sin app → refunds OK pero `cancelledLineIds` ausente; solo app sin rules → campo escrito sin enforcement backend |

- [ ] OK

---

## Notas de la sesión

| Hora | Módulo | Resultado | Incidencia / ticket |
|------|--------|-----------|---------------------|
| | | | |
| | | | |

---

## Qué NO cubre este runbook

- Pruebas de carga / estrés Firestore
- Regresión visual pixel-perfect en todos los breakpoints
- Integraciones externas (TPV hardware, impresoras, pasarelas de pago externas)
- Escandallos, inventario, compras, recepciones, mermas (smoke aparte si el release los toca) — **Timeline producto** §12 · **deep-links y export** §13
- **KDS Operational Intelligence** (batching, SLA, heat, gestos, focus) — ver §14; no sustituye routing KDS §5
- **Facturas proveedor OCR** — ver §10 (smoke dedicado inventario/costes)
- **Aliases OCR proveedor** — ver §11 (gestión aprendizaje IA)
- **Roles y permisos (Fase 5/5B/5C/5D–5F)** — ver §15; matriz en `docs/hostly-roles-permissions.md` (§7.2–7.3 TPV hardening)
- Tests automatizados E2E (Playwright/Cypress) — fuera de alcance

---

## Mantenimiento

| Evento | Acción |
|--------|--------|
| Nuevo módulo operativo crítico | Añadir sección con escenario real |
| Bug de producción | Añadir fila en “Errores típicos” del módulo afectado |
| Cambio de ruta | Actualizar paths en pasos |
| Release trimestral | Re-ejecutar runbook completo en staging y archivar PDF/notas |

**Relacionado:** `docs/hostly-release-checklist.md`, `docs/hostly-catalog-migration.md`, `docs/hostly-floor-plan-layouts.md`, `docs/hostly-supplier-invoices-ocr.md`, `docs/hostly-stock-flow.md`, `docs/hostly-kds-operational-intelligence.md`, `docs/hostly-roles-permissions.md`
