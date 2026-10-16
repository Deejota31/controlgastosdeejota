import { cn } from '@/lib/cn'

export interface OpcionChip {
  valor: string
  etiqueta: string
  color?: string
}

/** Selección única con chips (grupo de radios). Flechas mueven la selección. */
export function ChipSelect({ etiqueta, opciones, valor, onChange, invalido, describedBy }: { etiqueta: string; opciones: OpcionChip[]; valor: string; onChange: (v: string) => void; invalido?: boolean; describedBy?: string }) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      aria-invalid={invalido || undefined}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
        e.preventDefault()
        const i = opciones.findIndex((o) => o.valor === valor)
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
        const n = opciones[(Math.max(i, 0) + d + opciones.length) % opciones.length]
        if (n) onChange(n.valor)
      }}
    >
      {opciones.map((o, i) => {
        const on = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!valor && i === 0) ? 0 : -1}
            onClick={() => onChange(o.valor)}
            className={cn(
              'min-h-11 rounded-full border px-4 font-medium transition-colors duration-150',
              on ? 'border-primary bg-primary text-primary-ink' : invalido ? 'border-danger bg-surface' : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            {o.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
