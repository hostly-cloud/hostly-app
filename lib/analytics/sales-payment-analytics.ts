export type PaidSaleReference = {
  id: string;
  orderId?: string;
  ticketNumber?: string;
};

export function paidSaleIdentity(payment: PaidSaleReference): string {
  return payment.orderId?.trim() || payment.ticketNumber?.trim() || payment.id;
}

export function countDistinctPaidSales(payments: PaidSaleReference[]): number {
  return new Set(payments.map(paidSaleIdentity)).size;
}
