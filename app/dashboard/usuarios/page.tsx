import { redirect } from "next/navigation";

/**
 * Compatibilidad de ruta.
 *
 * La antigua pantalla /dashboard/usuarios mantenía un catálogo de usuarios en
 * localStorage independiente del tenant real. Empleados es ya la superficie
 * canónica para gestionar personas y accesos del restaurante.
 */
export default function UsuariosPage() {
  redirect("/dashboard/empleados");
}
