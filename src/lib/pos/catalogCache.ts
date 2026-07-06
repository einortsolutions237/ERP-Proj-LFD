import { dbGet, dbPut, CATALOG_STORE } from './offlineDb'

export interface CatalogCacheEntry {
  branchId: string
  products: { id: string; name: string; sku: string; price: number; quantity: number }[]
  services: { id: string; name: string; price: number }[]
  cachedAt: number
}

export async function saveCatalogCache(entry: CatalogCacheEntry): Promise<void> {
  await dbPut(CATALOG_STORE, entry)
}

export async function loadCatalogCache(branchId: string): Promise<CatalogCacheEntry | undefined> {
  return dbGet<CatalogCacheEntry>(CATALOG_STORE, branchId)
}
