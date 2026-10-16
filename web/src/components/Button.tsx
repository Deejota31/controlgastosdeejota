import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger'

const base =
  'inline-flex items-center justify-center gap-2 rounded-ctl font-medium transition-colors duration-150 ' +
  'min-h-11 px-4 select-none disabled:opacity-50 disabled:cursor-not-allowed'
const variantes: Record<Variante, string> = {
  primary: 'bg-primary text-primary-ink hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  loading?: boolean
  icono?: ReactNode
}

export function Button({ variante = 'primary', loading, icono, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(base, variantes[variante], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icono}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  etiqueta: string
  children: ReactNode
}

export function IconButton({ etiqueta, children, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-ctl text-ink transition-colors duration-150 hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
