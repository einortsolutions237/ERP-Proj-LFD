// Must match functions/src/lowStock.ts's comparison exactly (quantityAfter
// <= reorderThreshold). That file is a separate deployable and can't import
// this — if this comparison ever changes, update both places, the same
// "keep in sync across an uncrossable boundary" situation firestore.rules'
// duplicated role lists are already in.
export function isLowStock(quantity: number, reorderThreshold: number): boolean {
  return quantity <= reorderThreshold
}
