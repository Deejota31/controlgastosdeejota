import { useMemo } from 'react'
import { cn } from '@/lib/cn'
import { formatoMoneda } from '@/engine/dinero'
import { mesesCompletos } from '@/engine/periodo'
import { useFiltros } from '@/lib/filtros'
import { navegar } from '@/lib/router'
import { useHoy } from '@/lib/fecha'
import { useDatos } from '@/store/datos'
import { BarraFiltros } from '../filtros/BarraFiltros'
import { SeccionCalidad } from '../salud/SeccionCalidad'
import { SeccionCompromisos } from '../salud/SeccionCompromisos'
import { SeccionConciliacion } from '../salud/SeccionConciliacion'
import { SeccionEvolucion } from '../salud/SeccionEvolucion'
import { SeccionPresupuesto } from '../salud/SeccionPresupuesto'
import { calcularCalidadDe, calcularSaludPresupuesto, verificacionesDe } from '../salud/logica'

type Id = 'calidad' | 'presupuesto' | 'evolucion' | 'compromisos' | 'conciliacion'
const TITULOS: Record<Id, string> = { calidad: 'Calidad de datos', presupuesto: 'Mi presupuesto', evolucion: 'Evolución', compromisos: 'Compromisos', conciliacion: 'Conciliación de saldos' }
const ORDEN: Id[] = ['calidad', 'presupuesto', 'evolucion', 'compromisos', 'conciliacion']

export function Salud() {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const hoy = useHoy(zona)
  const { filtros, cambiar, ruta } = useFiltros(hoy)
  const meses = mesesCompletos(filtros)
  // Presupuesto, compromisos y conciliación son mensuales: con varios meses se usa el último.
  const mes = meses ? meses[meses.length - 1]! : hoy.slice(0, 7)
  const pedida = ruta.params.get('seccion')
  const activa: Id = (ORDEN as string[]).includes(pedida ?? '') ? (pedida as Id) : 'calidad'
  const base = (config['moneda_base'] || 'PEN').toUpperCase()

  const resumenes = useMemo(() => {
    const cal = calcularCalidadDe(vista)
    const pres = calcularSaludPresupuesto(vista, config, mes)
    const vs = verificacionesDe(vista, config).filter((v) => !v.reemplazada)
    const abiertas = vs.filter((v) => v.estado !== 'conciliada' && v.estado !== 'cerrada_justificada').length
    return {
      calidad: cal.calidad.sinDatos ? 'Sin datos' : `${cal.calidad.puntaje} de 100`,
      presupuesto: pres.presupuesto === 0 ? 'Sin presupuesto' : `${formatoMoneda(pres.disponibleTrasCompromisos, base)} libres`,
      evolucion: 'Subidas y bajadas',
      compromisos: `${vista.compromisos.filter((c) => c.activo).length} activos`,
      conciliacion: vs.length === 0 ? 'Sin verificar' : abiertas === 0 ? 'Al día' : `${abiertas} por revisar`,
    } satisfies Record<Id, string>
  }, [vista, config, mes, base])

  const elegir = (id: Id) => navegar('/salud', { ...Object.fromEntries(ruta.params), seccion: id }, { reemplazar: true })

  return (
    <div className="grid grid-cols-1 gap-4">
      <BarraFiltros hoy={hoy} filtros={filtros} onCambiar={cambiar} idBase="salud" />
      <div role="tablist" aria-label="Secciones de salud financiera" className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {ORDEN.map((id, i) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activa === id}
            aria-controls={`panel-${id}`}
            tabIndex={activa === id ? 0 : -1}
            onClick={() => elegir(id)}
            onKeyDown={(e) => {
              const j = e.key === 'ArrowRight' ? (i + 1) % ORDEN.length : e.key === 'ArrowLeft' ? (i - 1 + ORDEN.length) % ORDEN.length : -1
              if (j >= 0) {
                e.preventDefault()
                elegir(ORDEN[j]!)
                document.getElementById(`tab-${ORDEN[j]}`)?.focus()
              }
            }}
            className={cn('min-h-16 min-w-0 rounded-card border p-3 text-left shadow-1 transition-colors', activa === id ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-2', id === 'conciliacion' && 'col-span-2 lg:col-span-1')}
          >
            <span className="block truncate font-medium">{TITULOS[id]}</span>
            <span className="num block truncate text-sm text-muted">{resumenes[id]}</span>
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${activa}`} aria-labelledby={`tab-${activa}`} className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-1">
        <h2 className="mb-3 text-xl font-semibold">{TITULOS[activa]}</h2>
        {activa === 'calidad' && <SeccionCalidad />}
        {activa === 'presupuesto' && <SeccionPresupuesto mes={mes} />}
        {activa === 'evolucion' && <SeccionEvolucion filtros={filtros} hoy={hoy} />}
        {activa === 'compromisos' && <SeccionCompromisos mes={mes} hoy={hoy} />}
        {activa === 'conciliacion' && <SeccionConciliacion mes={mes} hoy={hoy} />}
      </section>
      <p className="sr-only" aria-live="polite">{TITULOS[activa]}</p>
    </div>
  )
}
