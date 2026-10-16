import { cn } from '@/lib/cn'

export type EstadoBarra = 'ok' | 'atencion' | 'critico' | 'excedido'

/** Estados de una caja según el % consumido y los umbrales (70 / 90 / 100 por defecto). */
export function estadoPorPct(pct: number, umbrales: [number, number, number] = [70, 90, 100]): EstadoBarra {
  if (pct > umbrales[2]) return 'excedido'
  if (pct >= umbrales[1]) return 'critico'
  if (pct >= umbrales[0]) return 'atencion'
  return 'ok'
}

const color: Record<EstadoBarra, string> = {
  ok: 'bg-ok',
  atencion: 'bg-warn',
  critico: 'bg-danger',
  excedido: 'bg-danger',
}
const texto: Record<EstadoBarra, string> = {
  ok: 'Al día',
  atencion: 'Atención',
  critico: 'Crítico',
  excedido: 'Excedida',
}

export interface ProgressBarProps {
  pct: number
  etiqueta: string
  estado?: EstadoBarra
}

export function ProgressBar({ pct, etiqueta, estado }: ProgressBarProps) {
  const est = estado ?? estadoPorPct(pct)
  const ancho = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${Math.round(pct)} % · ${texto[est]}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-200', color[est])} style={{ width: `${ancho}%` }} />
      </div>
    </div>
  )
}
