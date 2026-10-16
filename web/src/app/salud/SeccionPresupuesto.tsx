import { navegar } from '@/lib/router'
import { Button } from '@/components/Button'
import { KpiCard, StatRow } from '@/components/KpiCard'
import { ProgressBar, type EstadoBarra } from '@/components/ProgressBar'
import { formatoMoneda, formatoPct } from '@/engine/dinero'
import { useDatos } from '@/store/datos'
import { etiquetaEstadoCaja } from '../presupuesto/logica'
import { calcularSaludPresupuesto } from './logica'

const BARRA: Record<string, EstadoBarra> = { al_dia: 'ok', atencion: 'atencion', critico: 'critico', excedida: 'excedido' }

export function SeccionPresupuesto({ mes }: { mes: string }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const s = calcularSaludPresupuesto(vista, config, mes)
  const m = (c: number) => formatoMoneda(c, base)
  const u = s.umbrales
  if (s.presupuesto === 0) {
    return (
      <div className="grid gap-2">
        <p className="text-muted">{mes} no tiene presupuesto: aplica tus fuentes y cajas para ver cuánto te queda.</p>
        <div><Button onClick={() => navegar('/presupuesto')}>Preparar mi mes</Button></div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <KpiCard titulo="Disponible tras compromisos" valor={m(s.disponibleTrasCompromisos)} ayuda="Lo que te queda del presupuesto después de reservar lo que aún debes pagar en compromisos." pie={`Disponible ${m(s.disponible)} − compromisos pendientes ${m(s.compromisosPendientes)}`} />
        <KpiCard titulo="Consumo del presupuesto" valor={formatoPct(s.pctConsumido, 0)} ayuda={`Alertas al ${Math.round(u.atencion * 100)} % (atención), ${Math.round(u.critico * 100)} % (crítico) y ${Math.round(u.excedida * 100)} % (excedida).`} />
      </div>
      <section aria-labelledby="riesgo">
        <h3 id="riesgo" className="mb-2 text-lg font-semibold">Cajas en riesgo</h3>
        {s.alertas.length === 0 ? (
          <p className="text-muted">Ninguna caja pasó del {Math.round(u.atencion * 100)} %. Vas bien.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
            {s.alertas.map((a) => (
              <li key={a.caja.caja.id} className="min-w-0 rounded-ctl border border-line p-3">
                <StatRow etiqueta={a.caja.caja.nombre} valor={`${m(a.caja.gastado)} / ${m(a.caja.asignado)}`} />
                <ProgressBar pct={(a.caja.pct ?? 0) * 100} etiqueta={`Consumo de ${a.caja.caja.nombre}`} estado={BARRA[a.nivel]} />
                <p className={`mt-1 text-sm ${a.nivel === 'excedida' ? 'text-danger' : 'text-warn'}`}>{etiquetaEstadoCaja(a.caja)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
