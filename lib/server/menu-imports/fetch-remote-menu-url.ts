import { HOSTLY_PUBLIC_SITE_URL } from "@/lib/hostly/public-site-url";
import { URL_FETCH_TIMEOUT_MS, MAX_REMOTE_MENU_BYTES } from "./menu-import-limits";

export type FetchedRemoteMenu = {
  buffer: Buffer;
  contentType: string;
  finalUrl: string;
};

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return true;
  if (host === "0.0.0.0") return true;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }

  if (host.includes("metadata.google.internal")) return true;
  return false;
}

export function assertSafePublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL del menú QR inválida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo se permiten URLs http/https");
  }
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    throw new Error("URL no permitida (host privado o bloqueado)");
  }
  return parsed;
}

export async function fetchRemoteMenuContent(sourceUrl: string): Promise<FetchedRemoteMenu> {
  const url = assertSafePublicHttpUrl(sourceUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": `HostlyMenuImport/1.0 (+${HOSTLY_PUBLIC_SITE_URL})`,
      },
    });

    if (!res.ok) {
      throw new Error(`No se pudo descargar el menú (${res.status})`);
    }

    const finalUrl = res.url || url.toString();
    const finalParsed = assertSafePublicHttpUrl(finalUrl);

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REMOTE_MENU_BYTES) {
      throw new Error("El menú remoto supera el tamaño máximo permitido");
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_REMOTE_MENU_BYTES) {
      throw new Error("El menú remoto supera el tamaño máximo permitido");
    }

    const buffer = Buffer.from(arrayBuffer);
    const headerType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    const looksPdf = buffer.subarray(0, 4).toString("utf8") === "%PDF";
    const contentType =
      looksPdf || headerType === "application/pdf"
        ? "application/pdf"
        : headerType.startsWith("text/") || headerType.includes("html")
          ? "text/html"
          : headerType || "application/octet-stream";

    return { buffer, contentType, finalUrl: finalParsed.toString() };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al descargar la URL del menú");
    }
    throw e instanceof Error ? e : new Error("Error al descargar la URL del menú");
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToVisibleText(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  text = text.replace(/\r/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  return text.trim();
}
