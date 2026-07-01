export type ConfigNavLeaf = { href: string; label: string };
export type ConfigNavGroup = { id: string; label: string; children: ConfigNavLeaf[] };

export const CONFIG_NAV_GROUPS: ConfigNavGroup[] = [
  {
    id: "produccion",
    label: "Producción",
    children: [
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
        label: "Import Workspace",
      },
    ],
  },
  {
    id: "espacios",
    label: "Espacios",
    children: [
      { href: "/dashboard/configuracion/espacios/zonas", label: "Zonas" },
      { href: "/dashboard/configuracion/espacios/mesas", label: "Mesas" },
      {
        href: "/dashboard/configuracion/espacios/editor-v2",
        label: "Editor V2 (Preview)",
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
