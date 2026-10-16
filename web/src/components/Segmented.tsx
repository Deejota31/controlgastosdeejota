import { cn } from '@/lib/cn'

export interface SegmentedProps<T extends string> {
  value: T
  onChange: (v: T) => void
  opciones: Array<{ valor: T; etiqueta: string }>
  etiqueta: string
}

export function Segmented<T extends string>({ value, onChange, opciones, etiqueta }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-ctl bg-surface-2 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={value === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
            value === o.valor ? 'bg-surface text-ink shadow-1' : 'text-muted hover:text-ink',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}
