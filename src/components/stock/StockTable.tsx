'use client'
import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import StockAdjustForm from './StockAdjustForm'
import StockTransferForm from './StockTransferForm'

export interface StockRow {
  id: string
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
  branchId: string
  canAdjust: boolean
  canTransfer: boolean
}

type OpenForm = { productId: string; kind: 'adjust' | 'transfer' } | null

export default function StockTable({ rows, branches, branchId, canAdjust, canTransfer }: StockTableProps) {
  const router = useRouter()
  const [openForm, setOpenForm] = useState<OpenForm>(null)

  function handleDone() {
    setOpenForm(null)
    router.refresh()
  }

  const showActions = canAdjust || canTransfer

  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Product</th>
            <th className="py-2 pr-4">SKU</th>
            <th className="py-2 pr-4">Quantity</th>
            <th className="py-2 pr-4">Reorder Threshold</th>
            <th className="py-2 pr-4">Status</th>
            {showActions && <th className="py-2 pr-4" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-b">
                <td className="py-2 pr-4">{row.productName}</td>
                <td className="py-2 pr-4">{row.sku}</td>
                <td className="py-2 pr-4">{row.quantity}</td>
                <td className="py-2 pr-4">{row.reorderThreshold}</td>
                <td className="py-2 pr-4">
                  {row.lowStock ? <span className="text-red-600 font-medium">Low stock</span> : 'OK'}
                </td>
                {showActions && (
                  <td className="py-2 pr-4 space-x-2">
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
                        className="underline"
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
                        className="underline"
                      >
                        Transfer
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {openForm?.productId === row.productId && openForm.kind === 'adjust' && (
                <tr className="border-b bg-zinc-50">
                  <td colSpan={showActions ? 6 : 5} className="py-3 pr-4">
                    <StockAdjustForm productId={row.productId} branchId={branchId} onDone={handleDone} />
                  </td>
                </tr>
              )}
              {openForm?.productId === row.productId && openForm.kind === 'transfer' && (
                <tr className="border-b bg-zinc-50">
                  <td colSpan={showActions ? 6 : 5} className="py-3 pr-4">
                    <StockTransferForm
                      productId={row.productId}
                      sourceBranchId={branchId}
                      destinationBranches={branches}
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
  )
}
