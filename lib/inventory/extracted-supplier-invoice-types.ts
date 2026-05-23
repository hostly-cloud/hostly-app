export type ExtractedSupplierInvoiceLineStatus = "matched" | "ambiguous" | "unmatched";

export type ExtractedSupplierInvoiceLine = {
  rawText?: string;
  detectedProductName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  matchedInventoryProductId?: string;
  matchedInventoryProductName?: string;
  confidence?: number;
  status: ExtractedSupplierInvoiceLineStatus;
};

export type ExtractedSupplierInvoiceDraft = {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  lines: ExtractedSupplierInvoiceLine[];
};

export type SupplierInvoiceUploadMeta = {
  storagePath: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type SupplierInvoiceExtractionSource = "vision_ai" | "mock_fallback" | "demo";

export type SupplierInvoiceExtractionMeta = {
  source: SupplierInvoiceExtractionSource;
  warnings: string[];
};

export type SupplierInvoiceExtractResponse = {
  ok: true;
  draft: ExtractedSupplierInvoiceDraft;
  upload: SupplierInvoiceUploadMeta;
  extractionMeta?: SupplierInvoiceExtractionMeta;
};
