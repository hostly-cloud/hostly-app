import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getSecurityRules } from "firebase-admin/security-rules";

const EXPECTED_BRANCH = "ops/deploy-firestore-rbac-rules-once";
const EXPECTED_PROJECT = "hostly-app-8b902";

const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
if (branch !== EXPECTED_BRANCH) {
  console.log(`[firebase-rules] skip: branch ${branch || "unknown"} is not ${EXPECTED_BRANCH}`);
  process.exit(0);
}

const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

if (projectId !== EXPECTED_PROJECT) {
  throw new Error(`[firebase-rules] refusing deployment: FIREBASE_PROJECT_ID=${projectId || "missing"}`);
}
if (!clientEmail || !rawPrivateKey) {
  throw new Error("[firebase-rules] Firebase Admin service-account environment is incomplete");
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
    }),
  });
}

const source = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
const securityRules = getSecurityRules();
const normalize = (value) => String(value || "").replace(/\r\n/g, "\n").trim();

const current = await securityRules.getFirestoreRuleset();
const currentFile = current.source.find((file) => file.name === "firestore.rules") || current.source[0];

if (currentFile && normalize(currentFile.content) === normalize(source)) {
  console.log(`[firebase-rules] already current: project=${projectId} ruleset=${current.name}`);
  process.exit(0);
}

const released = await securityRules.releaseFirestoreRulesetFromSource(source);
const verified = await securityRules.getFirestoreRuleset();
const verifiedFile = verified.source.find((file) => file.name === "firestore.rules") || verified.source[0];

if (!verifiedFile || normalize(verifiedFile.content) !== normalize(source)) {
  throw new Error("[firebase-rules] deployment returned but active Firestore rules do not match repository source");
}

console.log(`[firebase-rules] deployed and verified: project=${projectId} ruleset=${released.name}`);
