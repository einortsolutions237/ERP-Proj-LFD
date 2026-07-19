'use client'

export default function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="shrink-0 rounded-lg border border-mist px-3 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-marine hover:bg-marine hover:text-paper print:hidden"
    >
      Print / Save as PDF
    </button>
  )
}
