import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Mueve un elemento de `de` a `a` sin mutar el arreglo. */
export function mover<T>(lista: readonly T[], de: number, a: number): T[] {
  if (de === a || de < 0 || a < 0 || de >= lista.length || a >= lista.length) return lista.slice()
  const out = lista.slice()
  const [x] = out.splice(de, 1)
  out.splice(a, 0, x!)
  return out
}

export interface DragListProps<T> {
  etiqueta: string
  items: readonly T[]
  id: (t: T) => string
  nombre: (t: T) => string
  render: (t: T) => ReactNode
  onReordenar: (ids: string[]) => void
}

/**
 * Lista reordenable con ratón, toque y teclado.
 * Teclado: en el asa, Espacio agarra / suelta, ↑↓ mueven, Esc cancela. Además cada fila tiene botones Subir/Bajar.
 */
export function DragList<T>({ etiqueta, items, id, nombre, render, onReordenar }: DragListProps<T>) {
  const [orden, setOrden] = useState<string[] | null>(null)
  const [agarrado, setAgarrado] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const original = useRef<string[]>([])
  const lista = useRef<HTMLOListElement>(null)

  const ids = orden ?? items.map(id)
  const porId = new Map(items.map((t) => [id(t), t] as const))

  const moverA = (idMov: string, destino: number) => {
    const base = orden ?? items.map(id)
    const i = base.indexOf(idMov)
    const n = Math.max(0, Math.min(base.length - 1, destino))
    if (i === n) return
    setOrden(mover(base, i, n))
    setAviso(`${nombre(porId.get(idMov)!)}, posición ${n + 1} de ${base.length}`)
  }
  const soltar = () => {
    if (orden && orden.join('|') !== original.current.join('|')) onReordenar(orden)
    setOrden(null)
    setAgarrado(null)
  }
  const cancelar = () => {
    setOrden(null)
    setAgarrado(null)
    setAviso('Movimiento cancelado')
  }

  const alMoverPuntero = (e: React.PointerEvent) => {
    if (!agarrado) return
    const filas = Array.from(lista.current?.querySelectorAll<HTMLElement>('[data-fila]') ?? [])
    const y = e.clientY
    let destino = filas.findIndex((f) => {
      const r = f.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    if (destino === -1) destino = filas.length - 1
    moverA(agarrado, destino)
  }

  return (
    <div>
      <p className="sr-only" aria-live="assertive">
        {aviso}
      </p>
      <ol ref={lista} aria-label={etiqueta} className="grid gap-2" onPointerMove={alMoverPuntero} onPointerUp={soltar} onPointerCancel={cancelar}>
        {ids.map((k, i) => {
          const t = porId.get(k)
          if (!t) return null
          const on = agarrado === k
          return (
            <li key={k} data-fila className={cn('flex items-center gap-2 rounded-ctl border border-line bg-surface', on && 'border-primary shadow-2')}>
              <button
                type="button"
                aria-label={`Reordenar ${nombre(t)}. Espacio para agarrar, flechas para mover`}
                aria-pressed={on}
                className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId)
                  original.current = items.map(id)
                  setAgarrado(k)
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    if (on) soltar()
                    else {
                      original.current = items.map(id)
                      setAgarrado(k)
                      setAviso(`${nombre(t)} agarrado, posición ${i + 1} de ${ids.length}`)
                    }
                  } else if (on && e.key === 'ArrowUp') {
                    e.preventDefault()
                    moverA(k, i - 1)
                  } else if (on && e.key === 'ArrowDown') {
                    e.preventDefault()
                    moverA(k, i + 1)
                  } else if (on && e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    cancelar()
                  }
                }}
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
              <div className="min-w-0 flex-1 py-2">{render(t)}</div>
              <div className="flex shrink-0">
                <button
                  type="button"
                  aria-label={`Subir ${nombre(t)}`}
                  disabled={i === 0}
                  className="inline-flex size-11 items-center justify-center rounded-ctl hover:bg-surface-2 disabled:opacity-30"
                  onClick={() => {
                    original.current = items.map(id)
                    const nuevo = mover(ids, i, i - 1)
                    onReordenar(nuevo)
                  }}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${nombre(t)}`}
                  disabled={i === ids.length - 1}
                  className="inline-flex size-11 items-center justify-center rounded-ctl hover:bg-surface-2 disabled:opacity-30"
                  onClick={() => onReordenar(mover(ids, i, i + 1))}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
