import type {
  ImportedMenuSourceType,
  ImportedMenuSuggestedStation,
} from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";

export type ExpectedNameMatchMode = "exact_normalized" | "normalized_contains" | "dice_gte_0.88";

export type ExpectedProductMatchRules = {
  nameMode?: ExpectedNameMatchMode;
  priceTolerance?: number;
  diceThreshold?: number;
  requirePrice?: boolean;
  requireSection?: boolean;
  requireStation?: boolean;
};

export type ExpectedProduct = {
  id: string;
  name: string;
  price?: number;
  sectionName?: string;
  suggestedCategory?: string;
  suggestedStation?: ImportedMenuSuggestedStation;
  match?: ExpectedProductMatchRules;
};

export type NegativeProductExpectation = {
  namePattern: string;
  reason?: string;
};

export type NegativeSectionExpectation = {
  namePattern: string;
  reason?: string;
};

export type GlobalExpectations = {
  maxPendingNames?: number;
  maxFalsePositives?: number;
  minRecall?: number;
  minPrecision?: number;
};

export type ExpectedProductsFile = {
  schemaVersion: number;
  caseId: string;
  labeledAt?: string;
  labeledBy?: string;
  sections?: Array<{ name: string; order?: number }>;
  products: ExpectedProduct[];
  negativeProducts?: NegativeProductExpectation[];
  negativeSections?: NegativeSectionExpectation[];
  globalExpectations?: GlobalExpectations;
};

export type CorpusCaseMeta = {
  id: string;
  title: string;
  tags?: string[];
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
  evaluatePhases?: string[];
  priority?: "P0" | "P1" | "P2";
  ocrPageWidth?: number;
  ocrPageHeight?: number;
};

export type CorpusManifest = {
  schemaVersion: number;
  title: string;
  cases: string[];
};

export type DetectedProduct = {
  name: string;
  price?: number;
  sectionName?: string;
  suggestedCategory?: string;
  suggestedStation?: ImportedMenuSuggestedStation;
};

export type ProductMatchPair = {
  expected: ExpectedProduct;
  detected: DetectedProduct;
  detectedIndex: number;
  nameScore: number;
  priceOk: boolean;
  sectionOk: boolean;
  stationOk: boolean;
};

export type CaseMatchResult = {
  truePositives: ProductMatchPair[];
  falsePositives: Array<{ detected: DetectedProduct; detectedIndex: number }>;
  falseNegatives: ExpectedProduct[];
  negativeHits: Array<{ pattern: string; detectedName: string; reason?: string }>;
  negativeSectionHits: Array<{ pattern: string; sectionName: string; reason?: string }>;
};

export type CaseMetrics = {
  expected: number;
  detected: number;
  tp: number;
  fp: number;
  fn: number;
  recall: number;
  precision: number;
};

export type CaseEvalResult = {
  caseId: string;
  title: string;
  metrics: CaseMetrics;
  match: CaseMatchResult;
  pendingNames: number;
  negativeSectionHitCount: number;
  stationMismatchCount: number;
  passed: boolean;
  failures: string[];
};
