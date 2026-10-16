import { Ban, Copy, History, Pencil, RotateCcw } from 'lucide-react'
import type { Movimiento } from '@/api/esquemas'
import { MenuAcciones, type AccionMenu } from '@/components/MenuAcciones'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { cn } from '@/lib/cn'
import type { Nombres } from './consulta'

export interface AccionesFila {
  editar: (m: Movimiento) => void
  clonar: (m: Movimiento) => void
  anular: (m: Movimiento) => void
  restaurar: (m: Movimiento) => void
  historial: (m: Movimiento) => void
}

/** Orden canónico del menú: editar → clonar → anular/restaurar → historial. */
export function accionesDe(m: Movimiento, a: AccionesFila): AccionMenu[] {
  const anulado = m.estado === 'anulado'
  return [
    { id: 'editar', etiqueta: 'Editar', icono: <Pencil className="size-4" aria-hidden />, deshabilitada: anulado, onSelect: () => a.editar(m) },
    { id: 'clonar', etiqueta: 'Clonar', icono: <Copy className="size-4" aria-hidden />, onSelect: () => a.clonar(m) },
    anulado
      ? { id: 'restaurar', etiqueta: 'Restaurar', icono: <RotateCcw className="size-4" aria-hidden />, onSelect: () => a.restaurar(m) }
      : { id: 'anular', etiqueta: 'Anular', icono: <Ban className="size-4" aria-hidden />, peligro: true, onSelect: () => a.anular(m) },
    { id: 'historial', etiqueta: 'Ver historial', icono: <History className="size-4" aria-hidden />, onSelect: () => a.historial(m) },
  ]
}

export function Importe({ m, base }: { m: Movimiento; base: string }) {
  const orig = formatoMoneda(aCentimos(m.monto), m.moneda)
  return (
    <span className="num grid justify-items-end text-right">
      <span className={cn('font-semibold', m.estado === 'anulado' && 'line-through opacity-60')}>{orig}</span>
      {m.moneda !== base &&
        (m.monto_base === null ? (
          <span className="text-xs text-warn">Sin tipo de cambio</span>
        ) : (
          <span className="text-xs text-muted">≈ {formatoMoneda(aCentimos(m.monto_base), base)}</span>
        ))}
    </span>
  )
}

export function Etiquetas({ m, n }: { m: Movimiento; n: Nombres }) {
  return (
    <span className="text-sm text-muted">
      {n.ambito(m.ambito_id)} · {n.categoria(m.categoria_id)}
      {m.subcategoria_id ? ` › ${n.sub(m.subcategoria_id)}` : ''}
    </span>
  )
}

export function Insignias({ m }: { m: Movimiento }) {
  return (
    <>
      {m.estado === 'anulado' && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">Anulado</span>}
      {m.es_recurrente && <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs text-info">Recurrente</span>}
    </>
  )
}

export { MenuAcciones }
