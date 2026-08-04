'use client'
import Button from '@/components/ui/Button'

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
    <Button type="button" variant="secondary" onClick={handleClick}>
      Download CSV
    </Button>
  )
}
