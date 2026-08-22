/**
 * Modern shadow evaluation profile for Hostly menu import.
 *
 * Keeps production behavior untouched and evaluates the existing V2 pipeline
 * through OpenAI Responses API with a current high-volume model by default.
 * Override HOSTLY_AI_IMPORT_V2_MODEL to compare another model.
 */
process.env.HOSTLY_AI_IMPORT_V2_API = "responses";
process.env.HOSTLY_AI_IMPORT_V2_MODEL =
  process.env.HOSTLY_AI_IMPORT_V2_MODEL?.trim() || "gpt-5.6-luna";

if (!process.argv.includes("--shadow-v2")) process.argv.push("--shadow-v2");
if (!process.argv.includes("--skip-baseline-check")) process.argv.push("--skip-baseline-check");

await import("./eval-menu-import-corpus");
