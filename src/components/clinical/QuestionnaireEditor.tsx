'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface QuestionnaireEditorProps {
  initialQuestions: string[]
}

export default function QuestionnaireEditor({ initialQuestions }: QuestionnaireEditorProps) {
  const router = useRouter()
  const [questions, setQuestions] = useState<string[]>(initialQuestions.length > 0 ? initialQuestions : [''])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, ''])
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    const trimmed = questions.map((q) => q.trim()).filter((q) => q.length > 0)
    if (trimmed.length === 0) {
      setError('At least one question is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/intake-questionnaire', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: trimmed }),
      })
      const body = await res.json()
      setSaving(false)
      if (!res.ok) {
        setError(body.error ?? 'Failed to save')
        return
      }
      setQuestions(trimmed)
      setSaved(true)
      router.refresh()
    } catch {
      setSaving(false)
      setError('Failed to save')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={q}
              onChange={(e) => updateQuestion(i, e.target.value)}
              placeholder={`Question ${i + 1}`}
              className="flex-1 rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
            />
            <button
              type="button"
              onClick={() => removeQuestion(i)}
              className="rounded-md border border-mist px-3 py-2 text-sm text-ink transition-colors hover:bg-mist"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="rounded-md border border-mist px-3 py-2 text-sm text-ink transition-colors hover:bg-mist"
      >
        Add question
      </button>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Saved.</p>}

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
        >
          Save questionnaire
        </button>
      </div>
    </div>
  )
}
