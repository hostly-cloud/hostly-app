import { auth } from "@/lib/firebase/client";

export function isAuthReady() {
  return !!auth.currentUser;
}
