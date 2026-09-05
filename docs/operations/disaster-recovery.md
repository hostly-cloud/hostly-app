# Hostly — Disaster recovery

Estado operativo de recuperación para producción (`hostly-app-8b902`). Este documento separa deliberadamente el plano de aplicación del plano de infraestructura: las credenciales que ejecutan Hostly en Vercel **no deben** administrar la configuración de Firestore, sus copias o sus restauraciones.

## Estado verificado

- Firebase / Google Cloud project: `hostly-app-8b902`.
- Firestore database: `(default)`.
- Cloud Storage bucket: `hostly-app-8b902.firebasestorage.app`, región `US-EAST1`.
- Cloud Storage soft delete: **14 días** (`1209600s`), elevado y verificado el 2026-09-05.
- La cuenta de servicio de runtime puede operar los datos que necesita Hostly, pero una llamada real a la API administrativa de Firestore devolvió `403 PERMISSION_DENIED`. Esto es el comportamiento deseado para separación de privilegios y no debe resolverse otorgando roles de administración de Firestore a la aplicación.

## Objetivo de Firestore

La configuración administrativa de producción debe ser:

1. PITR habilitado (retención de versiones de 7 días).
2. Delete protection habilitado en `(default)`.
3. Un backup diario con retención de 14 semanas.
4. Un backup semanal, domingo, con retención de 14 semanas.
5. Restauración probada mediante clone a una base de datos nueva; nunca usar una restauración destructiva sobre `(default)` como primera opción.

Google Cloud admite como máximo un schedule diario y uno semanal por base de datos, con retención máxima de 14 semanas.

## Identidad administrativa

Ejecutar los comandos siguientes con una identidad humana/operativa o de infraestructura separada del runtime de Hostly.

Permisos mínimos relevantes:

- PITR / delete protection: `datastore.databases.update` y `datastore.databases.list` (o un rol administrativo equivalente).
- Schedules: `roles/datastore.backupSchedulesAdmin`.
- Simulacro por clone: `roles/datastore.cloneAdmin`.
- Restore desde backup, si se usa: `roles/datastore.restoreAdmin`.

No conceder estos roles a `FIREBASE_CLIENT_EMAIL` de Vercel salvo una decisión de seguridad explícita y temporal.

## Activación de Firestore

```bash
PROJECT_ID="hostly-app-8b902"
gcloud config set project "$PROJECT_ID"

gcloud firestore databases update \
  --database='(default)' \
  --enable-pitr \
  --delete-protection \
  --project="$PROJECT_ID"

gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=14w \
  --project="$PROJECT_ID"

gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=weekly \
  --retention=14w \
  --day-of-week=SUN \
  --project="$PROJECT_ID"
```

Antes de crear schedules, listar los existentes para evitar duplicados:

```bash
gcloud firestore backups schedules list \
  --database='(default)' \
  --project="$PROJECT_ID"
```

## Verificación obligatoria

```bash
gcloud firestore databases describe \
  --database='(default)' \
  --project="$PROJECT_ID"

gcloud firestore backups schedules list \
  --database='(default)' \
  --project="$PROJECT_ID"
```

Aceptar únicamente si la descripción muestra:

- `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED`
- `versionRetentionPeriod: 604800s`
- `deleteProtectionState: DELETE_PROTECTION_ENABLED`

Y los schedules muestran exactamente una recurrencia diaria y una semanal, ambas con 14 semanas de retención.

## Simulacro de restauración seguro

El clone de PITR crea una base nueva en la misma ubicación e incluye datos e índices. El timestamp debe estar en el pasado, a minuto completo y dentro de la ventana PITR disponible.

```bash
PROJECT_ID="hostly-app-8b902"
SNAPSHOT_TIME="2026-09-05T02:00:00Z" # Sustituir por un minuto reciente válido
DR_DB="dr-restore-$(date -u +%Y%m%d%H%M)"

gcloud firestore databases clone \
  --source-database="projects/${PROJECT_ID}/databases/(default)" \
  --snapshot-time="$SNAPSHOT_TIME" \
  --destination-database="$DR_DB" \
  --project="$PROJECT_ID"

gcloud firestore databases describe \
  --database="$DR_DB" \
  --project="$PROJECT_ID"
```

Validar en la base clonada una muestra representativa antes de declarar el simulacro correcto: restaurante, productos, mesas, órdenes/reservas recientes y configuración. No cambiar el tráfico de producción durante el simulacro.

Después de validar, eliminar la base de simulacro. Si el clon hereda delete protection, desactivarla **solo en el clon** antes de borrarlo:

```bash
gcloud firestore databases update \
  --database="$DR_DB" \
  --no-delete-protection \
  --project="$PROJECT_ID"

gcloud firestore databases delete \
  --database="$DR_DB" \
  --project="$PROJECT_ID"
```

Nunca desactivar delete protection de `(default)` durante un simulacro.

## Recuperación de Cloud Storage

Soft delete de 14 días protege imágenes, logos y otros objetos de Storage frente a borrados accidentales durante esa ventana. Antes de cualquier recuperación masiva, identificar los objetos afectados y restaurar primero una muestra. No reducir la retención por debajo de 14 días sin una decisión registrada.

## Estrategia de incidente

- Borrado/corrupción reciente de Firestore: preferir PITR/clone y validar el resultado en una base nueva.
- Pérdida que requiere un punto más antiguo: usar un backup programado dentro de las 14 semanas y restaurarlo a una base nueva.
- Objeto eliminado en Storage: recuperar desde soft delete dentro de 14 días.
- Corrupción de aplicación/código: rollback de Vercel es independiente de las copias de datos.

Una restauración in-place de Firestore es destructiva para el estado actual; no es el procedimiento por defecto de Hostly.

## Objetivos internos

- RPO técnico objetivo Firestore con PITR: **<= 1 minuto**, una vez PITR esté habilitado y acumulando historial.
- RPO de largo plazo: backup diario, con capa semanal retenida 14 semanas.
- RPO Storage por borrado accidental: 14 días de objetos soft-deleted.
- RTO operativo objetivo para recuperación scoped/clone: **<= 60 min**.
- RTO objetivo para incidente de base completa: **<= 4 h**.

Los RTO son objetivos operativos de Hostly, no un SLA de Google Cloud.

## Cadencia de prueba

- Trimestral: clone PITR a una base temporal, validar datos e índices y eliminar el clon.
- Semanal: revisar que existen los dos schedules y que hay backups recientes.
- Tras cualquier cambio de IAM, Firebase o arquitectura de datos: volver a ejecutar la verificación.
- Guardar evidencia del simulacro: fecha, snapshot/backup usado, base temporal, verificaciones, tiempo total y limpieza final.

## Regla de seguridad

No crear endpoints HTTP permanentes capaces de habilitar PITR, gestionar schedules, clonar o restaurar bases. Esas operaciones pertenecen al plano administrativo de Google Cloud y deben usar identidad administrativa separada, auditada y de mínimo privilegio.
