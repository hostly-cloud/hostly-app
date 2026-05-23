export function defaultInventory() {
  return {
    enabled: false,
    unit: "ud" as const,
    currentStock: 0,
    minStock: 0,
    costPerUnit: 0,
  };
}

export function defaultRecipe() {
  return {
    enabled: false,
    ingredients: [] as unknown[],
  };
}
