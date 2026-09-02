"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { SalaEditorWorkspace } from "@/components/sala-editor/sala-editor-workspace";
import { resolveAuthenticatedRestaurantId } from "@/lib/hostly/restaurant-scope";
import { seedSalaEditorV2DraftFromRoomsAssistant } from "@/lib/rooms-assistant/seed-sala-editor-v2-draft";

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
  const [handoff, setHandoff] = useState<{
    restaurantId: string;
    error: string | null;
  } | null>(null);
  const handoffReadyForRestaurantId = handoff?.restaurantId ?? null;
  const handoffError =
    handoff?.restaurantId === restaurantId ? handoff.error : null;

  useEffect(() => {
    if (!profileReady || !restaurantId) return;

    let cancelled = false;
    void (async () => {
      let errorMessage: string | null = null;
      try {
        await seedSalaEditorV2DraftFromRoomsAssistant({
          restaurantId,
          updatedBy: user?.uid ?? null,
        });
      } catch (error: unknown) {
        errorMessage =
          error instanceof Error
            ? error.message
            : "No se pudo preparar el borrador del asistente.";
      }
      if (!cancelled) {
        setHandoff({ restaurantId, error: errorMessage });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileReady, restaurantId, user?.uid]);

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

  if (handoffReadyForRestaurantId !== restaurantId) {
    return (
      <div className="hostly-sala-editor-page">
        <div className="hostly-sala-editor-canvas-hint">Preparando Editor V2…</div>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-page">
      {handoffError ? (
        <div className="hostly-sala-editor-canvas-hint" role="status">
          El asistente no pudo transferir su borrador. Editor V2 cargará el estado
          guardado disponible.
        </div>
      ) : null}
      <SalaEditorWorkspace
        key={restaurantId}
        restaurantId={restaurantId}
        currentUserId={user?.uid ?? null}
      />
    </div>
  );
}
