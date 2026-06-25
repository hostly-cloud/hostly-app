# Hostly Product Bible

> Constitución de producto, criterio de decisión y fuente máxima de autoridad de Hostly.

**Estado:** oficial  
**Versión:** 1.0  
**Autoridad documental:** nivel 1  
**Ámbito:** producto, experiencia, arquitectura, diseño, operación, IA y evolución

---

## 1. Jerarquía documental

Cuando dos documentos parezcan contradecirse, prevalece el que esté más arriba:

1. `00_HOSTLY_PRODUCT_BIBLE.md`
2. `01_HOSTLY_ARCHITECTURE_GUIDE.md`
3. `02_HOSTLY_DESIGN_SYSTEM.md`
4. `03_HOSTLY_ROADMAP.md`
5. `04_HOSTLY_DECISIONS_LOG.md`
6. `05_HOSTLY_STATE_AUDIT.md`
7. `06_HOSTLY_AI_GUIDELINES.md`
8. `07_HOSTLY_OPERATIONS_GUIDE.md`

Los documentos especializados existentes en `docs/` desarrollan dominios concretos,
pero no sustituyen esta jerarquía.

---

## 2. Manifiesto

Hostly existe para que un restaurante pueda operar con más claridad, menos fricción
y menos estrés.

La hostelería no necesita más pantallas, más configuración ni más complejidad. Necesita
herramientas que entiendan el ritmo del servicio, reduzcan errores y permitan que cada
persona se concentre en su trabajo.

**Hostly no es un TPV, ni un ERP, ni un software de cocina. Hostly es el sistema
operativo inteligente para la hostelería.**

La mejor tecnología es aquella que desaparece para que las personas puedan hacer mejor
su trabajo.

---

## 3. Qué es Hostly

Hostly es un SaaS B2B multi-restaurante que conecta:

- configuración del negocio;
- carta y productos;
- espacios y mesas;
- TPV y comandas;
- Cocina, Barra, Coctelería y Sala;
- reservas;
- cobros;
- inventario, escandallos, compras y recepciones;
- análisis e inteligencia aplicada.

Su unidad de diseño no es la pantalla. Es el servicio completo del restaurante.

## 4. Qué no es Hostly

Hostly no es:

- un ERP genérico adaptado superficialmente a hostelería;
- una colección de módulos inconexos;
- un panel administrativo clásico;
- un editor técnico que obliga al usuario a conocer el modelo interno;
- un sistema que automatiza decisiones irreversibles sin confirmación humana;
- un producto que sacrifica la operación real por elegancia técnica;
- un escaparate de IA.

---

## 5. Misión

Hacer que operar y gestionar un negocio de hostelería sea más simple, rápido y
comprensible, conectando en una única experiencia las decisiones del propietario con
el trabajo real de sala, cocina, barra y compras.

## 6. Visión

Convertir Hostly en la capa operativa inteligente de restaurantes, bares, cafeterías,
hoteles, beach clubs y otros negocios de hostelería, capaz de acompañarlos desde su
configuración inicial hasta la mejora continua de su operación.

---

## 7. Simple by design

La simplicidad no significa reducir capacidades. Significa ordenar la complejidad para
que aparezca únicamente cuando sea necesaria.

Hostly debe:

- presentar una decisión principal por momento;
- usar lenguaje de restaurante, no lenguaje técnico;
- proponer valores razonables;
- recordar contexto;
- ocultar opciones avanzadas hasta que aporten valor;
- mantener visibles el estado y la siguiente acción;
- permitir corregir sin castigar.

Si una función necesita una explicación larga para poder utilizarse, el problema aún
no está bien resuelto.

---

## 8. Pensamos como un restaurante

Antes de diseñar una solución debemos comprender:

- quién la usa;
- en qué momento del servicio;
- qué presión tiene;
- qué información necesita en tres segundos;
- qué error puede cometer;
- qué consecuencias operativas tendría;
- qué ocurre si falla la conexión o hay dos dispositivos actuando a la vez.

La secuencia obligatoria es:

**Primero entendemos el restaurante. Después diseñamos la experiencia. Después
escribimos el código.**

## 9. Diseñamos para la hora punta

Hostly debe funcionar cuando:

- el restaurante está lleno;
- hay ruido, interrupciones y prisas;
- varias personas operan simultáneamente;
- un camarero tiene una sola mano libre;
- cocina acumula comandas;
- una mesa cambia, se une o divide;
- un cobro no puede quedar ambiguo;
- la conexión es imperfecta.

Si una solución solo funciona en una demo tranquila, no está terminada.

---

## 10. Principios fundamentales

1. **La operación manda.** La integridad del servicio está por encima de la limpieza
   interna o del refinamiento visual.
2. **Un restaurante nunca debe ver datos de otro.** `restaurantId` es frontera de
   seguridad.
3. **Cada acción debe tener un resultado comprensible.**
4. **Los estados críticos no pueden ser ambiguos.**
5. **Una única fuente de verdad por responsabilidad.**
6. **Touch first.** Diseñar para dedo y presión operacional.
7. **La configuración prepara la operación; no compite con ella.**
8. **La IA propone; la persona confirma.**
9. **Los cambios críticos deben ser pequeños, observables y reversibles.**
10. **No extendemos patrones legacy como arquitectura nueva.**

---

## 11. Cómo se toman decisiones

Ante una decisión de producto, diseño o arquitectura:

1. Definir el problema operativo real.
2. Identificar usuario, contexto y riesgo.
3. Confirmar qué existe hoy en código y datos.
4. Buscar la solución mínima compatible.
5. Evaluar impacto en TPV, KDS, pagos, inventario y tenant.
6. Diseñar el estado vacío, error, carga y recuperación.
7. Validar en móvil, tablet y operación concurrente.
8. Documentar la decisión si crea o cambia un precedente.

### Regla de oro

**No cambiar lógica operativa cuando la misión es visual, y no cambiar persistencia
cuando la misión es de experiencia.**

---

## 12. Principios de IA

- La IA debe reducir trabajo, no introducir incertidumbre oculta.
- Toda salida relevante debe poder revisarse.
- La IA no publica, cobra, elimina, migra ni confirma automáticamente.
- Debe mostrar límites, dudas y elementos pendientes.
- Debe conservar la fuente o contexto que permita verificar su propuesta.
- Un fallo de IA no debe bloquear la operación principal.
- Los costes, cuotas, privacidad y trazabilidad forman parte del diseño.

---

## 13. Principios de UX

- Una acción principal por contexto.
- Objetivos táctiles mínimos de 44–48 px.
- No depender del hover.
- No usar doble scroll evitable.
- Confirmar acciones destructivas o económicas.
- Mantener Atrás, Cancelar y Continuar predecibles.
- Evitar formularios largos cuando puede existir una conversación guiada.
- No adelantar complejidad.
- Dar prioridad a mesa, producto, tiempo, estado, importe y siguiente acción.
- Diseñar errores con recuperación, no solo con mensajes.

---

## 14. Principios visuales

- Hostly Design System v1 es el único contrato visual.
- Geist es la tipografía principal.
- Colores, radios, sombras y espacios proceden de tokens `--hostly-*`.
- Operación antes que decoración.
- Jerarquía antes que densidad.
- Premium significa claridad y precisión, no ornamento.
- No se crean variantes locales si existe un componente Hostly equivalente.
- La interfaz debe desaparecer visualmente para que destaque el trabajo.

---

## 15. Principios técnicos

- `restaurantId` debe acompañar y proteger toda operación multi-tenant.
- Firestore Rules son seguridad; la UI es prevención y experiencia.
- TPV y KDS son runtimes críticos.
- UI y persistencia deben evolucionar por separado.
- No se divide estado sin caracterizar sus invariantes.
- No se reescriben megacomponentes como ejercicio de limpieza.
- Primero presentación, después helpers, después estado y finalmente persistencia.
- Los procesos económicos deben ser idempotentes.
- Los listeners deben tener alcance y coste conocidos.
- Los fallbacks legacy son transiciones documentadas, no patrones nuevos.

---

## 16. Cómo debe trabajar cualquier IA en Hostly

Toda IA debe:

1. Leer esta Product Bible.
2. Leer la Architecture Guide si toca código, datos o estructura.
3. Leer el Design System si toca experiencia o UI.
4. Inspeccionar el estado real antes de proponer cambios.
5. Declarar qué entiende, qué riesgo existe y qué archivos están en alcance.
6. Respetar las prohibiciones de la misión.
7. No inventar funcionalidades, datos ni decisiones.
8. Realizar un cambio importante por iteración.
9. Validar en proporción al riesgo.
10. Explicar qué cambió, qué no cambió y qué queda pendiente.

Las instrucciones detalladas están en `06_HOSTLY_AI_GUIDELINES.md`.

---

## 17. Relación con Architecture Guide y Design System

- Esta Product Bible define **por qué** existe Hostly y cómo decide.
- `01_HOSTLY_ARCHITECTURE_GUIDE.md` define **cómo se estructura y protege**.
- `02_HOSTLY_DESIGN_SYSTEM.md` define **cómo se presenta y se siente**.

Ninguna implementación se considera alineada si contradice uno de estos tres contratos.

