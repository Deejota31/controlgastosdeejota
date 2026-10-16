import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { KpiCard } from '@/components/KpiCard'
import { calcularCompromisos } from '@/engine/compromisos'
import { deCentimos, formatoMoneda } from '@/engine/dinero'
import { prepararMovimientos } from '@/engine/movimientos'
import { tipoCambioDe } from '@/lib/catalogo'
import { navegar } from '@/lib/router'
import { cn } from '@/lib/cn'
import { useDatos } from '@/store/datos'
import { useFormMov, type SemillaMov } from '@/store/formMov'
import { toast } from '@/store/toasts'
import { CalendarCheck } from 'lucide-react'
import { datosDe } from '../gastosmes/logica'
import { candidatosAPago, ordenarCompromisos, type EstadoVisible, type FilaCompromiso } from './logica'

const ETQ: Record<EstadoVisible, string> = { vencido: 'Vencido', proximo: 'Próximo', pendiente: 'Pendiente', pagado: 'Cubierto', sin_monto: 'Sin monto' }
const TONO: Record<EstadoVisible, string> = { vencido: 'bg-danger-soft text-danger', proximo: 'bg-warn-soft text-warn', pendiente: 'bg-surface-2 text-muted', pagado: 'bg-ok-soft text-ok', sin_monto: 'bg-surface-2 text-muted' }

function textoVence(f: FilaCompromiso): string {
  if (f.dias === null) return f.compromiso.dia_vencimiento ? `Vence el día ${f.compromiso.dia_vencimiento}` : 'Sin día de vencimiento'
  if (f.dias < 0) return `Venció hace ${-f.dias} ${f.dias === -1 ? 'día' : 'días'}`
  if (f.dias === 0) return 'Vence hoy'
  return `Vence en ${f.dias} ${f.dias === 1 ? 'día' : 'días'}`
}

export function SeccionCompromisos({ mes, hoy }: { mes: string; hoy: string }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const abrirMov = useFormMov((s) => s.abrir)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const m = (c: number) => formatoMoneda(c, base)
  const [asociando, setAsociando] = useState<{ id: string; elegido: string } | null>(null)
  const [quitando, setQuitando] = useState<{ compromisoId: string; movimientoId: string; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  const resumen = useMemo(
    () => calcularCompromisos(mes, vista.compromisos, vista.compromiso_pagos, prepararMovimientos(vista.movimientos), (mo) => tipoCambioDe(config, mo), base),
    [vista.compromisos, vista.compromiso_pagos, vista.movimientos, config, mes, base],
  )
  const filas = useMemo(() => ordenarCompromisos(resumen, hoy), [resumen, hoy])
  const abiertos = filas.filter((f) => f.visible !== 'pagado')
  const pagados = filas.filter((f) => f.visible === 'pagado')
  const porMov = new Map(vista.movimientos.map((x) => [x.id, x] as const))

  if (vista.compromisos.filter((c) => c.activo).length === 0) {
    return (
      <EmptyState
        icono={<CalendarCheck className="size-7" aria-hidden />}
        titulo="Aún no tienes compromisos"
        mensaje="Un compromiso es un pago fijo del mes, como el alquiler. Crea una plantilla de gasto marcada como «Es compromiso» en Gastos del mes."
      />
    )
  }

  const registrarPago = (f: FilaCompromiso) => {
    const c = f.compromiso
    const pl = vista.plantillas.find((p) => p.id === c.plantilla_id)
    const d = pl ? datosDe(pl) : null
    const mismaMoneda = c.moneda === base
    const monto = f.previsto === null ? '' : mismaMoneda ? String(deCentimos(f.pendiente > 0 ? f.pendiente : f.previsto)) : String(c.monto_previsto ?? '')
    const semilla: SemillaMov = {
      ambito: d?.ambito_id, categoria: d?.categoria_id, sub: d?.subcategoria_id, descripcion: d?.descripcion || c.nombre, monto, moneda: c.moneda,
      medio: d?.medio_pago_id, tipo: d?.tipo_gasto ?? 'fijo', recurrente: d?.es_recurrente, compromisoId: c.id,
    }
    abrirMov('nuevo', undefined, semilla)
  }
  const vincular = async () => {
    if (!asociando?.elegido) return
    setEnviando(true)
    const r = await mutar('compromiso.vincular', { compromiso_id: asociando.id, movimiento_id: asociando.elegido, mes })
    setEnviando(false)
    if (r.ok) {
      toast.ok('Movimiento asociado al compromiso.')
      setAsociando(null)
    } else toast.error(`No se pudo asociar: ${r.error.message}`)
  }
  const desvincular = async () => {
    if (!quitando) return
    setEnviando(true)
    const r = await mutar('compromiso.desvincular', { compromiso_id: quitando.compromisoId, movimiento_id: quitando.movimientoId })
    setEnviando(false)
    if (r.ok) {
      toast.ok('Pago quitado del compromiso.')
      setQuitando(null)
    } else toast.error(`No se pudo quitar: ${r.error.message}`)
  }

  const Fila = ({ f }: { f: FilaCompromiso }) => (
    <li className="rounded-ctl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{f.compromiso.nombre}</p>
          <p className="text-sm text-muted">{f.visible === 'pagado' ? 'Pagado completo' : textoVence(f)}</p>
        </div>
        <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-medium', TONO[f.visible])}>{ETQ[f.visible]}</span>
      </div>
      <p className="num mt-1 text-sm">
        {f.previsto === null ? 'Sin monto previsto' : <>Previsto {m(f.previsto)} · Pagado {m(f.pagado)} · Pendiente {m(f.pendiente)}</>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {f.visible !== 'pagado' && (
          <Button className="min-h-9" onClick={() => registrarPago(f)} aria-label={`Registrar pago de ${f.compromiso.nombre}`}>Registrar pago</Button>
        )}
        <Button variante="secondary" className="min-h-9" onClick={() => setAsociando({ id: f.compromiso.id, elegido: '' })} aria-label={`Asociar movimiento a ${f.compromiso.nombre}`}>Asociar movimiento</Button>
      </div>
      {f.pagos.length > 0 && (
        <details className="mt-2">
          <summary className="min-h-9 cursor-pointer py-1.5 text-sm text-muted">Pagos vinculados ({f.pagos.length})</summary>
          <ul className="divide-y divide-line">
            {f.pagos.map((p) => {
              const mv = porMov.get(p.movimientoId)
              const texto = `${mv?.descripcion || 'Movimiento'} · ${mv?.fecha ?? ''}`
              return (
                <li key={p.movimientoId} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                  <button type="button" className="min-w-0 truncate text-left underline-offset-2 hover:underline" onClick={() => navegar('/movimientos', { resaltar: p.movimientoId, volver: '/salud' })}>
                    {texto} · <span className="num">{m(p.cents)}</span>
                  </button>
                  <Button variante="ghost" className="min-h-9" onClick={() => setQuitando({ compromisoId: f.compromiso.id, movimientoId: p.movimientoId, texto })} aria-label={`Quitar pago ${texto}`}>Quitar</Button>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </li>
  )

  const cands = asociando ? candidatosAPago(vista, mes, asociando.id) : []
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <KpiCard titulo="Previsto" valor={m(resumen.previsto)} ayuda="Suma de lo que esperas pagar este mes en compromisos con monto." />
        <KpiCard titulo="Pagado" valor={m(resumen.pagado)} ayuda="Movimientos activos vinculados a un compromiso este mes. Anular un pago deja de cubrirlo." />
        <KpiCard titulo="Pendiente" valor={m(resumen.pendiente)} ayuda="Lo que falta cubrir: previsto menos pagado, sin bajar de cero por compromiso." />
      </div>
      {abiertos.length > 0 && <ul aria-label="Compromisos por pagar" className="grid gap-3">{abiertos.map((f) => <Fila key={f.compromiso.id} f={f} />)}</ul>}
      {abiertos.length === 0 && <p className="text-muted">No tienes compromisos por pagar en {mes}.</p>}
      {pagados.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Pagados ({pagados.length})</summary>
          <ul aria-label="Compromisos pagados" className="mt-2 grid gap-3">{pagados.map((f) => <Fila key={f.compromiso.id} f={f} />)}</ul>
        </details>
      )}

      {asociando && (
        <ConfirmDialog
          abierto
          titulo="Asociar movimiento"
          confirmar="Asociar"
          loading={enviando}
          confirmarDeshabilitado={!asociando.elegido}
          onCancelar={() => setAsociando(null)}
          onConfirmar={() => void vincular()}
          impacto={
            cands.length === 0 ? (
              <p>No hay movimientos del mes disponibles: los que ya pagan otro compromiso o están anulados no se ofrecen.</p>
            ) : (
              <fieldset className="grid gap-1">
                <legend className="mb-1">Elige el movimiento que pagó este compromiso.</legend>
                {cands.map((c) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-2">
                    <input type="radio" name="asociar" checked={asociando.elegido === c.id} onChange={() => setAsociando({ ...asociando, elegido: c.id })} />
                    <span className="min-w-0 truncate">{c.descripcion || 'Sin descripción'} · {c.fecha} · <span className="num">{m(c.cents)}</span></span>
                  </label>
                ))}
              </fieldset>
            )
          }
        />
      )}
      {quitando && (
        <ConfirmDialog abierto titulo="Quitar pago" confirmar="Quitar" peligro loading={enviando} onCancelar={() => setQuitando(null)} onConfirmar={() => void desvincular()} impacto={<p>«{quitando.texto}» dejará de contar como pago de este compromiso. El movimiento no se borra.</p>} />
      )}
    </div>
  )
}
