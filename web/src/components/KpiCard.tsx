import type { ReactNode } from 'react'
import { InfoTip } from './Tooltip'
import { cn } from '@/lib/cn'

export interface KpiCardProps {
  titulo: string
  valor: ReactNode
  ayuda?: string
  variacion?: { texto: string; tono: 'ok' | 'danger' | 'neutro' }
  pie?: ReactNode
}

export function KpiCard({ titulo, valor, ayuda, variacion, pie }: KpiCardProps) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-1">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">{titulo}</h3>
        {ayuda && <InfoTip texto={ayuda} />}
      </header>
      <div className="num mt-1 text-[28px] font-semibold leading-tight">{valor}</div>
      {variacion && (
        <p
          className={cn(
            'num mt-1 text-sm',
            variacion.tono === 'ok' && 'text-ok',
            variacion.tono === 'danger' && 'text-danger',
            variacion.tono === 'neutro' && 'text-muted',
          )}
        >
          {variacion.texto}
        </p>
      )}
      {pie && <div className="mt-2 text-sm text-muted">{pie}</div>}
    </section>
  )
}

export function StatRow({ etiqueta, valor, tono }: { etiqueta: string; valor: ReactNode; tono?: 'danger' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-muted">{etiqueta}</span>
      <span className={cn('num font-medium', tono === 'danger' && 'text-danger')}>{valor}</span>
    </div>
  )
}
