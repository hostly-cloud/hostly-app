"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { SalaEditorWorkspace } from "@/components/sala-editor/sala-editor-workspace";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";

export default function EditorSalaV2PreviewPage() {
  const {
    user,
    restaurantId: profileRestaurantId,
    profileReady,
  } = useAuth();
  const restaurantId = useMemo(
    () => resolveAuthenticatedRestaurantId(profileReady, profileRestaurantId),
    [profileReady, profileRestaurantId],
  );

  if (!profileReady) {
    return (
      <div className="hostly-sala-editor-page">
        <div className="hostly-sala-editor-canvas-hint">Cargando editor…</div>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="hostly-sala-editor-page">
        <div className="hostly-sala-editor-canvas-hint">
          No hay restaurante activo para cargar el borrador del editor.
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-page">
      <SalaEditorWorkspace
        restaurantId={restaurantId}
        currentUserId={user?.uid ?? null}
      />
    </div>
  );
}
