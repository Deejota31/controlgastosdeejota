import { ChevronDown, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { normalizarBusqueda } from '@/lib/texto'
import type { OpcionCombo } from './Combobox'
import { Flotante } from './Flotante'

export interface MultiSelectProps {
  etiqueta: string
  opciones: OpcionCombo[]
  valor: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  /** Chips visibles antes de agrupar en «+N». */
  maxChips?: number
}

/** Selección múltiple con chips y casillas. La lista no se cierra al marcar: se puede elegir varias seguidas. */
export function MultiSelect({ etiqueta, opciones, valor, onChange, placeholder = 'Todos', maxChips = 2 }: MultiSelectProps) {
  const id = useId()
  const ancla = useRef<HTMLDivElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const sel = new Set(valor)
  const visibles = useMemo(() => {
    const q = normalizarBusqueda(texto)
    return q ? opciones.filter((o) => normalizarBusqueda(o.etiqueta).includes(q)) : opciones
  }, [opciones, texto])
  const alternar = (v: string) => onChange(sel.has(v) ? valor.filter((x) => x !== v) : [...valor, v])
  const nombre = (v: string) => opciones.find((o) => o.valor === v)?.etiqueta ?? v

  return (
    <div ref={ancla} className="relative">
      <div
        className="flex min-h-11 w-full flex-wrap items-center gap-1 rounded-ctl border border-line bg-surface px-2 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
        onClick={() => setAbierto(true)}
      >
        {valor.slice(0, maxChips).map((v) => (
          <span key={v} className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-0.5 pl-2 text-sm text-primary">
            <span className="truncate">{nombre(v)}</span>
            <button
              type="button"
              aria-label={`Quitar ${nombre(v)}`}
              onClick={(e) => {
                e.stopPropagation()
                alternar(v)
              }}
              className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {valor.length > maxChips && <span className="rounded-full bg-surface-2 px-2 text-sm">+{valor.length - maxChips}</span>}
        <input
          role="combobox"
          aria-label={etiqueta}
          aria-expanded={abierto}
          aria-controls={`${id}-l`}
          autoComplete="off"
          value={texto}
          placeholder={valor.length ? '' : placeholder}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && abierto) {
              e.stopPropagation()
              setAbierto(false)
            } else if (e.key === 'Backspace' && !texto && valor.length) onChange(valor.slice(0, -1))
          }}
          className="min-h-9 min-w-[4rem] flex-1 bg-transparent px-1 outline-none"
        />
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
      </div>
      <Flotante ancla={ancla} abierto={abierto} onCerrar={() => setAbierto(false)} id={`${id}-l`} role="listbox" etiqueta={etiqueta} className="py-1">
        <div className="flex justify-between px-3 py-1 text-sm">
          <button type="button" className="min-h-9 text-primary" onClick={() => onChange(opciones.filter((o) => !o.deshabilitada).map((o) => o.valor))}>
            Todos
          </button>
          <button type="button" className="min-h-9 text-primary" onClick={() => onChange([])}>
            Ninguno
          </button>
        </div>
        {visibles.length === 0 && <p className="px-3 py-2 text-muted">Sin resultados</p>}
        {visibles.map((o) => (
          <label key={o.valor} className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3 hover:bg-surface-2')}>
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={sel.has(o.valor)} onChange={() => alternar(o.valor)} />
            <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
          </label>
        ))}
      </Flotante>
    </div>
  )
}
