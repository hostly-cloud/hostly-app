"use client";

import { useRouter } from "next/navigation";
import RoomsAssistant from "./rooms-assistant";

const EDITOR_V2_HREF = "/dashboard/configuracion/espacios/editor-v2";

export default function ConfigEspaciosMesasPage() {
  const router = useRouter();

  return (
    <RoomsAssistant
      onOpenAdvancedEditor={() => router.push(EDITOR_V2_HREF)}
    />
  );
}
