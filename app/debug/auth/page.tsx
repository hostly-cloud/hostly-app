"use client";

import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { normalizeInviteEmail } from "@/lib/firestore/restaurant-invites";

type PermissionStatus =
  | "ok_exists"
  | "ok_missing"
  | "permission_denied"
  | "unavailable"
  | "unknown_error";

type PermissionRow = {
  path: string;
  status: PermissionStatus | "skipped_no_uid" | "skipped_no_email";
  code: string | null;
  shortMessage: string;
  keys?: string[];
  restaurantId?: unknown;
  restaurantName?: unknown;
  name?: unknown;
  role?: unknown;
};

type DocReadResult = {
  path: string;
  loading: boolean;
  exists: boolean | null;
  keys: string[];
  restaurantIdValue: unknown;
  restaurantNameValue: unknown;
  nameValue: unknown;
  roleValue: unknown;
  json: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type RestaurantReadResult = {
  path: string;
  loading: boolean;
  exists: boolean | null;
  nameValue: unknown;
  json: string;
  errorCode: string | null;
  errorMessage: string | null;
};

type InviteProbeState = {
  pathDescription: string;
  loading: boolean;
  status: PermissionStatus | "skipped_no_email";
  code: string | null;
  shortMessage: string;
  pendingCount: number | null;
  sampleDocId: string | null;
};

function truncateMsg(s: string, max = 140): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function classifyRead(
  exists: boolean | null,
  errorCode: string | null,
  errorMessage: string | null,
): { status: PermissionStatus; shortMessage: string; code: string | null } {
  if (errorMessage || errorCode) {
    const code = errorCode ?? "unknown";
    const msg = truncateMsg(errorMessage ?? "");
    if (code === "permission-denied") {
      return { status: "permission_denied", shortMessage: msg, code };
    }
    if (code === "unavailable") {
      return { status: "unavailable", shortMessage: msg, code };
    }
    return { status: "unknown_error", shortMessage: msg, code };
  }
  if (exists === true) {
    return { status: "ok_exists", shortMessage: "", code: null };
  }
  if (exists === false) {
    return { status: "ok_missing", shortMessage: "", code: null };
  }
  return {
    status: "unknown_error",
    shortMessage: "estado indeterminado",
    code: null,
  };
}

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeForJson);
  if (
    typeof (value as { toMillis?: () => number }).toMillis === "function"
  ) {
    const ts = value as { toMillis: () => number; toDate?: () => Date };
    return {
      __firestoreTimestamp: true,
      millis: ts.toMillis(),
      iso: typeof ts.toDate === "function" ? ts.toDate().toISOString() : null,
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sanitizeForJson(v);
  }
  return out;
}

function emptyDocResult(path: string): DocReadResult {
  return {
    path,
    loading: true,
    exists: null,
    keys: [],
    restaurantIdValue: undefined,
    restaurantNameValue: undefined,
    nameValue: undefined,
    roleValue: undefined,
    json: "",
    errorCode: null,
    errorMessage: null,
  };
}

async function readProfileDoc(
  collectionId: string,
  uid: string,
): Promise<Omit<DocReadResult, "loading">> {
  const path = `${collectionId}/${uid}`;
  try {
    const snap = await getDoc(doc(db, collectionId, uid));
    const exists = snap.exists();
    if (!exists) {
      return {
        path,
        exists: false,
        keys: [],
        restaurantIdValue: undefined,
        restaurantNameValue: undefined,
        nameValue: undefined,
        roleValue: undefined,
        json: "(sin documento)",
        errorCode: null,
        errorMessage: null,
      };
    }
    const data = snap.data() as Record<string, unknown>;
    const keys = Object.keys(data);
    return {
      path,
      exists: true,
      keys,
      restaurantIdValue: data.restaurantId,
      restaurantNameValue: data.restaurantName,
      nameValue: data.name,
      roleValue: data.role,
      json: JSON.stringify(sanitizeForJson(data), null, 2),
      errorCode: null,
      errorMessage: null,
    };
  } catch (e) {
    const fe = e instanceof FirebaseError ? e : null;
    return {
      path,
      exists: null,
      keys: [],
      restaurantIdValue: undefined,
      restaurantNameValue: undefined,
      nameValue: undefined,
      roleValue: undefined,
      json: "",
      errorCode: fe?.code ?? "unknown",
      errorMessage: fe?.message ?? String(e),
    };
  }
}

async function readRestaurantDoc(
  restaurantId: string,
): Promise<Omit<RestaurantReadResult, "loading">> {
  const path = `restaurants/${restaurantId}`;
  try {
    const snap = await getDoc(doc(db, "restaurants", restaurantId));
    const exists = snap.exists();
    if (!exists) {
      return {
        path,
        exists: false,
        nameValue: undefined,
        json: "(sin documento)",
        errorCode: null,
        errorMessage: null,
      };
    }
    const data = snap.data() as Record<string, unknown>;
    return {
      path,
      exists: true,
      nameValue: data.name,
      json: JSON.stringify(sanitizeForJson(data), null, 2),
      errorCode: null,
      errorMessage: null,
    };
  } catch (e) {
    const fe = e instanceof FirebaseError ? e : null;
    return {
      path,
      exists: null,
      nameValue: undefined,
      json: "",
      errorCode: fe?.code ?? "unknown",
      errorMessage: fe?.message ?? String(e),
    };
  }
}

async function probeRestaurantInvitesQuery(email: string): Promise<InviteProbeState> {
  const normalized = normalizeInviteEmail(email);
  const pathDescription = `query restaurant_invites (email=="${normalized}", status=="pending") — no hay doc fijo restaurant_invites/{email}`;
  if (!normalized || !normalized.includes("@")) {
    return {
      pathDescription,
      loading: false,
      status: "skipped_no_email",
      code: null,
      shortMessage: "sin email en sesión",
      pendingCount: null,
      sampleDocId: null,
    };
  }
  try {
    const q = query(
      collection(db, "restaurant_invites"),
      where("email", "==", normalized),
      where("status", "==", "pending"),
      limit(25),
    );
    const snap = await getDocs(q);
    const first = snap.docs[0];
    return {
      pathDescription,
      loading: false,
      status: snap.empty ? "ok_missing" : "ok_exists",
      code: null,
      shortMessage: snap.empty
        ? "0 invitaciones pendientes"
        : `${snap.size} doc(s) pendiente(s)`,
      pendingCount: snap.size,
      sampleDocId: first?.id ?? null,
    };
  } catch (e) {
    const fe = e instanceof FirebaseError ? e : null;
    const code = fe?.code ?? "unknown";
    let status: PermissionStatus = "unknown_error";
    if (code === "permission-denied") status = "permission_denied";
    else if (code === "unavailable") status = "unavailable";
    return {
      pathDescription,
      loading: false,
      status,
      code,
      shortMessage: truncateMsg(fe?.message ?? String(e)),
      pendingCount: null,
      sampleDocId: null,
    };
  }
}

function profileToPermissionRow(
  r: DocReadResult,
): PermissionRow | null {
  if (r.loading) return null;
  if (!r.path.includes("/") || r.path.includes("(sin")) {
    return {
      path: r.path,
      status: "skipped_no_uid",
      code: null,
      shortMessage: r.json || "omitido",
    };
  }
  const c = classifyRead(r.exists, r.errorCode, r.errorMessage);
  return {
    path: r.path,
    status: c.status,
    code: c.code,
    shortMessage: c.shortMessage,
    keys: r.keys.length ? r.keys : undefined,
    restaurantId: r.restaurantIdValue,
    restaurantName: r.restaurantNameValue,
    name: r.nameValue,
    role: r.roleValue,
  };
}

function restaurantToPermissionRow(
  id: string,
  r: RestaurantReadResult & { loading: boolean },
): PermissionRow | null {
  if (r.loading) return null;
  const c = classifyRead(r.exists, r.errorCode, r.errorMessage);
  return {
    path: r.path,
    status: c.status,
    code: c.code,
    shortMessage: c.shortMessage,
    keys: undefined,
    restaurantId: undefined,
    restaurantName: undefined,
    name: r.nameValue,
    role: undefined,
  };
}

function inviteToPermissionRow(inv: InviteProbeState): PermissionRow {
  if (inv.loading) {
    return {
      path: inv.pathDescription,
      status: "unknown_error",
      code: null,
      shortMessage: "cargando…",
    };
  }
  if (inv.status === "skipped_no_email") {
    return {
      path: inv.pathDescription,
      status: "skipped_no_email",
      code: null,
      shortMessage: inv.shortMessage,
    };
  }
  return {
    path: inv.pathDescription,
    status: inv.status,
    code: inv.code,
    shortMessage: inv.shortMessage,
    restaurantId: undefined,
    restaurantName: undefined,
    name: inv.sampleDocId ? `(sample doc id: ${inv.sampleDocId})` : undefined,
    role: inv.pendingCount != null ? `(count: ${inv.pendingCount})` : undefined,
  };
}

function Block({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        background: "#f8fafc",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Err({ children }: { children: ReactNode }) {
  return (
    <p style={{ color: "#b91c1c", fontWeight: 600, margin: "8px 0" }}>
      {children}
    </p>
  );
}

function statusColor(status: PermissionRow["status"]): string {
  if (status === "ok_exists") return "#15803d";
  if (status === "ok_missing") return "#a16207";
  if (status === "permission_denied") return "#b91c1c";
  if (status === "unavailable") return "#c2410c";
  if (
    status === "skipped_no_uid" ||
    status === "skipped_no_email"
  ) {
    return "#64748b";
  }
  return "#7c3aed";
}

export default function DebugAuthPage() {
  const {
    user,
    ready,
    profileReady,
    restaurantId: ctxRestaurantId,
    restaurantName: ctxRestaurantName,
    role,
  } = useAuth();

  const uid = user?.uid ?? null;
  const email = user?.email ?? null;
  const readKey = `${uid ?? ""}:${email ?? ""}:${ctxRestaurantId ?? ""}`;
  const [readState, setReadState] = useState<{
    key: string;
    usersDoc: DocReadResult;
    usuariosDoc: DocReadResult;
    restaurantReads: Record<
      string,
      RestaurantReadResult & { loading: boolean }
    >;
    inviteProbe: InviteProbeState;
  } | null>(null);
  const canProbe = Boolean(isFirebaseConfigured && uid);
  const currentReadState =
    canProbe && readState?.key === readKey ? readState : null;
  const { usersDoc, usuariosDoc, restaurantReads, inviteProbe } = useMemo(() => {
    if (canProbe) {
      return {
        usersDoc:
          currentReadState?.usersDoc ?? emptyDocResult(`users/${uid}`),
        usuariosDoc:
          currentReadState?.usuariosDoc ?? emptyDocResult(`usuarios/${uid}`),
        restaurantReads: currentReadState?.restaurantReads ?? {},
        inviteProbe:
          currentReadState?.inviteProbe ?? ({
            pathDescription:
              "query restaurant_invites (email, status=pending) — patrón Hostly",
            loading: true,
            status: "ok_missing",
            code: null,
            shortMessage: "",
            pendingCount: null,
            sampleDocId: null,
          } satisfies InviteProbeState),
      };
    }
    return {
      usersDoc: {
        ...emptyDocResult("users/(sin uid)"),
        loading: false,
        json: "(omitido: sin usuario o Firebase)",
      },
      usuariosDoc: {
        ...emptyDocResult("usuarios/(sin uid)"),
        loading: false,
        json: "(omitido: sin usuario o Firebase)",
      },
      restaurantReads: {},
      inviteProbe: {
        pathDescription:
          "query restaurant_invites — sin uid / sin Firebase en cliente",
        loading: false,
        status: "skipped_no_email",
        code: null,
        shortMessage: "omitido",
        pendingCount: null,
        sampleDocId: null,
      } satisfies InviteProbeState,
    };
  }, [canProbe, currentReadState, uid]);

  useEffect(() => {
    if (!canProbe || !uid) return;

    let cancelled = false;

    void (async () => {
      const [u, o, invite] = await Promise.all([
        readProfileDoc("users", uid),
        readProfileDoc("usuarios", uid),
        email != null && email.trim() !== ""
          ? probeRestaurantInvitesQuery(email)
          : Promise.resolve({
              pathDescription:
                "query restaurant_invites — sin email en sesión Hostly",
              loading: false,
              status: "skipped_no_email" as const,
              code: null,
              shortMessage: "sin email",
              pendingCount: null,
              sampleDocId: null,
            } satisfies InviteProbeState),
      ]);
      if (cancelled) return;

      const ids = new Set<string>();
      const push = (v: unknown) => {
        if (typeof v === "string" && v.trim() !== "") ids.add(v.trim());
      };
      push(ctxRestaurantId);
      push(u.restaurantIdValue);
      push(o.restaurantIdValue);

      const resolvedRestaurants = await Promise.all(
        [...ids].map(async (id) => [id, await readRestaurantDoc(id)] as const),
      );
      if (cancelled) return;
      const nextReads = Object.fromEntries(
        resolvedRestaurants.map(([id, result]) => [
          id,
          { ...result, loading: false },
        ]),
      );
      setReadState({
        key: readKey,
        usersDoc: { ...u, loading: false },
        usuariosDoc: { ...o, loading: false },
        restaurantReads: nextReads,
        inviteProbe: invite,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [canProbe, ctxRestaurantId, email, readKey, uid]);

  const candidates = useMemo(() => {
    const out: string[] = [];
    const add = (v: unknown) => {
      if (typeof v === "string" && v.trim() !== "") out.push(v.trim());
    };
    add(ctxRestaurantId);
    if (!usersDoc.loading) add(usersDoc.restaurantIdValue);
    if (!usuariosDoc.loading) add(usuariosDoc.restaurantIdValue);
    return [...new Set(out)];
  }, [
    ctxRestaurantId,
    usersDoc.restaurantIdValue,
    usuariosDoc.restaurantIdValue,
    usersDoc.loading,
    usuariosDoc.loading,
  ]);

  const permissionRows = useMemo((): PermissionRow[] => {
    const rows: PermissionRow[] = [];
    const ur = profileToPermissionRow(usersDoc);
    const or = profileToPermissionRow(usuariosDoc);
    if (ur) rows.push(ur);
    if (or) rows.push(or);
    rows.push(inviteToPermissionRow(inviteProbe));
    for (const id of candidates) {
      const rr = restaurantReads[id];
      if (rr) {
        const row = restaurantToPermissionRow(id, rr);
        if (row) rows.push(row);
      }
    }
    return rows;
  }, [usersDoc, usuariosDoc, inviteProbe, candidates, restaurantReads]);

  const diagnosisLines = useMemo(() => {
    const lines: string[] = [];
    if (!uid || !isFirebaseConfigured) {
      lines.push(
        "Inicia sesión con Firebase configurado para evaluar permisos y perfiles.",
      );
      return lines;
    }

    const uc = classifyRead(
      usersDoc.exists,
      usersDoc.errorCode,
      usersDoc.errorMessage,
    );
    const oc = classifyRead(
      usuariosDoc.exists,
      usuariosDoc.errorCode,
      usuariosDoc.errorMessage,
    );

    if (
      uc.status === "permission_denied" &&
      oc.status === "permission_denied"
    ) {
      lines.push(
        "Problema probable: Firestore rules bloquean lectura del perfil.",
      );
    }

    if (
      uc.status === "ok_missing" &&
      oc.status === "ok_missing" &&
      !usersDoc.loading &&
      !usuariosDoc.loading
    ) {
      lines.push(
        "Problema probable: el usuario autenticado no tiene perfil creado.",
      );
    }

    const ridU =
      typeof usersDoc.restaurantIdValue === "string"
        ? usersDoc.restaurantIdValue.trim()
        : "";
    const ridO =
      typeof usuariosDoc.restaurantIdValue === "string"
        ? usuariosDoc.restaurantIdValue.trim()
        : "";

    const docsExist =
      uc.status === "ok_exists" ||
      oc.status === "ok_exists";
    const noRidInProfiles = !ridU && !ridO;
    const ctxRid =
      typeof ctxRestaurantId === "string"
        ? ctxRestaurantId.trim()
        : "";

    if (
      docsExist &&
      noRidInProfiles &&
      !ctxRid &&
      !usersDoc.loading &&
      !usuariosDoc.loading
    ) {
      lines.push(
        "Problema probable: falta restaurantId en el perfil del usuario.",
      );
    }

    let restaurantDenied = false;
    for (const id of candidates) {
      const rr = restaurantReads[id];
      if (!rr || rr.loading) continue;
      if (rr.errorCode === "permission-denied") {
        restaurantDenied = true;
        break;
      }
    }
    if (restaurantDenied) {
      lines.push(
        "Problema probable: reglas bloquean lectura del restaurante.",
      );
    }

    const profileHasRid = Boolean(ridU || ridO);
    let anyRestaurantOk = false;
    for (const id of candidates) {
      const rr = restaurantReads[id];
      if (rr && !rr.loading && rr.exists === true) {
        anyRestaurantOk = true;
        break;
      }
    }
    if (
      profileReady &&
      !ctxRid &&
      (profileHasRid || candidates.length > 0) &&
      anyRestaurantOk
    ) {
      lines.push("Problema probable: bug en AuthProvider/helper.");
    }

    if (lines.length === 0) {
      lines.push(
        "Datos y permisos parecen correctos; revisar lógica de layout/páginas.",
      );
    }

    return lines;
  }, [
    uid,
    usersDoc,
    usuariosDoc,
    restaurantReads,
    candidates,
    ctxRestaurantId,
    profileReady,
  ]);

  const missingRestaurantId = useMemo(() => {
    if (!profileReady) return false;
    const hasCtx =
      typeof ctxRestaurantId === "string" && ctxRestaurantId.trim() !== "";
    return !hasCtx;
  }, [profileReady, ctxRestaurantId]);

  const nodeEnv =
    typeof process !== "undefined" ? process.env.NODE_ENV : "unknown";

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>
        Debug Auth / Restaurante
      </h1>

      <p
        style={{
          padding: 12,
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        Ruta temporal de diagnóstico. No usar en producción.
        {nodeEnv === "production" ? (
          <strong style={{ display: "block", marginTop: 8, color: "#b45309" }}>
            Estás en NODE_ENV=production: oculta esta ruta o protégela antes de
            exponer la app.
          </strong>
        ) : null}
      </p>

      <Block title="AUTH">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Firebase configurado (cliente):{" "}
            <strong>{isFirebaseConfigured ? "sí" : "no"}</strong>
          </li>
          <li>
            Usuario autenticado: <strong>{user ? "sí" : "no"}</strong>
          </li>
          <li>
            uid:{" "}
            <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
              {uid ?? "(null)"}
            </code>
          </li>
          <li>
            email:{" "}
            <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
              {email ?? "(null)"}
            </code>
          </li>
          <li>
            NODE_ENV: <strong>{nodeEnv}</strong>
          </li>
        </ul>
      </Block>

      <Block title="CONTEXT (useAuth)">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            ready: <strong>{String(ready)}</strong>
          </li>
          <li>
            profileReady: <strong>{String(profileReady)}</strong>
          </li>
          <li>
            restaurantId:{" "}
            <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
              {ctxRestaurantId ?? "(null)"}
            </code>
          </li>
          <li>
            restaurantName:{" "}
            <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
              {ctxRestaurantName ?? "(null)"}
            </code>
          </li>
          <li>
            role:{" "}
            <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
              {role}
            </code>
          </li>
        </ul>
        {missingRestaurantId ? (
          <p style={{ marginTop: 12, color: "#92400e", fontWeight: 600 }}>
            Aviso: con profileReady=true no hay restaurantId en el contexto.
            Revisa lecturas Firestore abajo (documentos inexistentes,
            campo vacío o permission-denied).
          </p>
        ) : null}
      </Block>

      <Block title="Detected restaurantId candidates">
        {candidates.length === 0 ? (
          <p style={{ fontWeight: 600 }}>
            No se encontró ningún restaurantId en contexto ni perfiles.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {candidates.map((id) => (
              <li key={id}>
                <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                  {id}
                </code>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Firestore Permissions Check">
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          Misma lectura que usa la app (<code>getDoc</code> /{" "}
          <code>getDocs</code>), clasificada por resultado.
        </p>
        {permissionRows.map((row, i) => (
          <div
            key={`${row.path}-${i}`}
            style={{
              marginBottom: 12,
              padding: 12,
              background: "#fff",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
            }}
          >
            <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13 }}>
              Path:{" "}
              <code style={{ wordBreak: "break-all" }}>{row.path}</code>
            </p>
            <p style={{ margin: "0 0 4px" }}>
              status:{" "}
              <strong style={{ color: statusColor(row.status) }}>
                {row.status}
              </strong>
              {row.code ? (
                <>
                  {" "}
                  · code:{" "}
                  <code style={{ background: "#f1f5f9", padding: "1px 4px" }}>
                    {row.code}
                  </code>
                </>
              ) : null}
            </p>
            {row.shortMessage ? (
              <p style={{ margin: "4px 0", fontSize: 13 }}>{row.shortMessage}</p>
            ) : null}
            {(row.keys && row.keys.length > 0) ||
            row.restaurantId !== undefined ||
            row.restaurantName !== undefined ||
            row.name !== undefined ||
            row.role !== undefined ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {row.keys && row.keys.length ? (
                  <li>
                    keys:{" "}
                    <code>{row.keys.join(", ")}</code>
                  </li>
                ) : null}
                {row.restaurantId !== undefined ? (
                  <li>
                    restaurantId:{" "}
                    <code>{JSON.stringify(row.restaurantId)}</code>
                  </li>
                ) : null}
                {row.restaurantName !== undefined ? (
                  <li>
                    restaurantName:{" "}
                    <code>{JSON.stringify(row.restaurantName)}</code>
                  </li>
                ) : null}
                {row.name !== undefined ? (
                  <li>
                    name: <code>{JSON.stringify(row.name)}</code>
                  </li>
                ) : null}
                {row.role !== undefined ? (
                  <li>
                    role: <code>{JSON.stringify(row.role)}</code>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ))}
      </Block>

      <Block title="FIRESTORE — users/{uid}">
        {usersDoc.loading ? (
          <p>Cargando…</p>
        ) : usersDoc.errorMessage && usersDoc.exists === null ? (
          <Err>
            {usersDoc.errorCode}: {usersDoc.errorMessage}
          </Err>
        ) : (
          <>
            <p>
              exists: <strong>{String(usersDoc.exists)}</strong>
            </p>
            <p>
              keys:{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                {usersDoc.keys.length ? usersDoc.keys.join(", ") : "(ninguna)"}
              </code>
            </p>
            <p>
              restaurantId (valor en doc):{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                {JSON.stringify(usersDoc.restaurantIdValue)}
              </code>
            </p>
            <p>
              restaurantName / name / role:{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                restaurantName={JSON.stringify(usersDoc.restaurantNameValue)},
                name={JSON.stringify(usersDoc.nameValue)}, role=
                {JSON.stringify(usersDoc.roleValue)}
              </code>
            </p>
            <pre
              style={{
                fontSize: 12,
                overflow: "auto",
                background: "#fff",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #e2e8f0",
              }}
            >
              {usersDoc.json}
            </pre>
          </>
        )}
      </Block>

      <Block title="FIRESTORE — usuarios/{uid}">
        {usuariosDoc.loading ? (
          <p>Cargando…</p>
        ) : usuariosDoc.errorMessage && usuariosDoc.exists === null ? (
          <Err>
            {usuariosDoc.errorCode}: {usuariosDoc.errorMessage}
          </Err>
        ) : (
          <>
            <p>
              exists: <strong>{String(usuariosDoc.exists)}</strong>
            </p>
            <p>
              keys:{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                {usuariosDoc.keys.length
                  ? usuariosDoc.keys.join(", ")
                  : "(ninguna)"}
              </code>
            </p>
            <p>
              restaurantId (valor en doc):{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                {JSON.stringify(usuariosDoc.restaurantIdValue)}
              </code>
            </p>
            <p>
              restaurantName / name / role:{" "}
              <code style={{ background: "#e2e8f0", padding: "2px 6px" }}>
                restaurantName={JSON.stringify(usuariosDoc.restaurantNameValue)},
                name={JSON.stringify(usuariosDoc.nameValue)}, role=
                {JSON.stringify(usuariosDoc.roleValue)}
              </code>
            </p>
            <pre
              style={{
                fontSize: 12,
                overflow: "auto",
                background: "#fff",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #e2e8f0",
              }}
            >
              {usuariosDoc.json}
            </pre>
          </>
        )}
      </Block>

      <Block title="FIRESTORE — restaurants/{restaurantId}">
        {!uid ? (
          <p>Sin uid; no se consultan restaurantes.</p>
        ) : candidates.length === 0 ? (
          <p>
            No hay ningún restaurantId deducido del contexto ni de los perfiles
            anteriores (no se llama a restaurants/*).
          </p>
        ) : (
          candidates.map((id) => {
            const r = restaurantReads[id];
            return (
              <div
                key={id}
                style={{
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottom: "1px dashed #cbd5e1",
                }}
              >
                <p style={{ fontWeight: 700 }}>ID: {id}</p>
                {!r || r.loading ? (
                  <p>Cargando…</p>
                ) : r.errorMessage && r.exists === null ? (
                  <Err>
                    {r.errorCode}: {r.errorMessage}
                  </Err>
                ) : (
                  <>
                    <p>
                      exists: <strong>{String(r.exists)}</strong>
                    </p>
                    <p>
                      name:{" "}
                      <code
                        style={{ background: "#e2e8f0", padding: "2px 6px" }}
                      >
                        {JSON.stringify(r.nameValue)}
                      </code>
                    </p>
                    <pre
                      style={{
                        fontSize: 12,
                        overflow: "auto",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {r.json}
                    </pre>
                  </>
                )}
              </div>
            );
          })
        )}
      </Block>

      <Block title="Diagnosis">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {diagnosisLines.map((line, idx) => (
            <li key={idx} style={{ marginBottom: 8 }}>
              {line}
            </li>
          ))}
        </ul>
      </Block>

      <p style={{ fontSize: 12, color: "#64748b" }}>
        Solo lecturas (getDoc / getDocs). Sin escrituras ni cambios en AuthProvider
        ni reglas.
      </p>
    </div>
  );
}
