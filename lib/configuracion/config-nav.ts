export type ConfigNavLeaf = { href: string; label: string };
export type ConfigNavGroup = { id: string; label: string; children: ConfigNavLeaf[] };
export type ConfigScrollOwner = "document" | "content" | "internal" | "viewport";

const CONFIG_HUB_PATH = "/dashboard/configuracion";
const MAP_EDITOR_PATH = "/dashboard/configuracion/espacios/editor-v2";

const INTERNAL_SCROLL_PATHS = [
  "/dashboard/configuracion/carta/productos",
  "/dashboard/configuracion/carta/escandallos",
  "/dashboard/configuracion/carta/import-workspace",
  "/dashboard/configuracion/empleados",
  "/dashboard/configuracion/empresa",
  "/dashboard/configuracion/espacios/zonas",
  "/dashboard/configuracion/operacion",
  "/dashboard/configuracion/integraciones",
] as const;

export const CONFIG_NAV_GROUPS: ConfigNavGroup[] = [
  {
    id: "produccion",
    label: "Producción",
    children: [
      { href: "/dashboard/configuracion/operacion", label: "Operación" },
      { href: "/dashboard/configuracion/estaciones", label: "Estaciones" },
      { href: "/dashboard/configuracion/impresoras", label: "Impresoras" },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    children: [
      { href: "/dashboard/configuracion/carta/familias", label: "Familias de menú" },
      { href: "/dashboard/configuracion/carta/categorias", label: "Categorías de carta" },
      { href: "/dashboard/configuracion/carta/productos", label: "Productos" },
      { href: "/dashboard/configuracion/modificadores", label: "Modificadores" },
      { href: "/dashboard/configuracion/carta/escandallos", label: "Escandallos" },
    ],
  },
  {
    id: "importacion",
    label: "Importación",
    children: [
      {
        href: "/dashboard/configuracion/carta/importacion",
        label: "IA / Importación",
      },
      {
        href: "/dashboard/configuracion/carta/import-workspace",
        label: "Espacio de importación",
      },
    ],
  },
  {
    id: "espacios",
    label: "Espacios",
    children: [
      {
        href: "/dashboard/configuracion/espacios/zonas",
        label: "Zonas",
      },
      {
        href: "/dashboard/configuracion/espacios/editor-v2",
        label: "Editor de mapas V2",
      },
    ],
  },
  {
    id: "otros",
    label: "Otros",
    children: [
      {
        href: "/dashboard/configuracion/familias-producto",
        label: "Familias de producto",
      },
    ],
  },
  {
    id: "equipo",
    label: "Equipo",
    children: [{ href: "/dashboard/configuracion/empleados", label: "Empleados" }],
  },
  {
    id: "empresa",
    label: "Empresa",
    children: [
      { href: "/dashboard/configuracion/empresa", label: "Empresa" },
      {
        href: "/dashboard/configuracion/integraciones",
        label: "Integraciones",
      },
    ],
  },
];

export function configPathnameMatches(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

/**
 * Defines the single vertical scroll owner for every Configuration route.
 *
 * - document: the hub grows naturally with the document.
 * - content: the pane below the context selector scrolls as one page.
 * - internal: a bounded workbench owns scrolling in its list/form region.
 * - viewport: immersive tools stay fixed and must not create outer scrolling.
 */
export function resolveConfigScrollOwner(pathname: string): ConfigScrollOwner {
  if (pathname === CONFIG_HUB_PATH) return "document";
  if (configPathnameMatches(pathname, MAP_EDITOR_PATH)) return "viewport";
  if (INTERNAL_SCROLL_PATHS.some((path) => configPathnameMatches(pathname, path))) {
    return "internal";
  }
  return "content";
}
