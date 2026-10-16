import { Check, ChevronDown } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { normalizarBusqueda } from '@/lib/texto'
import { claseCampo } from './Campo'
import { Flotante } from './Flotante'

export interface OpcionCombo {
  valor: string
  etiqueta: string
  detalle?: string
  deshabilitada?: boolean
}

export interface ComboboxProps {
  id?: string
  etiqueta: string
  opciones: OpcionCombo[]
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  invalido?: boolean
  describedBy?: string
  vacio?: string
}

/** Selector con búsqueda (patrón combobox ARIA). La lista vive en un portal y se voltea si no cabe. */
export function Combobox({ id, etiqueta, opciones, valor, onChange, placeholder = 'Elegir…', disabled, invalido, describedBy, vacio = 'Sin resultados' }: ComboboxProps) {
  const auto = useId()
  const idc = id ?? auto
  const lista = `${idc}-lista`
  const ancla = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const actual = opciones.find((o) => o.valor === valor)

  const visibles = useMemo(() => {
    const q = normalizarBusqueda(texto)
    return q ? opciones.filter((o) => normalizarBusqueda(o.etiqueta + ' ' + (o.detalle ?? '')).includes(q)) : opciones
  }, [opciones, texto])

  const cerrar = () => {
    setAbierto(false)
    setTexto('')
  }
  const elegir = (o: OpcionCombo | undefined) => {
    if (!o || o.deshabilitada) return
    onChange(o.valor)
    cerrar()
  }
  const abrir = () => {
    if (disabled) return
    const i = visibles.findIndex((o) => o.valor === valor)
    setActivo(i >= 0 ? i : 0)
    setAbierto(true)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) abrir()
      else setActivo((i) => Math.min(visibles.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home' && abierto) {
      e.preventDefault()
      setActivo(0)
    } else if (e.key === 'End' && abierto) {
      e.preventDefault()
      setActivo(Math.max(0, visibles.length - 1))
    } else if (e.key === 'Enter' && abierto) {
      e.preventDefault()
      e.stopPropagation()
      elegir(visibles[activo])
    } else if (e.key === 'Escape' && abierto) {
      e.preventDefault()
      e.stopPropagation()
      cerrar()
    } else if (e.key === 'Tab' && abierto) {
      cerrar()
    }
  }

  return (
    <div ref={ancla} className="relative">
      <input
        ref={entrada}
        id={idc}
        role="combobox"
        aria-label={etiqueta}
        aria-expanded={abierto}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && visibles[activo] ? `${idc}-o${activo}` : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        className={cn(claseCampo, 'pr-9')}
        placeholder={actual ? undefined : placeholder}
        value={abierto ? texto : (actual?.etiqueta ?? '')}
        onChange={(e) => {
          setTexto(e.target.value)
          setActivo(0)
          if (!abierto) setAbierto(true)
        }}
        onFocus={abrir}
        onClick={() => !abierto && abrir()}
        onKeyDown={onKey}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      <Flotante ancla={ancla} abierto={abierto} onCerrar={cerrar} id={lista} role="listbox" etiqueta={etiqueta} className="py-1">
        {visibles.length === 0 ? (
          <p className="px-3 py-2 text-muted">{vacio}</p>
        ) : (
          visibles.map((o, i) => (
            <div
              key={o.valor}
              id={`${idc}-o${i}`}
              role="option"
              aria-selected={o.valor === valor}
              aria-disabled={o.deshabilitada || undefined}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => elegir(o)}
              onMouseEnter={() => setActivo(i)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 px-3',
                i === activo && 'bg-surface-2',
                o.deshabilitada && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.etiqueta}</span>
                {o.detalle && <span className="block truncate text-xs text-muted">{o.detalle}</span>}
              </span>
              {o.valor === valor && <Check className="size-4 text-primary" aria-hidden />}
            </div>
          ))
        )}
      </Flotante>
    </div>
  )
}
