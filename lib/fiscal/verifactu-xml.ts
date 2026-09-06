import type {
  FiscalCancellationRecord,
  FiscalRecord,
  FiscalRecordPrevious,
  FiscalRegistrationRecord,
  FiscalSoftwareIdentity,
} from "@/lib/fiscal/model";
import { formatAeatAmount, formatAeatRate } from "@/lib/fiscal/money";

export const AEAT_XML_NAMESPACES = Object.freeze({
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  suministroLR:
    "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd",
  suministroInformacion:
    "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd",
});

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function yesNo(value: boolean): "S" | "N" {
  return value ? "S" : "N";
}

function previousXml(previous: FiscalRecordPrevious | null): string {
  if (!previous) return "<sum:PrimerRegistro>S</sum:PrimerRegistro>";
  return `<sum:RegistroAnterior><sum:IDEmisorFactura>${xml(previous.issuerNif)}</sum:IDEmisorFactura><sum:NumSerieFactura>${xml(previous.invoiceNumber)}</sum:NumSerieFactura><sum:FechaExpedicionFactura>${xml(previous.issueDate)}</sum:FechaExpedicionFactura><sum:Huella>${xml(previous.hash)}</sum:Huella></sum:RegistroAnterior>`;
}

function softwareXml(software: FiscalSoftwareIdentity): string {
  return `<sum:SistemaInformatico><sum:NombreRazon>${xml(software.producerLegalName)}</sum:NombreRazon><sum:NIF>${xml(software.producerNif)}</sum:NIF><sum:NombreSistemaInformatico>${xml(software.systemName)}</sum:NombreSistemaInformatico><sum:IdSistemaInformatico>${xml(software.systemId)}</sum:IdSistemaInformatico><sum:Version>${xml(software.version)}</sum:Version><sum:NumeroInstalacion>${xml(software.installationNumber)}</sum:NumeroInstalacion><sum:TipoUsoPosibleSoloVerifactu>${yesNo(software.onlyVerifactuCapable)}</sum:TipoUsoPosibleSoloVerifactu><sum:TipoUsoPosibleMultiOT>${yesNo(software.multiTaxpayerCapable)}</sum:TipoUsoPosibleMultiOT><sum:IndicadorMultiplesOT>${yesNo(software.multipleTaxpayersUsed)}</sum:IndicadorMultiplesOT></sum:SistemaInformatico>`;
}

function correctedInvoicesXml(record: FiscalRegistrationRecord): string {
  if (!record.correctedInvoices?.length) return "";
  const rows = record.correctedInvoices.map(
    (previous) => `<sum:IDFacturaRectificada><sum:IDEmisorFactura>${xml(previous.issuerNif)}</sum:IDEmisorFactura><sum:NumSerieFactura>${xml(previous.invoiceNumber)}</sum:NumSerieFactura><sum:FechaExpedicionFactura>${xml(previous.issueDate)}</sum:FechaExpedicionFactura></sum:IDFacturaRectificada>`,
  ).join("");
  return `<sum:FacturasRectificadas>${rows}</sum:FacturasRectificadas>`;
}

function substitutedInvoicesXml(record: FiscalRegistrationRecord): string {
  if (!record.substitutedInvoices?.length) return "";
  const rows = record.substitutedInvoices.map(
    (previous) => `<sum:IDFacturaSustituida><sum:IDEmisorFactura>${xml(previous.issuerNif)}</sum:IDEmisorFactura><sum:NumSerieFactura>${xml(previous.invoiceNumber)}</sum:NumSerieFactura><sum:FechaExpedicionFactura>${xml(previous.issueDate)}</sum:FechaExpedicionFactura></sum:IDFacturaSustituida>`,
  ).join("");
  return `<sum:FacturasSustituidas>${rows}</sum:FacturasSustituidas>`;
}

function registrationXml(record: FiscalRegistrationRecord): string {
  const customer = record.customer
    ? `<sum:Destinatarios><sum:IDDestinatario><sum:NombreRazon>${xml(record.customer.legalName)}</sum:NombreRazon><sum:NIF>${xml(record.customer.nif)}</sum:NIF></sum:IDDestinatario></sum:Destinatarios>`
    : "";
  const breakdown = record.breakdown.map((row) => {
    const regime = row.regimeCode ? `<sum:ClaveRegimen>${row.regimeCode}</sum:ClaveRegimen>` : "";
    return `<sum:DetalleDesglose><sum:Impuesto>${row.taxCode}</sum:Impuesto>${regime}<sum:CalificacionOperacion>${row.operationClassification}</sum:CalificacionOperacion><sum:TipoImpositivo>${formatAeatRate(row.vatRateBps)}</sum:TipoImpositivo><sum:BaseImponibleOimporteNoSujeto>${formatAeatAmount(row.taxableBaseCents)}</sum:BaseImponibleOimporteNoSujeto><sum:CuotaRepercutida>${formatAeatAmount(row.taxAmountCents)}</sum:CuotaRepercutida></sum:DetalleDesglose>`;
  }).join("");
  return `<sum:RegistroAlta><sum:IDVersion>${record.schemaVersion}</sum:IDVersion><sum:IDFactura><sum:IDEmisorFactura>${xml(record.issuerNif)}</sum:IDEmisorFactura><sum:NumSerieFactura>${xml(record.invoiceNumber)}</sum:NumSerieFactura><sum:FechaExpedicionFactura>${xml(record.issueDate)}</sum:FechaExpedicionFactura></sum:IDFactura><sum:NombreRazonEmisor>${xml(record.issuerLegalName)}</sum:NombreRazonEmisor><sum:TipoFactura>${record.invoiceType}</sum:TipoFactura>${record.rectificationType ? `<sum:TipoRectificativa>${record.rectificationType}</sum:TipoRectificativa>` : ""}${correctedInvoicesXml(record)}${substitutedInvoicesXml(record)}<sum:DescripcionOperacion>${xml(record.description)}</sum:DescripcionOperacion>${customer}<sum:Desglose>${breakdown}</sum:Desglose><sum:CuotaTotal>${formatAeatAmount(record.taxAmountCents)}</sum:CuotaTotal><sum:ImporteTotal>${formatAeatAmount(record.totalCents)}</sum:ImporteTotal><sum:Encadenamiento>${previousXml(record.previous)}</sum:Encadenamiento>${softwareXml(record.software)}<sum:FechaHoraHusoGenRegistro>${xml(record.generatedAt)}</sum:FechaHoraHusoGenRegistro><sum:TipoHuella>${record.hashAlgorithm}</sum:TipoHuella><sum:Huella>${record.hash}</sum:Huella></sum:RegistroAlta>`;
}

function cancellationXml(record: FiscalCancellationRecord): string {
  return `<sum:RegistroAnulacion><sum:IDVersion>${record.schemaVersion}</sum:IDVersion><sum:IDFactura><sum:IDEmisorFacturaAnulada>${xml(record.issuerNif)}</sum:IDEmisorFacturaAnulada><sum:NumSerieFacturaAnulada>${xml(record.invoiceNumber)}</sum:NumSerieFacturaAnulada><sum:FechaExpedicionFacturaAnulada>${xml(record.issueDate)}</sum:FechaExpedicionFacturaAnulada></sum:IDFactura><sum:Encadenamiento>${previousXml(record.previous)}</sum:Encadenamiento>${softwareXml(record.software)}<sum:FechaHoraHusoGenRegistro>${xml(record.generatedAt)}</sum:FechaHoraHusoGenRegistro><sum:TipoHuella>${record.hashAlgorithm}</sum:TipoHuella><sum:Huella>${record.hash}</sum:Huella></sum:RegistroAnulacion>`;
}

export function buildVerifactuSoapEnvelope(input: {
  taxpayerLegalName: string;
  taxpayerNif: string;
  records: readonly FiscalRecord[];
}): string {
  if (input.records.length < 1 || input.records.length > 1_000) {
    throw new Error("AEAT_RECORD_BATCH_SIZE_INVALID");
  }
  const records = input.records.map((record) =>
    `<sum1:RegistroFactura>${record.kind === "alta" ? registrationXml(record) : cancellationXml(record)}</sum1:RegistroFactura>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${AEAT_XML_NAMESPACES.soap}" xmlns:sum1="${AEAT_XML_NAMESPACES.suministroLR}" xmlns:sum="${AEAT_XML_NAMESPACES.suministroInformacion}"><soapenv:Header/><soapenv:Body><sum1:RegFactuSistemaFacturacion><sum1:Cabecera><sum:ObligadoEmision><sum:NombreRazon>${xml(input.taxpayerLegalName)}</sum:NombreRazon><sum:NIF>${xml(input.taxpayerNif)}</sum:NIF></sum:ObligadoEmision></sum1:Cabecera>${records}</sum1:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;
}

export function markVerifactuEnvelopeAsIncident(envelope: string): string {
  if (envelope.includes("<sum:RemisionVoluntaria>")) return envelope;
  const marker = "</sum:ObligadoEmision>";
  if (!envelope.includes(marker)) throw new Error("FISCAL_XML_HEADER_INVALID");
  return envelope.replace(marker, `${marker}<sum:RemisionVoluntaria><sum:Incidencia>S</sum:Incidencia></sum:RemisionVoluntaria>`);
}
