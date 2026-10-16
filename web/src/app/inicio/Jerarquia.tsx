import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { formatoMoneda, formatoPct } from '@/engine/dinero'
import type { NodoJerarquia } from '@/engine/panel'
import { cn } from '@/lib/cn'
import type { Rotulos } from './logica'

function Nodo({ nodo, nivel, abiertos, alternar, r, base }: { nodo: NodoJerarquia; nivel: number; abiertos: Set<string>; alternar: (k: string) => void; r: Rotulos; base: string }) {
  const clave = `${nodo.tipo}:${nodo.id}`
  const abierto = abiertos.has(clave)
  const tiene = nodo.hijos.length > 0
  return (
    <li>
      <div className="flex min-h-11 items-center gap-2" style={{ paddingLeft: nivel * 16 }}>
        {tiene ? (
          <button type="button" aria-expanded={abierto} aria-label={`${abierto ? 'Contraer' : 'Expandir'} ${r.nombre(nodo.tipo === 'ambito' ? 'ambito' : nodo.tipo, nodo.id)}`} onClick={() => alternar(clave)} className="grid size-9 shrink-0 place-items-center rounded-ctl hover:bg-surface-2">
            <ChevronRight className={cn('size-4 transition-transform', abierto && 'rotate-90')} aria-hidden />
          </button>
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{r.nombre(nodo.tipo, nodo.id)}</span>
            <span className="num shrink-0 text-sm">
              {formatoMoneda(nodo.total, base)} <span className="text-muted">· {formatoPct(nodo.peso, 1)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, nodo.peso * 100)}%`, background: r.color(nodo.tipo, nodo.id) }} />
          </div>
        </div>
      </div>
      {tiene && abierto && (
        <ul>
          {nodo.hijos.map((h) => (
            <Nodo key={`${h.tipo}:${h.id}`} nodo={h} nivel={nivel + 1} abiertos={abiertos} alternar={alternar} r={r} base={base} />
          ))}
        </ul>
      )}
    </li>
  )
}

function claves(nodos: NodoJerarquia[], out: string[] = []): string[] {
  for (const n of nodos) {
    if (n.hijos.length) {
      out.push(`${n.tipo}:${n.id}`)
      claves(n.hijos, out)
    }
  }
  return out
}

/** Ámbito → categoría → subcategoría con peso sobre el total. Nace contraída. */
export function Jerarquia({ nodos, r, base }: { nodos: NodoJerarquia[]; r: Rotulos; base: string }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternar = (k: string) =>
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const todo = claves(nodos)
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Button variante="secondary" className="min-h-9" onClick={() => setAbiertos(new Set(todo))}>
          Expandir todo
        </Button>
        <Button variante="secondary" className="min-h-9" onClick={() => setAbiertos(new Set())}>
          Contraer todo
        </Button>
      </div>
      <ul aria-label="Jerarquía de gastos">
        {nodos.map((n) => (
          <Nodo key={`${n.tipo}:${n.id}`} nodo={n} nivel={0} abiertos={abiertos} alternar={alternar} r={r} base={base} />
        ))}
      </ul>
    </div>
  )
}
