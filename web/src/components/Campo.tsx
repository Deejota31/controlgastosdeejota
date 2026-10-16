import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const claseCampo =
  'min-h-11 w-full rounded-ctl border border-line bg-surface px-3 text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 aria-[invalid=true]:border-danger'

export interface CampoProps {
  id: string
  etiqueta: string
  error?: string | null
  ayuda?: ReactNode
  requerido?: boolean
  className?: string
  children: ReactNode
}

/** Etiqueta + control + ayuda/error. El control debe usar `id` y, si hay error, `aria-describedby={`${id}-e`}`. */
export function Campo({ id, etiqueta, error, ayuda, requerido, className, children }: CampoProps) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={id} className={cn('font-medium', requerido && "after:ml-1 after:text-danger after:content-['*']")}>
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && <p className="text-sm text-muted">{ayuda}</p>}
      {error && (
        <p id={`${id}-e`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
