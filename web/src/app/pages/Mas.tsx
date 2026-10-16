import { NAV_PRINCIPAL } from '../nav'

export function Mas() {
  return (
    <nav aria-label="Más secciones" className="grid gap-2 sm:grid-cols-2">
      {NAV_PRINCIPAL.slice(3).map((n) => (
        <a
          key={n.path}
          href={`#${n.path}`}
          className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-4 font-medium shadow-1 hover:bg-surface-2"
        >
          <n.icono className="size-5 text-primary" aria-hidden />
          {n.etiqueta}
        </a>
      ))}
    </nav>
  )
}
