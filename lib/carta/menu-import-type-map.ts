import type { ImportedMenuCartaType } from "./imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";

const CARTA_TO_MENU: Record<ImportedMenuCartaType, MenuImportMenuType> = {
  comida: "food",
  bebidas: "drinks",
  vinos: "wine",
  cocteles: "cocktails",
  mixta: "mixed",
};

const MENU_TO_CARTA: Record<MenuImportMenuType, ImportedMenuCartaType> = {
  food: "comida",
  drinks: "bebidas",
  wine: "vinos",
  cocktails: "cocteles",
  mixed: "mixta",
};

export function cartaTypeToMenuType(cartaType: ImportedMenuCartaType): MenuImportMenuType {
  return CARTA_TO_MENU[cartaType] ?? "mixed";
}

export function menuTypeToCartaType(menuType: MenuImportMenuType | string | undefined): ImportedMenuCartaType {
  if (menuType && menuType in MENU_TO_CARTA) {
    return MENU_TO_CARTA[menuType as MenuImportMenuType];
  }
  return "mixta";
}
