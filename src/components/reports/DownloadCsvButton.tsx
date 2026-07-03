'use client'
export default function DownloadCsvButton({ filename, csv }: { filename: string; csv: string }) {
  function handleClick() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button type="button" onClick={handleClick} className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100">
      Download CSV
    </button>
  )
}
