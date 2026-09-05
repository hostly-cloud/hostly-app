import type { Locale } from "@/lib/i18n";

type OperationalAlertsCopy = {
  now: string;
  aria: string;
  title: string;
  criticalOne: string;
  criticalMany: string;
  attentionPending: string;
  slaHint: string;
  alertOne: string;
  alertMany: string;
  critical: string;
  attention: string;
  delayedLineOne: string;
  delayedLineMany: string;
  since: string;
  extraPrefix: string;
  extraSuffix: string;
  stationKitchen: string;
  stationBar: string;
  stationCocktail: string;
};

const base: Record<"es" | "en" | "fr" | "de" | "it" | "pt" | "nl", OperationalAlertsCopy> = {
  es: { now: "ahora", aria: "Alertas operativas", title: "Alertas operativas", criticalOne: "1 retraso crítico", criticalMany: "{{count}} retrasos críticos", attentionPending: "Servicio con atención pendiente", slaHint: "Prioridad calculada con los mismos tiempos SLA que Cocina, Barra y Coctelería.", alertOne: "alerta", alertMany: "alertas", critical: "Crítico", attention: "Atención", delayedLineOne: "línea retrasada", delayedLineMany: "líneas retrasadas", since: "desde {{minutes}} min", extraPrefix: "Hay", extraSuffix: "alertas adicionales en las pantallas operativas.", stationKitchen: "Cocina", stationBar: "Barra", stationCocktail: "Coctelería" },
  en: { now: "now", aria: "Operational alerts", title: "Operational alerts", criticalOne: "1 critical delay", criticalMany: "{{count}} critical delays", attentionPending: "Service needs attention", slaHint: "Priority uses the same SLA timings as Kitchen, Bar and Cocktails.", alertOne: "alert", alertMany: "alerts", critical: "Critical", attention: "Attention", delayedLineOne: "delayed line", delayedLineMany: "delayed lines", since: "since {{minutes}} min", extraPrefix: "There are", extraSuffix: "additional alerts on the operational screens.", stationKitchen: "Kitchen", stationBar: "Bar", stationCocktail: "Cocktails" },
  fr: { now: "maintenant", aria: "Alertes opérationnelles", title: "Alertes opérationnelles", criticalOne: "1 retard critique", criticalMany: "{{count}} retards critiques", attentionPending: "Service nécessitant une attention", slaHint: "La priorité utilise les mêmes délais SLA que Cuisine, Bar et Cocktails.", alertOne: "alerte", alertMany: "alertes", critical: "Critique", attention: "Attention", delayedLineOne: "ligne en retard", delayedLineMany: "lignes en retard", since: "depuis {{minutes}} min", extraPrefix: "Il y a", extraSuffix: "alertes supplémentaires sur les écrans opérationnels.", stationKitchen: "Cuisine", stationBar: "Bar", stationCocktail: "Cocktails" },
  de: { now: "jetzt", aria: "Betriebswarnungen", title: "Betriebswarnungen", criticalOne: "1 kritische Verzögerung", criticalMany: "{{count}} kritische Verzögerungen", attentionPending: "Service erfordert Aufmerksamkeit", slaHint: "Die Priorität verwendet dieselben SLA-Zeiten wie Küche, Bar und Cocktailbar.", alertOne: "Warnung", alertMany: "Warnungen", critical: "Kritisch", attention: "Achtung", delayedLineOne: "verzögerte Position", delayedLineMany: "verzögerte Positionen", since: "seit {{minutes}} Min.", extraPrefix: "Es gibt", extraSuffix: "weitere Warnungen auf den Betriebsbildschirmen.", stationKitchen: "Küche", stationBar: "Bar", stationCocktail: "Cocktailbar" },
  it: { now: "adesso", aria: "Avvisi operativi", title: "Avvisi operativi", criticalOne: "1 ritardo critico", criticalMany: "{{count}} ritardi critici", attentionPending: "Il servizio richiede attenzione", slaHint: "La priorità usa gli stessi tempi SLA di Cucina, Bar e Cocktail.", alertOne: "avviso", alertMany: "avvisi", critical: "Critico", attention: "Attenzione", delayedLineOne: "riga in ritardo", delayedLineMany: "righe in ritardo", since: "da {{minutes}} min", extraPrefix: "Ci sono", extraSuffix: "avvisi aggiuntivi nelle schermate operative.", stationKitchen: "Cucina", stationBar: "Bar", stationCocktail: "Cocktail" },
  pt: { now: "agora", aria: "Alertas operacionais", title: "Alertas operacionais", criticalOne: "1 atraso crítico", criticalMany: "{{count}} atrasos críticos", attentionPending: "Serviço requer atenção", slaHint: "A prioridade usa os mesmos tempos SLA de Cozinha, Bar e Cocktails.", alertOne: "alerta", alertMany: "alertas", critical: "Crítico", attention: "Atenção", delayedLineOne: "linha atrasada", delayedLineMany: "linhas atrasadas", since: "desde {{minutes}} min", extraPrefix: "Existem", extraSuffix: "alertas adicionais nos ecrãs operacionais.", stationKitchen: "Cozinha", stationBar: "Bar", stationCocktail: "Cocktails" },
  nl: { now: "nu", aria: "Operationele waarschuwingen", title: "Operationele waarschuwingen", criticalOne: "1 kritieke vertraging", criticalMany: "{{count}} kritieke vertragingen", attentionPending: "Service vereist aandacht", slaHint: "De prioriteit gebruikt dezelfde SLA-tijden als Keuken, Bar en Cocktails.", alertOne: "waarschuwing", alertMany: "waarschuwingen", critical: "Kritiek", attention: "Aandacht", delayedLineOne: "vertraagde regel", delayedLineMany: "vertraagde regels", since: "sinds {{minutes}} min", extraPrefix: "Er zijn", extraSuffix: "extra waarschuwingen op de operationele schermen.", stationKitchen: "Keuken", stationBar: "Bar", stationCocktail: "Cocktails" },
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
