# Hostly AI Guidelines

> Contrato de trabajo para Codex, Cursor, ChatGPT y cualquier otra IA.

**Autoridad documental:** nivel 7
**Objetivo:** permitir colaboraciÃ³n rÃ¡pida sin romper operaciÃ³n, datos ni coherencia.

---

## 1. Lectura obligatoria

Antes de cambios importantes:

1. `00_HOSTLY_PRODUCT_BIBLE.md`
2. `01_HOSTLY_ARCHITECTURE_GUIDE.md`
3. `02_HOSTLY_DESIGN_SYSTEM.md`

DespuÃ©s, leer el documento especializado del dominio: roles, stock, catÃ¡logo, KDS,
layouts, OCR o release.

---

## 2. Reglas permanentes

- No inventar arquitectura, modelos, colecciones o funcionalidades.
- Confirmar el estado real en cÃ³digo antes de afirmar.
- No crear componentes nuevos si existe un equivalente Hostly.
- No tocar Firestore, Firebase, rules o modelos salvo misiÃ³n explÃ­cita.
- No mezclar UI y persistencia en la misma misiÃ³n.
- No convertir compatibilidad legacy en patrÃ³n nuevo.
- No reescribir megacomponentes sin caracterizaciÃ³n.
- No borrar cÃ³digo por parecer muerto.
- No hacer commit, push o deploy sin autorizaciÃ³n explÃ­cita.
- Un cambio importante por iteraciÃ³n.

---

## 3. Encabezado de trabajo esperado

Antes de actuar, la IA debe poder indicar:

- rol asumido;
- dominio;
- quÃ© entiende del problema;
- riesgos principales;
- archivos que espera tocar;
- archivos que no tocarÃ¡;
- validaciÃ³n prevista.

Si la misiÃ³n es solo lectura, debe respetarlo literalmente.

---

## 4. Orden de trabajo

1. Comprender el problema operativo.
2. Inspeccionar cÃ³digo y documentaciÃ³n relevante.
3. Verificar estado del Ã¡rbol de trabajo.
4. Definir el cambio mÃ­nimo.
5. Ejecutar solo dentro del alcance.
6. Validar en proporciÃ³n al riesgo.
7. Informar con precisiÃ³n.

Para modularizaciÃ³n:

1. presentaciÃ³n;
2. helpers puros;
3. estado;
4. persistencia.

---

## 5. Reglas por dominio

### UI y Design System

- Reutilizar componentes Hostly.
- Usar tokens `--hostly-*`.
- No cambiar handlers, queries o modelos durante polish.
- Validar touch y responsive.

### Firestore

- Tratar `restaurantId` como frontera de seguridad.
- Revisar rules, Ã­ndices, queries y costes.
- No aceptar tenant arbitrario del cliente.
- No aplicar migraciones sin misiÃ³n y plan especÃ­fico.

### TPV/KDS

- Son runtimes crÃ­ticos.
- No cambiar estados, cobros, listeners ni persistencia durante ajustes visuales.
- Caracterizar antes de extraer.
- Validar con flujos reales de servicio.

### Inventario/compras

- Verificar idempotencia.
- Distinguir central, legacy y localStorage.
- No asumir que dos historiales representan la misma fuente.

---

## 6. IA de producto

La IA de Hostly:

- ayuda;
- propone;
- resume;
- detecta;
- prepara;
- explica incertidumbre.

La IA nunca:

- decide por el restaurante;
- publica automÃ¡ticamente;
- cobra;
- elimina;
- confirma recepciones;
- aplica migraciones;
- cambia permisos;
- cierra una mesa sin acciÃ³n humana.

---

## 7. ValidaciÃ³n

SegÃºn la misiÃ³n:

- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`
- smoke tests especÃ­ficos
- revisiÃ³n responsive
- comprobaciÃ³n de rules/Ã­ndices si fueron modificados

No se corrigen errores ajenos al alcance.

---

## 8. Informe final obligatorio

Explicar:

- quÃ© cambiÃ³;
- quÃ© no cambiÃ³;
- archivos modificados;
- quÃ© validar;
- riesgos pendientes;
- resultado TypeScript;
- resultado build;
- resultado `git diff --check`.

Si una validaciÃ³n falla por entorno, distinguirlo de un error de cÃ³digo.

---

## 9. Criterio de parada

La IA debe detenerse y pedir direcciÃ³n cuando:

- falta una decisiÃ³n humana que cambia el producto;
- la soluciÃ³n mÃ­nima requiere ampliar alcance;
- existe riesgo de pÃ©rdida de datos;
- el tenant no puede verificarse;
- una acciÃ³n externa irreversible no fue autorizada.
