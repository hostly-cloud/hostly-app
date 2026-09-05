# H-023 — Información gastronómica y maridajes por plan

**Estado:** aceptada  
**Fecha:** 2026-09-05  
**Ámbito:** TPV, Productos, Sommelier IA, planes Básico / Pro / Ultra

## Contexto

Hostly dispone de una ficha rápida de producto mediante pulsación larga en el TPV y de un módulo Sommelier IA. La experiencia debe diferenciarse comercialmente por plan y no puede exponer en Básico información reservada a Pro o Ultra.

## Decisión

### Básico

- La tarjeta de producto del TPV funciona únicamente como acción de clic para añadir el producto.
- La pulsación larga no abre ninguna ficha gastronómica.
- No se muestran alérgenos, perfil de vino ni maridajes.

### Pro

- La pulsación larga abre la ficha rápida gastronómica.
- En platos se muestran los alérgenos confirmados por el restaurante.
- La ausencia de información de alérgenos se presenta como información no disponible; nunca se interpreta como “sin alérgenos”.
- En vinos, cavas, champanes y otros vinos espumosos se muestra el perfil canónico disponible: estilo, dulzor/sequedad, carácter afrutado, cuerpo, uvas y procedencia cuando estén informados.
- Pro no muestra recomendaciones de maridaje generadas por Sommelier IA.

### Ultra

- Incluye toda la información disponible en Pro.
- Añade maridajes bidireccionales generados por Sommelier IA usando exclusivamente productos reales del catálogo del mismo restaurante.
- Al mantener pulsado un plato, Hostly recomienda vinos/cavas/champanes concretos del restaurante compatibles con ese plato.
- Al mantener pulsado un vino/cava/champán, Hostly recomienda platos concretos del restaurante compatibles con ese vino.
- La IA no puede inventar `productId`, productos, añadas, ingredientes ni alérgenos. Las recomendaciones deben validarse contra IDs reales del tenant antes de mostrarse o persistirse.

## Autoridad comercial

- El acceso Pro a la ficha gastronómica se representa mediante el entitlement `tpv.productInfo.gastronomy`.
- Los maridajes continúan bajo `ai.sommelierPairing`, exclusivo de Ultra.
- `restaurants/{restaurantId}.subscription.plan` continúa siendo la fuente canónica del plan; la UI nunca actúa como autoridad comercial.

## Datos gastronómicos

Los datos manuales/canónicos del producto pueden existir en cualquier plan para permitir configurar el catálogo y preparar una futura mejora de plan. Lo que cambia por plan es su exposición operativa en TPV y el acceso a la IA de maridajes.

Los alérgenos deben seguir semántica conservadora:

- campo ausente = información desconocida;
- `allergens: []` explícito = información revisada sin alérgenos marcados;
- la IA nunca certifica ausencia de alérgenos ni sustituye la confirmación humana.

## Código relacionado

- `lib/subscription/hostly-entitlements.ts`
- `lib/tpv/product-info-plan-access.ts`
- `lib/carta/product-gastronomy.ts`
- `lib/server/sommelier/sommelier-pairing-engine.ts`
- TPV / ficha rápida de producto
- Productos / información comercial y gastronómica
