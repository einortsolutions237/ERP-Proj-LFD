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
}

type OpenForm = { productId: string; kind: 'adjust' | 'transfer' } | null

export default function StockTable({ rows, branches, canAdjust, canTransfer }: StockTableProps) {
  const router = useRouter()
  const [openForm, setOpenForm] = useState<OpenForm>(null)

  function handleDone() {
    setOpenForm(null)
    router.refresh()
  }

  const showActions = canAdjust || canTransfer

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-mist">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">SKU</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reorder Threshold</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
              {showActions && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{row.productName}</td>
                  <td className="px-3 py-2 text-ink">{row.sku}</td>
                  <td className="px-3 py-2 font-mono text-ink">{row.quantity}</td>
                  <td className="px-3 py-2 font-mono text-ink">{row.reorderThreshold}</td>
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
                    <td className="px-3 py-2 space-x-2">
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
                          className="rounded-md border border-mist px-2 py-1 text-sm text-ink transition-colors hover:bg-mist"
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
                          className="rounded-md border border-mist px-2 py-1 text-sm text-ink transition-colors hover:bg-mist"
                        >
                          Transfer
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {openForm?.productId === row.productId && openForm.kind === 'adjust' && (
                  <tr className="bg-mist/30">
                    <td colSpan={showActions ? 6 : 5} className="px-3 py-3">
                      <StockAdjustForm productId={row.productId} branchId={row.branchId} onDone={handleDone} />
                    </td>
                  </tr>
                )}
                {openForm?.productId === row.productId && openForm.kind === 'transfer' && (
                  <tr className="bg-mist/30">
                    <td colSpan={showActions ? 6 : 5} className="px-3 py-3">
                      <StockTransferForm
                        productId={row.productId}
                        sourceBranchId={row.branchId}
                        destinationBranches={branches.filter((b) => b.id !== row.branchId)}
                        onDone={handleDone}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
