/**
 * Límite de workspace por espacio (UI-only, Pass 1).
 * Prepara evolución futura a planos independientes sin cambiar el modelo de datos.
 */
export type SpaceWorkspaceScope = {
  restaurantId: string;
  spaceId: string;
};

export function createSpaceWorkspaceScope(
  restaurantId: string,
  spaceId: string,
): SpaceWorkspaceScope {
  return { restaurantId, spaceId };
}

/** Clave estable para aislar el árbol React de cada espacio. */
export function getSpaceWorkspaceKey(scope: SpaceWorkspaceScope): string {
  return `${scope.restaurantId}:space:${scope.spaceId}`;
}
