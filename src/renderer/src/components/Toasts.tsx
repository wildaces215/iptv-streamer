import * as React from 'react'
import { create } from 'zustand'
import { X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  kind: 'error' | 'info' | 'success'
}

interface ToastStore {
  toasts: Toast[]
  push: (message: string, kind?: Toast['kind']) => void
  dismiss: (id: number) => void
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'error') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 6000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

/** Imperative hook for non-React code paths. */
export const toast = {
  error: (message: string): void => useToastStore.getState().push(message, 'error'),
  info: (message: string): void => useToastStore.getState().push(message, 'info'),
  success: (message: string): void => useToastStore.getState().push(message, 'success')
}

export function Toasts(): React.JSX.Element {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return <></>
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-md border p-3 text-sm shadow-lg ${
            t.kind === 'error'
              ? 'border-destructive/50 bg-card text-foreground'
              : 'border-border bg-card text-foreground'
          }`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  )
}