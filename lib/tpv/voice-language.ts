export type TpvVoiceLanguage = "es" | "en" | "fr" | "de" | "it" | "pt" | "nl";

export const TPV_VOICE_LANGUAGE_STORAGE_KEY = "hostly.locale";

export const TPV_VOICE_LANGUAGE_OPTIONS: ReadonlyArray<{
  code: TpvVoiceLanguage;
  shortLabel: string;
  label: string;
  speechLocale: string;
}> = [
  { code: "es", shortLabel: "ES", label: "Español", speechLocale: "es-ES" },
  { code: "en", shortLabel: "EN", label: "English", speechLocale: "en-GB" },
  { code: "fr", shortLabel: "FR", label: "Français", speechLocale: "fr-FR" },
  { code: "de", shortLabel: "DE", label: "Deutsch", speechLocale: "de-DE" },
  { code: "it", shortLabel: "IT", label: "Italiano", speechLocale: "it-IT" },
  { code: "pt", shortLabel: "PT", label: "Português", speechLocale: "pt-PT" },
  { code: "nl", shortLabel: "NL", label: "Nederlands", speechLocale: "nl-NL" },
] as const;

const HOSTLY_SPEECH_LOCALES: Readonly<Record<string, string>> = {
  es: "es-ES",
  en: "en-GB",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  nl: "nl-NL",
  "de-ch": "de-CH",
  "fr-ch": "fr-CH",
  "it-ch": "it-CH",
};

export type TpvVoiceUiCopy = {
  languageLabel: string;
  listening: string;
  interpreting: (transcript: string) => string;
  permissionError: string;
  noSpeechError: string;
  audioError: string;
  genericListenError: string;
  unavailable: string;
  activationError: string;
  hasSaid: string;
  understood: string;
  cancel: string;
  confirm: string;
  repeat: string;
  sending: string;
  start: string;
  stop: string;
  title: string;
  dialogLabel: string;
};

const UI_COPY: Record<TpvVoiceLanguage, TpvVoiceUiCopy> = {
  es: {
    languageLabel: "Idioma de voz del TPV",
    listening: "Escuchando…",
    interpreting: (transcript) => `Interpretando: “${transcript}”`,
    permissionError: "Necesito permiso para usar el micrófono.",
    noSpeechError: "No he oído ningún comando.",
    audioError: "No encuentro un micrófono disponible.",
    genericListenError: "No he podido escuchar el comando.",
    unavailable: "Los comandos por voz no están disponibles en este navegador.",
    activationError: "No he podido activar el micrófono.",
    hasSaid: "Has dicho",
    understood: "He entendido",
    cancel: "Cancelar",
    confirm: "OK, enviar",
    repeat: "Repetir",
    sending: "Enviando comando…",
    start: "Iniciar comando por voz",
    stop: "Detener comando por voz",
    title: "Comando por voz",
    dialogLabel: "Confirmar comando por voz",
  },
  en: {
    languageLabel: "POS voice language",
    listening: "Listening…",
    interpreting: (transcript) => `Interpreting: “${transcript}”`,
    permissionError: "I need microphone permission.",
    noSpeechError: "I didn't hear a command.",
    audioError: "I can't find an available microphone.",
    genericListenError: "I couldn't hear the command.",
    unavailable: "Voice commands aren't available in this browser.",
    activationError: "I couldn't activate the microphone.",
    hasSaid: "You said",
    understood: "I understood",
    cancel: "Cancel",
    confirm: "OK, send",
    repeat: "Repeat",
    sending: "Sending command…",
    start: "Start voice command",
    stop: "Stop voice command",
    title: "Voice command",
    dialogLabel: "Confirm voice command",
  },
  fr: {
    languageLabel: "Langue vocale du TPV",
    listening: "Écoute…",
    interpreting: (transcript) => `Interprétation : « ${transcript} »`,
    permissionError: "J’ai besoin de l’autorisation d’utiliser le microphone.",
    noSpeechError: "Je n’ai entendu aucune commande.",
    audioError: "Je ne trouve aucun microphone disponible.",
    genericListenError: "Je n’ai pas pu entendre la commande.",
    unavailable: "Les commandes vocales ne sont pas disponibles dans ce navigateur.",
    activationError: "Je n’ai pas pu activer le microphone.",
    hasSaid: "Vous avez dit",
    understood: "J’ai compris",
    cancel: "Annuler",
    confirm: "OK, envoyer",
    repeat: "Répéter",
    sending: "Envoi de la commande…",
    start: "Démarrer la commande vocale",
    stop: "Arrêter la commande vocale",
    title: "Commande vocale",
    dialogLabel: "Confirmer la commande vocale",
  },
  de: {
    languageLabel: "TPV-Spracherkennung",
    listening: "Ich höre zu…",
    interpreting: (transcript) => `Verstanden als: „${transcript}“`,
    permissionError: "Ich benötige die Mikrofonberechtigung.",
    noSpeechError: "Ich habe keinen Befehl gehört.",
    audioError: "Ich finde kein verfügbares Mikrofon.",
    genericListenError: "Ich konnte den Befehl nicht hören.",
    unavailable: "Sprachbefehle sind in diesem Browser nicht verfügbar.",
    activationError: "Ich konnte das Mikrofon nicht aktivieren.",
    hasSaid: "Gesagt",
    understood: "Verstanden",
    cancel: "Abbrechen",
    confirm: "OK, senden",
    repeat: "Wiederholen",
    sending: "Befehl wird gesendet…",
    start: "Sprachbefehl starten",
    stop: "Sprachbefehl stoppen",
    title: "Sprachbefehl",
    dialogLabel: "Sprachbefehl bestätigen",
  },
  it: {
    languageLabel: "Lingua vocale del TPV",
    listening: "In ascolto…",
    interpreting: (transcript) => `Interpretazione: “${transcript}”`,
    permissionError: "Ho bisogno del permesso per usare il microfono.",
    noSpeechError: "Non ho sentito alcun comando.",
    audioError: "Non trovo un microfono disponibile.",
    genericListenError: "Non sono riuscito ad ascoltare il comando.",
    unavailable: "I comandi vocali non sono disponibili in questo browser.",
    activationError: "Non sono riuscito ad attivare il microfono.",
    hasSaid: "Hai detto",
    understood: "Ho capito",
    cancel: "Annulla",
    confirm: "OK, invia",
    repeat: "Ripeti",
    sending: "Invio del comando…",
    start: "Avvia comando vocale",
    stop: "Ferma comando vocale",
    title: "Comando vocale",
    dialogLabel: "Conferma comando vocale",
  },
  pt: {
    languageLabel: "Idioma de voz do TPV",
    listening: "A ouvir…",
    interpreting: (transcript) => `A interpretar: “${transcript}”`,
    permissionError: "Preciso de permissão para usar o microfone.",
    noSpeechError: "Não ouvi nenhum comando.",
    audioError: "Não encontro um microfone disponível.",
    genericListenError: "Não consegui ouvir o comando.",
    unavailable: "Os comandos de voz não estão disponíveis neste navegador.",
    activationError: "Não consegui ativar o microfone.",
    hasSaid: "Disse",
    understood: "Entendi",
    cancel: "Cancelar",
    confirm: "OK, enviar",
    repeat: "Repetir",
    sending: "A enviar comando…",
    start: "Iniciar comando de voz",
    stop: "Parar comando de voz",
    title: "Comando de voz",
    dialogLabel: "Confirmar comando de voz",
  },
  nl: {
    languageLabel: "Spraaktaal van de kassa",
    listening: "Luisteren…",
    interpreting: (transcript) => `Interpreteren: “${transcript}”`,
    permissionError: "Ik heb toestemming nodig voor de microfoon.",
    noSpeechError: "Ik heb geen opdracht gehoord.",
    audioError: "Ik kan geen beschikbare microfoon vinden.",
    genericListenError: "Ik kon de opdracht niet horen.",
    unavailable: "Spraakopdrachten zijn niet beschikbaar in deze browser.",
    activationError: "Ik kon de microfoon niet activeren.",
    hasSaid: "Je zei",
    understood: "Ik begreep",
    cancel: "Annuleren",
    confirm: "OK, verzenden",
    repeat: "Opnieuw",
    sending: "Opdracht verzenden…",
    start: "Spraakopdracht starten",
    stop: "Spraakopdracht stoppen",
    title: "Spraakopdracht",
    dialogLabel: "Spraakopdracht bevestigen",
  },
};

export function getTpvVoiceUi(language: TpvVoiceLanguage): TpvVoiceUiCopy {
  return UI_COPY[language];
}

function normalizedHostlyLocale(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function normalizeTpvVoiceLanguage(value: unknown): TpvVoiceLanguage | null {
  const base = normalizedHostlyLocale(value).split("-")[0];
  return base === "es" ||
    base === "en" ||
    base === "fr" ||
    base === "de" ||
    base === "it" ||
    base === "pt" ||
    base === "nl"
    ? base
    : null;
}

export function speechLocaleForHostlyLocale(value: unknown): string | null {
  const normalized = normalizedHostlyLocale(value);
  if (!normalized) return null;
  const exact = HOSTLY_SPEECH_LOCALES[normalized];
  if (exact) return exact;
  const language = normalizeTpvVoiceLanguage(normalized);
  return language ? speechLocaleForTpvVoiceLanguage(language) : null;
}

export function speechLocaleForTpvVoiceLanguage(language: TpvVoiceLanguage): string {
  return (
    TPV_VOICE_LANGUAGE_OPTIONS.find((option) => option.code === language)?.speechLocale ??
    "es-ES"
  );
}

function browserLocaleCandidates(): unknown[] {
  if (typeof window === "undefined") return [];
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(TPV_VOICE_LANGUAGE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  return [stored, document.documentElement.lang, window.navigator.language];
}

export function resolveTpvVoiceLanguage(): TpvVoiceLanguage {
  for (const candidate of browserLocaleCandidates()) {
    const language = normalizeTpvVoiceLanguage(candidate);
    if (language) return language;
  }
  return "es";
}

export function resolveTpvVoiceSpeechLocale(): string {
  for (const candidate of browserLocaleCandidates()) {
    const locale = speechLocaleForHostlyLocale(candidate);
    if (locale) return locale;
  }
  return "es-ES";
}

export function persistTpvVoiceLanguage(language: TpvVoiceLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TPV_VOICE_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The selection still applies to the current React state even if storage is blocked.
  }
}

function normalizeSpeech(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type LanguageProfile = {
  requestPrefixes: readonly string[];
  fillers: ReadonlySet<string>;
  politeSuffixes: readonly string[];
  conjunctions: ReadonlySet<string>;
  articles: ReadonlySet<string>;
  tableTargets: readonly string[];
  leadingTableTargets: readonly string[];
  tableNumberPrefixes: readonly string[];
  numberWords: ReadonlyMap<string, number>;
  pairPhrases: readonly string[];
  halfDozenPhrases: readonly string[];
  dozenPhrases: readonly string[];
};

function buildEnglishNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5],
    ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10],
    ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14],
    ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18],
    ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50],
  ]);
  const tens: Array<[string, number]> = [["twenty", 20], ["thirty", 30], ["forty", 40]];
  const units = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9 && value + unit <= 50; unit += 1) {
      map.set(`${word} ${units[unit]}`, value + unit);
    }
  }
  return map;
}

function buildFrenchNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["un", 1], ["une", 1], ["deux", 2], ["trois", 3], ["quatre", 4], ["cinq", 5],
    ["six", 6], ["sept", 7], ["huit", 8], ["neuf", 9], ["dix", 10], ["onze", 11],
    ["douze", 12], ["treize", 13], ["quatorze", 14], ["quinze", 15], ["seize", 16],
    ["dix sept", 17], ["dix huit", 18], ["dix neuf", 19], ["vingt", 20],
    ["trente", 30], ["quarante", 40], ["cinquante", 50],
  ]);
  const tens: Array<[string, number]> = [["vingt", 20], ["trente", 30], ["quarante", 40]];
  const units = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9; unit += 1) {
      map.set(`${word} ${units[unit]}`, value + unit);
      if (unit === 1) map.set(`${word} et un`, value + unit);
    }
  }
  return map;
}

function buildGermanNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["ein", 1], ["eins", 1], ["eine", 1], ["einen", 1], ["zwei", 2], ["drei", 3],
    ["vier", 4], ["funf", 5], ["sechs", 6], ["sieben", 7], ["acht", 8], ["neun", 9],
    ["zehn", 10], ["elf", 11], ["zwolf", 12], ["dreizehn", 13], ["vierzehn", 14],
    ["funfzehn", 15], ["sechzehn", 16], ["siebzehn", 17], ["achtzehn", 18],
    ["neunzehn", 19], ["zwanzig", 20], ["dreissig", 30], ["vierzig", 40], ["funfzig", 50],
  ]);
  const unitStems = ["", "ein", "zwei", "drei", "vier", "funf", "sechs", "sieben", "acht", "neun"];
  const tens: Array<[string, number]> = [["zwanzig", 20], ["dreissig", 30], ["vierzig", 40]];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9; unit += 1) {
      map.set(`${unitStems[unit]}und${word}`, value + unit);
    }
  }
  return map;
}

function buildItalianNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["un", 1], ["uno", 1], ["una", 1], ["due", 2], ["tre", 3], ["quattro", 4],
    ["cinque", 5], ["sei", 6], ["sette", 7], ["otto", 8], ["nove", 9], ["dieci", 10],
    ["undici", 11], ["dodici", 12], ["tredici", 13], ["quattordici", 14],
    ["quindici", 15], ["sedici", 16], ["diciassette", 17], ["diciotto", 18],
    ["diciannove", 19], ["venti", 20], ["trenta", 30], ["quaranta", 40], ["cinquanta", 50],
  ]);
  const units = ["", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"];
  const tens: Array<[string, number]> = [["venti", 20], ["trenta", 30], ["quaranta", 40]];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9; unit += 1) {
      const stem = unit === 1 || unit === 8 ? word.slice(0, -1) : word;
      map.set(`${stem}${units[unit]}`, value + unit);
    }
  }
  return map;
}

function buildPortugueseNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["um", 1], ["uma", 1], ["dois", 2], ["duas", 2], ["tres", 3], ["quatro", 4],
    ["cinco", 5], ["seis", 6], ["sete", 7], ["oito", 8], ["nove", 9], ["dez", 10],
    ["onze", 11], ["doze", 12], ["treze", 13], ["catorze", 14], ["quatorze", 14],
    ["quinze", 15], ["dezasseis", 16], ["dezesseis", 16], ["dezassete", 17], ["dezessete", 17],
    ["dezoito", 18], ["dezanove", 19], ["dezenove", 19], ["vinte", 20],
    ["trinta", 30], ["quarenta", 40], ["cinquenta", 50],
  ]);
  const tens: Array<[string, number]> = [["vinte", 20], ["trinta", 30], ["quarenta", 40]];
  const units = ["", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9; unit += 1) {
      map.set(`${word} e ${units[unit]}`, value + unit);
    }
  }
  return map;
}

function buildDutchNumbers(): Map<string, number> {
  const map = new Map<string, number>([
    ["een", 1], ["twee", 2], ["drie", 3], ["vier", 4], ["vijf", 5], ["zes", 6],
    ["zeven", 7], ["acht", 8], ["negen", 9], ["tien", 10], ["elf", 11], ["twaalf", 12],
    ["dertien", 13], ["veertien", 14], ["vijftien", 15], ["zestien", 16], ["zeventien", 17],
    ["achttien", 18], ["negentien", 19], ["twintig", 20], ["dertig", 30], ["veertig", 40],
    ["vijftig", 50],
  ]);
  const stems = ["", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen"];
  const tens: Array<[string, number]> = [["twintig", 20], ["dertig", 30], ["veertig", 40]];
  for (const [word, value] of tens) {
    for (let unit = 1; unit <= 9; unit += 1) {
      map.set(`${stems[unit]}en${word}`, value + unit);
    }
  }
  return map;
}

const PROFILES: Record<Exclude<TpvVoiceLanguage, "es">, LanguageProfile> = {
  en: {
    requestPrefixes: [
      "could you bring me", "can you bring me", "could you add", "can you add",
      "please bring me", "bring me", "give me", "get me", "put", "add",
      "i need", "i want", "we need", "we want",
    ],
    fillers: new Set(["okay", "ok", "well", "hey", "please", "sorry"]),
    politeSuffixes: ["please"],
    conjunctions: new Set(["and", "plus", "then", "also"]),
    articles: new Set(["a", "an"]),
    tableTargets: [
      "to the table", "for the table", "at the table", "on the table",
      "to table", "for table", "at table", "on table",
    ],
    leadingTableTargets: ["for the table", "at the table", "on the table", "table"],
    tableNumberPrefixes: ["number", "no"],
    numberWords: buildEnglishNumbers(),
    pairPhrases: ["a pair of", "pair of"],
    halfDozenPhrases: ["half a dozen of", "half dozen of"],
    dozenPhrases: ["a dozen of", "dozen of"],
  },
  fr: {
    requestPrefixes: [
      "est ce que vous pouvez mettre", "vous pouvez mettre", "tu peux mettre",
      "mettez moi", "mets moi", "apportez moi", "apporte moi", "donnez moi",
      "donne moi", "ajoutez", "ajoute", "je voudrais", "je veux", "il me faut",
      "j ai besoin de",
    ],
    fillers: new Set(["bon", "alors", "euh", "eh", "pardon", "svp"]),
    politeSuffixes: ["s il vous plait", "s il te plait", "svp"],
    conjunctions: new Set(["et", "plus", "puis", "aussi"]),
    articles: new Set(["un", "une"]),
    tableTargets: ["pour la table", "a la table", "sur la table", "pour table", "a table"],
    leadingTableTargets: ["pour la table", "a la table", "sur la table", "table"],
    tableNumberPrefixes: ["numero", "no"],
    numberWords: buildFrenchNumbers(),
    pairPhrases: ["une paire de", "paire de"],
    halfDozenPhrases: ["une demi douzaine de", "demi douzaine de"],
    dozenPhrases: ["une douzaine de", "douzaine de"],
  },
  de: {
    requestPrefixes: [
      "konnen sie mir bringen", "kannst du mir bringen", "konnen sie mir",
      "kannst du mir", "bringen sie mir", "bring mir", "gib mir", "stell mir",
      "mach mir", "ich brauche", "ich mochte", "ich will",
    ],
    fillers: new Set(["also", "okay", "ok", "bitte", "entschuldigung", "sorry"]),
    politeSuffixes: ["bitte"],
    conjunctions: new Set(["und", "plus", "dann", "auch"]),
    articles: new Set(["ein", "eine", "einen"]),
    tableTargets: [
      "fur den tisch", "an den tisch", "zum tisch", "auf den tisch",
      "fur tisch", "an tisch", "zu tisch",
    ],
    leadingTableTargets: ["fur den tisch", "an den tisch", "zum tisch", "tisch"],
    tableNumberPrefixes: ["nummer", "nr"],
    numberWords: buildGermanNumbers(),
    pairPhrases: ["ein paar", "ein paar von"],
    halfDozenPhrases: ["ein halbes dutzend", "halbes dutzend"],
    dozenPhrases: ["ein dutzend", "dutzend"],
  },
  it: {
    requestPrefixes: [
      "mi puoi portare", "puoi portarmi", "puoi portare", "portami", "mettimi",
      "mi metti", "aggiungimi", "aggiungi", "dammi", "mi serve", "mi servono",
      "vorrei", "voglio",
    ],
    fillers: new Set(["allora", "ok", "okay", "ecco", "scusa", "scusami", "per favore"]),
    politeSuffixes: ["per favore"],
    conjunctions: new Set(["e", "ed", "piu", "poi", "anche"]),
    articles: new Set(["un", "uno", "una"]),
    tableTargets: ["per il tavolo", "per la tavola", "al tavolo", "alla tavola", "sul tavolo", "a tavolo"],
    leadingTableTargets: ["per il tavolo", "al tavolo", "sul tavolo", "tavolo", "tavola"],
    tableNumberPrefixes: ["numero", "n"],
    numberWords: buildItalianNumbers(),
    pairPhrases: ["un paio di", "paio di"],
    halfDozenPhrases: ["mezza dozzina di", "una mezza dozzina di"],
    dozenPhrases: ["una dozzina di", "dozzina di"],
  },
  pt: {
    requestPrefixes: [
      "pode me trazer", "podes me trazer", "pode trazer me", "podes trazer me",
      "traga me", "traz me", "traz", "pode me por", "podes me por", "poe me",
      "coloca me", "adiciona me", "adiciona", "acrescenta me", "acrescenta",
      "da me", "preciso de", "quero",
    ],
    fillers: new Set(["bem", "entao", "ok", "okay", "olha", "desculpa", "desculpe", "por favor"]),
    politeSuffixes: ["por favor", "se faz favor"],
    conjunctions: new Set(["e", "mais", "depois", "tambem"]),
    articles: new Set(["um", "uma"]),
    tableTargets: [
      "para a mesa", "para o mesa", "na mesa", "no mesa", "a mesa",
      "para mesa", "em mesa",
    ],
    leadingTableTargets: ["para a mesa", "na mesa", "a mesa", "mesa"],
    tableNumberPrefixes: ["numero", "n"],
    numberWords: buildPortugueseNumbers(),
    pairPhrases: ["um par de", "par de"],
    halfDozenPhrases: ["meia duzia de", "uma meia duzia de"],
    dozenPhrases: ["uma duzia de", "duzia de"],
  },
  nl: {
    requestPrefixes: [
      "kun je me brengen", "kunt u me brengen", "kan je me brengen", "breng me",
      "geef me", "zet me", "zet", "voeg toe", "doe erbij", "ik heb nodig",
      "ik wil", "we hebben nodig", "we willen",
    ],
    fillers: new Set(["nou", "oke", "ok", "goed", "sorry", "alsjeblieft", "alstublieft"]),
    politeSuffixes: ["alsjeblieft", "alstublieft"],
    conjunctions: new Set(["en", "plus", "dan", "ook"]),
    articles: new Set(["een"]),
    tableTargets: [
      "voor de tafel", "aan de tafel", "op de tafel", "voor tafel", "aan tafel", "op tafel",
    ],
    leadingTableTargets: ["voor de tafel", "aan de tafel", "op de tafel", "voor tafel", "tafel"],
    tableNumberPrefixes: ["nummer", "nr"],
    numberWords: buildDutchNumbers(),
    pairPhrases: ["een paar", "paar"],
    halfDozenPhrases: ["een half dozijn", "half dozijn"],
    dozenPhrases: ["een dozijn", "dozijn"],
  },
};

function stripLeadingFillers(value: string, profile: LanguageProfile): string {
  let tokens = value.split(" ").filter(Boolean);
  while (tokens.length > 1 && profile.fillers.has(tokens[0]!)) tokens = tokens.slice(1);
  return tokens.join(" ");
}

function stripPoliteness(value: string, profile: LanguageProfile): string {
  let result = value.trim();
  for (const suffix of profile.politeSuffixes) {
    if (result === suffix) return "";
    if (result.endsWith(` ${suffix}`)) result = result.slice(0, -suffix.length).trim();
  }
  return result;
}

function stripRequestPrefix(value: string, profile: LanguageProfile): string {
  const sorted = [...profile.requestPrefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (value === prefix) return "";
    if (value.startsWith(`${prefix} `)) return value.slice(prefix.length).trim();
  }
  return value;
}

type NumberMatch = { value: number; consumed: number };

function parseNumberAt(tokens: string[], index: number, profile: LanguageProfile): NumberMatch | null {
  const numeric = tokens[index];
  if (/^\d{1,2}$/.test(numeric ?? "")) {
    const value = Number(numeric);
    if (value >= 1 && value <= 50) return { value, consumed: 1 };
  }

  for (const consumed of [3, 2, 1]) {
    if (index + consumed > tokens.length) continue;
    const phrase = tokens.slice(index, index + consumed).join(" ");
    const value = profile.numberWords.get(phrase);
    if (value != null) return { value, consumed };
  }
  return null;
}

function parseWholeNumber(value: string, profile: LanguageProfile): number | null {
  const tokens = value.split(" ").filter(Boolean);
  const match = parseNumberAt(tokens, 0, profile);
  return match && match.consumed === tokens.length ? match.value : null;
}

function stripTableNumberPrefix(value: string, profile: LanguageProfile): string {
  for (const prefix of profile.tableNumberPrefixes) {
    if (value.startsWith(`${prefix} `)) return value.slice(prefix.length).trim();
  }
  return value;
}

function canonicalTableQuery(value: string, profile: LanguageProfile): string {
  const cleaned = stripTableNumberPrefix(value.trim(), profile);
  const number = parseWholeNumber(cleaned, profile);
  return number != null ? String(number) : cleaned;
}

function replaceQuantityPhraseAtStart(value: string, phrases: readonly string[], quantity: number): string {
  for (const phrase of phrases) {
    if (value.startsWith(`${phrase} `)) return `${quantity} ${value.slice(phrase.length).trim()}`;
  }
  return value;
}

function translateOrderText(value: string, profile: LanguageProfile): string {
  let cleaned = stripLeadingFillers(value, profile);
  cleaned = stripPoliteness(cleaned, profile);
  cleaned = stripRequestPrefix(cleaned, profile);
  cleaned = replaceQuantityPhraseAtStart(cleaned, profile.halfDozenPhrases, 6);
  cleaned = replaceQuantityPhraseAtStart(cleaned, profile.dozenPhrases, 12);
  cleaned = replaceQuantityPhraseAtStart(cleaned, profile.pairPhrases, 2);

  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return "";

  const result: string[] = [];
  let productTokensSinceQuantity = 0;
  let atItemStart = true;

  for (let index = 0; index < tokens.length; ) {
    const token = tokens[index]!;

    if (profile.conjunctions.has(token)) {
      const nextNumber = parseNumberAt(tokens, index + 1, profile);
      const nextArticle = profile.articles.has(tokens[index + 1] ?? "");
      if (nextNumber || nextArticle) {
        result.push("y");
        atItemStart = true;
        productTokensSinceQuantity = 0;
        index += 1;
        continue;
      }
    }

    const number = parseNumberAt(tokens, index, profile);
    if (number && (atItemStart || productTokensSinceQuantity > 0)) {
      result.push(String(number.value));
      atItemStart = false;
      productTokensSinceQuantity = 0;
      index += number.consumed;
      continue;
    }

    if (profile.articles.has(token) && (atItemStart || productTokensSinceQuantity > 0)) {
      result.push("1");
      atItemStart = false;
      productTokensSinceQuantity = 0;
      index += 1;
      continue;
    }

    result.push(token);
    productTokensSinceQuantity += 1;
    atItemStart = false;
    index += 1;
  }

  return result.join(" ").trim();
}

function findTrailingTableTarget(value: string, profile: LanguageProfile): { order: string; table: string } | null {
  let bestIndex = -1;
  let bestNeedle = "";
  for (const phrase of profile.tableTargets) {
    const needle = ` ${phrase} `;
    const index = value.lastIndexOf(needle);
    if (index > bestIndex) {
      bestIndex = index;
      bestNeedle = needle;
    }
  }

  if (bestIndex >= 0 && bestNeedle) {
    const order = value.slice(0, bestIndex).trim();
    const table = value.slice(bestIndex + bestNeedle.length).trim();
    if (order && table) return { order, table };
  }

  return null;
}

function findLeadingTableTarget(value: string, profile: LanguageProfile): { order: string; table: string } | null {
  const sorted = [...profile.leadingTableTargets].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    if (!value.startsWith(`${phrase} `)) continue;
    const tail = value.slice(phrase.length).trim();
    const tokens = tail.split(" ").filter(Boolean);
    let offset = 0;
    if (profile.tableNumberPrefixes.includes(tokens[0] ?? "")) offset = 1;
    const number = parseNumberAt(tokens, offset, profile);
    if (!number) continue;
    const consumed = offset + number.consumed;
    const order = tokens.slice(consumed).join(" ").trim();
    if (!order) continue;
    return { order, table: String(number.value) };
  }
  return null;
}

function canonicalAction(value: string, language: Exclude<TpvVoiceLanguage, "es">): string | null {
  const exact: Record<Exclude<TpvVoiceLanguage, "es">, Record<string, string>> = {
    en: {
      "send order": "enviar comanda",
      "send the order": "enviar comanda",
      "send to kitchen": "enviar comanda",
      "send to the kitchen": "enviar comanda",
      "back to map": "volver al mapa",
      "go back to map": "volver al mapa",
      "go to map": "volver al mapa",
      "pre ticket": "pre ticket",
      preticket: "pre ticket",
      "print pre ticket": "pre ticket",
      "charge table": "cobrar mesa",
      "take payment": "cobrar mesa",
      charge: "cobrar mesa",
      "confirm fire": "confirmar marcha",
      "confirm course": "confirmar marcha",
      "fire starters": "marchar primeros",
      "fire first course": "marchar primeros",
      "send starters": "marchar primeros",
      "fire mains": "marchar segundos",
      "fire main course": "marchar segundos",
      "send mains": "marchar segundos",
      "fire desserts": "marchar postres",
      "send desserts": "marchar postres",
    },
    fr: {
      "envoyer la commande": "enviar comanda",
      "envoie la commande": "enviar comanda",
      "envoyer en cuisine": "enviar comanda",
      "envoie en cuisine": "enviar comanda",
      "retour au plan": "volver al mapa",
      "revenir au plan": "volver al mapa",
      "retour a la carte des tables": "volver al mapa",
      "pre ticket": "pre ticket",
      "imprimer le pre ticket": "pre ticket",
      encaisser: "cobrar mesa",
      "encaisser la table": "cobrar mesa",
      "confirmer l envoi": "confirmar marcha",
      "lancer les entrees": "marchar primeros",
      "envoyer les entrees": "marchar primeros",
      "lancer les plats": "marchar segundos",
      "envoyer les plats": "marchar segundos",
      "lancer les desserts": "marchar postres",
      "envoyer les desserts": "marchar postres",
    },
    de: {
      "bestellung senden": "enviar comanda",
      "bestellung abschicken": "enviar comanda",
      "in die kuche senden": "enviar comanda",
      "zuruck zum plan": "volver al mapa",
      "zuruck zur tischansicht": "volver al mapa",
      "vorabrechnung": "pre ticket",
      "vorabrechnung drucken": "pre ticket",
      kassieren: "cobrar mesa",
      "tisch kassieren": "cobrar mesa",
      "gang bestatigen": "confirmar marcha",
      "vorspeisen schicken": "marchar primeros",
      "vorspeisen senden": "marchar primeros",
      "hauptgange schicken": "marchar segundos",
      "hauptgerichte schicken": "marchar segundos",
      "desserts schicken": "marchar postres",
      "nachtisch schicken": "marchar postres",
    },
    it: {
      "invia comanda": "enviar comanda",
      "invia la comanda": "enviar comanda",
      "invia ordine": "enviar comanda",
      "invia in cucina": "enviar comanda",
      "torna alla mappa": "volver al mapa",
      "torna alla mappa tavoli": "volver al mapa",
      preconto: "pre ticket",
      "stampa preconto": "pre ticket",
      incassa: "cobrar mesa",
      "incassa tavolo": "cobrar mesa",
      "conferma uscita": "confirmar marcha",
      "manda primi": "marchar primeros",
      "manda i primi": "marchar primeros",
      "manda secondi": "marchar segundos",
      "manda i secondi": "marchar segundos",
      "manda dolci": "marchar postres",
      "manda i dolci": "marchar postres",
    },
    pt: {
      "enviar comanda": "enviar comanda",
      "envia a comanda": "enviar comanda",
      "enviar pedido": "enviar comanda",
      "envia o pedido": "enviar comanda",
      "enviar para a cozinha": "enviar comanda",
      "manda para a cozinha": "enviar comanda",
      "voltar ao mapa": "volver al mapa",
      "volta ao mapa": "volver al mapa",
      "voltar ao mapa das mesas": "volver al mapa",
      "pre conta": "pre ticket",
      "imprimir pre conta": "pre ticket",
      cobrar: "cobrar mesa",
      "cobrar mesa": "cobrar mesa",
      "cobrar a mesa": "cobrar mesa",
      "confirmar saida": "confirmar marcha",
      "mandar entradas": "marchar primeros",
      "manda entradas": "marchar primeros",
      "mandar pratos principais": "marchar segundos",
      "manda pratos principais": "marchar segundos",
      "mandar sobremesas": "marchar postres",
      "manda sobremesas": "marchar postres",
    },
    nl: {
      "bestelling versturen": "enviar comanda",
      "verstuur bestelling": "enviar comanda",
      "bestelling verzenden": "enviar comanda",
      "stuur naar de keuken": "enviar comanda",
      "naar de keuken sturen": "enviar comanda",
      "terug naar de plattegrond": "volver al mapa",
      "ga terug naar de plattegrond": "volver al mapa",
      "terug naar tafeloverzicht": "volver al mapa",
      voorrekening: "pre ticket",
      "voorrekening afdrukken": "pre ticket",
      afrekenen: "cobrar mesa",
      "tafel afrekenen": "cobrar mesa",
      "gang bevestigen": "confirmar marcha",
      "voorgerechten sturen": "marchar primeros",
      "stuur voorgerechten": "marchar primeros",
      "hoofdgerechten sturen": "marchar segundos",
      "stuur hoofdgerechten": "marchar segundos",
      "desserts sturen": "marchar postres",
      "stuur desserts": "marchar postres",
    },
  };
  return exact[language][value] ?? null;
}

function canonicalOpenTable(value: string, language: Exclude<TpvVoiceLanguage, "es">, profile: LanguageProfile): string | null {
  const prefixes: Record<Exclude<TpvVoiceLanguage, "es">, readonly string[]> = {
    en: ["open table", "go to table", "enter table"],
    fr: ["ouvre la table", "ouvrir la table", "va a la table", "aller a la table"],
    de: ["offne tisch", "offne den tisch", "gehe zu tisch", "gehe zum tisch"],
    it: ["apri tavolo", "apri il tavolo", "vai al tavolo", "entra nel tavolo"],
    pt: ["abre mesa", "abrir mesa", "abre a mesa", "abrir a mesa", "vai para a mesa", "ir para a mesa"],
    nl: ["open tafel", "open de tafel", "ga naar tafel", "ga naar de tafel"],
  };

  for (const prefix of prefixes[language]) {
    if (!value.startsWith(`${prefix} `)) continue;
    const table = canonicalTableQuery(value.slice(prefix.length).trim(), profile);
    return table ? `mesa ${table}` : null;
  }

  if (language === "de") {
    const match = value.match(/^tisch\s+(.+?)\s+offnen$/);
    if (match?.[1]) {
      const table = canonicalTableQuery(match[1], profile);
      return table ? `mesa ${table}` : null;
    }
  }
  if (language === "nl") {
    const match = value.match(/^tafel\s+(.+?)\s+openen$/);
    if (match?.[1]) {
      const table = canonicalTableQuery(match[1], profile);
      return table ? `mesa ${table}` : null;
    }
  }
  return null;
}

/**
 * Converts only the operational grammar (quantities, table destination, verbs)
 * into the Spanish canonical grammar already understood by the TPV parser.
 * Product words are intentionally preserved so arbitrary catalog names remain
 * matched against the active restaurant catalog instead of a global dictionary.
 */
export function canonicalizeTpvVoiceTranscript(
  transcript: string,
  language: TpvVoiceLanguage,
): string {
  if (language === "es") {
    const normalizedSpanish = normalizeSpeech(transcript);
    const openMatch = normalizedSpanish.match(
      /^(?:abre|abrir|entra|entrar|ve|vete|ir)\s+(?:(?:a|en)\s+)?(?:la\s+)?mesa\s+(.+)$/,
    );
    return openMatch?.[1] ? `mesa ${openMatch[1]}` : transcript;
  }

  const profile = PROFILES[language];
  let normalized = normalizeSpeech(transcript);
  if (!normalized) return transcript;
  normalized = stripLeadingFillers(normalized, profile);

  const action = canonicalAction(normalized, language);
  if (action) return action;

  const openTable = canonicalOpenTable(normalized, language, profile);
  if (openTable) return openTable;

  const trailing = findTrailingTableTarget(normalized, profile);
  if (trailing) {
    const order = translateOrderText(trailing.order, profile);
    const table = canonicalTableQuery(trailing.table, profile);
    if (order && table) return `${order} a mesa ${table}`;
  }

  const leading = findLeadingTableTarget(normalized, profile);
  if (leading) {
    const order = translateOrderText(leading.order, profile);
    if (order) return `mesa ${leading.table} ${order}`;
  }

  const translatedOrder = translateOrderText(normalized, profile);
  return translatedOrder || normalized;
}
