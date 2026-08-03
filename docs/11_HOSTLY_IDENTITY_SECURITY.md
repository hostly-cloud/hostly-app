# Hostly Identity Security

## Estado del piloto

- El alta pública self-service de propietarios está deshabilitada.
- `register_owner` falla cerrado tanto en API como en el servicio de dominio.
- Los nuevos owners necesitarán un flujo administrativo independiente futuro.
- No se deriva confianza de email, UID, body o variables opcionales del cliente.

## Autoridad de perfiles

- `users/{uid}` es la única fuente canónica de tenant, rol y status.
- `usuarios/{uid}` es un mirror de compatibilidad y nunca amplía permisos.
- Ambos documentos deben existir y coincidir en UID, email normalizado,
  `restaurantId`, rol, status y campos históricos de autorización presentes.
- Un mirror ausente o inconsistente requiere revisión administrativa; no se
  repara automáticamente.
- `restaurantIds` no amplía el tenant autorizado: `sameRestaurant()` utiliza
  exclusivamente `users/{uid}.restaurantId`.

## Status

- `disabled`, `inactive`, `blocked`, `suspended` y `deactivated` deniegan acceso.
- Dos mirrors legacy sin `status` se consideran temporalmente `legacy_active`
  para conservar cuentas existentes sin inventar un rol distinto.
- Si solo un mirror tiene status, la autorización falla por inconsistencia.

## Roles y mínimo privilegio

- `staff`, `operativo`, `employee`, `empleado` y aliases de sala se interpretan
  como `waiter`, nunca como `manager`.
- `waiter` conserva `tpv.sell`, `tpv.cancel_line` y `tpv.charge`; no obtiene
  capacidades administrativas, analítica gerencial, inventario, compras,
  facturas de proveedor, devoluciones ni `kds.manage`.
- Roles ausentes, vacíos o desconocidos invalidan el perfil y fallan cerrados.
- Las nuevas invitaciones persisten roles canónicos (`admin`, `manager` o
  `waiter`); una invitación histórica `staff` crea un perfil `waiter`.

## Invitaciones y empleados

- Las invitaciones se crean, listan y revocan exclusivamente mediante endpoints
  Admin tenant-scoped con `users.manage`.
- Firestore guarda únicamente `tokenHash`; el token en claro solo se devuelve
  al crear la invitación y nunca se persiste en `inviteUrl`.
- Las superficies cliente conservan `inviteUrl` únicamente en memoria React.
  `localStorage`, datos legacy y listados se saneizan antes de reutilizarse.
- Aceptar una invitación exige token Firebase no revocado, email verificado,
  email coincidente, token vigente y creador todavía autorizado.
- Las mutaciones administrativas actualizan `users` y `usuarios` en una sola
  transacción. No aceptan tenant del cliente ni permiten autoelevación.

## Auditoría histórica

`npm run audit:user-profile-integrity` es exclusivamente read-only, requiere
credenciales administrativas explícitas y no debe ejecutarse contra producción
sin autorización operativa previa.

## IA y Storage

- `/api/ai/import-menu` exige perfil canónico activo y `settings.manage` antes
  de leer multipart, ejecutar OCR o invocar OpenAI.
- Todas las rutas mutables de `/api/menu-imports/*` exigen `settings.manage`
  antes de leer el body, procesar un borrador o publicar catálogo.
- `/api/supplier-invoices/extract` exige `supplier_invoices.manage` antes de
  leer multipart, subir mediante Admin SDK o ejecutar Vision.
- `/api/ai/manager-summary` exige `analytics.view` y un rol gerencial
  (`owner`, `admin` o `manager`); `viewer`, sala y cocina quedan denegados.
- No existe actualmente una infraestructura compartida de rate limiting.
  No se usa un contador en memoria que pueda aparentar protección durable.
- Esta ausencia no bloquea el commit local del hardening, pero sí bloquea el
  despliegue comercial de endpoints sensibles.
  Antes de producción comercial debe añadirse un límite durable por UID y
  tenant en Vercel WAF/Firewall o un almacén distribuido equivalente.
- Los endpoints costosos que deben quedar cubiertos son, como mínimo,
  `/api/ai/import-menu`, `/api/menu-imports/process` y
  `/api/supplier-invoices/extract`, además de cualquier ruta futura que invoque
  OCR, OpenAI o Vision.
- La policy durable debe usar UID y tenant como unidad principal; la IP solo
  puede ser una señal adicional. Debe contemplar ventana, concurrencia,
  respuesta `429`, trazabilidad y alertas de coste. Los valores definitivos se
  fijarán después de medir el uso real del piloto.
- Storage permite lectura tenant-scoped a perfiles activos, pero reserva
  create/update/delete a `settings.manage`.
- Imágenes y logos admiten exclusivamente JPEG, PNG, WebP o GIF hasta 3 MiB;
  SVG, AVIF, BMP, HEIC, HEIF y MIME arbitrarios se deniegan.
- Borradores de importación admiten JPEG, PNG, WebP, GIF o PDF hasta 12 MiB.
  Create y reintento/update están permitidos a `settings.manage`; delete
  permanece denegado porque no existe un caller cliente legítimo.
- `menuImportDrafts` solo permite al cliente crear el borrador mínimo, asociar
  su fuente mientras está en `draft` y editar `sections/items` durante
  `ready`. Lifecycle, locks, resultados y auditoría permanecen server-side.
- `supplierProductAliases` exige `supplier_invoices.manage`, tenant canónico,
  mirror coherente y allowlist de campos; el borrado físico está denegado.
