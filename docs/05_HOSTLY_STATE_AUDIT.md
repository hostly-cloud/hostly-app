# Hostly State Audit

> Fotografía del estado real del producto y su preparación técnica.

**Estado de la auditoría:** junio de 2026  
**Autoridad documental:** nivel 6  
**Naturaleza:** descriptiva; no sustituye arquitectura ni roadmap.

---

## 1. Resumen

Hostly es un producto operativo real, no una demo. Contiene flujos funcionales de
TPV, KDS, reservas, configuración, catálogo, inventario, compras, recepciones,
facturas proveedor e IA/OCR.

Su potencial de producto es alto. Su madurez técnica precomercial es aproximada:
**6,8/10**.

El principal riesgo no es la falta de funcionalidades, sino la concentración de
responsabilidades y la coexistencia de arquitecturas canónicas y legacy.

---

## 2. Estado por área

### Producto

- Dashboard operativo real.
- Configuración de empresa y restaurante.
- Catálogo, categorías, familias, modificadores y escandallos.
- TPV conectado a mesas, pedidos, cobros y KDS.
- Reservas conectadas con mesas y planos.
- Inventario, compras, recepciones y facturas en distintos grados de consolidación.

### TPV

Avanzado y funcional, pero concentrado en
`app/dashboard/carta/carta-page-content.tsx`, un megacomponente de unas 18.000 líneas.
Es la mayor zona de riesgo de cambio.

### KDS

Funcional para Cocina, Barra, Coctelería y Sala. Incluye estados, pases, métricas,
SLA, heat y gestos táctiles. Convive con una Cocina legacy.

### Reservas

Funcionales por fecha, cliente, aforo y mesa, con selector de mapa. Requieren más
consolidación visual y de pruebas operativas.

### Inventario y compras

Híbridos. Existe modelo central Firestore y también persistencia/localStorage legacy.
Stock, compras, recepciones, facturas y movimientos aún no forman una única historia
completamente consolidada.

### Firestore

Híbrido:

- subcolecciones bajo `restaurants/{restaurantId}`;
- colecciones raíz operativas con `restaurantId`;
- raíces legacy `restaurantes`, `usuarios`, `mesas`, `productos`.

La frontera tenant está diseñada, pero su implementación no es uniforme en todas las
APIs y compatibilidades.

### Design System

Hostly Design System v1 existe, está documentado y dispone de componentes canónicos.
Persisten estilos inline, wrappers y clases legacy en pantallas antiguas o complejas.

### Asistente de Salas

Se encuentra en fase local de producto. Recoge decisiones en estado de React y no
persiste planos ni escribe Firestore. La dirección de experiencia está definida, pero
el archivo empieza a crecer y debe modularizarse antes de incorporar más fases.

### IA/OCR

Existen importación de carta, procesamiento de borradores, publicación revisada,
facturas proveedor, matching y aliases. Es una ventaja estratégica, aunque requiere
límites de coste, seguridad y calidad antes de escalar.

---

## 3. Riesgos antes de clientes reales

### Críticos

- Build no completamente reproducible: Geist puede requerir Google Fonts durante build.
- APIs legacy con patrones de tenant menos robustos que las APIs nuevas.
- TPV y editor de mesas altamente concentrados.
- Datos operativos todavía dependientes de localStorage en algunos módulos.

### Altos

- Doble sistema de roles/capabilities.
- Muchos listeners Firestore simultáneos.
- Doble naming `restaurants/restaurantes`, `users/usuarios`, `tables/mesas`.
- Rutas legacy todavía presentes.
- Falta de pruebas automatizadas visibles para runtimes críticos.

### Medios

- Estilos inline y Design System incompleto en varias pantallas.
- Logs de diagnóstico en cliente.
- Metadata y documentación base aún conservan rastros del scaffold inicial.
- Eventos globales no tipados entre módulos.

---

## 4. Archivos de mayor complejidad

| Archivo | Líneas aproximadas | Riesgo |
| --- | ---: | --- |
| `app/dashboard/carta/carta-page-content.tsx` | 18.025 | Crítico |
| `app/dashboard/config/mesas/page.tsx` | 6.055 | Crítico |
| `components/productos/productos-management-page.tsx` | 5.649 | Alto |
| `app/dashboard/recepciones/page.tsx` | 3.452 | Alto |
| `components/kds/order-items-board.tsx` | 3.228 | Alto |
| `components/map/EditableFloorMap.tsx` | 2.792 | Alto |
| `app/dashboard/inventario/inventario-stock-section.tsx` | 2.521 | Medio-alto |

---

## 5. Estado de validación observado

- TypeScript: correcto en la última auditoría.
- `git diff --check`: correcto, con avisos de normalización LF/CRLF.
- Build: bloqueado por descarga de Geist desde Google Fonts en un entorno sin red.

Este fallo no demuestra un error de TypeScript, pero sí un riesgo de reproducibilidad.

---

## 6. Lectura comercial

Hostly está cerca de poder pilotarse, pero antes necesita una fase de hardening:

1. seguridad servidor y tenant;
2. build reproducible;
3. smoke tests de operación;
4. control de localStorage;
5. medición de listeners y costes;
6. observabilidad y soporte.

No necesita una reescritura. Necesita estabilización quirúrgica.

