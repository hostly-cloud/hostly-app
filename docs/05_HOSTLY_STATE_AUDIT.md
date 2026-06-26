# Hostly State Audit

> FotografÃ­a del estado real del producto y su preparaciÃ³n tÃ©cnica.

**Estado de la auditorÃ­a:** junio de 2026
**Autoridad documental:** nivel 6
**Naturaleza:** descriptiva; no sustituye arquitectura ni roadmap.

---

## 1. Resumen

Hostly es un producto operativo real, no una demo. Contiene flujos funcionales de
TPV, KDS, reservas, configuraciÃ³n, catÃ¡logo, inventario, compras, recepciones,
facturas proveedor e IA/OCR.

Su potencial de producto es alto. Su madurez tÃ©cnica precomercial es aproximada:
**6,8/10**.

El principal riesgo no es la falta de funcionalidades, sino la concentraciÃ³n de
responsabilidades y la coexistencia de arquitecturas canÃ³nicas y legacy.

---

## 2. Estado por Ã¡rea

### Producto

- Dashboard operativo real.
- ConfiguraciÃ³n de empresa y restaurante.
- CatÃ¡logo, categorÃ­as, familias, modificadores y escandallos.
- TPV conectado a mesas, pedidos, cobros y KDS.
- Reservas conectadas con mesas y planos.
- Inventario, compras, recepciones y facturas en distintos grados de consolidaciÃ³n.

### TPV

Avanzado y funcional, pero concentrado en
`app/dashboard/carta/carta-page-content.tsx`, un megacomponente de unas 18.000 lÃ­neas.
Es la mayor zona de riesgo de cambio.

### KDS

Funcional para Cocina, Barra, CoctelerÃ­a y Sala. Incluye estados, pases, mÃ©tricas,
SLA, heat y gestos tÃ¡ctiles. Convive con una Cocina legacy.

### Reservas

Funcionales por fecha, cliente, aforo y mesa, con selector de mapa. Requieren mÃ¡s
consolidaciÃ³n visual y de pruebas operativas.

### Inventario y compras

HÃ­bridos. Existe modelo central Firestore y tambiÃ©n persistencia/localStorage legacy.
Stock, compras, recepciones, facturas y movimientos aÃºn no forman una Ãºnica historia
completamente consolidada.

### Firestore

HÃ­brido:

- subcolecciones bajo `restaurants/{restaurantId}`;
- colecciones raÃ­z operativas con `restaurantId`;
- raÃ­ces legacy `restaurantes`, `usuarios`, `mesas`, `productos`.

La frontera tenant estÃ¡ diseÃ±ada, pero su implementaciÃ³n no es uniforme en todas las
APIs y compatibilidades.

### Design System

Hostly Design System v1 existe, estÃ¡ documentado y dispone de componentes canÃ³nicos.
Persisten estilos inline, wrappers y clases legacy en pantallas antiguas o complejas.

### Asistente de Salas

Se encuentra en fase local de producto. Recoge decisiones en estado de React y no
persiste planos ni escribe Firestore. La direcciÃ³n de experiencia estÃ¡ definida, pero
el archivo empieza a crecer y debe modularizarse antes de incorporar mÃ¡s fases.

### IA/OCR

Existen importaciÃ³n de carta, procesamiento de borradores, publicaciÃ³n revisada,
facturas proveedor, matching y aliases. Es una ventaja estratÃ©gica, aunque requiere
lÃ­mites de coste, seguridad y calidad antes de escalar.

---

## 3. Riesgos antes de clientes reales

### CrÃ­ticos

- Build no completamente reproducible: Geist puede requerir Google Fonts durante build.
- APIs legacy con patrones de tenant menos robustos que las APIs nuevas.
- TPV y editor de mesas altamente concentrados.
- Datos operativos todavÃ­a dependientes de localStorage en algunos mÃ³dulos.

### Altos

- Doble sistema de roles/capabilities.
- Muchos listeners Firestore simultÃ¡neos.
- Doble naming `restaurants/restaurantes`, `users/usuarios`, `tables/mesas`.
- Rutas legacy todavÃ­a presentes.
- Falta de pruebas automatizadas visibles para runtimes crÃ­ticos.

### Medios

- Estilos inline y Design System incompleto en varias pantallas.
- Logs de diagnÃ³stico en cliente.
- Metadata y documentaciÃ³n base aÃºn conservan rastros del scaffold inicial.
- Eventos globales no tipados entre mÃ³dulos.

---

## 4. Archivos de mayor complejidad

| Archivo | LÃ­neas aproximadas | Riesgo |
| --- | ---: | --- |
| `app/dashboard/carta/carta-page-content.tsx` | 18.025 | CrÃ­tico |
| `app/dashboard/config/mesas/page.tsx` | 6.055 | CrÃ­tico |
| `components/productos/productos-management-page.tsx` | 5.649 | Alto |
| `app/dashboard/recepciones/page.tsx` | 3.452 | Alto |
| `components/kds/order-items-board.tsx` | 3.228 | Alto |
| `components/map/EditableFloorMap.tsx` | 2.792 | Alto |
| `app/dashboard/inventario/inventario-stock-section.tsx` | 2.521 | Medio-alto |

---

## 5. Estado de validaciÃ³n observado

- TypeScript: correcto en la Ãºltima auditorÃ­a.
- `git diff --check`: correcto, con avisos de normalizaciÃ³n LF/CRLF.
- Build: bloqueado por descarga de Geist desde Google Fonts en un entorno sin red.

Este fallo no demuestra un error de TypeScript, pero sÃ­ un riesgo de reproducibilidad.

---

## 6. Lectura comercial

Hostly estÃ¡ cerca de poder pilotarse, pero antes necesita una fase de hardening:

1. seguridad servidor y tenant;
2. build reproducible;
3. smoke tests de operaciÃ³n;
4. control de localStorage;
5. mediciÃ³n de listeners y costes;
6. observabilidad y soporte.

No necesita una reescritura. Necesita estabilizaciÃ³n quirÃºrgica.
