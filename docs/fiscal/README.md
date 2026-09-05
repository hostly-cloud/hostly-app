# Arquitectura fiscal española de Hostly

Estado del documento: implementación técnica previa a validación jurídica, certificación operativa y piloto AEAT. No autoriza por sí solo el uso fiscal real.

## Alcance y separación de dominios

Hostly mantiene entidades distintas para `order`, `payment`, `fiscalInvoice` y `fiscalRecord`. Cobrar finaliza la venta; solo una configuración fiscal activa genera en la misma transacción una factura inmutable, un registro RRSIF encadenado y una entrada duradera de salida.

El aislamiento no usa únicamente `restaurantId`. La configuración modela:

- `taxEntityId`: obligado tributario; sus cadenas son independientes.
- `establishmentId`: establecimiento que emite y ámbito de la serie.
- `restaurantId`: tenant de acceso de Hostly.
- `installationNumber`: instalación del SIF incluida en el registro.

## Flujo autoritativo

1. El servidor valida identidad, rol, tenant, pedido, pagos, productos, tipos de IVA y configuración.
2. Una transacción Firestore asigna el siguiente número de la serie con bloqueo optimista, calcula importes en céntimos, enlaza el registro anterior y genera la huella SHA-256.
3. La misma transacción crea factura, registro, outbox, estado de entrega y auditoría. Si falla cualquier escritura, no existe una emisión parcial.
4. Vercel Queue reclama el outbox mediante lease. El worker valida el XML contra los XSD oficiales, obtiene el certificado desde Secret Manager y usa mTLS.
5. Cada intento se conserva en `fiscalSubmissions`. La respuesta funcional se guarda en `fiscalDeliveryStates`; factura y registro nunca se actualizan.
6. Los fallos temporales generan reintento exponencial, como máximo una hora. En el reenvío se informa `RemisionVoluntaria/Incidencia=S`.
7. El control por obligado y entorno serializa envíos y respeta `TiempoEsperaEnvio` devuelto por AEAT.

## Colecciones Firestore

| Colección | Mutabilidad | Finalidad |
|---|---:|---|
| `fiscalConfigurations` | servidor, controlada | obligado, establecimiento, series, modo y referencia al secreto |
| `fiscalInvoices` | apéndice | representación completa emitida y snapshots |
| `fiscalRecords` | apéndice | alta/anulación, cadena, huella y versión |
| `fiscalCounters` | transaccional | secuencia por obligado, establecimiento, serie y periodo |
| `fiscalChains` | transaccional | último registro por obligado e instalación |
| `fiscalOutbox` | estado servidor | entrega duradera, lease y reintentos |
| `fiscalAeatFlowControls` | estado servidor | exclusión y espera indicada por AEAT |
| `fiscalSubmissions` | apéndice | resultado de cada intento, sin certificado |
| `fiscalDeliveryStates` | estado servidor | proyección de UX |
| `fiscalRelations` | apéndice | rectifica, sustituye o anula registro |
| `fiscalAuditEvents` | apéndice | actor, acción, origen y resultado |

Las reglas niegan al SDK cliente toda escritura fiscal y todo acceso a registros, colas, certificados, cadenas y contadores. La lectura de facturas y auditoría exige tenant y capacidad fiscal.

## Documentos

- F2: factura simplificada de hostelería, con límite técnico de 3.000 EUR IVA incluido.
- F1: factura completa emitida desde el cobro con destinatario y domicilio.
- F3: nueva factura completa que sustituye una F2; el original se conserva y se referencia en `FacturasSustituidas`.
- R1 por diferencias: devolución total o parcial; nunca modifica el documento original.
- Anulación de registro: operación excepcional separada y confirmada; no representa una devolución económica.
- Duplicado: vuelve a generar el PDF marcado, sin crear otro número ni registro.

La clasificación automática R1 usada en devoluciones de hostelería debe ser confirmada por asesor fiscal para operaciones especiales o regímenes distintos del general.

## Modo demo, test y producción

- `demo`: el cobro no crea factura ni registro. La UI indica que no tiene validez fiscal.
- `test`: crea registros y usa el entorno de pruebas. Admite validación técnica antes de publicar la declaración.
- `live`: requiere configuración completa, certificado/autorización, productor válido, declaración de la versión, `HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED=true` y `HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED=true`.

Los dos interruptores son independientes para impedir que una prueba active producción por accidente.

## Datos anteriores y migración

No existe migración automática de comandas, pagos, tickets o facturas históricas. Al activar se registra `activatedAt`; solo un cobro final posterior y procesado por el flujo autoritativo puede originar un documento fiscal. Antes de desplegar reglas o índices se debe exportar Firestore y conservar el identificador de la copia.

La reversión del código no borra documentos. Si una versión produce un error, se suspende la configuración, se conserva el outbox y se corrige mediante nuevos registros conforme al caso, nunca editando los emitidos.

## Factura electrónica B2B

VERI*FACTU y factura electrónica B2B son subsistemas separados. `lib/fiscal/b2b-electronic-invoice.ts` define formatos EN 16931, estados y adaptadores para solución pública o plataforma privada, pero la transmisión permanece desactivada con `PENDING_FINAL_MINISTERIAL_TECHNICAL_SPECIFICATION`. No se generan protocolos ficticios.

## Versionado

Cada factura y registro guarda `hostlyVersion`, `fiscalModuleVersion`, `sifVersion` y `aeatSchemaVersion`. Un cambio funcional fiscal exige evaluar el incremento del módulo, regenerar pruebas y publicar una declaración responsable que coincida exactamente antes de reactivar producción.

## Fuentes canónicas

- [Real Decreto 1007/2023, texto consolidado](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840)
- [Orden HAC/1177/2024, texto consolidado](https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138)
- [Reglamento de facturación, Real Decreto 1619/2012](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696)
- [Información técnica SIF y VERI*FACTU de AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html)
- [Real Decreto 238/2026 sobre factura electrónica empresarial](https://www.boe.es/buscar/doc.php?id=BOE-A-2026-7295)

