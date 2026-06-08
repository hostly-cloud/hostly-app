export type ConfigNavLeaf = { href: string; label: string };
export type ConfigNavGroup = { id: string; label: string; children: ConfigNavLeaf[] };

export const CONFIG_NAV_GROUPS: ConfigNavGroup[] = [
  {
    id: "carta",
    label: "Carta",
    children: [
      { href: "/dashboard/configuracion/carta/productos", label: "Productos" },
      { href: "/dashboard/configuracion/carta/categorias", label: "Categorías" },
      { href: "/dashboard/configuracion/carta/familias", label: "Familias" },
      { href: "/dashboard/configuracion/carta/escandallos", label: "Escandallos" },
      {
        href: "/dashboard/configuracion/carta/importacion",
        label: "IA / Importación",
      },
      { href: "/dashboard/configuracion/modificadores", label: "Modificadores" },
    ],
  },
  {
    id: "espacios",
    label: "Espacios",
    children: [
      { href: "/dashboard/configuracion/espacios/mesas", label: "Mesas" },
      { href: "/dashboard/configuracion/espacios/zonas", label: "Zonas" },
    ],
  },
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
