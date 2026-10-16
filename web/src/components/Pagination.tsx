import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './Button'

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const

export function paginar<T>(items: readonly T[], pagina: number, tamano: number): { items: T[]; paginas: number; pagina: number } {
  const paginas = Math.max(1, Math.ceil(items.length / tamano))
  const p = Math.min(Math.max(1, pagina), paginas)
  return { items: items.slice((p - 1) * tamano, p * tamano), paginas, pagina: p }
}

export function Pagination({
  pagina,
  paginas,
  total,
  tamano,
  onPagina,
  onTamano,
}: {
  pagina: number
  paginas: number
  total: number
  tamano: number
  onPagina: (p: number) => void
  onTamano: (t: number) => void
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1
  const hasta = Math.min(total, pagina * tamano)
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="num text-muted" aria-live="polite">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted">
          Filas
          <select
            value={tamano}
            onChange={(e) => onTamano(Number(e.target.value))}
            className="min-h-11 rounded-ctl border border-line bg-surface px-2 text-ink"
          >
            {TAMANOS_PAGINA.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <IconButton etiqueta="Página anterior" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <span className="num">
          {pagina} / {paginas}
        </span>
        <IconButton etiqueta="Página siguiente" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
      </div>
    </nav>
  )
}
