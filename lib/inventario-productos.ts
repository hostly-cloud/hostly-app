import { supabase } from "@/lib/supabase";

export type InventarioProducto = {
  id: string | number;
  nombre: string | null;
  unidad: string | null;
  stock_actual: number | null;
  coste_unitario: number | null;
  stock_minimo: number | null;
};

export function mockInventarioProductos(): InventarioProducto[] {
  return [
    { id: 1, nombre: "Arroz bomba", unidad: "kg", stock_actual: 8, coste_unitario: 3.8, stock_minimo: 2 },
    { id: 2, nombre: "Pollo", unidad: "kg", stock_actual: 12, coste_unitario: 6.4, stock_minimo: 3 },
    { id: 3, nombre: "Caldo", unidad: "l", stock_actual: 20, coste_unitario: 1.1, stock_minimo: 5 },
    { id: 4, nombre: "Queso", unidad: "kg", stock_actual: 4, coste_unitario: 6, stock_minimo: 1 },
    { id: 5, nombre: "Tomate", unidad: "kg", stock_actual: 10, coste_unitario: 2.5, stock_minimo: 2 },
  ];
}

/** Carga inventario desde Supabase; si falla, devuelve el mismo mock que /dashboard/inventario. */
export async function fetchInventarioProductos(): Promise<{ productos: InventarioProducto[]; usingMock: boolean }> {
  if (!supabase) {
    return { productos: mockInventarioProductos(), usingMock: true };
  }

  try {
    const { data, error } = await supabase
      .from("inventario_productos")
      .select("id, nombre, unidad, stock_actual, coste_unitario, stock_minimo")
      .order("nombre", { ascending: true, nullsFirst: false });

    if (error) throw error;
    return { productos: (data ?? []) as InventarioProducto[], usingMock: false };
  } catch {
    return { productos: mockInventarioProductos(), usingMock: true };
  }
}
