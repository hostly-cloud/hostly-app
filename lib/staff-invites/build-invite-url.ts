export function getStaffInviteBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "https://hostlyapp.app";
}

export function buildStaffInviteUrl(token: string, baseUrl = getStaffInviteBaseUrl()): string {
  const safeToken = encodeURIComponent(token.trim());
  return `${baseUrl.replace(/\/$/, "")}/invite/${safeToken}`;
}
