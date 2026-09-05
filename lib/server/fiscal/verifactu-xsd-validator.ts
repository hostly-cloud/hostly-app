import { validateXML } from "xmllint-wasm";

const AEAT_SCHEMA_BASE = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws";
export const AEAT_VERIFACTU_SCHEMA_URLS = Object.freeze({
  ledger: `${AEAT_SCHEMA_BASE}/SuministroLR.xsd`,
  information: `${AEAT_SCHEMA_BASE}/SuministroInformacion.xsd`,
  xmlSignature: "https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd",
});

type VerifactuSchemas = {
  ledger: string;
  information: string;
  xmlSignature: string;
};

let schemaPromise: Promise<VerifactuSchemas> | null = null;

export class FiscalXmlSchemaError extends Error {
  readonly code = "FISCAL_XML_SCHEMA_INVALID";
}

async function fetchSchema(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "application/xml,text/xml" },
    signal: AbortSignal.timeout(15_000),
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`FISCAL_XSD_DOWNLOAD_${response.status}`);
  const schema = await response.text();
  if (!schema.includes("<schema") || schema.length < 500) throw new Error("FISCAL_XSD_DOWNLOAD_INVALID");
  return schema;
}

async function officialSchemas(): Promise<VerifactuSchemas> {
  schemaPromise ??= Promise.all([
    fetchSchema(AEAT_VERIFACTU_SCHEMA_URLS.ledger),
    fetchSchema(AEAT_VERIFACTU_SCHEMA_URLS.information),
    fetchSchema(AEAT_VERIFACTU_SCHEMA_URLS.xmlSignature),
  ]).then(([ledger, information, xmlSignature]) => ({ ledger, information, xmlSignature }))
    .catch((error) => {
      schemaPromise = null;
      throw error;
    });
  return schemaPromise;
}

function ledgerDocument(envelope: string): string {
  const match = envelope.match(/<sum1:RegFactuSistemaFacturacion>([\s\S]*?)<\/sum1:RegFactuSistemaFacturacion>/);
  if (!match) throw new FiscalXmlSchemaError("FISCAL_XML_LEDGER_ROOT_MISSING");
  return `<?xml version="1.0" encoding="UTF-8"?><sum1:RegFactuSistemaFacturacion xmlns:sum1="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">${match[1]}</sum1:RegFactuSistemaFacturacion>`;
}

export async function validateVerifactuEnvelopeAgainstOfficialSchemas(
  envelope: string,
  suppliedSchemas?: VerifactuSchemas,
): Promise<void> {
  const schemas = suppliedSchemas ?? await officialSchemas();
  const result = await validateXML({
    xml: { fileName: "registro.xml", contents: ledgerDocument(envelope) },
    schema: { fileName: "SuministroLR.xsd", contents: schemas.ledger },
    preload: [
      { fileName: "SuministroInformacion.xsd", contents: schemas.information },
      { fileName: "xmldsig-core-schema.xsd", contents: schemas.xmlSignature },
      { fileName: "http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd", contents: schemas.xmlSignature },
    ],
    initialMemoryPages: 512,
    maxMemoryPages: 1_024,
  });
  if (!result.valid) {
    const details = result.errors.slice(0, 3).map((item) => item.message.replace(/[\r\n]+/g, " ").slice(0, 300)).join(" | ");
    throw new FiscalXmlSchemaError(details || "FISCAL_XML_SCHEMA_INVALID");
  }
}
