import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { ProductionStationDocument, ProductionStationType } from "@/lib/produccion/production-station-types";
import type { MenuImportLearnedPreference } from "../menu-import-local-learning";
import type {
  AiImportV2RestaurantContextResult,
  AiImportV2ValidatedItem,
} from "./types";

function mapSuggestedStationType(
  station: AiImportV2ValidatedItem["operationalSuggestion"]["suggestedStation"],
): ProductionStationType | null {
  if (station === "kitchen") return "cocina";
  if (station === "bar") return "barra";
  if (station === "cocktail") return "cocteleria";
  return null;
}

function resolveUniqueStation(
  item: AiImportV2ValidatedItem,
  stations: ProductionStationDocument[],
): { station?: ProductionStationDocument; reason?: string } {
  const targetType = mapSuggestedStationType(item.operationalSuggestion.suggestedStation);
  if (!targetType) return {};
  const matches = stations.filter((station) => station.active && station.type === targetType);
  if (matches.length === 1) return { station: matches[0] };
  if (matches.length === 0) return { reason: `no_active_station:${targetType}` };
  return { reason: `ambiguous_station:${targetType}:${matches.length}` };
}

function resolveUniqueFamily(
  item: AiImportV2ValidatedItem,
  families: ProductFamilyDocument[],
): { family?: ProductFamilyDocument; reason?: string } {
  const targetType = item.operationalSuggestion.productFamilyType;
  const matches = families.filter((family) => family.active && family.type === targetType);
  if (matches.length === 1) return { family: matches[0] };

  const preferredId =
    targetType === "food"
      ? "default-food"
      : targetType === "drink"
        ? "default-drink"
        : "default-other";
  const preferred = matches.find((family) => family.id === preferredId);
  if (preferred) return { family: preferred };
  if (matches.length === 0) return { reason: `no_active_family:${targetType}` };
  return { reason: `ambiguous_family:${targetType}:${matches.length}` };
}

export function resolveRestaurantOperationalContext(args: {
  restaurantId: string;
  items: AiImportV2ValidatedItem[];
  productionStations: ProductionStationDocument[];
  productFamilies: ProductFamilyDocument[];
  learnedPreferences?: Map<string, MenuImportLearnedPreference>;
}): AiImportV2RestaurantContextResult {
  const activeStations = args.productionStations.filter((station) => station.active);
  const activeFamilies = args.productFamilies.filter((family) => family.active);
  const warnings: string[] = [];

  const targets = args.items.map((item) => {
    const reasons = [...item.operationalWarnings];
    const stationResolution = resolveUniqueStation(item, activeStations);
    const familyResolution = resolveUniqueFamily(item, activeFamilies);
    if (stationResolution.reason) reasons.push(stationResolution.reason);
    if (familyResolution.reason) reasons.push(familyResolution.reason);

    const learned = args.learnedPreferences?.get(item.name);
    if (
      learned?.station &&
      learned.station !== item.operationalSuggestion.suggestedStation
    ) {
      reasons.push(
        `local_learning_station_conflict:${item.operationalSuggestion.suggestedStation}->${learned.station}`,
      );
    }
    if (
      learned?.category &&
      learned.category.trim() &&
      learned.category.trim().toLocaleLowerCase("es") !==
        item.sectionName.trim().toLocaleLowerCase("es")
    ) {
      reasons.push("local_learning_category_review");
    }

    const expectsStation = item.operationalSuggestion.suggestedStation !== "none";
    const stationResolved = !expectsStation || Boolean(stationResolution.station);
    const familyResolved = Boolean(familyResolution.family);
    const status: "matched" | "partial" | "review" =
      reasons.length > 0
        ? "review"
        : stationResolved && familyResolved
          ? "matched"
          : stationResolved || familyResolved
            ? "partial"
            : "review";

    return {
      itemName: item.name,
      status,
      reasons,
      ...(stationResolution.station
        ? { station: { id: stationResolution.station.id, name: stationResolution.station.name, type: stationResolution.station.type } }
        : {}),
      ...(familyResolution.family
        ? { productFamily: { id: familyResolution.family.id, name: familyResolution.family.name, type: familyResolution.family.type } }
        : {}),
      ...(learned
        ? {
            localLearning: {
              ...(learned.station ? { station: learned.station } : {}),
              stationSupport: learned.stationSupport,
              stationConfidence: learned.stationConfidence,
              ...(learned.category ? { category: learned.category } : {}),
              categorySupport: learned.categorySupport,
              categoryConfidence: learned.categoryConfidence,
            },
          }
        : {}),
    };
  });

  if (activeStations.length === 0) warnings.push("restaurant_has_no_active_production_stations");
  if (activeFamilies.length === 0) warnings.push("restaurant_has_no_active_product_families");

  return {
    restaurantId: args.restaurantId.trim(),
    productionStationsRead: args.productionStations.length,
    activeProductionStations: activeStations.length,
    productFamiliesRead: args.productFamilies.length,
    activeProductFamilies: activeFamilies.length,
    fullyResolvedCount: targets.filter((target) => target.status === "matched").length,
    partialCount: targets.filter((target) => target.status === "partial").length,
    reviewCount: targets.filter((target) => target.status === "review").length,
    targets,
    warnings,
  };
}
