export interface RawCartLine {
  type: 'product' | 'service'
  itemId: string
  quantity: number
}

export interface NormalizedCart {
  productLines: { itemId: string; quantity: number }[]
  serviceLines: { itemId: string; quantity: number }[]
}

// For stock-check/stock-write purposes only — the aggregated productLines here
// collapse repeated itemIds into one summed entry, so this must never be used
// to populate sales/{saleId}.lineItems (the receipt), which needs one entry
// per original cart line with its own resolved name/unitPrice/lineTotal.
export function normalizeCartLines(lineItems: RawCartLine[]): NormalizedCart {
  const productQuantities = new Map<string, number>()
  const serviceLines: { itemId: string; quantity: number }[] = []

  for (const line of lineItems) {
    if (line.type === 'product') {
      productQuantities.set(line.itemId, (productQuantities.get(line.itemId) ?? 0) + line.quantity)
    } else {
      serviceLines.push({ itemId: line.itemId, quantity: line.quantity })
    }
  }

  const productLines = Array.from(productQuantities.entries()).map(([itemId, quantity]) => ({ itemId, quantity }))
  return { productLines, serviceLines }
}
