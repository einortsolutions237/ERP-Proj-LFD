'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Alert, { type AlertTone } from './Alert'

interface ToastEntry {
  id: number
  message: string
  tone: AlertTone
}

interface ToastContextValue {
  showToast: (message: string, tone?: AlertTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 4000

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be called within a ToastProvider')
  }
  return context
}

function ToastItem({ tone, message, onDismiss }: { tone: AlertTone; message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={`w-80 max-w-[calc(100vw-2rem)] transition-all duration-200 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <Alert tone={tone} role={tone === 'error' ? 'alert' : 'status'} className="relative pr-8 shadow-[var(--shadow-popover)]">
        {message}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-70 transition-opacity duration-200 hover:opacity-100"
        >
          &times;
        </button>
      </Alert>
    </div>
  )
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, tone: AlertTone = 'success') => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, message, tone }])
      setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem tone={t.tone} message={t.message} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
