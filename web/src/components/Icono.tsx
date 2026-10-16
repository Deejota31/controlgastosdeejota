import { Tag } from 'lucide-react'
import { ICONOS } from '@/lib/iconos'
import { cn } from '@/lib/cn'

/** Dibuja un icono del catálogo por su nombre. Si el nombre no existe muestra una etiqueta genérica. */
export function Icono({ nombre, className }: { nombre: string; className?: string }) {
  const C = ICONOS[nombre] ?? Tag
  return <C aria-hidden className={cn('size-5', className)} />
}

/** Insignia redonda con el icono sobre el color de la entidad (texto blanco o negro según contraste). */
export function InsigniaIcono({ icono, color, className }: { icono: string; color: string; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full', className)} style={{ backgroundColor: color, color: textoSobre(color) }}>
      <Icono nombre={icono} />
    </span>
  )
}

/** Negro o blanco, el que mejor contraste da sobre `hex`. */
export function textoSobre(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1]!, 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.4 ? '#0f172a' : '#ffffff'
}
