'use client'
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import StockAdjustForm from './StockAdjustForm'
import StockTransferForm from './StockTransferForm'

export interface StockRow {
  id: string
  branchId: string
  productId: string
  productName: string
  sku: string
  quantity: number
  reorderThreshold: number
  lowStock: boolean
}

interface StockTableProps {
  rows: StockRow[]
  branches: { id: string; name: string }[]
  canAdjust: boolean
  canTransfer: boolean
  // Only org-wide (non-branch-locked) viewers see every branch's rows on one
  // screen — branch-locked viewers (cashier/branch_manager) only ever see
  // their own branch, so the column would be redundant noise for them.
  showBranch: boolean
}

type OpenForm = { productId: string; kind: 'adjust' | 'transfer' } | null

export default function StockTable({ rows, branches, canAdjust, canTransfer, showBranch }: StockTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [openForm, setOpenForm] = useState<OpenForm>(null)

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]))

  function handleDone() {
    setOpenForm(null)
    router.refresh()
  }

  function handleCancel() {
    setOpenForm(null)
  }

  const showActions = canAdjust || canTransfer
  const columnCount = (showBranch ? 6 : 5) + (showActions ? 1 : 0)

  const query = search.trim().toLowerCase()
  const filtered = rows.filter(
    (row) => row.productName.toLowerCase().includes(query) || row.sku.toLowerCase().includes(query)
  )

  return (
    <div className="space-y-3">
      <label htmlFor="stock-search" className="sr-only">
        Search stock by product or SKU
      </label>
      <input
        id="stock-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by product or SKU…"
        className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
      />
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">SKU</th>
                {showBranch && (
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                )}
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">Reorder Threshold</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                {showActions && (
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-8 text-center text-sm text-slate">
                    {rows.length === 0 ? 'No stock records yet.' : 'No stock records match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="transition-colors duration-200 hover:bg-mist/40">
                      <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.productName}>
                        {row.productName}
                      </td>
                      <td className="px-3 py-2 text-ink">{row.sku}</td>
                      {showBranch && (
                        <td className="px-3 py-2 text-ink">{branchNameById.get(row.branchId) ?? '—'}</td>
                      )}
                      <td className="px-3 py-2 font-mono text-right text-ink">{row.quantity}</td>
                      <td className="px-3 py-2 font-mono text-right text-ink">{row.reorderThreshold}</td>
                      <td className="px-3 py-2 text-ink">
                        {row.lowStock ? (
                          <span className="inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                            Low stock
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            OK
                          </span>
                        )}
                      </td>
                      {showActions && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {canAdjust && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenForm(
                                    openForm?.productId === row.productId && openForm.kind === 'adjust'
                                      ? null
                                      : { productId: row.productId, kind: 'adjust' }
                                  )
                                }
                                className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
                              >
                                Adjust
                              </button>
                            )}
                            {canTransfer && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenForm(
                                    openForm?.productId === row.productId && openForm.kind === 'transfer'
                                      ? null
                                      : { productId: row.productId, kind: 'transfer' }
                                  )
                                }
                                className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
                              >
                                Transfer
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {openForm?.productId === row.productId && openForm.kind === 'adjust' && (
                      <tr className="bg-mist/30">
                        <td colSpan={columnCount} className="px-3 py-3">
                          <StockAdjustForm
                            productId={row.productId}
                            branchId={row.branchId}
                            currentQuantity={row.quantity}
                            onDone={handleDone}
                            onCancel={handleCancel}
                          />
                        </td>
                      </tr>
                    )}
                    {openForm?.productId === row.productId && openForm.kind === 'transfer' && (
                      <tr className="bg-mist/30">
                        <td colSpan={columnCount} className="px-3 py-3">
                          <StockTransferForm
                            productId={row.productId}
                            sourceBranchId={row.branchId}
                            currentQuantity={row.quantity}
                            destinationBranches={branches.filter((b) => b.id !== row.branchId)}
                            onDone={handleDone}
                            onCancel={handleCancel}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
