import {
  adjustCatalogImageCreditBalance,
  startCatalogImageCreditPeriod,
} from "../lib/server/product-images/administer-catalog-image-credits";
import { readCatalogImageCreditSummary } from "../lib/server/product-images/read-catalog-image-credit-summary";

function argument(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function integerArgument(name: string): number {
  const raw = argument(name);
  const parsed = Number(raw);
  if (!raw || !Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} debe ser un entero`);
  }
  return parsed;
}

function dateArgument(name: string): number {
  const raw = argument(name);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) {
    throw new Error(`--${name} debe ser una fecha ISO válida`);
  }
  return parsed;
}

async function main() {
  const command = process.argv[2];
  if (command !== "period" && command !== "adjust") {
    throw new Error("Uso: administer-catalog-image-credits.ts <period|adjust> [opciones]");
  }
  const restaurantId = argument("restaurant");
  const idempotencyKey = argument("idempotency-key");
  const operatorId = argument("operator");
  const reason = argument("reason");
  if (!restaurantId || !idempotencyKey || !operatorId || !reason) {
    throw new Error(
      "Faltan --restaurant, --idempotency-key, --operator o --reason",
    );
  }

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const db = getHostlyFirestore();
  if (!db) throw new Error("Firebase Admin no está configurado");
  const before = await readCatalogImageCreditSummary({ db, restaurantId });
  const apply = process.argv.includes("--apply");
  const intended =
    command === "period"
      ? {
          command,
          period: {
            id: argument("period-id"),
            startsAt: dateArgument("starts-at"),
            endsAt: dateArgument("ends-at"),
            allocation: integerArgument("allocation"),
          },
          replaceActivePeriod: process.argv.includes("--replace-active-period"),
        }
      : {
          command,
          delta: integerArgument("delta"),
          expectedPeriodId: argument("period-id") || undefined,
        };

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          applied: false,
          note: "Vista previa. Repite con --apply para escribir.",
          restaurantId,
          current: {
            plan: before.access.effectivePlan,
            meteringMode: before.access.meteringMode,
            creditBalance: before.access.creditBalance,
            period: before.period,
          },
          intended,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = command === "period"
    ? await startCatalogImageCreditPeriod({
        db,
        restaurantId,
        idempotencyKey,
        operatorId,
        reason,
        period: {
          id: argument("period-id"),
          startsAt: dateArgument("starts-at"),
          endsAt: dateArgument("ends-at"),
          allocation: integerArgument("allocation"),
        },
        replaceActivePeriod: process.argv.includes("--replace-active-period"),
      })
    : await adjustCatalogImageCreditBalance({
        db,
        restaurantId,
        idempotencyKey,
        operatorId,
        reason,
        delta: integerArgument("delta"),
        ...(argument("period-id")
          ? { expectedPeriodId: argument("period-id") }
          : {}),
      });
  console.log(JSON.stringify({ applied: true, restaurantId, result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
