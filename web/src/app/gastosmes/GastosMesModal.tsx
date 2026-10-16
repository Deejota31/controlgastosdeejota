import { ListChecks, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Plantilla } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { MenuAcciones } from '@/components/MenuAcciones'
import { Modal } from '@/components/Modal'
import { MoneyInput } from '@/components/MoneyInput'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { monedasPermitidas } from '@/lib/catalogo'
import { useHoy } from '@/lib/fecha'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { useGastosMes } from '@/store/gastosMes'
import { toast } from '@/store/toasts'
import { moverUno } from '../presupuesto/acciones'
import { FormPlantillaGasto } from './FormPlantillaGasto'
import { construirLote, filasDeGastos, filtrarGastos, problemaDeFila, totalesPorMoneda, type Edicion, type FilaGasto } from './logica'

type Sub = { t: 'form'; plantilla?: Plantilla; semilla?: { nombre: string; datos: FilaGasto['datos'] } } | { t: 'eliminar'; plantilla: Plantilla }

function Contenido() {
  const cerrar = useGastosMes((s) => s.cerrar)
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const mutar = useDatos((s) => s.mutar)
  const abrirMov = useFormMov((s) => s.abrir)
  const hoy = useHoy(zona)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const monedas = monedasPermitidas(config)

  const [fechaElegida, setFechaElegida] = useState<string | null>(null)
  const fecha = fechaElegida ?? hoy
  const [texto, setTexto] = useState('')
  const [ambito, setAmbito] = useState('')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ediciones, setEdiciones] = useState<Record<string, Partial<Edicion>>>({})
  const [problemas, setProblemas] = useState<Record<string, string>>({})
  const [errorLote, setErrorLote] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [sub, setSub] = useState<Sub | null>(null)
  const bloqueo = useRef(false)
  const ids = useRef(new Map<string, string>())
  const lote = useRef<{ firma: string; id: string }>({ firma: '', id: nuevoId('lote') })

  const mes = fecha.slice(0, 7)
  const filas = useMemo(() => filasDeGastos(vista, config, mes), [vista, config, mes])
  const visibles = useMemo(() => filtrarGastos(filas, texto, ambito), [filas, texto, ambito])
  const filtrando = !!texto || !!ambito
  const idsPlantillas = filas.map((f) => f.plantilla.id)
  // La selección no puede apuntar a plantillas que ya no existen o que pasaron a «requiere revisión».
  const efectiva = useMemo(() => new Set(filas.filter((f) => seleccion.has(f.plantilla.id) && !f.revision).map((f) => f.plantilla.id)), [filas, seleccion])

  const edicionDe = (f: FilaGasto): Edicion => {
    const e = ediciones[f.plantilla.id] ?? {}
    return { monto: e.monto ?? (f.datos.monto !== null ? String(f.datos.monto) : ''), moneda: e.moneda ?? (f.datos.moneda || base), medio: e.medio ?? f.datos.medio_pago_id }
  }
  const editar = (id: string, parcial: Partial<Edicion>) => {
    setEdiciones((e) => ({ ...e, [id]: { ...e[id], ...parcial } }))
    setProblemas((p) => (p[id] ? { ...p, [id]: '' } : p))
    setErrorLote(null)
  }
  const marcar = (id: string, v: boolean) => {
    setSeleccion((s) => {
      const n = new Set(s)
      if (v) n.add(id)
      else n.delete(id)
      return n
    })
    setErrorLote(null)
  }

  const elegidas = filas.filter((f) => efectiva.has(f.plantilla.id))
  const resumen = useMemo(() => {
    const items = elegidas.map((f) => {
      const e = edicionDe(f)
      const n = Number(e.monto.replace(',', '.'))
      return { monto: Number.isFinite(n) ? n : 0, moneda: e.moneda, nombre: f.plantilla.nombre }
    })
    return { items, totales: totalesPorMoneda(items) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegidas, ediciones])

  const idDe = (plantillaId: string) => {
    let id = ids.current.get(plantillaId)
    if (!id) ids.current.set(plantillaId, (id = nuevoId('mov')))
    return id
  }

  async function registrar() {
    if (bloqueo.current || elegidas.length === 0) return
    const probs: Record<string, string> = {}
    for (const f of elegidas) {
      const p = problemaDeFila(vista, config, f, edicionDe(f))
      if (p) probs[f.plantilla.id] = p
    }
    setProblemas(probs)
    const primero = elegidas.find((f) => probs[f.plantilla.id])
    if (primero) {
      setErrorLote(`Corrige ${Object.keys(probs).length === 1 ? 'el gasto marcado' : 'los gastos marcados'} antes de registrar. No se registró ninguno.`)
      document.getElementById(`gm-monto-${primero.plantilla.id}`)?.focus()
      return
    }
    const items = construirLote(fecha, elegidas.map((f) => ({ fila: f, edicion: edicionDe(f), id: idDe(f.plantilla.id) })))
    // El mismo lote se reintenta con el mismo id; si cambia lo que se envía, es otro lote.
    const firma = JSON.stringify(items)
    if (lote.current.firma !== firma) lote.current = { firma, id: lote.current.firma === '' ? lote.current.id : nuevoId('lote') }
    bloqueo.current = true
    setEnviando(true)
    setErrorLote(null)
    const r = await mutar('movimientos.lote', { lote_id: lote.current.id, items })
    setEnviando(false)
    bloqueo.current = false
    if (r.ok) {
      toast.ok(`${items.length === 1 ? 'Se registró 1 gasto' : `Se registraron ${items.length} gastos`}.`)
      cerrar()
    } else {
      setErrorLote(`No se registró ningún gasto: ${r.error.message}`)
    }
  }

  async function eliminar(p: Plantilla) {
    const r = await mutar('plantilla.eliminar', { id: p.id, confirmar: true })
    setSub(null) // vuelve al modal conservando búsqueda, filtros y selección
    if (r.ok) toast.ok('Plantilla eliminada.')
    else toast.error(`No se pudo eliminar: ${r.error.message}`)
  }

  function usar(f: FilaGasto) {
    cerrar()
    abrirMov('nuevo', undefined, {
      ambito: f.datos.ambito_id,
      categoria: f.datos.categoria_id,
      sub: f.datos.subcategoria_id,
      descripcion: f.datos.descripcion || f.plantilla.nombre,
      monto: f.datos.monto !== null ? String(f.datos.monto) : '',
      moneda: f.datos.moneda || base,
      medio: f.datos.medio_pago_id,
      tipo: f.datos.tipo_gasto,
      recurrente: f.datos.es_recurrente,
      ...(f.compromiso ? { compromisoId: f.compromiso.compromiso.id } : {}),
    })
  }

  const selectables = (lista: FilaGasto[]) => lista.filter((f) => !f.revision).map((f) => f.plantilla.id)
  const compr = filas.filter((f) => f.compromiso)
  const pendientes = compr.filter((f) => f.compromiso!.estado !== 'cubierto').length

  return (
    <>
      <Modal
        abierto
        ancho="lg"
        onCerrar={cerrar}
        titulo="Gastos del mes"
        pie={
          <div className="grid w-full gap-2">
            {errorLote && (
              <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
                {errorLote}
              </p>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer">
                <span className="font-medium">{elegidas.length === 1 ? '1 gasto' : `${elegidas.length} gastos`}</span>
                {resumen.totales.length > 0 && <span className="num"> · {resumen.totales.map((t) => formatoMoneda(t.cents, t.moneda)).join(' + ')}</span>}
              </summary>
              <ul className="mt-2 grid gap-1">
                {resumen.items.map((i) => (
                  <li key={i.nombre} className="flex justify-between gap-3">
                    <span className="truncate">{i.nombre}</span>
                    <span className="num">{formatoMoneda(aCentimos(i.monto), i.moneda)}</span>
                  </li>
                ))}
                {resumen.items.length === 0 && <li className="text-muted">Aún no elegiste ningún gasto.</li>}
              </ul>
            </details>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variante="secondary" onClick={cerrar}>
                Cerrar
              </Button>
              <Button loading={enviando} disabled={elegidas.length === 0} onClick={() => void registrar()}>
                {elegidas.length === 0 ? 'Registrar gastos' : elegidas.length === 1 ? 'Registrar 1 gasto' : `Registrar ${elegidas.length} gastos`}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_12rem]">
            <label className="grid gap-1.5 font-medium">
              Fecha de registro
              <input type="date" className={claseCampo} value={fecha} onChange={(e) => e.target.value && setFechaElegida(e.target.value)} />
            </label>
            <label className="grid gap-1.5 font-medium">
              Buscar
              <input type="search" aria-label="Buscar plantillas" placeholder="Nombre, descripción o categoría" className={claseCampo} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
            <label className="grid gap-1.5 font-medium">
              Ámbito
              <select aria-label="Filtrar por ámbito" className={claseCampo} value={ambito} onChange={(e) => setAmbito(e.target.value)}>
                <option value="">Todos</option>
                {vista.ambitos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variante="secondary" onClick={() => setSeleccion(new Set(selectables(filas)))}>
              Todas
            </Button>
            <Button variante="secondary" onClick={() => setSeleccion(new Set([...efectiva, ...selectables(visibles)]))}>
              Visibles
            </Button>
            <Button variante="secondary" onClick={() => setSeleccion(new Set())}>
              Limpiar
            </Button>
            <Button className="ml-auto" icono={<Plus className="size-4" aria-hidden />} onClick={() => setSub({ t: 'form' })}>
              Nueva plantilla
            </Button>
          </div>
          {compr.length > 0 && (
            <p className="text-sm text-muted">
              Compromisos de {mes}: {pendientes === 0 ? 'todos cubiertos.' : `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'} de ${compr.length}.`}
            </p>
          )}
          {filas.length === 0 ? (
            <EmptyState icono={<ListChecks className="size-7" aria-hidden />} titulo="Aún no tienes plantillas de gasto" mensaje="Crea una para los gastos que repites cada mes (alquiler, internet, suscripciones) y regístralos todos juntos." accion={{ etiqueta: 'Crear mi primera plantilla', onClick: () => setSub({ t: 'form' }) }} />
          ) : visibles.length === 0 ? (
            <p className="text-muted">Ninguna plantilla coincide con la búsqueda. Tu selección se conserva.</p>
          ) : (
            <ul className="grid gap-2" aria-label="Plantillas de gasto">
              {visibles.map((f) => {
                const id = f.plantilla.id
                const ed = edicionDe(f)
                const marcada = efectiva.has(id)
                const i = idsPlantillas.indexOf(id)
                const cubierto = f.compromiso?.estado === 'cubierto'
                return (
                  <li key={id} className="grid min-w-0 gap-2 rounded-card border border-line bg-surface p-3 shadow-1 md:grid-cols-[1fr_8rem_6rem_9rem_auto] md:items-start">
                    <div className="min-w-0">
                      <Checkbox checked={marcada} disabled={!!f.revision} onChange={(v) => marcar(id, v)}>
                        <span className="min-w-0 truncate font-medium">{f.plantilla.nombre}</span>
                      </Checkbox>
                      <p className="pl-7 text-sm text-muted">{f.clasificacion}</p>
                      {f.revision && <p className="pl-7 text-sm text-danger">Requiere revisión: {f.revision} Edítala para poder usarla.</p>}
                      {f.compromiso && !f.revision && (
                        <p className="pl-7 text-sm text-muted">
                          Compromiso · vence el día {f.datos.dia_vencimiento}
                          {' · '}
                          {cubierto ? `ya cubierto en ${mes}` : f.compromiso.estado === 'parcial' ? `pago parcial en ${mes}` : `pendiente en ${mes}`}
                        </p>
                      )}
                      {marcada && cubierto && <p className="pl-7 text-sm text-warn">Ya está cubierto en {mes}: registrarlo otra vez sumaría un pago más.</p>}
                    </div>
                    <div className="grid gap-1">
                      <MoneyInput id={`gm-monto-${id}`} etiqueta={`Monto de ${f.plantilla.nombre}`} valor={ed.monto} onChange={(v) => editar(id, { monto: v })} invalido={!!problemas[id]} describedBy={problemas[id] ? `gm-err-${id}` : undefined} disabled={!!f.revision} />
                    </div>
                    <select aria-label={`Moneda de ${f.plantilla.nombre}`} className={claseCampo} value={ed.moneda} disabled={!!f.revision} onChange={(e) => editar(id, { moneda: e.target.value })}>
                      {monedas.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                    <select aria-label={`Medio de pago de ${f.plantilla.nombre}`} className={claseCampo} value={ed.medio} disabled={!!f.revision} onChange={(e) => editar(id, { medio: e.target.value })}>
                      {!vista.medios_pago.some((m) => m.id === ed.medio) && <option value="">Elegir…</option>}
                      {vista.medios_pago.filter((m) => m.activo || m.id === ed.medio).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    <MenuAcciones
                      etiqueta={`Acciones de ${f.plantilla.nombre}`}
                      acciones={[
                        { id: 'usar', etiqueta: 'Usar (abrir el formulario)', deshabilitada: !!f.revision, onSelect: () => usar(f) },
                        { id: 'editar', etiqueta: 'Editar', onSelect: () => setSub({ t: 'form', plantilla: f.plantilla }) },
                        { id: 'clonar', etiqueta: 'Clonar', onSelect: () => setSub({ t: 'form', semilla: { nombre: `${f.plantilla.nombre} (copia)`, datos: f.datos } }) },
                        { id: 'subir', etiqueta: 'Subir', deshabilitada: filtrando || i <= 0, onSelect: () => void reordenar(idsPlantillas, id, -1) },
                        { id: 'bajar', etiqueta: 'Bajar', deshabilitada: filtrando || i >= idsPlantillas.length - 1, onSelect: () => void reordenar(idsPlantillas, id, 1) },
                        { id: 'eliminar', etiqueta: 'Eliminar', peligro: true, onSelect: () => setSub({ t: 'eliminar', plantilla: f.plantilla }) },
                      ]}
                    />
                    {problemas[id] && (
                      <p id={`gm-err-${id}`} role="alert" className="text-sm text-danger md:col-span-5">
                        {problemas[id]}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Modal>
      {sub?.t === 'form' && <FormPlantillaGasto key={sub.plantilla?.id ?? 'nueva'} plantilla={sub.plantilla} semilla={sub.semilla} onCerrar={() => setSub(null)} />}
      <ConfirmDialog
        abierto={sub?.t === 'eliminar'}
        titulo={sub?.t === 'eliminar' ? `Eliminar «${sub.plantilla.nombre}»` : ''}
        impacto="Se elimina la plantilla. Los gastos que ya registraste con ella no cambian; si era un compromiso, el compromiso se conserva sin plantilla."
        confirmar="Eliminar"
        peligro
        onCancelar={() => setSub(null)}
        onConfirmar={() => sub?.t === 'eliminar' && void eliminar(sub.plantilla)}
      />
    </>
  )

  async function reordenar(todas: string[], id: string, delta: -1 | 1) {
    const nuevo = moverUno(todas, id, delta)
    if (!nuevo) return
    const r = await mutar('plantilla.reordenar', { tipo: 'gasto', ids: nuevo })
    if (!r.ok) toast.error(`No se pudo reordenar: ${r.error.message}`)
  }
}

/** Modal «Gastos del mes»: registra varias plantillas de gasto de una vez, todo o nada. */
export function GastosMesModal() {
  const abierto = useGastosMes((s) => s.abierto)
  return abierto ? <Contenido /> : null
}
