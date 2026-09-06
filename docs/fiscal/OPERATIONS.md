# Operación fiscal, recuperación y piloto

## Secretos y variables

Las claves privadas no se guardan en Firestore, variables públicas, logs ni payloads. Secret Manager contiene un JSON con `pfxBase64` y `passphrase`; Firestore solo conserva la referencia versionada.

Configurar o rotar de forma segura:

```bash
npm run admin:fiscal-credential -- --restaurant=RESTAURANT_ID --secret-resource=projects/PROJECT/secrets/SECRET/versions/1 --operator=USER_ID
npm run admin:fiscal-credential -- --restaurant=RESTAURANT_ID --secret-resource=projects/PROJECT/secrets/SECRET/versions/1 --operator=USER_ID --apply
```

El primer comando es una vista previa. `--apply` verifica que el secreto puede leerse y que el material PKCS#12 puede cargarse con su passphrase; añade un evento de auditoría sin registrar material criptográfico. Si Hostly presenta como representante, añadir `--representation-verified-at=FECHA_ISO` solo después de comprobar el apoderamiento aplicable.

Variables obligatorias antes de producción:

- identidad y domicilio del productor;
- URL, versión, fecha y lugar de la declaración responsable publicada;
- credenciales Firebase Admin y acceso IAM mínimo a la versión del secreto;
- `CRON_SECRET`;
- los dos interruptores de producción, habilitados únicamente durante el pase controlado.

## Separación entre pruebas y restaurante real

Las pruebas AEAT se realizan con un tenant/restaurante técnico dedicado. Un restaurante que vaya a producir facturación real debe permanecer sin actividad fiscal (`demo` o `live` en estado `draft`) hasta su pase controlado. No se reutiliza para producción un tenant que ya tenga facturas, registros, outbox, contadores o cadena de pruebas.

Antes del 1 de enero de 2027 los dos interruptores de producción deben permanecer cerrados. Además, el código bloquea por fecha tanto la activación `live` como cualquier llamada al endpoint AEAT de producción.

## Preflight de go-live

Preparación previa, con los interruptores todavía cerrados:

```bash
npm run admin:fiscal-preflight -- --restaurant=RESTAURANT_ID --phase=prepare
```

Debe devolver `ok: true`. Comprueba configuración `live` en `draft`, entorno AEAT producción, checklist de readiness completo, acceso real a Secret Manager, PKCS#12 utilizable y ausencia de datos fiscales previos del restaurante (facturas, registros, outbox, delivery states, contadores, cancelaciones, rectificaciones y cadena de la instalación).

En la ventana de activación, una vez revisada la normativa vigente y abiertos deliberadamente ambos interruptores:

```bash
npm run admin:fiscal-preflight -- --restaurant=RESTAURANT_ID --phase=activate
```

Esta segunda fase exige además que la fecha mínima de producción esté abierta y que ambos interruptores estén realmente habilitados. El preflight es de solo lectura: no emite facturas, no altera contadores y no envía nada a AEAT.

## Monitorización

`/api/cron/fiscal-outbox-recovery` se ejecuta cada minuto. Recupera leases vencidos, reencola pendientes y publica métricas agregadas sin NIF, cliente, factura ni importes. Emite un error estructurado si existe un rechazo o el pendiente más antiguo supera una hora. `/api/fiscal/health` expone al propietario/gestor el estado aislado de su restaurante y la UI muestra avisos comprensibles.

Alertas mínimas en Vercel:

- crear alerta sobre `[fiscal-health] attention required`;
- alertar ante errores 5xx sostenidos en rutas `fiscal-*`;
- vigilar ejecuciones fallidas del cron y cola;
- nunca exportar el cuerpo XML ni la respuesta completa a un proveedor de logs.

## Recuperación

- Sin Internet o timeout AEAT: la venta y el registro ya están persistidos; el outbox reintenta y marca incidencia.
- Reinicio Vercel: el lease vence a los 90 segundos y el cron recupera.
- Doble pulsación: ID determinista por pedido evita segunda factura.
- Dos TPV: Firestore reintenta la transacción sobre contador y cadena.
- Respuesta duplicada: el estado final hace idempotente el consumidor; AEAT duplicado correcto se trata como aceptado.
- Impresora falla: reimprimir genera duplicado visual, no nueva factura.
- XML inválido: queda en `schema_error`, bloquea los eslabones posteriores y se reintenta cada hora; corregir y desplegar el generador antes de que venza el siguiente reintento.
- Certificado inválido: la activación vuelve a comprobar Secret Manager y PKCS#12; no se activa hasta corregir o rotar el certificado.

## Checklist de piloto real

No activar hasta cumplir todos los puntos:

- [ ] revisión de asesor fiscal del modelo de negocio, regímenes, tipos, rectificativas y series;
- [ ] identidad legal definitiva del productor;
- [ ] declaración responsable firmada, publicada y vinculada a la versión exacta;
- [ ] apoderamiento/colaboración social o certificado propio del obligado verificado cuando aplique;
- [ ] certificado mTLS aplicable configurado y validado en Secret Manager;
- [ ] pruebas completas en AEAT test con tenant técnico dedicado;
- [ ] reglas e índices desplegados y exportación previa de Firestore;
- [ ] monitorización y contacto de guardia probados;
- [ ] prueba 80 mm, 58 mm, A4, QR físico y reimpresión;
- [ ] simulacros de Internet, timeout, doble cobro, concurrencia, reinicio e impresora;
- [ ] formación breve del pub y fecha/hora de activación acordada;
- [ ] preflight `prepare` en verde;
- [ ] revisión normativa el día de activación;
- [ ] doble aprobación para ambos interruptores de producción;
- [ ] preflight `activate` en verde.

Durante el piloto no fiscal se mantiene el restaurante real sin emisión fiscal y su TPV fiscal anterior sigue siendo el sistema de facturación válido. Los datos de prueba no se convierten. Para el pase real se confirma que contador y cadena de producción estén limpios, se activa deliberadamente y se hace una primera venta controlada con cotejo del QR y respuesta AEAT.
