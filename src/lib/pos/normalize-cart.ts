export interface RawCartLine {
  type: 'product' | 'service'
  itemId: string
  quantity: number
}

export interface NormalizedCart {
  productLines: { itemId: string; quantity: number }[]
  serviceLines: { itemId: string; quantity: number }[]
}

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
