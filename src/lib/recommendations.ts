import type { InventoryItem, Product, Recommendation, Transfer } from "./types";

export function buildRecommendations(
  inventory: InventoryItem[],
  products: Product[],
  transfers: Transfer[],
): Recommendation[] {
  const prices = new Map(products.map((product) => [product.id, product.price]));
  const plannedTransfers = transfers.filter((transfer) => transfer.status === "planned");
  const planned = new Set(plannedTransfers.map((transfer) => `${transfer.productId}:${transfer.fromPharmacyId}:${transfer.toPharmacyId}`));
  const reservedAtSource = new Map<string, number>();
  const incomingAtTarget = new Map<string, number>();
  for (const transfer of plannedTransfers) {
    const sourceKey = `${transfer.productId}:${transfer.fromPharmacyId}`;
    const targetKey = `${transfer.productId}:${transfer.toPharmacyId}`;
    reservedAtSource.set(sourceKey, (reservedAtSource.get(sourceKey) ?? 0) + transfer.quantity);
    incomingAtTarget.set(targetKey, (incomingAtTarget.get(targetKey) ?? 0) + transfer.quantity);
  }
  const byProduct = new Map<number, InventoryItem[]>();
  for (const item of inventory) {
    const rows = byProduct.get(item.productId) ?? [];
    rows.push(item);
    byProduct.set(item.productId, rows);
  }

  const recommendations: Recommendation[] = [];
  for (const [productId, rows] of byProduct) {
    const donors = rows
      .filter((item) => item.abc === "C" && item.xyz === "Z" && item.quantity - item.minStock - (reservedAtSource.get(`${productId}:${item.pharmacyId}`) ?? 0) > 0)
      .sort((a, b) => b.quantity - a.quantity);
    const receivers = rows
      .filter((item) => item.abc === "A" && item.xyz === "X")
      .sort((a, b) => (b.minStock - b.quantity) - (a.minStock - a.quantity));
    const allocatedToReceiver = new Map<number, number>();

    for (const donor of donors) {
      let available = donor.quantity - donor.minStock - (reservedAtSource.get(`${productId}:${donor.pharmacyId}`) ?? 0);
      for (const receiver of receivers) {
        if (available <= 0) break;
        if (donor.pharmacyId === receiver.pharmacyId) continue;
        if (planned.has(`${productId}:${donor.pharmacyId}:${receiver.pharmacyId}`)) continue;

        // Use the configured target stock; estimate demand only when no target was provided.
        const incoming = incomingAtTarget.get(`${productId}:${receiver.pharmacyId}`) ?? 0;
        const demand = receiver.minStock > 0
          ? Math.max(0, receiver.minStock - receiver.quantity - incoming)
          : Math.max(0, Math.max(1, Math.ceil(receiver.quantity * 0.35)) - incoming);
        const need = demand - (allocatedToReceiver.get(receiver.id) ?? 0);
        if (need <= 0) continue;
        const quantity = Math.min(available, need);
        available -= quantity;
        allocatedToReceiver.set(receiver.id, (allocatedToReceiver.get(receiver.id) ?? 0) + quantity);
        recommendations.push({
          key: `${productId}-${donor.pharmacyId}-${receiver.pharmacyId}`,
          productId,
          fromPharmacyId: donor.pharmacyId,
          toPharmacyId: receiver.pharmacyId,
          sourceInventoryId: donor.id,
          targetInventoryId: receiver.id,
          sourceQuantity: donor.quantity,
          targetQuantity: receiver.quantity,
          targetMinStock: receiver.minStock,
          quantity,
          value: quantity * (prices.get(productId) ?? 0),
        });
      }
    }
  }
  return recommendations.sort((a, b) => b.value - a.value);
}
