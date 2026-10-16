import { useState } from 'react'
import type { Movimiento } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Modal } from '@/components/Modal'
import { Segmented } from '@/components/Segmented'
import { Tabs } from '@/components/Tabs'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import type { GrupoDuplicado } from '@/engine/calidad'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { toast } from '@/store/toasts'
import { sugerirClasificacion, type DatosCalidad } from './logica'

type Estado = GrupoDuplicado['estado']
const ETQ: Record<Estado, string> = { legitimo: 'Legítimo', pendiente: 'Pendiente', duplicado: 'Duplicado confirmado' }

function Resumen({ m, base }: { m: Movimiento; base: string }) {
  return (
    <span className="min-w-0">
      <span className="font-medium">{m.descripcion || 'Sin descripción'}</span> <span className="text-muted">· {m.fecha} · </span>
      <span className="num">{formatoMoneda(aCentimos(m.monto), m.moneda || base)}</span>
    </span>
  )
}

/** «Revisar datos»: incompletos, clasificaciones inactivas (con sugerencia) y posibles duplicados con su estado. */
export function RevisarDatos({ datos, onCerrar }: { datos: DatosCalidad; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const abrirMov = useFormMov((s) => s.abrir)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const [tab, setTab] = useState('incompletos')
  const [anulando, setAnulando] = useState<{ grupo: GrupoDuplicado; elegido: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const porId = new Map(vista.movimientos.map((m) => [m.id, m] as const))
  const nombreSub = (id: string) => vista.subcategorias.find((s) => s.id === id)?.nombre ?? '—'
  const editar = (id: string) => {
    const m = porId.get(id)
    if (!m) return
    onCerrar()
    abrirMov('editar', m)
  }
  const { calidad, duplicados } = datos
  const pendDup = duplicados.filter((d) => d.estado === 'pendiente').length

  const marcar = async (g: GrupoDuplicado, estado: Estado, anular?: string) => {
    setEnviando(true)
    const r = await mutar('revision.guardar', { tipo_alerta: 'duplicado', firma: g.firma, estado, movimiento_ids: g.movimientoIds })
    if (!r.ok) {
      setEnviando(false)
      toast.error(`No se pudo guardar la revisión: ${r.error.message}`)
      return
    }
    if (anular) {
      const m = porId.get(anular)
      const a = m ? await mutar('movimiento.anular', { id: m.id, version: m.version }) : null
      if (a && !a.ok) toast.error(`Se guardó la revisión, pero no se pudo anular el movimiento: ${a.error.message}`)
      else toast.ok('Marcado como duplicado y movimiento anulado.')
    } else toast.ok(`Grupo marcado como «${ETQ[estado].toLowerCase()}».`)
    setEnviando(false)
    setAnulando(null)
  }
  const elegirEstado = (g: GrupoDuplicado, e: Estado) => {
    if (e === g.estado || enviando) return
    if (e === 'duplicado') {
      const candidatos = g.movimientoIds.filter((id) => porId.get(id)?.estado === 'activo')
      setAnulando({ grupo: g, elegido: candidatos[candidatos.length - 1] ?? '' })
    } else void marcar(g, e)
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Revisar datos" ancho="lg" pie={<Button variante="secondary" onClick={onCerrar}>Cerrar</Button>}>
      <Tabs
        etiqueta="Qué revisar"
        activa={tab}
        onChange={setTab}
        tabs={[
          { id: 'incompletos', etiqueta: `Incompletos (${calidad.incompletos.length})` },
          { id: 'clasificacion', etiqueta: `Clasificación (${calidad.clasificacionInactiva.length})` },
          { id: 'duplicados', etiqueta: `Duplicados (${pendDup})` },
        ]}
      >
        <div className="grid gap-2 pt-3">
          {tab === 'incompletos' &&
            (calidad.incompletos.length === 0 ? (
              <p className="text-muted">No hay movimientos incompletos.</p>
            ) : (
              <ul className="divide-y divide-line">
                {calidad.incompletos.map((i) => {
                  const m = porId.get(i.id)
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        {m && <Resumen m={m} base={base} />}
                        <p className="text-sm text-danger">{i.motivos.join(' · ')}</p>
                      </div>
                      <Button variante="secondary" className="min-h-9" onClick={() => editar(i.id)}>Corregir</Button>
                    </li>
                  )
                })}
              </ul>
            ))}
          {tab === 'clasificacion' &&
            (calidad.clasificacionInactiva.length === 0 ? (
              <p className="text-muted">Todas las clasificaciones están vigentes.</p>
            ) : (
              <ul className="divide-y divide-line">
                {calidad.clasificacionInactiva.map((i) => {
                  const m = porId.get(i.id)
                  const sug = sugerirClasificacion(vista, i.id)
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        {m && <Resumen m={m} base={base} />}
                        <p className="text-sm text-muted">Hoy: {m ? nombreSub(m.subcategoria_id) : '—'}</p>
                        <p className="text-sm text-danger">{i.motivos.join(' · ')}</p>
                        <p className="text-sm">{sug ? <>Sugerencia: <strong>{sug.texto}</strong></> : 'No hay una clasificación activa que sugerir.'}</p>
                      </div>
                      <Button variante="secondary" className="min-h-9" onClick={() => editar(i.id)}>Reclasificar</Button>
                    </li>
                  )
                })}
              </ul>
            ))}
          {tab === 'duplicados' &&
            (duplicados.length === 0 ? (
              <p className="text-muted">No se encontraron posibles duplicados.</p>
            ) : (
              <ul className="grid gap-3">
                {duplicados.map((g) => (
                  <li key={g.firma} className="rounded-ctl border border-line p-3">
                    <ul className="mb-2 grid gap-1">
                      {g.movimientoIds.map((id) => {
                        const m = porId.get(id)
                        return m ? (
                          <li key={id}>
                            <Resumen m={m} base={base} />
                            {m.estado === 'anulado' && <span className="ml-2 text-sm text-muted">(anulado)</span>}
                          </li>
                        ) : null
                      })}
                    </ul>
                    <Segmented etiqueta={`Estado del grupo ${g.movimientoIds.length} movimientos`} value={g.estado} onChange={(e) => elegirEstado(g, e)} opciones={(['legitimo', 'pendiente', 'duplicado'] as Estado[]).map((e) => ({ valor: e, etiqueta: ETQ[e] }))} />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Tabs>

      {anulando && (
        <ConfirmDialog
          abierto
          titulo="Duplicado confirmado"
          confirmar="Anular el elegido"
          peligro
          loading={enviando}
          confirmarDeshabilitado={!anulando.elegido}
          onCancelar={() => setAnulando(null)}
          onConfirmar={() => void marcar(anulando.grupo, 'duplicado', anulando.elegido)}
          impacto={
            <div className="grid gap-2">
              <p>Elige cuál anular. Se puede restaurar después desde Movimientos.</p>
              {anulando.grupo.movimientoIds.map((id) => {
                const m = porId.get(id)
                if (!m || m.estado !== 'activo') return null
                return (
                  <label key={id} className="flex min-h-11 items-center gap-2">
                    <input type="radio" name="anular-dup" checked={anulando.elegido === id} onChange={() => setAnulando({ ...anulando, elegido: id })} />
                    <Resumen m={m} base={base} />
                  </label>
                )
              })}
              <Button
                variante="ghost"
                onClick={() => void marcar(anulando.grupo, 'duplicado')}
              >
                Solo marcar, sin anular
              </Button>
            </div>
          }
        />
      )}
    </Modal>
  )
}
