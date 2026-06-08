import { loadUsuarios } from "@/lib/usuarios-local";
import {
  TPV_OPERATOR_BARRA_ID,
  TPV_OPERATOR_GENERIC_ID,
  type TpvOperatorPickerOption,
} from "@/lib/tpv/active-operator-session";

export function buildTpvOperatorPickerOptions(): TpvOperatorPickerOption[] {
  const activeUsers = loadUsuarios().filter((user) => user.activo !== false);

  if (activeUsers.length === 0) {
    return [
      {
        id: TPV_OPERATOR_GENERIC_ID,
        name: "Operador genérico",
        role: "operativo",
      },
    ];
  }

  const options: TpvOperatorPickerOption[] = activeUsers.map((user) => ({
    id: user.id,
    name: user.nombre,
    role: user.rol,
  }));

  options.push({
    id: TPV_OPERATOR_BARRA_ID,
    name: "Barra",
    role: "operativo",
  });

  return options;
}
