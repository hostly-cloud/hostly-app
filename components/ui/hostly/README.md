# Hostly UI (dashboard shell)

Declarative building blocks wired to **`app/globals.css`** tokens (`--hostly-*`) and Tailwind arbitrary values where needed.

## Cuándo usar qué

| Necesidad | Preferir |
| --- | --- |
| Column layout + ritmo vertical | `HostlySection` (`stack="sm"|"md"|"lg"` → `.hostly-stack-*`) |
| Panel / tarjeta con borde y sombra canónicos | `HostlySurface` (`variant`) |
| Título + subtítulo meta + slots de acciones | `HostlySectionHeader` |
| Métricas compactas con acento opcional | `HostlyKpiCard` |

## Superficies

`HostlySurface` aplica estas clases: `flat` → `hostly-surface-flat`, `soft`, `ice`, `elevated`. El modificador **`interactive`** añade `hostly-surface--interactive`.

La clase legacy **`.hostly-surface`** (sin sufijo) sigue disponible solo por compatibilidad; en pantallas nuevas usar `HostlySurface`.

## Tokens

Fuente única en `:root` dentro de `globals.css`; el bloque lleva índice de secciones (`[A]` … `[K]`).

Ritmo vertical de listados: `--hostly-stack-gap-sm/md/lg` gobiernan `.hostly-stack-*` (véase `HostlySection`); **`--hostly-m-stack-gap`** puede quedar ligeramente más holgado en móvil para shells que lo opt‑in sin perder táctiles.

Radio canónico adicional **`--hostly-radius-sm`** y **`--hostly-radius-xl`**; los prefijos **`--hostly-m-*`** reutilizan esos valores (alias) para que no diverjan.
