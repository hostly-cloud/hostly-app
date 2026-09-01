export type VisionClientEnv = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

export type VisionClientOptions = {
  projectId: string;
  credentials: {
    client_email: string;
    private_key: string;
  };
};

/** Reutiliza la cuenta de servicio server-side que ya autentica Firebase Admin en Vercel. */
export function resolveVisionClientOptions(
  env: VisionClientEnv = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  },
): VisionClientOptions | undefined {
  const projectId = env.projectId?.trim();
  const clientEmail = env.clientEmail?.trim();
  const rawPrivateKey = env.privateKey?.trim();

  if (!projectId || !clientEmail || !rawPrivateKey) return undefined;

  return {
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: rawPrivateKey.replace(/\\n/g, "\n"),
    },
  };
}
