import { request as httpsRequest } from "node:https";
import { XMLParser } from "fast-xml-parser";
import type { AeatEnvironment } from "@/lib/fiscal/model";
import type { FiscalCertificateMaterial } from "@/lib/server/fiscal/fiscal-certificate-secret";

export const AEAT_VERIFACTU_ENDPOINTS: Readonly<Record<AeatEnvironment, string>> = {
  test: "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  production: "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
};

export type AeatSubmissionResult = {
  submissionStatus: "Correcto" | "ParcialmenteCorrecto" | "Incorrecto";
  recordStatus: "Correcto" | "AceptadoConErrores" | "Incorrecto";
  csv: string | null;
  presenterNif: string | null;
  presentedAt: string | null;
  waitSeconds: number;
  errorCode: string | null;
  errorDescription: string | null;
  duplicateStatus: string | null;
};

export type AeatHttpTransport = (input: {
  url: string;
  body: string;
  certificate: FiscalCertificateMaterial;
  timeoutMs: number;
}) => Promise<{ statusCode: number; body: string }>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

export function parseAeatSubmissionResponse(xml: string): AeatSubmissionResult {
  let parsed: unknown;
  try {
    parsed = new XMLParser({ removeNSPrefix: true, trimValues: true }).parse(xml);
  } catch {
    throw new Error("AEAT_RESPONSE_XML_INVALID");
  }
  const envelope = asRecord(parsed);
  const body = asRecord(asRecord(envelope.Envelope).Body);
  const fault = asRecord(body.Fault);
  if (Object.keys(fault).length) {
    const code = asText(fault.faultcode) ?? "SOAP_FAULT";
    throw new Error(`AEAT_SOAP_FAULT:${code}`);
  }
  const response = asRecord(body.RespuestaRegFactuSistemaFacturacion);
  if (!Object.keys(response).length) throw new Error("AEAT_RESPONSE_BODY_MISSING");
  const lineRaw = response.RespuestaLinea;
  const line = asRecord(Array.isArray(lineRaw) ? lineRaw[0] : lineRaw);
  const presentation = asRecord(response.DatosPresentacion);
  const duplicate = asRecord(line.RegistroDuplicado);
  const submissionStatus = asText(response.EstadoEnvio);
  const recordStatus = asText(line.EstadoRegistro);
  if (!["Correcto", "ParcialmenteCorrecto", "Incorrecto"].includes(submissionStatus ?? "")) {
    throw new Error("AEAT_SUBMISSION_STATUS_UNKNOWN");
  }
  if (!["Correcto", "AceptadoConErrores", "Incorrecto"].includes(recordStatus ?? "")) {
    throw new Error("AEAT_RECORD_STATUS_UNKNOWN");
  }
  return {
    submissionStatus: submissionStatus as AeatSubmissionResult["submissionStatus"],
    recordStatus: recordStatus as AeatSubmissionResult["recordStatus"],
    csv: asText(response.CSV),
    presenterNif: asText(presentation.NIFPresentador),
    presentedAt: asText(presentation.TimestampPresentacion),
    waitSeconds: Number(asText(response.TiempoEsperaEnvio)) || 0,
    errorCode: asText(line.CodigoErrorRegistro),
    errorDescription: asText(line.DescripcionErrorRegistro),
    duplicateStatus: asText(duplicate.EstadoRegistroDuplicado),
  };
}

const defaultTransport: AeatHttpTransport = ({ url, body, certificate, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "POST",
      pfx: certificate.pfx,
      passphrase: certificate.passphrase,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        SOAPAction: "",
      },
      timeout: timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2_000_000) {
          request.destroy(new Error("AEAT_RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("AEAT_TIMEOUT")));
    request.on("error", reject);
    request.end(body, "utf8");
  });

export async function submitAeatVerifactu(input: {
  environment: AeatEnvironment;
  xmlEnvelope: string;
  certificate: FiscalCertificateMaterial;
  timeoutMs?: number;
  transport?: AeatHttpTransport;
}): Promise<AeatSubmissionResult> {
  if (input.environment === "production" && process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED !== "true") {
    throw new Error("AEAT_PRODUCTION_SUBMISSION_DISABLED");
  }
  if (!input.xmlEnvelope.startsWith("<?xml") || !input.xmlEnvelope.includes("RegFactuSistemaFacturacion")) {
    throw new Error("AEAT_REQUEST_XML_INVALID");
  }
  const result = await (input.transport ?? defaultTransport)({
    url: AEAT_VERIFACTU_ENDPOINTS[input.environment],
    body: input.xmlEnvelope,
    certificate: input.certificate,
    timeoutMs: input.timeoutMs ?? 20_000,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`AEAT_HTTP_ERROR:${result.statusCode}`);
  }
  return parseAeatSubmissionResponse(result.body);
}
