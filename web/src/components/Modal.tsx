import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { cn } from '@/lib/cn'

export interface ModalProps {
  abierto: boolean
  /** Se invoca al pedir cerrar (Escape, X o clic fuera). El padre decide si confirma el descarte. */
  onCerrar: () => void
  titulo: string
  children: ReactNode
  pie?: ReactNode
  ancho?: 'md' | 'lg'
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Escritorio: diálogo centrado (radio 12). Móvil: hoja inferior de pantalla completa con cabecera y pie fijos. */
export function Modal({ abierto, onCerrar, titulo, children, pie, ancho = 'md' }: ModalProps) {
  const tituloId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const previo = useRef<Element | null>(null)

  useEffect(() => {
    if (!abierto) return
    previo.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      if (previo.current instanceof HTMLElement) previo.current.focus()
    }
  }, [abierto])

  if (!abierto) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCerrar()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const primero = items[0]!
    const ultimo = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/50 [animation:fade_150ms_ease-out]"
        onClick={onCerrar}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={cn(
          'relative flex w-full flex-col bg-surface shadow-2',
          // móvil: pantalla completa; ≥768: diálogo
          'h-[100dvh] [animation:sheet-up_200ms_ease-out] md:h-auto md:max-h-[90dvh] md:rounded-modal md:[animation:pop_160ms_ease-out]',
          ancho === 'md' ? 'md:max-w-lg' : 'md:max-w-4xl',
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 pt-[max(0.5rem,var(--safe-top))] pb-2 md:pt-2">
          <h2 id={tituloId} className="text-xl font-semibold">
            {titulo}
          </h2>
          <IconButton etiqueta="Cerrar" onClick={onCerrar}>
            <X className="size-5" aria-hidden />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {pie && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))]">
            {pie}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
