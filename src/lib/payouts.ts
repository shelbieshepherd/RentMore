// RentVue - Owner Payout Calculation Engine
// Minimal structural types: callers may pass their own row shapes (store types
// from ./data, or DB-mapped rows from server fns) as long as the fields used
// below are present.
export interface PayoutOwner {
  id: string;
  name: string;
}
export interface PayoutProperty {
  id: string;
  ownerId: string;
  name: string;
}
export interface PayoutPayment {
  id: string;
  propertyId: string;
  status: string; // 'paid' rows are counted (DB 'completed' maps to 'paid')
  date: string;
  description: string;
  amount: number; // cents
}
export interface PayoutMaintenance {
  id: string;
  propertyId: string;
  status: string; // 'resolved' rows are counted (DB 'completed' maps to 'resolved')
  dateReported: string;
  dateResolved?: string;
  description: string;
  priority: string; // 'urgent' | 'high' | 'medium' | 'low'
}

export interface PayoutLineItem {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  type: "rent" | "booking" | "maintenance_deduction" | "fee";
}

export interface OwnerPayoutStatement {
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  period: string;
  lineItems: PayoutLineItem[];
  grossRevenue: number;
  managementFeePercent: number;
  managementFee: number;
  maintenanceDeductions: number;
  netPayout: number;
  status: "calculated" | "pending" | "paid";
}

export function getDefaultManagementFee(ownerId: string): number {
  // Default 15% management fee
  return 15;
}

export function calculateOwnerPayouts(
  owners: PayoutOwner[],
  properties: PayoutProperty[],
  payments: PayoutPayment[],
  maintenanceRequests: PayoutMaintenance[],
  startDate: string,
  endDate: string,
): OwnerPayoutStatement[] {
  const statements: OwnerPayoutStatement[] = [];

  for (const owner of owners) {
    const ownerProperties = properties.filter(p => p.ownerId === owner.id);
    const feePercent = getDefaultManagementFee(owner.id);

    for (const property of ownerProperties) {
      const lineItems: PayoutLineItem[] = [];

      // Rent/bookings revenue
      const propPayments = payments.filter(p =>
        p.propertyId === property.id &&
        p.status === "paid" &&
        p.date >= startDate &&
        p.date <= endDate
      );

      for (const payment of propPayments) {
        lineItems.push({
          transactionId: payment.id,
          date: payment.date,
          description: payment.description,
          amount: payment.amount,
          type: payment.description.toLowerCase().includes("rent") ? "rent" : "booking",
        });
      }

      // Maintenance deductions (chargebacks billed to owner)
      const propMaintenance = maintenanceRequests.filter(m =>
        m.propertyId === property.id &&
        m.status === "resolved" &&
        m.dateResolved &&
        m.dateResolved >= startDate &&
        m.dateResolved <= endDate
      );

      let maintenanceCost = 0;
      for (const m of propMaintenance) {
        const cost = m.priority === "urgent" ? 500 : m.priority === "high" ? 300 : m.priority === "medium" ? 150 : 75;
        maintenanceCost += cost;
        lineItems.push({
          transactionId: m.id,
          date: m.dateResolved || m.dateReported,
          description: `Maintenance: ${m.description}`,
          amount: -cost,
          type: "maintenance_deduction",
        });
      }

      const grossRevenue = propPayments.reduce((s, p) => s + p.amount, 0);
      const mgmtFee = Math.round(grossRevenue * feePercent / 100);

      if (grossRevenue === 0 && maintenanceCost === 0) continue; // Skip empty

      statements.push({
        ownerId: owner.id,
        ownerName: owner.name,
        propertyId: property.id,
        propertyName: property.name,
        period: `${startDate} to ${endDate}`,
        lineItems,
        grossRevenue,
        managementFeePercent: feePercent,
        managementFee: mgmtFee,
        maintenanceDeductions: maintenanceCost,
        netPayout: grossRevenue - mgmtFee - maintenanceCost,
        status: "calculated",
      });
    }
  }

  return statements;
}