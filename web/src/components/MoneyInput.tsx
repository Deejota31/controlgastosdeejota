import { useId } from 'react'
import { cn } from '@/lib/cn'
import { claseCampo } from './Campo'

/**
 * Convierte lo escrito a número. Acepta «1,234.50», «1234,5» y «1.234,50»: el último separador decide el decimal.
 * Devuelve null si no es un número válido o tiene más de 2 decimales.
 */
export function parsearMonto(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '')
  if (!t || !/^[0-9.,]+$/.test(t)) return null
  const ultimoPunto = t.lastIndexOf('.')
  const ultimaComa = t.lastIndexOf(',')
  const sep = Math.max(ultimoPunto, ultimaComa)
  let entero = t
  let dec = ''
  if (sep >= 0) {
    const tras = t.slice(sep + 1)
    const otros = t.slice(0, sep).replace(/[.,]/g, '')
    // «1,234» (3 dígitos tras un solo separador) es millar; con 1-2 dígitos es decimal.
    const soloUno = (t.match(/[.,]/g) ?? []).length === 1
    if (tras.length === 3 && soloUno) {
      entero = t.replace(/[.,]/g, '')
    } else if (tras.length <= 2) {
      entero = otros
      dec = tras
    } else return null
  }
  if (!/^\d+$/.test(entero || '0')) return null
  const n = Number(`${entero || '0'}${dec ? '.' + dec : ''}`)
  return Number.isFinite(n) ? n : null
}

export interface MoneyInputProps {
  id?: string
  etiqueta?: string
  valor: string
  onChange: (v: string) => void
  moneda?: string
  invalido?: boolean
  describedBy?: string
  disabled?: boolean
  className?: string
}

/** Campo de monto con teclado numérico en móvil y prefijo de moneda. El texto se conserva tal cual lo escribe la persona. */
export function MoneyInput({ id, etiqueta, valor, onChange, moneda, invalido, describedBy, disabled, className }: MoneyInputProps) {
  const auto = useId()
  return (
    <div className={cn('relative', className)}>
      {moneda && <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{moneda}</span>}
      <input
        id={id ?? auto}
        aria-label={etiqueta}
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,\s]/g, ''))}
        aria-invalid={invalido || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder="0.00"
        className={cn(claseCampo, 'num', moneda && 'pl-12')}
      />
    </div>
  )
}
