import { firebaseEnvDebug, isFirebaseConfigured } from "@/lib/firebase/client";

export default function CartaPage() {
  return (
    <div style={{ color: "white", padding: 20 }}>
      <h1>Carta</h1>
      <p>isFirebaseConfigured: {isFirebaseConfigured ? "true" : "false"}</p>
      <p>apiKey: {firebaseEnvDebug.apiKey ?? ""}</p>
      <p>projectId: {firebaseEnvDebug.projectId ?? ""}</p>
      <p>authDomain: {firebaseEnvDebug.authDomain ?? ""}</p>
    </div>
  );
}
