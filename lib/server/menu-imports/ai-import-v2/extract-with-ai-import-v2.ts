import { buildAiImportV2Prompt } from "./build-ai-import-v2-prompt";
import { normalizeAiImportV2SectionNames } from "./normalize-ai-import-v2-sections";
import { parseAiImportV2Payload } from "./validate-ai-import-v2-output";
import type { AiImportV2Extraction, AiImportV2ShadowInput } from "./types";
import { resolveAiImportV2ApiMode, resolveAiImportV2Model } from "./types";

const AI_TIMEOUT_MS = 45_000;
const SYSTEM_INSTRUCTIONS =
  "Extrae productos de carta en JSON estricto. No inventes nombres ni precios. Traducciones van en translations[], no como productos. Las sugerencias operativas son inferencias revisables: usa solo los enums permitidos y baja confidence si hay duda.";

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
                  operationalSuggestion: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      categoryType: { type: "string", enum: ["food", "drink", "general"] },
                      productFamilyType: { type: "string", enum: ["food", "drink", "other"] },
                      suggestedStation: {
                        type: "string",
                        enum: ["kitchen", "bar", "cocktail", "none"],
                      },
                      confidence: { type: "number" },
                    },
                    required: [
                      "categoryType",
                      "productFamilyType",
                      "suggestedStation",
                      "confidence",
                    ],
                  },
                },
                required: [
                  "name",
                  "description",
                  "translations",
                  "price",
                  "confidence",
                  "sourceEvidence",
                  "operationalSuggestion",
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

function buildChatUserContent(input: AiImportV2ShadowInput, prompt: string): unknown {
  if (input.imageDataUrl) {
    return [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
    ];
  }
  return prompt;
}

function buildResponsesUserContent(input: AiImportV2ShadowInput, prompt: string): unknown[] {
  const content: unknown[] = [{ type: "input_text", text: prompt }];
  if (input.imageDataUrl) {
    content.push({ type: "input_image", image_url: input.imageDataUrl, detail: "high" });
  }
  return content;
}

function parseStructuredPayload(content: string): AiImportV2Extraction {
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

function extractResponsesOutputText(envelope: unknown): string | undefined {
  const direct = (envelope as { output_text?: unknown })?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = (envelope as { output?: unknown[] })?.output;
  if (!Array.isArray(output)) return undefined;

  for (const item of output) {
    const content = (item as { content?: unknown[] })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = (part as { text?: unknown })?.text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return undefined;
}

async function callChatCompletions(args: {
  apiKey: string;
  model: string;
  input: AiImportV2ShadowInput;
  prompt: string;
}): Promise<AiImportV2Extraction> {
  const res = await withTimeout(
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          { role: "user", content: buildChatUserContent(args.input, args.prompt) },
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

  return parseStructuredPayload(content);
}

async function callResponsesApi(args: {
  apiKey: string;
  model: string;
  input: AiImportV2ShadowInput;
  prompt: string;
}): Promise<AiImportV2Extraction> {
  const res = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        store: false,
        instructions: SYSTEM_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: buildResponsesUserContent(args.input, args.prompt),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: AI_IMPORT_V2_JSON_SCHEMA.name,
            schema: AI_IMPORT_V2_JSON_SCHEMA.schema,
            strict: true,
          },
        },
      }),
    }),
    AI_TIMEOUT_MS,
  );

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI Responses ${res.status}: ${bodyText.slice(0, 240)}`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(bodyText);
  } catch {
    throw new Error("AI_IMPORT_V2_INVALID_RESPONSES_ENVELOPE");
  }

  const content = extractResponsesOutputText(envelope);
  if (!content) {
    throw new Error("AI_IMPORT_V2_EMPTY_RESPONSES_CONTENT");
  }

  return parseStructuredPayload(content);
}

async function callOpenAiImportV2(input: AiImportV2ShadowInput): Promise<AiImportV2Extraction> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const model = resolveAiImportV2Model();
  const apiMode = resolveAiImportV2ApiMode();
  const prompt = buildAiImportV2Prompt({
    rawText: input.rawText,
    menuType: input.menuType,
    layoutSummary: input.layoutSummary,
    hasImage: Boolean(input.imageDataUrl),
  });

  if (apiMode === "responses") {
    return callResponsesApi({ apiKey, model, input, prompt });
  }
  return callChatCompletions({ apiKey, model, input, prompt });
}

export async function extractWithAiImportV2(
  input: AiImportV2ShadowInput,
): Promise<{
  extraction: AiImportV2Extraction;
  model: string;
  apiMode: ReturnType<typeof resolveAiImportV2ApiMode>;
  usedVision: boolean;
}> {
  const rawExtraction = await callOpenAiImportV2(input);
  const extraction = normalizeAiImportV2SectionNames(rawExtraction);
  return {
    extraction,
    model: resolveAiImportV2Model(),
    apiMode: resolveAiImportV2ApiMode(),
    usedVision: Boolean(input.imageDataUrl),
  };
}
