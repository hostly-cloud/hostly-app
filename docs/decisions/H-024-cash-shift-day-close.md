# H-024 — Caja, turnos, cierre diario e informe Z operativo

**Estado:** aceptada  
**Fecha:** 2026-09-05

Hostly mantiene una caja principal por restaurante en esta fase y separa **cierre de turno** y **cierre diario**. El turno incluye fondo inicial, entradas/salidas justificadas, arqueo ciego, revisión supervisada y snapshot Z. El cierre diario consolida los turnos cerrados de la jornada del restaurante según su zona horaria (fallback seguro `Europe/Madrid`).

## Permisos y autoridad

Quien tenga `tpv.charge` puede abrir y operar caja y enviar el arqueo. Quien tenga `tpv.refund` o `users.manage` puede ver esperado, reabrir arqueos, cerrar turnos, cerrar jornada y exportar. Todas las mutaciones pasan por endpoints autenticados y tenant-scoped; el cliente no calcula ni persiste cierres como autoridad.

## Informe Z operativo

Cada nuevo cierre congela ventas brutas/netas, métodos de pago, devoluciones, descuentos, propinas, impuestos explícitamente presentes en los cobros, movimientos manuales, efectivo esperado/contado, diferencia, pedidos, anulaciones e invitaciones cuando existe la información. No se inventan impuestos ni se reconstruyen como “sellados” cierres legacy.

El snapshot y el cierre diario almacenan una huella SHA-256 canónica. En lectura se marca `verified`, `missing` (legacy) o `mismatch`. Además se escriben eventos append-only de apertura, movimiento, arqueo, reapertura, cierre y cierre diario.

## Cierre diario

No se puede cerrar con una sesión activa. El documento usa `YYYY-MM-DD`, conserva los IDs exactos de los turnos incluidos y bloquea una segunda apertura después de sellar esa jornada. CSV e impresión quedan disponibles para gerencia y como contrato de integración futura.

**Nota fiscal:** este “informe Z” es un cierre operativo de Hostly y no se presenta como certificación legal/fiscal española. La integración con normativa fiscal (p. ej. VeriFactu/TicketBAI según corresponda) requiere un módulo específico posterior.
