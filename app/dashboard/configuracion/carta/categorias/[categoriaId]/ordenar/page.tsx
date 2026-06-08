"use client";

import { useParams } from "next/navigation";
import { CategoriaProductosOrdenView } from "@/components/carta/categoria-productos-orden-view";

export default function CategoriaProductosOrdenPage() {
  const params = useParams();
  const raw = params.categoriaId;
  const categoriaId = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  return <CategoriaProductosOrdenView categoriaId={categoriaId} />;
}
