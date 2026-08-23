export type ProductCommercialIdentity = {
  productId: string;
  brand: string;
  quantity: string;
  barcode: string;
};

export type ProductCommercialIdentityInput = {
  productId: string;
  brand: string;
  quantity: string;
  barcode: string;
};

export type ProductCommercialIdentityApiResponse =
  | { ok: true; identity: ProductCommercialIdentity }
  | { ok: false; error: string; details?: string | null };
