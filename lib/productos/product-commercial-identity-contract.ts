export type ProductCommercialIdentity = {
  productId: string;
  brand: string;
  quantity: string;
  barcode: string;
  wineProducer: string;
  wineAppellation: string;
  wineVintage: string;
};

export type ProductCommercialIdentityInput = {
  productId: string;
  brand: string;
  quantity: string;
  barcode: string;
  wineProducer: string;
  wineAppellation: string;
  wineVintage: string;
};

export type ProductCommercialIdentityApiResponse =
  | { ok: true; identity: ProductCommercialIdentity }
  | { ok: false; error: string; details?: string | null };
