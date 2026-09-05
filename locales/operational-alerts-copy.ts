import type { Locale } from "@/lib/i18n";

type OperationalAlertsCopy = {
  now: string;
  aria: string;
  title: string;
  criticalOne: string;
  criticalMany: string;
  escalatedOne: string;
  escalatedMany: string;
  attentionPending: string;
  policyHint: string;
  alertOne: string;
  alertMany: string;
  escalated: string;
  critical: string;
  attention: string;
  delayedLineOne: string;
  delayedLineMany: string;
  tableService: string;
  since: string;
  extraPrefix: string;
  extraSuffix: string;
  openCenter: string;
  stationKitchen: string;
  stationBar: string;
  stationCocktail: string;
  stationTable: string;
};

const base: Record<"es" | "en" | "fr" | "de" | "it" | "pt" | "nl", OperationalAlertsCopy> = {
  es: { now: "ahora", aria: "Alertas operativas", title: "Alertas operativas", criticalOne: "1 retraso crítico", criticalMany: "{{count}} retrasos críticos", escalatedOne: "1 alerta escalada", escalatedMany: "{{count}} alertas escaladas", attentionPending: "Servicio con atención pendiente", policyHint: "Prioridad calculada con la política operativa configurada para este restaurante.", alertOne: "alerta", alertMany: "alertas", escalated: "Escalada", critical: "Crítico", attention: "Atención", delayedLineOne: "línea retrasada", delayedLineMany: "líneas retrasadas", tableService: "servicio de mesa abierto", since: "desde {{minutes}} min", extraPrefix: "Hay", extraSuffix: "alertas adicionales.", openCenter: "Abrir centro de operaciones", stationKitchen: "Cocina", stationBar: "Barra", stationCocktail: "Coctelería", stationTable: "Mesa" },
  en: { now: "now", aria: "Operational alerts", title: "Operational alerts", criticalOne: "1 critical delay", criticalMany: "{{count}} critical delays", escalatedOne: "1 escalated alert", escalatedMany: "{{count}} escalated alerts", attentionPending: "Service needs attention", policyHint: "Priority is calculated using the operational policy configured for this restaurant.", alertOne: "alert", alertMany: "alerts", escalated: "Escalated", critical: "Critical", attention: "Attention", delayedLineOne: "delayed line", delayedLineMany: "delayed lines", tableService: "table service open", since: "since {{minutes}} min", extraPrefix: "There are", extraSuffix: "additional alerts.", openCenter: "Open operations center", stationKitchen: "Kitchen", stationBar: "Bar", stationCocktail: "Cocktails", stationTable: "Table" },
  fr: { now: "maintenant", aria: "Alertes opérationnelles", title: "Alertes opérationnelles", criticalOne: "1 retard critique", criticalMany: "{{count}} retards critiques", escalatedOne: "1 alerte escaladée", escalatedMany: "{{count}} alertes escaladées", attentionPending: "Service nécessitant une attention", policyHint: "La priorité est calculée selon la politique opérationnelle configurée pour ce restaurant.", alertOne: "alerte", alertMany: "alertes", escalated: "Escaladée", critical: "Critique", attention: "Attention", delayedLineOne: "ligne en retard", delayedLineMany: "lignes en retard", tableService: "service de table en cours", since: "depuis {{minutes}} min", extraPrefix: "Il y a", extraSuffix: "alertes supplémentaires.", openCenter: "Ouvrir le centre des opérations", stationKitchen: "Cuisine", stationBar: "Bar", stationCocktail: "Cocktails", stationTable: "Table" },
  de: { now: "jetzt", aria: "Betriebswarnungen", title: "Betriebswarnungen", criticalOne: "1 kritische Verzögerung", criticalMany: "{{count}} kritische Verzögerungen", escalatedOne: "1 eskalierte Warnung", escalatedMany: "{{count}} eskalierte Warnungen", attentionPending: "Service erfordert Aufmerksamkeit", policyHint: "Die Priorität wird anhand der für dieses Restaurant konfigurierten Betriebsrichtlinie berechnet.", alertOne: "Warnung", alertMany: "Warnungen", escalated: "Eskaliert", critical: "Kritisch", attention: "Achtung", delayedLineOne: "verzögerte Position", delayedLineMany: "verzögerte Positionen", tableService: "Tischservice läuft", since: "seit {{minutes}} Min.", extraPrefix: "Es gibt", extraSuffix: "weitere Warnungen.", openCenter: "Betriebszentrale öffnen", stationKitchen: "Küche", stationBar: "Bar", stationCocktail: "Cocktailbar", stationTable: "Tisch" },
  it: { now: "adesso", aria: "Avvisi operativi", title: "Avvisi operativi", criticalOne: "1 ritardo critico", criticalMany: "{{count}} ritardi critici", escalatedOne: "1 avviso escalato", escalatedMany: "{{count}} avvisi escalati", attentionPending: "Il servizio richiede attenzione", policyHint: "La priorità viene calcolata con la politica operativa configurata per questo ristorante.", alertOne: "avviso", alertMany: "avvisi", escalated: "Escalato", critical: "Critico", attention: "Attenzione", delayedLineOne: "riga in ritardo", delayedLineMany: "righe in ritardo", tableService: "servizio al tavolo aperto", since: "da {{minutes}} min", extraPrefix: "Ci sono", extraSuffix: "avvisi aggiuntivi.", openCenter: "Apri centro operativo", stationKitchen: "Cucina", stationBar: "Bar", stationCocktail: "Cocktail", stationTable: "Tavolo" },
  pt: { now: "agora", aria: "Alertas operacionais", title: "Alertas operacionais", criticalOne: "1 atraso crítico", criticalMany: "{{count}} atrasos críticos", escalatedOne: "1 alerta escalado", escalatedMany: "{{count}} alertas escalados", attentionPending: "Serviço requer atenção", policyHint: "A prioridade é calculada com a política operacional configurada para este restaurante.", alertOne: "alerta", alertMany: "alertas", escalated: "Escalado", critical: "Crítico", attention: "Atenção", delayedLineOne: "linha atrasada", delayedLineMany: "linhas atrasadas", tableService: "serviço de mesa aberto", since: "desde {{minutes}} min", extraPrefix: "Existem", extraSuffix: "alertas adicionais.", openCenter: "Abrir centro de operações", stationKitchen: "Cozinha", stationBar: "Bar", stationCocktail: "Cocktails", stationTable: "Mesa" },
  nl: { now: "nu", aria: "Operationele waarschuwingen", title: "Operationele waarschuwingen", criticalOne: "1 kritieke vertraging", criticalMany: "{{count}} kritieke vertragingen", escalatedOne: "1 geëscaleerde waarschuwing", escalatedMany: "{{count}} geëscaleerde waarschuwingen", attentionPending: "Service vereist aandacht", policyHint: "De prioriteit wordt berekend met het operationele beleid dat voor dit restaurant is ingesteld.", alertOne: "waarschuwing", alertMany: "waarschuwingen", escalated: "Geëscaleerd", critical: "Kritiek", attention: "Aandacht", delayedLineOne: "vertraagde regel", delayedLineMany: "vertraagde regels", tableService: "tafelservice actief", since: "sinds {{minutes}} min", extraPrefix: "Er zijn", extraSuffix: "extra waarschuwingen.", openCenter: "Operationeel centrum openen", stationKitchen: "Keuken", stationBar: "Bar", stationCocktail: "Cocktails", stationTable: "Tafel" },
};

export const OPERATIONAL_ALERTS_COPY: Record<Locale, OperationalAlertsCopy> = {
  es: base.es,
  en: base.en,
  fr: base.fr,
  de: base.de,
  it: base.it,
  pt: base.pt,
  nl: base.nl,
  "de-CH": base.de,
  "fr-CH": base.fr,
  "it-CH": base.it,
};

export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`));
}
