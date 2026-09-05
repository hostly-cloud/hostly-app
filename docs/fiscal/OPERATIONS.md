# Operación fiscal, recuperación y piloto

## Secretos y variables

Las claves privadas no se guardan en Firestore, variables públicas, logs ni payloads. Secret Manager contiene un JSON con `pfxBase64` y `passphrase`; Firestore solo conserva la referencia versionada.

Configurar o rotar de forma segura:

```bash
npm run admin:fiscal-credential -- --restaurant=RESTAURANT_ID --secret-resource=projects/PROJECT/secrets/SECRET/versions/1 --operator=USER_ID
npm run admin:fiscal-credential -- --restaurant=RESTAURANT_ID --secret-resource=projects/PROJECT/secrets/SECRET/versions/1 --operator=USER_ID --apply
```

El primer comando es una vista previa. `--apply` verifica que el secreto puede leerse y añade un evento de auditoría sin registrar material criptográfico. Si Hostly presenta como representante, añadir `--representation-verified-at=FECHA_ISO` solo después de comprobar el apoderamiento aplicable.

Variables obligatorias antes de producción:

- identidad y domicilio del productor;
- URL, versión, fecha y lugar de la declaración responsable publicada;
- credenciales Firebase Admin y acceso IAM mínimo a la versión del secreto;
- `CRON_SECRET`;
- los dos interruptores de producción, habilitados únicamente durante el pase controlado.

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
- XML inválido: rechazo local permanente, evento de auditoría y aviso; corregir el software antes de emitir el registro procedente.
- Certificado inválido: no se registra el secreto; queda pendiente y se reintenta tras rotación.

## Checklist de piloto real

No activar hasta cumplir todos los puntos:

- [ ] revisión de asesor fiscal del modelo de negocio, regímenes, tipos, rectificativas y series;
- [ ] identidad legal definitiva del productor;
- [ ] declaración responsable firmada, publicada y vinculada a la versión exacta;
- [ ] apoderamiento/colaboración social o certificado propio del obligado verificado;
- [ ] pruebas completas en AEAT test con certificado de prueba aplicable;
- [ ] reglas e índices desplegados y exportación previa de Firestore;
- [ ] monitorización y contacto de guardia probados;
- [ ] prueba 80 mm, 58 mm, A4, QR físico y reimpresión;
- [ ] simulacros de Internet, timeout, doble cobro, concurrencia, reinicio e impresora;
- [ ] formación breve del pub y fecha/hora de activación acordada;
- [ ] doble aprobación para ambos interruptores de producción.

Durante el piloto no fiscal se mantiene `mode=demo` y el TPV actual del pub sigue siendo el sistema fiscal. Los datos demo nunca se convierten. Para el pase real se crea/configura el obligado, se verifica desde cero el contador y la cadena, se activa deliberadamente y se hace una primera venta controlada con cotejo del QR y respuesta AEAT.

