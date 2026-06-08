import { buildAiImportV2Prompt } from "./build-ai-import-v2-prompt";
import { normalizeAiImportV2SectionNames } from "./normalize-ai-import-v2-sections";
import { parseAiImportV2Payload } from "./validate-ai-import-v2-output";
import type { AiImportV2Extraction, AiImportV2ShadowInput } from "./types";
import { resolveAiImportV2Model } from "./types";

const AI_TIMEOUT_MS = 45_000;

const AI_IMPORT_V2_JSON_SCHEMA = {
  name: "menu_import_v2_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  translations: {
                    type: "array",
                    items: { type: "string" },
                  },
                  price: { type: "number" },
                  confidence: { type: "number" },
                  sourceEvidence: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: [
                  "name",
                  "description",
                  "translations",
                  "price",
                  "confidence",
                  "sourceEvidence",
                ],
              },
            },
          },
          required: ["name", "items"],
        },
      },
    },
    required: ["sections"],
  },
} as const;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`AI_IMPORT_V2_TIMEOUT_${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function buildUserContent(input: AiImportV2ShadowInput, prompt: string): unknown {
  if (input.imageDataUrl) {
    return [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
    ];
  }
  return prompt;
}

async function callOpenAiImportV2(input: AiImportV2ShadowInput): Promise<AiImportV2Extraction> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = resolveAiImportV2Model();
  const prompt = buildAiImportV2Prompt({
    rawText: input.rawText,
    menuType: input.menuType,
    layoutSummary: input.layoutSummary,
    hasImage: Boolean(input.imageDataUrl),
  });

  const res = await withTimeout(
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Extrae productos de carta en JSON estricto. No inventes nombres ni precios. Traducciones van en translations[], no como productos.",
          },
          {
            role: "user",
            content: buildUserContent(input, prompt),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: AI_IMPORT_V2_JSON_SCHEMA,
        },
      }),
    }),
    AI_TIMEOUT_MS,
  );

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${bodyText.slice(0, 240)}`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(bodyText);
  } catch {
    throw new Error("AI_IMPORT_V2_INVALID_ENVELOPE");
  }

  const content = (envelope as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI_IMPORT_V2_EMPTY_CONTENT");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("AI_IMPORT_V2_MALFORMED_JSON");
  }

  const parsed = parseAiImportV2Payload(payload);
  if (!parsed) {
    throw new Error("AI_IMPORT_V2_SCHEMA_PARSE_FAILED");
  }

  return parsed;
}

export async function extractWithAiImportV2(
  input: AiImportV2ShadowInput,
): Promise<{ extraction: AiImportV2Extraction; model: string; usedVision: boolean }> {
  const rawExtraction = await callOpenAiImportV2(input);
  const extraction = normalizeAiImportV2SectionNames(rawExtraction);
  return {
    extraction,
    model: resolveAiImportV2Model(),
    usedVision: Boolean(input.imageDataUrl),
  };
}
