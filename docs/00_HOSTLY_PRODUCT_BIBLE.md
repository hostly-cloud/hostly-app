# Hostly Product Bible

> ConstituciÃ³n de producto, criterio de decisiÃ³n y fuente mÃ¡xima de autoridad de Hostly.

**Estado:** oficial
**VersiÃ³n:** 1.0
**Autoridad documental:** nivel 1
**Ãmbito:** producto, experiencia, arquitectura, diseÃ±o, operaciÃ³n, IA y evoluciÃ³n

---

## 1. JerarquÃ­a documental

Cuando dos documentos parezcan contradecirse, prevalece el que estÃ© mÃ¡s arriba:

1. `00_HOSTLY_PRODUCT_BIBLE.md` — constituciÃ³n de producto (autoridad mÃ¡xima en producto y experiencia)
2. `11_HOSTLY_ENGINEERING_CONSTITUTION.md` — **ConstituciÃ³n TÃ©cnica** (autoridad mÃ¡xima en ingenierÃ­a e implementaciÃ³n)
3. `01_HOSTLY_ARCHITECTURE_GUIDE.md`
4. `02_HOSTLY_DESIGN_SYSTEM.md`
5. `03_HOSTLY_ROADMAP.md`
6. `04_HOSTLY_DECISIONS_LOG.md`
7. `05_HOSTLY_STATE_AUDIT.md`
8. `06_HOSTLY_AI_GUIDELINES.md`
9. `07_HOSTLY_OPERATIONS_GUIDE.md`
10. `08_HOSTLY_BOOTSTRAP.md`
11. `09_HOSTLY_PATTERNS.md`
12. `10_HOSTLY_TECHNICAL_DEBT.md`

**Regla de resoluciÃ³n:** la Product Bible prevalece en *quÃ©* construimos; la ConstituciÃ³n TÃ©cnica (`11`) prevalece en *cÃ³mo* lo construimos.

**Referencias maestras de ingenierÃ­a** (subordinadas a `00` y `11`; no sustituyen la lista anterior):

- `12_HOSTLY_RELEASE_PLAYBOOK.md` — procedimiento oficial de releases
- `13_HOSTLY_AI_ENGINE_ARCHITECTURE.md` — arquitectura del motor de IA
- `14_HOSTLY_MODULES_REFERENCE.md` — mapa de mÃ³dulos
- `15_HOSTLY_DATA_MODEL_REFERENCE.md` — contrato del modelo de datos

RelaciÃ³n: la ConstituciÃ³n (`11`) fija el *cÃ³mo*; el Release Playbook (`12`) opera el ciclo de entrega; AI Engine (`13`) define la plataforma IA; MÃ³dulos (`14`) y Modelo de datos (`15`) son contratos de referencia funcional y de persistencia.

Los documentos especializados existentes en `docs/` desarrollan dominios concretos,
pero no sustituyen esta jerarquÃ­a.

---

## 2. Manifiesto

Hostly existe para que un restaurante pueda operar con mÃ¡s claridad, menos fricciÃ³n
y menos estrÃ©s.

La hostelerÃ­a no necesita mÃ¡s pantallas, mÃ¡s configuraciÃ³n ni mÃ¡s complejidad. Necesita
herramientas que entiendan el ritmo del servicio, reduzcan errores y permitan que cada
persona se concentre en su trabajo.

**Hostly no es un TPV, ni un ERP, ni un software de cocina. Hostly es el sistema
operativo inteligente para la hostelerÃ­a.**

La mejor tecnologÃ­a es aquella que desaparece para que las personas puedan hacer mejor
su trabajo.

---

## 3. QuÃ© es Hostly

Hostly es un SaaS B2B multi-restaurante que conecta:

- configuraciÃ³n del negocio;
- carta y productos;
- espacios y mesas;
- TPV y comandas;
- Cocina, Barra, CoctelerÃ­a y Sala;
- reservas;
- cobros;
- inventario, escandallos, compras y recepciones;
- anÃ¡lisis e inteligencia aplicada.

Su unidad de diseÃ±o no es la pantalla. Es el servicio completo del restaurante.

## 4. QuÃ© no es Hostly

Hostly no es:

- un ERP genÃ©rico adaptado superficialmente a hostelerÃ­a;
- una colecciÃ³n de mÃ³dulos inconexos;
- un panel administrativo clÃ¡sico;
- un editor tÃ©cnico que obliga al usuario a conocer el modelo interno;
- un sistema que automatiza decisiones irreversibles sin confirmaciÃ³n humana;
- un producto que sacrifica la operaciÃ³n real por elegancia tÃ©cnica;
- un escaparate de IA.

---

## 5. MisiÃ³n

Hacer que operar y gestionar un negocio de hostelerÃ­a sea mÃ¡s simple, rÃ¡pido y
comprensible, conectando en una Ãºnica experiencia las decisiones del propietario con
el trabajo real de sala, cocina, barra y compras.

## 6. VisiÃ³n

Convertir Hostly en la capa operativa inteligente de restaurantes, bares, cafeterÃ­as,
hoteles, beach clubs y otros negocios de hostelerÃ­a, capaz de acompaÃ±arlos desde su
configuraciÃ³n inicial hasta la mejora continua de su operaciÃ³n.

---

## 7. Simple by design

La simplicidad no significa reducir capacidades. Significa ordenar la complejidad para
que aparezca Ãºnicamente cuando sea necesaria.

Hostly debe:

- presentar una decisiÃ³n principal por momento;
- usar lenguaje de restaurante, no lenguaje tÃ©cnico;
- proponer valores razonables;
- recordar contexto;
- ocultar opciones avanzadas hasta que aporten valor;
- mantener visibles el estado y la siguiente acciÃ³n;
- permitir corregir sin castigar.

Si una funciÃ³n necesita una explicaciÃ³n larga para poder utilizarse, el problema aÃºn
no estÃ¡ bien resuelto.

---

## 8. Pensamos como un restaurante

Antes de diseÃ±ar una soluciÃ³n debemos comprender:

- quiÃ©n la usa;
- en quÃ© momento del servicio;
- quÃ© presiÃ³n tiene;
- quÃ© informaciÃ³n necesita en tres segundos;
- quÃ© error puede cometer;
- quÃ© consecuencias operativas tendrÃ­a;
- quÃ© ocurre si falla la conexiÃ³n o hay dos dispositivos actuando a la vez.

La secuencia obligatoria es:

**Primero entendemos el restaurante. DespuÃ©s diseÃ±amos la experiencia. DespuÃ©s
escribimos el cÃ³digo.**

## 9. DiseÃ±amos para la hora punta

Hostly debe funcionar cuando:

- el restaurante estÃ¡ lleno;
- hay ruido, interrupciones y prisas;
- varias personas operan simultÃ¡neamente;
- un camarero tiene una sola mano libre;
- cocina acumula comandas;
- una mesa cambia, se une o divide;
- un cobro no puede quedar ambiguo;
- la conexiÃ³n es imperfecta.

Si una soluciÃ³n solo funciona en una demo tranquila, no estÃ¡ terminada.

---

## 10. Principios fundamentales

1. **La operaciÃ³n manda.** La integridad del servicio estÃ¡ por encima de la limpieza
   interna o del refinamiento visual.
2. **Un restaurante nunca debe ver datos de otro.** `restaurantId` es frontera de
   seguridad.
3. **Cada acciÃ³n debe tener un resultado comprensible.**
4. **Los estados crÃ­ticos no pueden ser ambiguos.**
5. **Una Ãºnica fuente de verdad por responsabilidad.**
6. **Touch first.** DiseÃ±ar para dedo y presiÃ³n operacional.
7. **La configuraciÃ³n prepara la operaciÃ³n; no compite con ella.**
8. **La IA propone; la persona confirma.**
9. **Los cambios crÃ­ticos deben ser pequeÃ±os, observables y reversibles.**
10. **No extendemos patrones legacy como arquitectura nueva.**

---

## 11. CÃ³mo se toman decisiones

Ante una decisiÃ³n de producto, diseÃ±o o arquitectura:

1. Definir el problema operativo real.
2. Identificar usuario, contexto y riesgo.
3. Confirmar quÃ© existe hoy en cÃ³digo y datos.
4. Buscar la soluciÃ³n mÃ­nima compatible.
5. Evaluar impacto en TPV, KDS, pagos, inventario y tenant.
6. DiseÃ±ar el estado vacÃ­o, error, carga y recuperaciÃ³n.
7. Validar en mÃ³vil, tablet y operaciÃ³n concurrente.
8. Documentar la decisiÃ³n si crea o cambia un precedente.

### Regla de oro

**No cambiar lÃ³gica operativa cuando la misiÃ³n es visual, y no cambiar persistencia
cuando la misiÃ³n es de experiencia.**

---

## 12. Principios de IA

- La IA debe reducir trabajo, no introducir incertidumbre oculta.
- Toda salida relevante debe poder revisarse.
- La IA no publica, cobra, elimina, migra ni confirma automÃ¡ticamente.
- Debe mostrar lÃ­mites, dudas y elementos pendientes.
- Debe conservar la fuente o contexto que permita verificar su propuesta.
- Un fallo de IA no debe bloquear la operaciÃ³n principal.
- Los costes, cuotas, privacidad y trazabilidad forman parte del diseÃ±o.

---

## 13. Principios de UX

- Una acciÃ³n principal por contexto.
- Objetivos tÃ¡ctiles mÃ­nimos de 44â€“48 px.
- No depender del hover.
- No usar doble scroll evitable.
- Confirmar acciones destructivas o econÃ³micas.
- Mantener AtrÃ¡s, Cancelar y Continuar predecibles.
- Evitar formularios largos cuando puede existir una conversaciÃ³n guiada.
- No adelantar complejidad.
- Dar prioridad a mesa, producto, tiempo, estado, importe y siguiente acciÃ³n.
- DiseÃ±ar errores con recuperaciÃ³n, no solo con mensajes.

---

## 14. Principios visuales

- Hostly Design System v1 es el Ãºnico contrato visual.
- Geist es la tipografÃ­a principal.
- Colores, radios, sombras y espacios proceden de tokens `--hostly-*`.
- OperaciÃ³n antes que decoraciÃ³n.
- JerarquÃ­a antes que densidad.
- Premium significa claridad y precisiÃ³n, no ornamento.
- No se crean variantes locales si existe un componente Hostly equivalente.
- La interfaz debe desaparecer visualmente para que destaque el trabajo.

---

## 15. Principios tÃ©cnicos

- `restaurantId` debe acompaÃ±ar y proteger toda operaciÃ³n multi-tenant.
- Firestore Rules son seguridad; la UI es prevenciÃ³n y experiencia.
- TPV y KDS son runtimes crÃ­ticos.
- UI y persistencia deben evolucionar por separado.
- No se divide estado sin caracterizar sus invariantes.
- No se reescriben megacomponentes como ejercicio de limpieza.
- Primero presentaciÃ³n, despuÃ©s helpers, despuÃ©s estado y finalmente persistencia.
- Los procesos econÃ³micos deben ser idempotentes.
- Los listeners deben tener alcance y coste conocidos.
- Los fallbacks legacy son transiciones documentadas, no patrones nuevos.

---

## 16. CÃ³mo debe trabajar cualquier IA en Hostly

Toda IA debe:

1. Leer esta Product Bible.
2. Leer la Architecture Guide si toca cÃ³digo, datos o estructura.
3. Leer el Design System si toca experiencia o UI.
4. Inspeccionar el estado real antes de proponer cambios.
5. Declarar quÃ© entiende, quÃ© riesgo existe y quÃ© archivos estÃ¡n en alcance.
6. Respetar las prohibiciones de la misiÃ³n.
7. No inventar funcionalidades, datos ni decisiones.
8. Realizar un cambio importante por iteraciÃ³n.
9. Validar en proporciÃ³n al riesgo.
10. Explicar quÃ© cambiÃ³, quÃ© no cambiÃ³ y quÃ© queda pendiente.

Las instrucciones detalladas estÃ¡n en `06_HOSTLY_AI_GUIDELINES.md`.

---

## 17. RelaciÃ³n con Architecture Guide y Design System

- Esta Product Bible define **por quÃ©** existe Hostly y cÃ³mo decide.
- `01_HOSTLY_ARCHITECTURE_GUIDE.md` define **cÃ³mo se estructura y protege**.
- `02_HOSTLY_DESIGN_SYSTEM.md` define **cÃ³mo se presenta y se siente**.

Ninguna implementaciÃ³n se considera alineada si contradice uno de estos tres contratos.
