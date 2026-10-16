import { useMemo } from 'react'
import { KpiCard } from '@/components/KpiCard'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { useDatos } from '@/store/datos'

const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

/** Resumen mínimo con los datos reales del store; el panel completo llega con la fase de Inicio y análisis. */
export function Inicio() {
  const vista = useDatos((s) => s.vista)
  const resumen = useMemo(() => {
    const activos = vista.movimientos.filter((m) => m.estado === 'activo')
    const mes = hoyLima().slice(0, 7)
    const delMes = activos.filter((m) => m.fecha.startsWith(mes))
    const sinTC = delMes.filter((m) => m.monto_base === null).length
    const totalMes = delMes.reduce((a, m) => a + (m.monto_base === null ? 0 : aCentimos(m.monto_base)), 0)
    const ultimos = [...activos].sort((a, b) => (a.fecha === b.fecha ? b.creado_en.localeCompare(a.creado_en) : b.fecha.localeCompare(a.fecha))).slice(0, 5)
    return { total: activos.length, delMes: delMes.length, totalMes, sinTC, ultimos }
  }, [vista.movimientos])
  const nombre = (id: string) => vista.subcategorias.find((s) => s.id === id)?.nombre ?? vista.categorias.find((c) => c.id === id)?.nombre ?? '—'

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard titulo="Gastado este mes" valor={formatoMoneda(resumen.totalMes)} pie={resumen.sinTC ? `${resumen.sinTC} sin tipo de cambio (excluidos)` : undefined} />
        <KpiCard titulo="Movimientos del mes" valor={resumen.delMes} />
        <KpiCard titulo="Movimientos en total" valor={resumen.total} />
      </div>
      <section className="rounded-card border border-line bg-surface p-4 shadow-1" aria-labelledby="ult-mov">
        <h2 id="ult-mov" className="mb-2 text-lg font-semibold">
          Últimos movimientos
        </h2>
        {resumen.ultimos.length === 0 ? (
          <p className="text-muted">Aún no hay movimientos. Cuando registres el primero aparecerá aquí.</p>
        ) : (
          <ul className="divide-y divide-line">
            {resumen.ultimos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.descripcion || nombre(m.subcategoria_id)}</p>
                  <p className="text-sm text-muted">
                    {m.fecha} · {nombre(m.subcategoria_id)}
                  </p>
                </div>
                <span className="num shrink-0 font-semibold">{formatoMoneda(aCentimos(m.monto), m.moneda)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
