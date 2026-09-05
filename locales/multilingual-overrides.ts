import type { Locale, MessageTree } from "@/lib/i18n";
import core from "@/locales/multilingual/core.json";
import productRouting from "@/locales/multilingual/products-routing.json";
import productActions from "@/locales/multilingual/products-actions.json";
import menuCategories from "@/locales/multilingual/menu-categories.json";
import receipts from "@/locales/multilingual/receipts.json";
import invoicesCosts from "@/locales/multilingual/invoices-costs.json";
import smartValidation from "@/locales/multilingual/smart-validation.json";
import purchases from "@/locales/multilingual/purchases.json";
import salesCatalogCore from "@/locales/multilingual/sales-catalog-core.json";
import salesCatalogRecipe from "@/locales/multilingual/sales-catalog-recipe.json";
import modifiers from "@/locales/multilingual/modifiers.json";
import menuImportReview from "@/locales/multilingual/menu-import-review.json";
import menuImportAnalyzePublish from "@/locales/multilingual/menu-import-analyze-publish.json";
import onboardingBusinessMenu from "@/locales/multilingual/onboarding-business-menu.json";
import onboardingStockTeamLive from "@/locales/multilingual/onboarding-stock-team-live.json";

type BaseMultilingualLocale = "fr" | "de" | "it" | "pt" | "nl";
type TranslationBundle = Record<string, readonly string[]>;

const BASE_LOCALES: readonly BaseMultilingualLocale[] = ["fr", "de", "it", "pt", "nl"];
const BUNDLES: readonly TranslationBundle[] = [
  core,
  productRouting,
  productActions,
  menuCategories,
  receipts,
  invoicesCosts,
  smartValidation,
  purchases,
  salesCatalogCore,
  salesCatalogRecipe,
  modifiers,
  menuImportReview,
  menuImportAnalyzePublish,
  onboardingBusinessMenu,
  onboardingStockTeamLive,
];

function baseLocale(locale: Locale): BaseMultilingualLocale | null {
  if (locale === "fr" || locale === "fr-CH") return "fr";
  if (locale === "de" || locale === "de-CH") return "de";
  if (locale === "it" || locale === "it-CH") return "it";
  if (locale === "pt") return "pt";
  if (locale === "nl") return "nl";
  return null;
}

function buildBundleForLocale(bundle: TranslationBundle, locale: BaseMultilingualLocale): MessageTree {
  const index = BASE_LOCALES.indexOf(locale);
  const out: MessageTree = {};
  for (const [key, values] of Object.entries(bundle)) {
    const translated = values[index];
    if (typeof translated === "string" && translated.length > 0) out[key] = translated;
  }
  return out;
}

const byBaseLocale = Object.fromEntries(
  BASE_LOCALES.map((locale) => [
    locale,
    Object.assign({}, ...BUNDLES.map((bundle) => buildBundleForLocale(bundle, locale))),
  ]),
) as Record<BaseMultilingualLocale, MessageTree>;

export function getMultilingualOverrides(locale: Locale): MessageTree {
  const base = baseLocale(locale);
  return base ? byBaseLocale[base] : {};
}
