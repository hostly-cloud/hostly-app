export const MAX_PRODUCT_IMAGE_BYTES = 3 * 1024 * 1024;

export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PRODUCT_IMAGE_ACCEPT = ALLOWED_PRODUCT_IMAGE_MIME_TYPES.join(",");

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_PRODUCT_IMAGE_MIME_TYPES);

export type ProductImageCandidate = Pick<File, "name" | "type" | "size">;

export function validateProductImageCandidate(
  file: ProductImageCandidate,
): void {
  const mimeType = file.type.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("La imagen debe ser JPEG, PNG, WebP o GIF");
  }
  if (file.size <= 0) {
    throw new Error("La imagen está vacía");
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("La imagen supera 3 MB");
  }
}
