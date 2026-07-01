/**
 * Editor de sala Hostly — arquitectura canónica (Fases 1–3).
 *
 * Este módulo prepara tipos, catálogos, adaptadores legacy y navegación
 * para el futuro editor centrado en espacios. No sustituye al editor actual
 * en `app/dashboard/config/mesas/page.tsx`.
 */

export * from "@/lib/sala-editor/types";
export * from "@/lib/sala-editor/catalog/espacio-presets";
export * from "@/lib/sala-editor/catalog/espacio-types";
export * from "@/lib/sala-editor/catalog/structural-catalog";
export * from "@/lib/sala-editor/catalog/operational-catalog";
export * from "@/lib/sala-editor/adapters/legacy-adapters";
export * from "@/lib/sala-editor/navigation/editor-phase-routing";
export * from "@/lib/sala-editor/preview/create-preview-espacios";
