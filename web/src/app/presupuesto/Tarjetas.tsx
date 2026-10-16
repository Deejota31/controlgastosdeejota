import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Caja, Fuente } from '@/api/esquemas'
import { InsigniaIcono } from '@/components/Icono'
import { MenuAcciones, type AccionMenu } from '@/components/MenuAcciones'
import { ProgressBar } from '@/components/ProgressBar'
import { Switch } from '@/components/Switch'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import type { CajaCalculada, FuenteCalculada } from '@/engine/presupuesto'
import { cn } from '@/lib/cn'
import { etiquetaEstadoCaja, fuenteVigente, pctDeUso, type EstadoMes } from './logica'

const TEXTO_ESTADO: Record<EstadoMes | 'fuera', string> = { aplicada: 'Aplicada', omitida: 'No aplica este mes', sin_aplicar: 'Sin aplicar', fuera: 'Fuera de vigencia' }
const TONO: Record<EstadoMes | 'fuera', string> = {
  aplicada: 'bg-ok-soft text-ok',
  omitida: 'bg-surface-2 text-muted',
  sin_aplicar: 'bg-warn-soft text-warn',
  fuera: 'bg-surface-2 text-muted',
}

export function InsigniaEstado({ estado }: { estado: EstadoMes | 'fuera' }) {
  return <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-medium', TONO[estado])}>{TEXTO_ESTADO[estado]}</span>
}

function Dato({ etiqueta, children, tono }: { etiqueta: string; children: ReactNode; tono?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{etiqueta}</dt>
      <dd className={cn('num truncate font-medium', tono === 'danger' && 'text-danger')}>{children}</dd>
    </div>
  )
}

export interface TarjetaFuenteProps {
  fuente: Fuente
  mes: string
  estado: EstadoMes
  montoMes: number | null
  calculo: FuenteCalculada | null
  mediosLigados: string[]
  baseMoneda: string
  pendiente: boolean
  acciones: AccionMenu[]
  onActivo: (v: boolean) => void
  onAjustar: () => void
  onOmitir: () => void
}

export function TarjetaFuente({ fuente: f, mes, estado, montoMes, calculo, mediosLigados, baseMoneda, pendiente, acciones, onActivo, onAjustar, onOmitir }: TarjetaFuenteProps) {
  const vigente = fuenteVigente(f, mes)
  const est: EstadoMes | 'fuera' = !vigente ? 'fuera' : estado
  const consumido = calculo ? calculo.consumido : 0
  const asignado = calculo ? calculo.asignado : 0
  const pct = asignado > 0 ? (consumido / asignado) * 100 : 0
  return (
    <li className={cn('grid gap-3 rounded-card border border-line bg-surface p-4 shadow-1', !f.activo && 'opacity-80')} aria-busy={pendiente || undefined}>
      <div className="flex items-start gap-3">
        <InsigniaIcono icono={f.icono} color={f.color} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 font-semibold">
            <span className="truncate">{f.nombre}</span>
            {f.es_principal && <span className="rounded-full bg-primary-soft px-2 text-sm text-primary">Principal</span>}
            {!f.activo && <span className="rounded-full bg-surface-2 px-2 text-sm text-muted">Inactiva</span>}
          </h3>
          <p className="text-sm text-muted">
            {f.recurrencia === 'mensual' ? `Todos los meses desde ${f.mes_inicio}${f.mes_fin ? ` hasta ${f.mes_fin}` : ''}` : `Solo ${f.mes_inicio}`} · por defecto {formatoMoneda(aCentimos(f.monto_defecto), f.moneda)}
          </p>
          {mediosLigados.length > 0 && (
            <p className="flex items-center gap-1 text-sm text-muted">
              <Lock className="size-3.5" aria-hidden /> Solo cubre: {mediosLigados.join(', ')}
            </p>
          )}
        </div>
        <Switch etiqueta={`Fuente ${f.nombre} activa`} checked={f.activo} onChange={onActivo} disabled={pendiente} />
        <MenuAcciones etiqueta={`Acciones de ${f.nombre}`} acciones={acciones} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InsigniaEstado estado={est} />
        {pendiente && <span className="text-sm text-muted">Guardando…</span>}
      </div>
      {estado === 'aplicada' && vigente && f.activo && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Dato etiqueta="Aporta en el mes">{formatoMoneda(aCentimos(montoMes ?? 0), f.moneda)}</Dato>
            <Dato etiqueta="En moneda base">{formatoMoneda(asignado, baseMoneda)}</Dato>
            <Dato etiqueta="Restante" tono={calculo && calculo.restante < 0 ? 'danger' : undefined}>
              {formatoMoneda(calculo?.restante ?? 0, baseMoneda)}
            </Dato>
          </dl>
          <ProgressBar pct={pct} etiqueta={`Consumo de ${f.nombre}`} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {vigente && f.activo && (
          <button type="button" onClick={onAjustar} disabled={pendiente} className="min-h-11 rounded-ctl border border-line px-3 font-medium hover:bg-surface-2 disabled:opacity-50">
            {estado === 'aplicada' ? 'Ajustar monto' : 'Aplicar a este mes'}
          </button>
        )}
        {vigente && f.activo && estado !== 'omitida' && (
          <button type="button" onClick={onOmitir} disabled={pendiente} className="min-h-11 rounded-ctl border border-line px-3 hover:bg-surface-2 disabled:opacity-50">
            No aplica este mes
          </button>
        )}
      </div>
    </li>
  )
}

export interface TarjetaCajaProps {
  caja: Caja
  mes: string
  estado: EstadoMes
  montoMes: number | null
  calculo: CajaCalculada | null
  etiquetaAlcance: string
  tipoAlcance: string
  baseMoneda: string
  pendiente: boolean
  acciones: AccionMenu[]
  onActivo: (v: boolean) => void
  onAjustar: () => void
  onOmitir: () => void
}

export function TarjetaCaja({ caja: c, estado, montoMes, calculo, etiquetaAlcance, tipoAlcance, baseMoneda, pendiente, acciones, onActivo, onAjustar, onOmitir }: TarjetaCajaProps) {
  const pct = calculo ? pctDeUso(calculo.asignado, calculo.gastado) : null
  const barra = calculo?.estado === 'excedida' ? 'excedido' : calculo?.estado === 'critico' ? 'critico' : calculo?.estado === 'atencion' ? 'atencion' : 'ok'
  return (
    <li className={cn('grid gap-3 rounded-card border border-line bg-surface p-4 shadow-1', !c.activo && 'opacity-80')} aria-busy={pendiente || undefined}>
      <div className="flex items-start gap-3">
        <InsigniaIcono icono={c.icono} color={c.color} />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-x-2 font-semibold">
            <span className="truncate">{c.nombre}</span>
            {!c.activo && <span className="rounded-full bg-surface-2 px-2 text-sm text-muted">Inactiva</span>}
          </h3>
          <p className="text-sm text-muted">
            {tipoAlcance}: {etiquetaAlcance} · por defecto {formatoMoneda(aCentimos(c.monto_defecto), baseMoneda)}
          </p>
          {c.descripcion && <p className="text-sm text-muted">{c.descripcion}</p>}
        </div>
        <Switch etiqueta={`Caja ${c.nombre} activa`} checked={c.activo} onChange={onActivo} disabled={pendiente} />
        <MenuAcciones etiqueta={`Acciones de ${c.nombre}`} acciones={acciones} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <InsigniaEstado estado={estado} />
        {calculo && (
          <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-medium', calculo.estado === 'al_dia' ? 'bg-ok-soft text-ok' : calculo.estado === 'atencion' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger')}>{etiquetaEstadoCaja(calculo)}</span>
        )}
        {pendiente && <span className="text-sm text-muted">Guardando…</span>}
      </div>
      {calculo ? (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Dato etiqueta="Asignado">{formatoMoneda(calculo.asignado, baseMoneda)}</Dato>
            <Dato etiqueta="Gastado">{formatoMoneda(calculo.gastado, baseMoneda)}</Dato>
            <Dato etiqueta="Disponible" tono={calculo.disponible < 0 ? 'danger' : undefined}>
              {formatoMoneda(calculo.disponible, baseMoneda)}
            </Dato>
          </dl>
          <ProgressBar pct={pct ?? (calculo.gastado > 0 ? 100 : 0)} estado={barra} etiqueta={`Uso de ${c.nombre}`} />
        </>
      ) : (
        estado === 'omitida' && <p className="text-sm text-muted">Esta caja no cuenta en el mes.</p>
      )}
      {estado === 'aplicada' && !c.activo && <p className="text-sm text-muted">Está aplicada pero inactiva: no reserva dinero hasta que la actives.</p>}
      {montoMes !== null && estado !== 'sin_aplicar' && !calculo && c.activo && <p className="num text-sm text-muted">Monto del mes: {formatoMoneda(aCentimos(montoMes), baseMoneda)}</p>}
      <div className="flex flex-wrap gap-2">
        {c.activo && (
          <button type="button" onClick={onAjustar} disabled={pendiente} className="min-h-11 rounded-ctl border border-line px-3 font-medium hover:bg-surface-2 disabled:opacity-50">
            {estado === 'aplicada' ? 'Ajustar monto' : 'Aplicar a este mes'}
          </button>
        )}
        {c.activo && estado !== 'omitida' && (
          <button type="button" onClick={onOmitir} disabled={pendiente} className="min-h-11 rounded-ctl border border-line px-3 hover:bg-surface-2 disabled:opacity-50">
            No aplica este mes
          </button>
        )}
      </div>
    </li>
  )
}
