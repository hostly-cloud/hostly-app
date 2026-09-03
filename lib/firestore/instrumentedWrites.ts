/**
 * Delegación a la SDK de Firestore sin logs (mismas firmas que durante el diagnóstico).
 */

import {
  addDoc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type SetOptions,
  type Transaction,
  type UpdateData,
} from "firebase/firestore";

export type FsWriteDebugContext = {
  label: string;
  collection?: string;
  restaurantId?: unknown;
  tableId?: unknown;
  orderId?: unknown;
  paymentId?: unknown;
};

export async function dbgAddDoc(
  collectionRef: CollectionReference<DocumentData>,
  data: DocumentData,
  ctx: FsWriteDebugContext,
): Promise<DocumentReference<DocumentData>> {
  void ctx;
  return addDoc(collectionRef, data);
}

export async function dbgUpdateDoc(
  docRef: DocumentReference<DocumentData>,
  data: UpdateData<DocumentData>,
  ctx: FsWriteDebugContext,
): Promise<void> {
  void ctx;
  await updateDoc(docRef, data);
}

export async function dbgSetDoc(
  docRef: DocumentReference<DocumentData>,
  data: DocumentData,
  ctx: FsWriteDebugContext,
  options?: SetOptions,
): Promise<void> {
  void ctx;
  if (options) {
    await setDoc(docRef, data, options);
  } else {
    await setDoc(docRef, data);
  }
}

export class DbgWriteBatch {
  private readonly inner: ReturnType<typeof writeBatch>;

  constructor(db: Firestore, ctxBase: FsWriteDebugContext) {
    void ctxBase;
    this.inner = writeBatch(db);
  }

  update(
    docRef: DocumentReference<DocumentData>,
    data: UpdateData<DocumentData>,
  ): void {
    this.inner.update(docRef, data);
  }

  set(
    docRef: DocumentReference<DocumentData>,
    data: DocumentData,
    options?: SetOptions,
  ): void {
    if (options) {
      this.inner.set(docRef, data, options);
    } else {
      this.inner.set(docRef, data);
    }
  }

  delete(docRef: DocumentReference<DocumentData>): void {
    this.inner.delete(docRef);
  }

  async commit(): Promise<void> {
    await this.inner.commit();
  }
}

export function dbgTransactionUpdate(
  transaction: Transaction,
  docRef: DocumentReference<DocumentData>,
  data: UpdateData<DocumentData>,
  ctx: FsWriteDebugContext,
): void {
  void ctx;
  transaction.update(docRef, data);
}

export async function dbgRunTransaction<T>(
  db: Firestore,
  updateFn: (transaction: Transaction) => Promise<T>,
  ctx: FsWriteDebugContext,
): Promise<T> {
  void ctx;
  return runTransaction(db, updateFn);
}
