# Hostly AI Guidelines

> Contrato de trabajo para Codex, Cursor, ChatGPT y cualquier otra IA.

**Autoridad documental:** nivel 7  
**Objetivo:** permitir colaboración rápida sin romper operación, datos ni coherencia.

---

## 1. Lectura obligatoria

Antes de cambios importantes:

1. `00_HOSTLY_PRODUCT_BIBLE.md`
2. `01_HOSTLY_ARCHITECTURE_GUIDE.md`
3. `02_HOSTLY_DESIGN_SYSTEM.md`

Después, leer el documento especializado del dominio: roles, stock, catálogo, KDS,
layouts, OCR o release.

---

## 2. Reglas permanentes

- No inventar arquitectura, modelos, colecciones o funcionalidades.
- Confirmar el estado real en código antes de afirmar.
- No crear componentes nuevos si existe un equivalente Hostly.
- No tocar Firestore, Firebase, rules o modelos salvo misión explícita.
- No mezclar UI y persistencia en la misma misión.
- No convertir compatibilidad legacy en patrón nuevo.
- No reescribir megacomponentes sin caracterización.
- No borrar código por parecer muerto.
- No hacer commit, push o deploy sin autorización explícita.
- Un cambio importante por iteración.

---

## 3. Encabezado de trabajo esperado

Antes de actuar, la IA debe poder indicar:

- rol asumido;
- dominio;
- qué entiende del problema;
- riesgos principales;
- archivos que espera tocar;
- archivos que no tocará;
- validación prevista.

Si la misión es solo lectura, debe respetarlo literalmente.

---

## 4. Orden de trabajo

1. Comprender el problema operativo.
2. Inspeccionar código y documentación relevante.
3. Verificar estado del árbol de trabajo.
4. Definir el cambio mínimo.
5. Ejecutar solo dentro del alcance.
6. Validar en proporción al riesgo.
7. Informar con precisión.

Para modularización:

1. presentación;
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
- Revisar rules, índices, queries y costes.
- No aceptar tenant arbitrario del cliente.
- No aplicar migraciones sin misión y plan específico.

### TPV/KDS

- Son runtimes críticos.
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
- publica automáticamente;
- cobra;
- elimina;
- confirma recepciones;
- aplica migraciones;
- cambia permisos;
- cierra una mesa sin acción humana.

---

## 7. Validación

Según la misión:

- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`
- smoke tests específicos
- revisión responsive
- comprobación de rules/índices si fueron modificados

No se corrigen errores ajenos al alcance.

---

## 8. Informe final obligatorio

Explicar:

- qué cambió;
- qué no cambió;
- archivos modificados;
- qué validar;
- riesgos pendientes;
- resultado TypeScript;
- resultado build;
- resultado `git diff --check`.

Si una validación falla por entorno, distinguirlo de un error de código.

---

## 9. Criterio de parada

La IA debe detenerse y pedir dirección cuando:

- falta una decisión humana que cambia el producto;
- la solución mínima requiere ampliar alcance;
- existe riesgo de pérdida de datos;
- el tenant no puede verificarse;
- una acción externa irreversible no fue autorizada.

