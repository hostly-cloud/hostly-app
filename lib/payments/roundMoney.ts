/** Redondeo seguro a céntimos (evita 35 - 25 = 9.999… en float). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Tolerancia para comparar importes en euros ya redondeados. */
export const MONEY_EPS = 0.005;
