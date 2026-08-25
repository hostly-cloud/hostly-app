# Menu Import · Photo Vision Eval

Este corpus está pensado para validar con fotografías reales y autorizadas la recuperación visual introducida en `feat/menu-import-photo-vision-v2`.

## Escenarios mínimos

1. `frontal-clara`: carta frontal, bien iluminada.
2. `foto-inclinada`: perspectiva oblicua de móvil.
3. `dos-columnas`: productos y precios en varias columnas.
4. `poca-luz`: contraste bajo / iluminación deficiente.
5. `carta-vinos`: nombres comerciales, añadas y varios formatos de precio.

Cada caso usa:

- `menu.jpg`: fotografía original autorizada.
- `expected.json`: lista canónica de productos visibles que deben detectarse.

Formato de `expected.json`:

```json
{
  "products": [
    { "name": "Ensaladilla rusa", "price": 8.5 }
  ]
}
```

Las fotografías no se incluyen en este commit porque el repositorio no contiene actualmente material fotográfico con procedencia/licencia verificable. No deben añadirse capturas de cartas de terceros sin autorización.

## Criterio de activación

La evaluación compara parser base frente a visión y mide recall, precision, falsos positivos y productos recuperados. `activationRecommended` solo puede ser `true` con al menos 5 casos, sin falsos positivos, precision visual >= 98% y recall visual no inferior al parser.

El flag de producto `HOSTLY_AI_IMPORT_V2_PHOTO_RECOVERY` permanece apagado hasta disponer de evidencia real suficiente.
