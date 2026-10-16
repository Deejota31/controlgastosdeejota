import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabsProps {
  tabs: Array<{ id: string; etiqueta: string }>
  activa: string
  onChange: (id: string) => void
  etiqueta: string
  children?: ReactNode
}

export function Tabs({ tabs, activa, onChange, etiqueta, children }: TabsProps) {
  const uid = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: KeyboardEvent, idx: number) => {
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else return
    e.preventDefault()
    const t = tabs[next]
    if (t) {
      onChange(t.id)
      refs.current[t.id]?.focus()
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={etiqueta} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={activa === t.id}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={activa === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'min-h-11 whitespace-nowrap border-b-2 px-4 font-medium transition-colors duration-150',
              activa === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-panel-${activa}`} aria-labelledby={`${uid}-tab-${activa}`} className="pt-4">
        {children}
      </div>
    </div>
  )
}
