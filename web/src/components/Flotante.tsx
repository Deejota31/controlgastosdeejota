import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

interface Pos {
  left: number
  top: number
  width: number
  maxH: number
  arriba: boolean
}

/**
 * Panel flotante en un portal (nunca queda recortado por contenedores con overflow). Se coloca bajo el ancla
 * y se voltea hacia arriba si abajo no cabe. Sigue al ancla al hacer scroll o cambiar el tamaño.
 */
export function Flotante({
  ancla,
  abierto,
  onCerrar,
  children,
  className,
  ancho,
  id,
  role,
  etiqueta,
}: {
  ancla: RefObject<HTMLElement | null>
  abierto: boolean
  onCerrar: () => void
  children: ReactNode
  className?: string
  ancho?: 'ancla' | number
  id?: string
  role?: string
  etiqueta?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  useLayoutEffect(() => {
    if (!abierto) {
      setPos(null)
      return
    }
    const calcular = () => {
      const a = ancla.current
      if (!a) return
      const r = a.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const alto = panel.current?.offsetHeight ?? 240
      const debajo = vh - r.bottom - 8
      const encima = r.top - 8
      const arriba = debajo < Math.min(alto, 240) && encima > debajo
      const w = ancho === 'ancla' || ancho === undefined ? r.width : ancho
      const left = Math.max(8, Math.min(r.left, vw - w - 8))
      setPos({
        left,
        width: w,
        arriba,
        maxH: Math.max(120, Math.min(360, arriba ? encima : debajo)),
        top: arriba ? r.top - 4 : r.bottom + 4,
      })
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => {
      window.removeEventListener('resize', calcular)
      window.removeEventListener('scroll', calcular, true)
    }
  }, [abierto, ancla, ancho])

  useLayoutEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || ancla.current?.contains(t)) return
      onCerrar()
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, ancla, onCerrar])

  if (!abierto) return null
  return createPortal(
    <div
      ref={panel}
      id={id}
      role={role}
      aria-label={etiqueta}
      style={{
        position: 'fixed',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: pos?.width,
        maxHeight: pos?.maxH,
        transform: pos?.arriba ? 'translateY(-100%)' : undefined,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn('z-[70] overflow-y-auto rounded-ctl border border-line bg-surface shadow-2', className)}
    >
      {children}
    </div>,
    document.body,
  )
}
