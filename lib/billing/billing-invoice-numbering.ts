import { FirebaseError } from "firebase/app";
import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  formatBillingInvoiceNumber,
  getBillingInvoiceSeriesConfig,
} from "@/lib/billing/billing-invoice-series-config";

const COUNTERS_COLLECTION = "billingInvoiceCounters";

export type AllocatedInvoiceNumber = {
  invoiceNumber: string;
  invoiceSeries: string;
  sequence: number;
  year: number;
};

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

/** Reserva el siguiente número de factura de forma atómica por restaurante y año. */
export async function allocateNextBillingInvoiceNumber(
  restaurantId: string,
): Promise<AllocatedInvoiceNumber> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("allocateNextBillingInvoiceNumber: restaurantId vacío");

  const config = await getBillingInvoiceSeriesConfig(rid);
  const year = new Date().getFullYear();
  const counterRef = doc(db, COUNTERS_COLLECTION, rid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      let lastSequence = 0;

      if (snap.exists()) {
        const data = snap.data() as DocumentData;
        const storedYear =
          typeof data.year === "number" && Number.isFinite(data.year)
            ? data.year
            : year;
        const storedSeq =
          typeof data.lastSequence === "number" && Number.isFinite(data.lastSequence)
            ? data.lastSequence
            : 0;
        lastSequence = storedYear === year ? storedSeq : 0;
      }

      const sequence = lastSequence + 1;
      const { invoiceNumber, invoiceSeries } = formatBillingInvoiceNumber(
        config,
        year,
        sequence,
      );

      tx.set(
        counterRef,
        {
          restaurantId: rid,
          seriesCode: invoiceSeries,
          year,
          lastSequence: sequence,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      return { invoiceNumber, invoiceSeries, sequence, year };
    });
  } catch (e) {
    rethrowWithMessage(e);
  }
}
