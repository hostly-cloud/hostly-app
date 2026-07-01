# Hostly · Operational Space Engine

> Fuente oficial de verdad del sistema de Sala y del modelo espacial operativo de Hostly.

**Estado:** oficial  
**Versión:** 1.0  
**Autoridad documental:** dominio Sala · nivel especializado canónico  
**Subordinación:** `00_HOSTLY_PRODUCT_BIBLE.md` → `01_HOSTLY_ARCHITECTURE_GUIDE.md` → **este documento**  
**Ámbito:** modelo de negocio espacial, editor, publicación, consumo operativo, IA y evolución de producto  
**No sustituye:** guías de implementación Firestore concretas (`hostly-floor-plan-layouts.md` describe la implementación legacy vigente hasta migración completa)

---

## Cómo usar este documento

Todo desarrollo futuro del sistema de Sala — editor, asistente, TPV, reservas, KDS, reporting e IA — **debe respetar las definiciones de este documento**.

Este documento contiene **únicamente decisiones finales**. No propone alternativas ni deja preguntas abiertas de producto.

---

# 1. Filosofía

## 1.1 Qué es Operational Space Engine

**Operational Space Engine (OSE)** es el motor conceptual y operativo de Hostly que traduce la realidad física de un negocio de hostelería — salones, terrazas, playas, barras, cocinas de sala, hamacas, mostradores y accesos — en un **Mapa Operativo publicado** que todos los módulos de Hostly pueden entender, consumir y actualizar en tiempo real sin ambigüedad.

OSE no es una pantalla. Es el **contrato espacial oficial** del restaurante dentro de Hostly.

## 1.2 Qué problema resuelve

OSE resuelve cuatro problemas estructurales de la hostelería digital:

1. **Fragmentación:** hoy distintos módulos interpretan mesas, zonas y planos de formas distintas. OSE unifica el significado.
2. **Configuración intimidante:** los dueños y encargados no piensan en coordenadas ni capas técnicas; piensan en salas, terrazas, mesas y servicio. OSE traduce su lenguaje al sistema.
3. **Cambio sin ruptura:** temporadas, eventos y reformas exigen reorganizar el local sin perder historial ni romper comandas abiertas. OSE separa borrador, publicación y versiones.
4. **Operación en tiempo real:** TPV, reservas, limpieza y personal necesitan el mismo mapa vivo con estados coherentes. OSE es la fuente publicada que ellos consumen.

## 1.3 Qué NO pretende ser

OSE **no** es:

- un CAD, AutoCAD ni herramienta de arquitectura técnica;
- el TPV disfrazado de editor;
- un ERP de facility management;
- un gemelo digital en 3D;
- un sistema de reservas;
- un motor de contabilidad de metros cuadrados;
- un reemplazo automático e instantáneo del legacy sin migración controlada;
- una libreta de dibujo libre sin reglas operativas.

## 1.4 Frase oficial del producto

> **Hostly convierte tu local en un mapa operativo vivo: configuras una vez, publicas con confianza y todo el equipo trabaja sobre el mismo espacio.**

---

# 2. Modelo Canónico

Cada entidad del modelo OSE tiene una definición única. Ningún módulo puede redefinirla.

---

## 2.1 Negocio

**Definición:** Unidad de tenant en Hostly. Representa un restaurante, bar, hotel F&B, beach club o negocio de hostelería aislado dentro del SaaS.

**Propósito:** Delimitar propiedad, permisos, publicación y consumo de mapas. Toda entidad OSE pertenece a exactamente un Negocio.

**Ejemplos:** «Restaurante La Mar», «Beach Club Sol», «Hotel Brisa · Restaurante».

**Relaciones:**
- Un Negocio tiene uno o más Mapas Operativos (normalmente uno activo publicado).
- Un Negocio nunca comparte entidades OSE con otro Negocio.

---

## 2.2 Mapa Operativo

**Definición:** Representación espacial oficial y versionada de cómo está organizado el local para operar. Es el artefacto publicado que consumen TPV, Reservas, KDS, Barra y el resto de módulos.

**Propósito:** Ser la **única fuente de verdad espacial publicada** del Negocio. Todo lo operativo ocurre sobre el Mapa Operativo activo.

**Ejemplos:** «Plano verano 2026», «Distribución evento Nochevieja», «Mapa habitual invierno».

**Relaciones:**
- Pertenece a un Negocio.
- Contiene Niveles (opcionales), Espacios, Zonas Operativas y Elementos.
- Tiene ciclo de vida: Borrador → Publicado → Archivado (y variantes temporales).
- Los Consumidores leen únicamente la versión **Publicada** activa, salvo modos de previsualización autorizados.

---

## 2.3 Nivel

**Definición:** Separación vertical u horizontal mayor del local cuando el negocio lo necesita. Representa plantas, altillos, decks o áreas físicamente separadas que el operador reconoce como «otro piso» o «otra zona grande».

**Propósito:** Organizar negocios multi-planta sin obligar a todos los locales a usarlo.

**Ejemplos:** «Planta baja», «Terraza superior», «Playa · Sector A», «Sótano bar».

**Relaciones:**
- Pertenece a un Mapa Operativo.
- Contiene uno o más Espacios.
- **Es opcional.** Un Mapa Operativo puede tener cero Niveles explícitos; en ese caso los Espacios cuelgan directamente del Mapa.

---

## 2.4 Espacio

**Definición:** Área operativa principal que el equipo del restaurante nombra y entiende como un lugar de servicio con identidad propia. Es la unidad de organización **visual y emocional** del editor.

**Propósito:** Agrupar estructura, elementos operativos, visibilidad y reglas de servicio bajo un contenedor comprensible para el dueño («Terraza», «Salón», «Chiringuito»).

**Ejemplos:** «Salón principal», «Terraza cubierta», «Hamacas premium», «Barra sala», «Zona VIP privada» *(como espacio, no como zona operativa)*.

**Relaciones:**
- Pertenece a un Nivel o directamente al Mapa Operativo.
- Contiene Elementos estructurales y operativos.
- Puede contener una o más Zonas Operativas.
- **No es lo mismo que Zona Operativa.** El Espacio es el «lugar»; la Zona Operativa es la «regla de operación dentro del lugar».

---

## 2.5 Zona Operativa

**Definición:** Subdivisión lógica dentro de un Espacio (o, excepcionalmente, entre Espacios contiguos del mismo servicio) que define **cómo se opera**, no **cómo se dibuja**.

**Propósito:** Enrutar comandas, filtrar vistas, asignar personal, aplicar reglas de reserva, priorizar limpieza y segmentar reporting sin redibujar el local.

**Ejemplos:** «Terraza · Tramo sol», «Salón · Ventana», «Hamacas · Fila 1», «Barra · Coctelería».

**Relaciones:**
- Pertenece a uno o más Espacios del mismo Mapa Operativo.
- Agrupa Elementos por referencia (no duplica geometría).
- Es consumida por TPV, Reservas, Personal, Limpieza y Reporting para filtros y reglas.
- **Nunca sustituye a un Espacio.** No se usa «zona» como sinónimo de «espacio».

---

## 2.6 Elemento

**Definición:** Entidad posicionada en el lienzo del Mapa Operativo con geometría, tipo e identidad estable.

**Propósito:** Representar todo lo que ocupa espacio físico o lógico en el plano: paredes, mesas, sillas, hamacas, barras, puertas, mostradores, separadores, escenarios, etc.

**Tipos oficiales (familias):**

| Familia | Propósito | Ejemplos |
|---------|-----------|----------|
| **Estructural** | Delimita y organiza el espacio | Pared, cristal, puerta, barra fija, jardinera, separador |
| **Operativo** | Soporta servicio directo | Mesa, taburete, hamaca, sunbed, mostrador, estación auxiliar |
| **Decorativo / Informativo** | Orientación y contexto | Planta, señalética, zona de espera marcada |

**Relaciones:**
- Pertenece a un Espacio.
- Puede estar asociado a una o más Zonas Operativas.
- Tiene identificador estable (`elementId`) que **no cambia** al publicar ni al restaurar layouts compatibles.
- Puede tener Estado operativo en runtime.

---

## 2.7 Estado

**Definición:** Condición **runtime** de un Elemento o de una agrupación operativa en el momento del servicio. No forma parte del diseño publicado del mapa; vive en la capa operativa.

**Propósito:** Informar a TPV, Reservas, Limpieza, Personal y Reporting qué ocurre ahora sobre el mapa.

**Estados oficiales de Elemento operativo (mínimo):**

| Estado | Significado operativo |
|--------|------------------------|
| `libre` | Disponible para sentar o asignar |
| `ocupado` | Servicio activo |
| `reservado` | Comprometido por reserva confirmada |
| `bloqueado` | No disponible por decisión operativa |
| `sucio` / `pendiente_limpieza` | Requiere intervención de limpieza |
| `fuera_servicio` | Inactivo por avería, clima o configuración |

**Relaciones:**
- Se aplica sobre Elementos publicados.
- Lo escriben principalmente TPV, Reservas y Limpieza.
- Lo leen todos los Consumidores operativos.
- **Nunca se confunde con el ciclo de vida del Mapa** (Borrador/Publicado).

---

## 2.8 Publicación

**Definición:** Acto formal de promover un Mapa Operativo (o una revisión suya) de **Borrador** a **Publicado**, haciéndolo la verdad operativa activa del Negocio.

**Propósito:** Separar experimentación de operación real. Ningún cambio de diseño afecta al servicio en curso hasta que un humano autorizado publica.

**Reglas oficiales:**
- Solo una versión **Publicada activa** por Mapa Operativo lógico del Negocio en un instante dado.
- Publicar requiere confirmación explícita.
- Publicar con servicio activo incompatible está **bloqueado** (misma invariante operativa que hoy protege layouts con mesas ocupadas).
- Publicar no borra comandas, reservas futuras ni historial; actualiza la capa espacial consumida.

**Relaciones:**
- Transforma el Mapa Operativo visible para Consumidores.
- Deja intacto el Borrador para seguir editando la siguiente versión.

---

## 2.9 Consumidor

**Definición:** Módulo o servicio de Hostly que **lee** el Mapa Operativo publicado y/o **escribe** Estados sobre Elementos. No define el modelo espacial.

**Propósito:** Ejecutar operación real sobre la verdad espacial común.

**Relaciones:**
- Depende del Mapa Operativo Publicado.
- No modifica geometría del mapa salvo permisos explícitos de configuración.
- Puede emitir y recibir eventos de Estado.

---

# 3. Jerarquía oficial

## 3.1 Diagrama canónico

```text
Negocio (tenant / restaurantId)
│
└── Mapa Operativo (contrato espacial publicado)
    │
    ├── [Nivel] (opcional, 0..N)
    │   │
    │   └── Espacio (lugar operativo reconocible)
    │       │
    │       ├── Zona Operativa (reglas / segmentación lógica)
    │       │   └── referencia → Elementos
    │       │
    │       └── Elemento (geometría + identidad)
    │           └── Estado (runtime, no diseño)
    │
    └── Publicación (ciclo de vida del mapa)
        ├── Borrador
        ├── Publicado (activo)
        ├── Archivado
        └── Temporal / Temporada / Evento

Consumidores (TPV, Reservas, KDS, …)
    └── leen Mapa Publicado + Estados
```

## 3.2 Diagrama simplificado de flujo humano

```text
Negocio
  ↓
Mapa Operativo
  ↓
Espacios          ← el usuario piensa aquí
  ↓
Zonas Operativas  ← el sistema opera aquí
  ↓
Elementos         ← mesas, paredes, hamacas…
  ↓
Estados           ← qué pasa ahora
  ↓
Consumidores      ← TPV, reservas, limpieza…
```

## 3.3 Por qué esta jerarquía

1. **Negocio primero:** Hostly es multi-restaurante; la frontera de tenant es innegociable.
2. **Mapa Operativo como contrato:** evita que cada módulo invente su propio plano.
3. **Nivel opcional:** hoteles y beach clubs lo necesitan; un bar de barrio no debe sufrir complejidad innecesaria.
4. **Espacio antes que Zona:** el operador configura lugares; las zonas refinan operación sin mezclar lenguaje.
5. **Elemento con identidad estable:** comandas, reservas e historial dependen de IDs persistentes.
6. **Estado separado del diseño:** dibujar una mesa ≠ servir en ella.
7. **Consumidores al final:** consumen verdad publicada; no la crean.

---

# 4. Consumidores oficiales

Cada módulo listado es Consumidor OSE. Ninguno redefine el modelo.

## 4.1 TPV

**Obtiene:** Mapa publicado, Elementos operativos, Zonas Operativas, Estados de mesa/superficie, capacidad y agrupaciones.

**Aporta:** Ocupación, apertura/cierre de servicio, bloqueos operativos, uniones temporales de mesas.

**Regla:** El TPV **consume** el mapa; no es el dueño del modelo espacial.

## 4.2 Reservas

**Obtiene:** Elementos reservables, capacidad, Zonas Operativas, disponibilidad por franja.

**Aporta:** Estado `reservado`, holds temporales, asignación de elemento al llegar el cliente.

## 4.3 KDS

**Obtiene:** Contexto de servicio por zona/estación cuando aplica enrutamiento espacial; no dibuja el mapa.

**Aporta:** Nada sobre geometría. Opcionalmente señales de carga por zona si el negocio lo activa.

## 4.4 Barra

**Obtiene:** Elementos de barra/mostrador, Zona Operativa de barra, estados de servicio paralelo.

**Aporta:** Estados operativos de superficies de barra cuando difieren de mesa clásica.

## 4.5 Inventario

**Obtiene:** Referencia contextual opcional (Espacio/Zona) para consumos o mermas ligadas a ubicación.

**Aporta:** Nada sobre geometría del mapa.

## 4.6 Personal

**Obtiene:** Zonas Operativas, asignación de turno/sección, Elementos bajo responsabilidad.

**Aporta:** Asignación de camarero a zona; no mueve mesas.

## 4.7 Limpieza

**Obtiene:** Elementos operativos, Estados `sucio` / `pendiente_limpieza`, prioridad por zona.

**Aporta:** Transiciones de estado de limpieza.

## 4.8 Reporting

**Obtiene:** Histórico de Estados, ocupación por Espacio/Zona/Elemento, comparativas por Temporada/Evento.

**Aporta:** Nada sobre diseño del mapa.

## 4.9 IA

**Obtiene:** Mapa borrador, fotos/planos, histórico operativo agregado (nunca datos de un tenant ajeno).

**Aporta:** Propuestas de Espacios, Elementos y Zonas en **Borrador** únicamente.

## 4.10 Automation Engine

**Obtiene:** Eventos de Estado, reglas por Zona Operativa, umbrales de ocupación.

**Aporta:** Acciones operativas preaprobadas (avisos, tareas); **nunca** publicación automática de mapa.

---

# 5. Principios UX

Estas normas son **obligatorias** para Asistente, Editor y cualquier superficie de configuración espacial.

## 5.1 Principios fundacionales

| # | Principio | Norma |
|---|-----------|-------|
| P1 | **Nunca CAD** | Prohibido lenguaje, iconografía o interacción de dibujo técnico profesional. Referentes: Figma, FigJam, Canva, Miro — no AutoCAD. |
| P2 | **Nunca intimidar** | El usuario nunca ve un lienzo vacío sin guía en la primera configuración. |
| P3 | **Todo táctil** | Targets mínimos, gestos simples, feedback inmediato. Tablet es dispositivo de referencia. |
| P4 | **Todo visual** | Tarjetas, colores, iconos y preview antes que formularios largos. |
| P5 | **Todo progresivo** | La complejidad aparece por fases; nunca toda a la vez. |
| P6 | **Seleccionar → Actuar → Configurar** | Orden fijo de interacción en el editor. |
| P7 | **Una herramienta activa** | En todo momento hay una sola herramienta activa en el editor avanzado. |
| P8 | **Una decisión principal** | Cada pantalla tiene una acción dominante clara. |
| P9 | **Lenguaje de restaurante** | «Terraza», «Hamaca», «Barra» — nunca «polyline», «layer», «entity». |
| P10 | **Reversible sin castigo** | Cancelar (ESC), deshacer futuro y borrador seguro antes de publicar. |

## 5.2 Flujo oficial del editor avanzado (fases)

```text
Fase 1 · Espacios     → dónde se trabaja
Fase 2 · Estructura   → límites y elementos fijos
Fase 3 · Operación    → mesas, hamacas, superficies de servicio
```

El usuario **siempre** entra por Espacios antes de dibujar estructura u operación.

## 5.3 Patrón Seleccionar → Actuar → Configurar

```text
1. Seleccionar   herramienta o elemento (panel izquierdo / lienzo)
2. Actuar        sobre el lienzo (colocar, dibujar, mover*)
3. Configurar    en inspector (propiedades, zona, capacidad)

* Mover/editar solo cuando el roadmap de producto lo habilite explícitamente.
```

## 5.4 Inspector

- Muestra contexto de lo seleccionado: herramienta activa, elemento o espacio.
- Nunca muestra propiedades genéricas irrelevantes.
- «Próximamente» solo para capacidades no liberadas; nunca como excusa de mala UX en lo ya publicado.

---

# 6. Asistente Inteligente

## 6.1 Rol oficial

El **Asistente Inteligente de Salas** es la **experiencia principal de primera configuración**. El Editor Avanzado es secundario y de precisión.

## 6.2 Flujo oficial

```text
1. Bienvenida
   → tipo de negocio (restaurante, bar, beach club, hotel F&B…)

2. Espacios
   → preguntas simples: «¿Tienes terraza?», «¿Hamacas?», «¿Barra en sala?»
   → genera Espacios con nombre, tipo y color

3. Capacidad orientativa
   → «¿Cuántas mesas aproximadas?», «¿Cuántas hamacas?»
   → genera propuesta de Elementos operativos (no publicada)

4. Estructura sugerida (opcional)
   → propone límites básicos si hay foto/plano
   → siempre editable

5. Revisión humana
   → mapa en Borrador, resumen legible, lista de decisiones

6. Publicación
   → solo tras confirmación explícita del usuario autorizado
```

## 6.3 Qué genera

- Espacios con metadatos comprensibles.
- Propuesta inicial de Elementos operativos y, si aplica, Elementos estructurales básicos.
- Zonas Operativas sugeridas cuando el tipo de negocio lo requiere (p. ej. hamacas por fila).
- **Todo en Borrador.** Nada operativo hasta publicar.

## 6.4 Qué puede modificar el usuario

- Renombrar, recolorear, ocultar o eliminar cualquier propuesta antes de publicar.
- Saltar al Editor Avanzado en cualquier momento.
- Rechazar por completo la propuesta de IA y empezar manualmente.
- Publicar parcialmente (solo algunos Espacios) en versiones futuras; la regla inicial es publicación del mapa revisado como unidad coherente.

## 6.5 Qué no hace el Asistente

- No publica automáticamente.
- No elimina mapas legacy sin confirmación.
- No promete precisión milimétrica desde foto.
- No configura TPV, carta ni personal.

---

# 7. Editor Avanzado

## 7.1 Qué hace

- Edita Mapas Operativos en **Borrador**.
- Gestiona Espacios, Elementos estructurales y operativos por fases.
- Permite precisión geométrica manual progresiva.
- Previsualiza el resultado antes de publicar.
- Delega al Asistente cuando el usuario prefiere guía.

## 7.2 Qué no hace

- No es la puerta de entrada recomendada para un local nuevo.
- No publica sin confirmación.
- No ejecuta operación de servicio (eso es TPV).
- No sustituye módulos de Reservas, Limpieza o Personal.
- No expone todas las opciones del legacy en una sola pantalla.

## 7.3 Cuándo aparece

- Tras completar o saltar el Asistente.
- Desde Configuración → Espacios → «Editor avanzado».
- Cuando el usuario necesita ajuste fino, temporada o evento.

## 7.4 Cómo se usa

```text
Elegir Espacio → Elegir herramienta → Actuar en lienzo → Configurar en inspector → Repetir → Publicar
```

## 7.5 Cómo evoluciona

| Etapa de producto | Capacidad del editor |
|-------------------|----------------------|
| **V2.0–V2.3** | Espacios, herramienta activa, primera estructura (pared) |
| **V2.4–V2.6** | Resto estructural, elementos operativos básicos |
| **V2.7–V2.9** | Selección, edición, duplicar, bloquear |
| **V3.0** | Publicación integrada, preview consumidor |
| **V3.x** | Temporadas, eventos, comparación de versiones |
| **V4.x** | IA asistida in-editor, import foto/plano revisable |

El legacy (`Configuración → Mesas` / `EditableFloorMap`) permanece hasta paridad funcional y migración validada; no recibe capacidades nuevas del modelo OSE.

---

# 8. IA

## 8.1 Qué puede hacer la IA

- Proponer Espacios a partir de preguntas o foto/plano.
- Sugerir distribución de Elementos según capacidad declarada.
- Detectar solapamientos, pasillos estrechos o capacidad incoherente.
- Recomendar Zonas Operativas según tipo de negocio.
- Generar resúmenes legibles del mapa borrador.
- Proponer layouts alternativos para Temporada/Evento como Borradores separados.

## 8.2 Qué nunca hará automáticamente

- Publicar un Mapa Operativo.
- Modificar un Mapa **Publicado** activo.
- Eliminar Elementos con historial operativo vinculado.
- Cambiar IDs de Elementos existentes.
- Fusionar Negocios o cruzar datos entre tenants.
- Abrir, cerrar o cobrar mesas.
- Confirmar reservas en nombre del cliente.

## 8.3 Qué siempre requerirá confirmación humana

- Publicación de cualquier cambio espacial.
- Sustitución del mapa activo por uno de Temporada/Evento.
- Eliminación masiva de Elementos.
- Importación que reemplace más del 50 % de la geometría existente.
- Cualquier propuesta de IA con confianza por debajo del umbral operativo definido por producto.

---

# 9. Versionado

## 9.1 Estados oficiales del Mapa Operativo

| Estado | Definición | Visible en operación |
|--------|------------|----------------------|
| **Borrador** | Trabajo en curso, editable libremente | No (solo preview autorizada) |
| **Publicado** | Verdad operativa activa del Negocio | Sí |
| **Archivado** | Histórico conservado, no activable sin acción explícita | No |
| **Temporal** | Borrador con fecha de expiración o sustitución planificada | Solo si se promueve a Publicado |
| **Temporada** | Variante estacional (verano/invierno) con identidad propia | Sí, cuando está Publicada y activa |
| **Evento** | Variante puntual (boda, banquete, festival) | Sí, cuando está Publicada y activa |

## 9.2 Convivencia

```text
                    ┌─────────────┐
                    │  Borrador   │ ← edición continua
                    └──────┬──────┘
                           │ publicar (confirmado)
                           ▼
                    ┌─────────────┐
         ┌─────────│  Publicado  │─────────┐
         │         └─────────────┘         │
         │ activar temporada/evento        │ archivar
         ▼                                 ▼
  ┌─────────────┐                   ┌─────────────┐
  │ Temporada / │                   │  Archivado  │
  │   Evento    │                   └─────────────┘
  └─────────────┘

Temporal: borrador con caducidad → archiva o publica al vencer
```

**Reglas:**
- Solo **un** Mapa Publicado activo por Negocio en un instante.
- Temporada y Evento son Mapas Publicados **alternativos**; activar uno desactiva el anterior sin borrarlo.
- Al archivar, no se pierde historial; se oculta de selección operativa.
- Cambiar de Temporada con servicio activo incompatible está bloqueado.

## 9.3 Relación con layouts legacy

Los presets actuales (`floorPlanSnapshots`) se interpretan como implementación transitoria de **Temporada/Evento/Archivado** hasta migración completa al modelo OSE en Firestore.

---

# 10. Roadmap conceptual

Orden **oficial** de evolución de producto (no técnico):

| Orden | Hito | Resultado para el negocio |
|-------|------|---------------------------|
| 1 | **Modelo y lenguaje** | Todos hablan Espacio/Zona/Elemento igual |
| 2 | **Asistente primera configuración** | Local configurado en minutos, sin lienzo vacío |
| 3 | **Editor por fases** | Espacios → Estructura → Operación |
| 4 | **Primera estructura dibujable** | Paredes y límites visuales |
| 5 | **Elementos operativos** | Mesas, hamacas, sillas en el mapa |
| 6 | **Publicación borrador → vivo** | Cambios controlados en servicio |
| 7 | **Consumo unificado TPV** | Un solo mapa en sala |
| 8 | **Reservas sobre mapa** | Disponibilidad espacial real |
| 9 | **Temporada y Evento** | Verano, invierno, banquetes sin caos |
| 10 | **Personal y Limpieza por zona** | Operación auxiliar conectada al espacio |
| 11 | **Reporting espacial** | Ocupación y rendimiento por Espacio/Zona |
| 12 | **IA de optimización** | Propuestas de mejora en borrador |
| 13 | **Retirada legacy** | Un solo motor, una sola verdad |

---

# 11. Nunca romper

Principios **inmutables** del Operational Space Engine. Ninguna feature futura puede violarlos.

## 11.1 Modelo

1. **Nunca mezclar Espacio con Zona Operativa.** Son entidades distintas con propósito distinto.
2. **Nunca hacer obligatorio un Nivel.** Los negocios simples operan sin niveles explícitos.
3. **Nunca hacer que el TPV sea el centro del modelo.** El TPV consume; OSE define.
4. **Nunca regenerar IDs de Elemento** al publicar, restaurar temporada o migrar compatible.
5. **Nunca permitir dos Mapas Publicados activos** simultáneos para el mismo Negocio.
6. **Nunca publicar cambios automáticamente**, incluida cualquier acción de IA.
7. **Nunca permitir que la IA modifique un mapa Publicado** sin aprobación humana explícita.
8. **Nunca cruzar datos espaciales entre Negocios.**
9. **Nunca confundir Estado runtime con diseño publicado.**
10. **Nunca eliminar historial operativo** al cambiar geometría; se desactiva o archiva, no se destruye silenciosamente.

## 11.2 UX

11. **Nunca presentar CAD** al usuario de hostelería.
12. **Nunca mostrar lienzo vacío** como primera experiencia de un local nuevo.
13. **Nunca activar más de una herramienta** simultáneamente en el editor.
14. **Nunca exigir coordenadas manuales** para una acción básica.
15. **Nunca bloquear cancelación** de una acción en curso (ESC / cancelar visible).

## 11.3 Operación

16. **Nunca activar un mapa incompatible** con servicio activo en Elementos afectados.
17. **Nunca romper comandas abiertas** por un cambio espacial.
18. **Nunca ocultar qué mapa está activo** al equipo en operación.
19. **Nunca permitir que Reservas reserve un Elemento inexistente** en el mapa publicado.
20. **Nunca desincronizar TPV y mapa publicado** en modo online salvo degradación documentada.

## 11.4 Arquitectura de producto

21. **Nunca añadir capacidades OSE al editor legacy** una vez alcanzada paridad; el legacy entra en retirada.
22. **Nunca crear un tercer modelo espacial** paralelo a OSE y legacy sin decisión documentada.
23. **Nunca mezclar borrador de carta, stock o personal** con borrador de mapa en la misma acción de «guardar todo».
24. **Nunca priorizar elegancia técnica** sobre operación en sala con clientes sentados.

---

# 12. Glosario oficial

| Término | Definición única |
|---------|------------------|
| **Asistente Inteligente de Salas** | Flujo guiado principal de primera configuración del mapa. Genera borradores; no publica solo. |
| **Automation Engine** | Motor de reglas y automatizaciones operativas de Hostly. Consume OSE; no diseña mapas. |
| **Archivado** | Estado de un mapa conservado pero no seleccionable para operación. |
| **Borrador** | Mapa en edición no visible para consumidores operativos. |
| **Consumidor** | Módulo Hostly que lee mapa publicado y/o escribe Estados. |
| **Editor Avanzado** | Herramienta secundaria de precisión por fases. No es la primera experiencia. |
| **Elemento** | Entidad con geometría e identidad estable en el lienzo (mesa, pared, hamaca…). |
| **Espacio** | Área operativa principal con identidad («Terraza», «Salón»). Contenedor visual y organizativo. |
| **Estado** | Condición runtime de un Elemento (`libre`, `ocupado`, `reservado`…). No es diseño. |
| **Evento** | Variante de mapa para ocasión puntual con ciclo de vida propio. |
| **Mapa Operativo** | Contrato espacial oficial publicado de un Negocio. |
| **Negocio** | Tenant Hostly (`restaurantId`). Unidad de aislamiento. |
| **Nivel** | Separación vertical u horizontal mayor opcional (planta, deck). |
| **Operational Space Engine (OSE)** | Motor conceptual y operativo completo definido en este documento. |
| **Publicación** | Acto humano confirmado de promover Borrador a Publicado activo. |
| **Publicado** | Mapa operativo activo consumido por TPV y resto de módulos. |
| **Temporada** | Variante estacional publicable (verano, invierno). |
| **Temporal** | Borrador o mapa con vigencia limitada en el tiempo. |
| **Zona Operativa** | Subdivisión lógica para reglas de servicio dentro de Espacio(s). No es sinónimo de Espacio. |

### Términos prohibidos en UX (usar en su lugar)

| Evitar | Usar |
|--------|------|
| Zona (= espacio completo) | Espacio |
| Plano / FloorPlan (con usuario) | Mapa |
| Entidad / Entity | Elemento |
| Layer / Capa | Fase o tipo de elemento |
| Snapshot (con usuario) | Temporada, Evento o copia guardada |
| CAD / Polilínea | Pared, límite, separador |

---

## Control de cambios documentales

Cualquier modificación a este documento requiere:

1. Revisión de producto y arquitectura.
2. Entrada en `04_HOSTLY_DECISIONS_LOG.md` si introduce o sustituye decisiones.
3. Incremento de versión en este archivo.

---

**Fin del documento canónico · Operational Space Engine v1.0**
