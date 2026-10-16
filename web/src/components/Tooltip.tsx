import { Info } from 'lucide-react'
import { useId, useState } from 'react'

/** ⓘ explicativo: se abre con mouse, toque y teclado; siempre se dibuja encima. */
export function InfoTip({ texto }: { texto: string }) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Más información"
        aria-describedby={abierto ? id : undefined}
        aria-expanded={abierto}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info className="size-4" aria-hidden />
      </button>
      {abierto && (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full left-1/2 z-50 mb-1 w-56 -translate-x-1/2 rounded-ctl bg-ink px-3 py-2 text-xs text-bg shadow-2"
        >
          {texto}
        </span>
      )}
    </span>
  )
}
