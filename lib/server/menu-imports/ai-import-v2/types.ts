import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { MenuImportMenuType } from "@/lib/firestore/menu-import-drafts";
import type { DetectedProduct } from "@/lib/menu-import-eval/types";

export type AiImportV2ApiMode = "chat_completions" | "responses";

export type AiImportV2Item = {
  name: string;
  description: string;
  translations: string[];
  price: number;
  confidence: number;
  sourceEvidence: string[];
};

export type AiImportV2Section = {
  name: string;
  items: AiImportV2Item[];
};

export type AiImportV2Extraction = {
  sections: AiImportV2Section[];
};

export type AiImportV2ValidatedItem = AiImportV2Item & {
  sectionName: string;
  validationStatus: "accepted" | "rejected";
  rejectionReasons: string[];
};

export type AiImportV2ValidationResult = {
  accepted: AiImportV2ValidatedItem[];
  rejected: AiImportV2ValidatedItem[];
  globalWarnings: string[];
};

export type AiImportV2PriceMismatch = {
  parserName: string;
  v2Name: string;
  parserPrice: number;
  v2Price: number;
  nameScore: number;
};

export type AiImportV2Comparison = {
  parserDetected: number;
  v2Detected: number;
  v2Accepted: number;
  v2Rejected: number;
  matchedBoth: number;
  parserOnly: DetectedProduct[];
  v2Only: DetectedProduct[];
  priceMismatches: AiImportV2PriceMismatch[];
  avgV2Confidence: number | null;
  parserVsV2Recall: number | null;
  parserVsV2Precision: number | null;
};

export type AiImportV2ShadowInput = {
  rawText: string;
  parserItems: ImportedMenuItem[];
  menuType: MenuImportMenuType;
  sourceType: "image" | "pdf" | "qr_url";
  storagePath?: string;
  originalFileName?: string;
  layoutSummary?: string;
  imageDataUrl?: string;
};

export type AiImportV2ShadowResult = {
  enabled: true;
  model: string;
  apiMode: AiImportV2ApiMode;
  usedVision: boolean;
  durationMs: number;
  extraction: AiImportV2Extraction | null;
  validation: AiImportV2ValidationResult | null;
  comparison: AiImportV2Comparison | null;
  error?: string;
  tokenEstimate?: {
    inputChars: number;
    layoutChars: number;
    hasImage: boolean;
  };
};

export type AiImportV2ShadowReport = AiImportV2ShadowResult;

export function isAiImportV2ShadowEnabled(): boolean {
  return process.env.HOSTLY_AI_IMPORT_V2_SHADOW === "true";
}

export function resolveAiImportV2ApiMode(): AiImportV2ApiMode {
  return process.env.HOSTLY_AI_IMPORT_V2_API?.trim() === "responses"
    ? "responses"
    : "chat_completions";
}

export function resolveAiImportV2Model(): string {
  return (
    process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() ||
    process.env.HOSTLY_OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}
