import { useId, useMemo, useState } from 'react'
import paleta from '@shared/paleta-colores.json'
import { cn } from '@/lib/cn'
import { FAMILIAS_ICONOS, SINONIMOS_ICONOS } from '@/lib/iconos'
import { normalizarBusqueda } from '@/lib/texto'
import { claseCampo } from './Campo'
import { Icono, InsigniaIcono } from './Icono'

export const COLORES: string[] = paleta as string[]
export const esHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

export interface Apariencia {
  icono: string
  color: string
}

/** Elige icono y color: 10 colores a la vista, «Más colores» muestra los 64 y se acepta un HEX libre. */
export function IconColorPicker({ valor, onChange, sinColor }: { valor: Apariencia; onChange: (v: Apariencia) => void; sinColor?: boolean }) {
  const id = useId()
  const [mas, setMas] = useState(false)
  const [busca, setBusca] = useState('')
  const [familia, setFamilia] = useState('todas')
  const [hex, setHex] = useState(valor.color)
  const hexValido = esHex(hex)

  const iconos = useMemo(() => {
    const q = normalizarBusqueda(busca)
    const base = familia === 'todas' ? FAMILIAS_ICONOS.flatMap((f) => f.iconos) : (FAMILIAS_ICONOS.find((f) => f.id === familia)?.iconos ?? [])
    const unicos = [...new Set(base)]
    if (!q) return unicos
    return unicos.filter((n) => normalizarBusqueda(n).includes(q) || (SINONIMOS_ICONOS[n] ?? []).some((s) => normalizarBusqueda(s).includes(q)))
  }, [busca, familia])

  const elegirColor = (c: string) => {
    setHex(c)
    onChange({ ...valor, color: c })
  }
  const visibles = mas ? COLORES : COLORES.slice(0, 10)

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <InsigniaIcono icono={valor.icono} color={esHex(valor.color) ? valor.color : '#64748b'} className="size-12" />
        <p className="text-sm text-muted">Vista previa</p>
      </div>

      {!sinColor && (
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">Color</legend>
        <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
          {visibles.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={valor.color.toLowerCase() === c.toLowerCase()}
              aria-label={`Color ${c}`}
              onClick={() => elegirColor(c)}
              className={cn('size-9 rounded-full border-2', valor.color.toLowerCase() === c.toLowerCase() ? 'border-ink' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
          <button type="button" className="min-h-9 rounded-full border border-line px-3 text-sm" aria-expanded={mas} onClick={() => setMas((v) => !v)}>
            {mas ? 'Menos colores' : 'Más colores'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-hex`} className="text-sm text-muted">
            Color propio (HEX)
          </label>
          <input
            id={`${id}-hex`}
            value={hex}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!hexValido || undefined}
            className={cn(claseCampo, 'num w-32')}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
              setHex(v)
              if (esHex(v)) onChange({ ...valor, color: v.toUpperCase() })
            }}
          />
          {!hexValido && <span role="alert" className="text-sm text-danger">Usa el formato #RRGGBB</span>}
        </div>
      </fieldset>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">Icono</legend>
        <div className="flex flex-wrap gap-2">
          <input type="search" aria-label="Buscar icono" placeholder="Buscar: café, casa, gasolina…" className={cn(claseCampo, 'min-w-0 flex-1')} value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select aria-label="Familia de iconos" className={cn(claseCampo, 'w-auto')} value={familia} onChange={(e) => setFamilia(e.target.value)}>
            <option value="todas">Todas las familias</option>
            {FAMILIAS_ICONOS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </div>
        <div role="radiogroup" aria-label="Icono" className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 overflow-y-auto">
          {iconos.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={valor.icono === n}
              aria-label={n}
              title={n}
              onClick={() => onChange({ ...valor, icono: n })}
              className={cn('inline-flex size-11 items-center justify-center rounded-ctl border', valor.icono === n ? 'border-primary bg-primary-soft text-primary' : 'border-transparent hover:bg-surface-2')}
            >
              <Icono nombre={n} />
            </button>
          ))}
          {iconos.length === 0 && <p className="col-span-full text-muted">No hay iconos con ese nombre.</p>}
        </div>
      </fieldset>
    </div>
  )
}
