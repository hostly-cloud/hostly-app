import {
  handleProductCommercialIdentityRequestSafe,
} from "@/lib/server/product-images/handle-product-commercial-identity-request";

export async function GET(req: Request) {
  return handleProductCommercialIdentityRequestSafe(req, "GET");
}

export async function POST(req: Request) {
  return handleProductCommercialIdentityRequestSafe(req, "POST");
}
