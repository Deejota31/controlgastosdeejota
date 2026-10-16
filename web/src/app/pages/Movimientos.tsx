import { Download, FileSpreadsheet, ListChecks, Plus, Receipt, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DragList } from '@/components/DragList'
import { EmptyState } from '@/components/EmptyState'
import { KpiCard } from '@/components/KpiCard'
import { MenuAcciones } from '@/components/MenuAcciones'
import { MultiSelect } from '@/components/MultiSelect'
import { Pagination, paginar } from '@/components/Pagination'
import { Segmented } from '@/components/Segmented'
import type { Movimiento } from '@/api/esquemas'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { primerDia, sumarMeses, ultimoDia } from '@/engine/fechas'
import { cn } from '@/lib/cn'
import { aCsv, aXlsx, descargar, type Celda } from '@/lib/exportar'
import { useHoy } from '@/lib/fecha'
import { useMediaQuery } from '@/lib/mediaQuery'
import { navegar, useRuta } from '@/lib/router'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { useGastosMes } from '@/store/gastosMes'
import { toast } from '@/store/toasts'
import { BarraSeleccion } from '../movimientos/BarraSeleccion'
import { consultar, nombresDe, totalesDe, type ColOrden, type Consulta, type EstadoFiltro } from '../movimientos/consulta'
import { accionesDe, Etiquetas, Importe, Insignias, type AccionesFila } from '../movimientos/FilaMovimiento'
import { Historial } from '../movimientos/Historial'

type Preset = 'este_mes' | 'mes_anterior' | 'este_ano' | 'todo' | 'personalizado'

const COLUMNAS: Array<{ col: Exclude<ColOrden, 'manual'>; etiqueta: string; derecha?: boolean }> = [
  { col: 'fecha', etiqueta: 'Fecha' },
  { col: 'descripcion', etiqueta: 'Descripción' },
  { col: 'categoria', etiqueta: 'Clasificación' },
  { col: 'medio', etiqueta: 'Medio de pago' },
  { col: 'monto', etiqueta: 'Monto', derecha: true },
]

function rangoDe(preset: Preset, hoy: string, custom: { desde: string; hasta: string }) {
  const mes = hoy.slice(0, 7)
  switch (preset) {
    case 'este_mes':
      return { desde: primerDia(mes), hasta: ultimoDia(mes) }
    case 'mes_anterior': {
      const m = sumarMeses(mes, -1)
      return { desde: primerDia(m), hasta: ultimoDia(m) }
    }
    case 'este_ano':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${hoy.slice(0, 4)}-12-31` }
    case 'todo':
      return { desde: '', hasta: '' }
    default:
      return custom
  }
}

export function Movimientos() {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const mutar = useDatos((s) => s.mutar)
  const hoy = useHoy(zona)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const ruta = useRuta()
  const abrirForm = useFormMov((s) => s.abrir)
  const abrirGastosMes = useGastosMes((s) => s.abrir)
  const ancho = useMediaQuery('(min-width: 768px)')

  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('activos')
  const [preset, setPreset] = useState<Preset>('este_mes')
  const [custom, setCustom] = useState({ desde: primerDia(hoy.slice(0, 7)), hasta: hoy })
  const [ambitos, setAmbitos] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [medios, setMedios] = useState<string[]>([])
  const [orden, setOrden] = useState<ColOrden>('fecha')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [paraAnular, setParaAnular] = useState<Movimiento | null>(null)
  const [historial, setHistorial] = useState<Movimiento | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const refResaltado = useRef<string | null>(null)

  const { desde, hasta } = rangoDe(preset, hoy, custom)
  const consulta: Consulta = useMemo(
    () => ({ texto, estado, desde, hasta, ambitos, categorias, medios, orden, dir }),
    [texto, estado, desde, hasta, ambitos, categorias, medios, orden, dir],
  )
  const nombres = useMemo(() => nombresDe(vista), [vista.ambitos, vista.categorias, vista.subcategorias, vista.medios_pago])
  const filtrados = useMemo(() => consultar(vista, consulta, nombres), [vista, consulta, nombres])
  const tot = useMemo(() => totalesDe(filtrados), [filtrados])
  const pag = paginar(filtrados, pagina, tamano)

  // Cualquier cambio de filtro vuelve a la primera página (la selección se conserva).
  useEffect(() => setPagina(1), [texto, estado, desde, hasta, ambitos, categorias, medios, orden, dir, tamano])
  // La selección no puede apuntar a movimientos que ya no existen.
  useEffect(() => {
    const existen = new Set(vista.movimientos.map((m) => m.id))
    setSeleccion((s) => (Array.from(s).every((id) => existen.has(id)) ? s : new Set(Array.from(s).filter((id) => existen.has(id)))))
  }, [vista.movimientos])

  // Resaltar un movimiento recién guardado: se muestran todos los estados/fechas y se salta a su página.
  const idResaltar = ruta.params.get('resaltar')
  useEffect(() => {
    if (!idResaltar || refResaltado.current === idResaltar) return
    refResaltado.current = idResaltar
    setPreset('todo')
    setEstado('todos')
    setTexto('')
    setAmbitos([])
    setCategorias([])
    setMedios([])
    setOrden('fecha')
    setDir('desc')
    setResaltado(idResaltar)
    const t = setTimeout(() => setResaltado(null), 6000)
    return () => clearTimeout(t)
  }, [idResaltar])
  useEffect(() => {
    if (!resaltado) return
    const i = filtrados.findIndex((m) => m.id === resaltado)
    if (i >= 0) {
      setPagina(Math.floor(i / tamano) + 1)
      queueMicrotask(() => document.getElementById(`fila-${resaltado}`)?.scrollIntoView?.({ block: 'center' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltado, filtrados.length])

  const porId = useMemo(() => new Map(vista.movimientos.map((m) => [m.id, m] as const)), [vista.movimientos])
  const seleccionados = useMemo(() => Array.from(seleccion).map((id) => porId.get(id)).filter((m): m is Movimiento => !!m), [seleccion, porId])

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todosEnPagina = pag.items.length > 0 && pag.items.every((m) => seleccion.has(m.id))
  const alternarPagina = () =>
    setSeleccion((s) => {
      const n = new Set(s)
      for (const m of pag.items) {
        if (todosEnPagina) n.delete(m.id)
        else n.add(m.id)
      }
      return n
    })

  const cambiarEstado = async (m: Movimiento, accion: 'anular' | 'restaurar') => {
    const r = await mutar(`movimiento.${accion}`, { id: m.id, version: m.version })
    if (r.ok) toast.ok(accion === 'anular' ? 'Movimiento anulado.' : 'Movimiento restaurado.')
    else toast.error(`No se pudo ${accion === 'anular' ? 'anular' : 'restaurar'}: ${r.error.message}`)
  }

  const acciones: AccionesFila = {
    editar: (m) => abrirForm('editar', m),
    clonar: (m) => abrirForm('clonar', m),
    anular: (m) => setParaAnular(m),
    restaurar: (m) => void cambiarEstado(m, 'restaurar'),
    historial: (m) => setHistorial(m),
  }

  const ordenarPor = (col: Exclude<ColOrden, 'manual'>) => {
    if (orden === col) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setOrden(col)
      setDir(col === 'fecha' || col === 'monto' ? 'desc' : 'asc')
    }
  }

  const reordenar = (idsPagina: string[]) => {
    const inicio = (pag.pagina - 1) * tamano
    const todos = filtrados.map((m) => m.id)
    todos.splice(inicio, idsPagina.length, ...idsPagina)
    void mutar('movimientos.reordenar', { items: todos.map((id, i) => ({ movimiento_id: id, orden: i })) }).then((r) => {
      if (!r.ok) toast.error(`No se pudo guardar el orden: ${r.error.message}`)
    })
  }

  const exportar = (formato: 'csv' | 'xlsx') => {
    const cab = ['fecha', 'descripcion', 'ambito', 'categoria', 'subcategoria', 'medio_pago', 'monto', 'moneda', 'tipo_cambio', 'monto_base', 'tipo_gasto', 'recurrente', 'estado', 'origen', 'comprobante_url', 'notas']
    const filas: Celda[][] = [cab, ...filtrados.map((m) => [m.fecha, m.descripcion, nombres.ambito(m.ambito_id), nombres.categoria(m.categoria_id), nombres.sub(m.subcategoria_id), nombres.medio(m.medio_pago_id), m.monto, m.moneda, m.tipo_cambio, m.monto_base, m.tipo_gasto, m.es_recurrente, m.estado, m.origen, m.comprobante_url, m.notas] as Celda[])]
    const nombre = `movimientos-${desde || 'historial'}${hasta ? '_' + hasta : ''}`
    if (formato === 'csv') descargar(`${nombre}.csv`, aCsv(filas), 'text/csv;charset=utf-8')
    else descargar(`${nombre}.xlsx`, aXlsx('Movimientos', filas) as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    toast.ok(`Exportados ${filtrados.length} movimientos.`)
  }

  const hayFiltros = !!texto || estado !== 'activos' || ambitos.length > 0 || categorias.length > 0 || medios.length > 0 || preset !== 'este_mes'
  const limpiar = () => {
    setTexto('')
    setEstado('activos')
    setPreset('este_mes')
    setAmbitos([])
    setCategorias([])
    setMedios([])
  }
  const opcAmb = vista.ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))
  const opcCat = vista.categorias.map((c) => ({ valor: c.id, etiqueta: c.nombre }))
  const opcMed = vista.medios_pago.map((m) => ({ valor: m.id, etiqueta: m.nombre }))
  const volver = ruta.params.get('volver')

  return (
    <div className="grid grid-cols-1 gap-4">
      {volver && resaltado && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-ctl bg-primary-soft px-3 py-2">
          <span>Movimiento resaltado.</span>
          <Button variante="secondary" className="min-h-9" onClick={() => navegar(volver)}>
            Volver
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Total del período" valor={formatoMoneda(tot.total, base)} pie={tot.sinTC ? `${tot.sinTC} sin tipo de cambio (excluidos)` : undefined} />
        <KpiCard titulo="Movimientos" valor={tot.cantidad} pie={tot.anulados ? `${tot.anulados} anulados (no suman)` : undefined} />
        <KpiCard titulo="Mayor gasto" valor={formatoMoneda(tot.mayor, base)} />
        <KpiCard titulo="Promedio" valor={formatoMoneda(tot.cantidad ? Math.round(tot.total / tot.cantidad) : 0, base)} />
      </div>

      <section aria-label="Filtros" className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-3 shadow-1 md:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Buscar movimientos" placeholder="Buscar por descripción, categoría o medio…" className={cn(claseCampo, 'pl-9')} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Segmented etiqueta="Estado" value={estado} onChange={setEstado} opciones={[{ valor: 'activos', etiqueta: 'Activos' }, { valor: 'anulados', etiqueta: 'Anulados' }, { valor: 'todos', etiqueta: 'Todos' }]} />
          <Button variante="secondary" icono={<ListChecks className="size-4" aria-hidden />} onClick={abrirGastosMes}>
            Gastos del mes
          </Button>
          <Button icono={<Plus className="size-4" aria-hidden />} className="max-md:hidden" onClick={() => abrirForm('nuevo')}>
            Nuevo movimiento
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            etiqueta="Período"
            value={preset}
            onChange={setPreset}
            opciones={[
              { valor: 'este_mes', etiqueta: 'Este mes' },
              { valor: 'mes_anterior', etiqueta: 'Mes anterior' },
              { valor: 'este_ano', etiqueta: 'Este año' },
              { valor: 'todo', etiqueta: 'Todo' },
              { valor: 'personalizado', etiqueta: 'Otro' },
            ]}
          />
          {preset === 'personalizado' && (
            <>
              <Campo id="mov-desde" etiqueta="Desde">
                <input id="mov-desde" type="date" className={claseCampo} value={custom.desde} max={custom.hasta || undefined} onChange={(e) => setCustom({ ...custom, desde: e.target.value })} />
              </Campo>
              <Campo id="mov-hasta" etiqueta="Hasta">
                <input id="mov-hasta" type="date" className={claseCampo} value={custom.hasta} min={custom.desde || undefined} onChange={(e) => setCustom({ ...custom, hasta: e.target.value })} />
              </Campo>
            </>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MultiSelect etiqueta="Ámbito" placeholder="Todos los ámbitos" opciones={opcAmb} valor={ambitos} onChange={setAmbitos} />
          <MultiSelect etiqueta="Categoría" placeholder="Todas las categorías" opciones={opcCat} valor={categorias} onChange={setCategorias} />
          <MultiSelect etiqueta="Medio de pago" placeholder="Todos los medios" opciones={opcMed} valor={medios} onChange={setMedios} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex max-w-full min-w-0 items-center gap-2 text-muted">
            Ordenar por
            <select
              className="min-h-11 min-w-0 rounded-ctl border border-line bg-surface px-2 text-ink"
              value={orden === 'manual' ? 'manual' : `${orden}:${dir}`}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'manual') setOrden('manual')
                else {
                  const [c, d] = v.split(':') as [ColOrden, 'asc' | 'desc']
                  setOrden(c)
                  setDir(d)
                }
              }}
            >
              <option value="fecha:desc">Fecha (recientes primero)</option>
              <option value="fecha:asc">Fecha (antiguos primero)</option>
              <option value="monto:desc">Monto (mayor primero)</option>
              <option value="monto:asc">Monto (menor primero)</option>
              <option value="descripcion:asc">Descripción (A–Z)</option>
              <option value="manual">Orden manual</option>
            </select>
          </label>
          {hayFiltros && (
            <Button variante="ghost" onClick={limpiar}>
              Limpiar filtros
            </Button>
          )}
          <span className="mr-auto" />
          <Button variante="secondary" icono={<Download className="size-4" aria-hidden />} disabled={!filtrados.length} onClick={() => exportar('csv')}>
            CSV
          </Button>
          <Button variante="secondary" icono={<FileSpreadsheet className="size-4" aria-hidden />} disabled={!filtrados.length} onClick={() => exportar('xlsx')}>
            Excel
          </Button>
        </div>
      </section>

      <BarraSeleccion
        seleccion={seleccionados}
        filtrados={filtrados.length}
        vista={vista}
        onLimpiar={() => setSeleccion(new Set())}
        onSeleccionarFiltrados={() => setSeleccion(new Set(filtrados.map((m) => m.id)))}
      />

      {filtrados.length === 0 ? (
        vista.movimientos.length === 0 ? (
          <EmptyState icono={<Receipt className="size-7" aria-hidden />} titulo="Aún no hay movimientos" mensaje="Registra tu primer gasto y aparecerá aquí." accion={{ etiqueta: 'Nuevo movimiento', onClick: () => abrirForm('nuevo') }} />
        ) : (
          <EmptyState icono={<Search className="size-7" aria-hidden />} titulo="Ningún movimiento coincide" mensaje="Prueba con otro período o quita algún filtro." accionSecundaria={{ etiqueta: 'Limpiar filtros', onClick: limpiar }} />
        )
      ) : orden === 'manual' ? (
        filtrados.length > 1000 ? (
          <p role="status" className="rounded-ctl bg-warn-soft px-3 py-2">
            Para ordenar a mano acota los filtros a 1000 movimientos o menos (ahora hay {filtrados.length}).
          </p>
        ) : (
          <DragList
            etiqueta="Movimientos en orden manual"
            items={pag.items}
            id={(m) => m.id}
            nombre={(m) => m.descripcion || nombres.sub(m.subcategoria_id)}
            onReordenar={reordenar}
            render={(m) => (
              <div className="flex items-center justify-between gap-3 pr-1">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.descripcion || nombres.sub(m.subcategoria_id)}</p>
                  <p className="num text-sm text-muted">{m.fecha}</p>
                </div>
                <Importe m={m} base={base} />
              </div>
            )}
          />
        )
      ) : ancho ? (
        <div className="relative overflow-x-auto rounded-card border border-line bg-surface shadow-1">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">Movimientos</caption>
            <thead>
              <tr className="border-b border-line bg-surface-2 text-sm">
                <th scope="col" className="w-12 px-2">
                  <input type="checkbox" aria-label="Seleccionar los de esta página" className="size-5 accent-[var(--primary)]" checked={todosEnPagina} onChange={alternarPagina} />
                </th>
                {COLUMNAS.map((c) => (
                  <th key={c.col} scope="col" aria-sort={orden === c.col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2 font-medium', c.derecha && 'text-right')}>
                    <button type="button" className={cn('inline-flex min-h-11 items-center gap-1', c.derecha && 'flex-row-reverse')} onClick={() => ordenarPor(c.col)}>
                      {c.etiqueta}
                      <span aria-hidden className="text-muted">{orden === c.col ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="w-14 px-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pag.items.map((m) => (
                <tr key={m.id} id={`fila-${m.id}`} className={cn('border-b border-line last:border-0 hover:bg-surface-2/60', m.estado === 'anulado' && 'text-muted', resaltado === m.id && 'bg-accent-soft')}>
                  <td className="px-2">
                    <input type="checkbox" aria-label={`Seleccionar ${m.descripcion || 'movimiento'}`} className="size-5 accent-[var(--primary)]" checked={seleccion.has(m.id)} onChange={() => alternar(m.id)} />
                  </td>
                  <td className="num px-3 py-2 whitespace-nowrap">{m.fecha}</td>
                  <td className="max-w-[18rem] px-3 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{m.descripcion || '—'}</span>
                      <Insignias m={m} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Etiquetas m={m} n={nombres} />
                  </td>
                  <td className="px-3 py-2">{nombres.medio(m.medio_pago_id)}</td>
                  <td className="px-3 py-2">
                    <Importe m={m} base={base} />
                  </td>
                  <td className="px-1">
                    <MenuAcciones etiqueta={`Acciones de ${m.descripcion || 'movimiento'}`} acciones={accionesDe(m, acciones)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {pag.items.map((m) => (
            <li key={m.id} id={`fila-${m.id}`} className={cn('flex items-start gap-2 rounded-card border border-line bg-surface p-3 shadow-1', resaltado === m.id && 'border-accent bg-accent-soft')}>
              <input type="checkbox" aria-label={`Seleccionar ${m.descripcion || 'movimiento'}`} className="mt-3 size-5 shrink-0 accent-[var(--primary)]" checked={seleccion.has(m.id)} onChange={() => alternar(m.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('min-w-0 truncate font-medium', m.estado === 'anulado' && 'text-muted')}>{m.descripcion || '—'}</p>
                  <Importe m={m} base={base} />
                </div>
                <p className="num text-sm text-muted">
                  {m.fecha} · {nombres.medio(m.medio_pago_id)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Etiquetas m={m} n={nombres} />
                  <Insignias m={m} />
                </div>
              </div>
              <MenuAcciones etiqueta={`Acciones de ${m.descripcion || 'movimiento'}`} acciones={accionesDe(m, acciones)} />
            </li>
          ))}
        </ul>
      )}

      {filtrados.length > 0 && <Pagination pagina={pag.pagina} paginas={pag.paginas} total={filtrados.length} tamano={tamano} onPagina={setPagina} onTamano={setTamano} />}

      <ConfirmDialog
        abierto={!!paraAnular}
        titulo="Anular movimiento"
        confirmar="Anular"
        peligro
        onCancelar={() => setParaAnular(null)}
        onConfirmar={() => {
          const m = paraAnular
          setParaAnular(null)
          if (m) void cambiarEstado(m, 'anular')
        }}
        impacto={
          paraAnular && (
            <p>
              «{paraAnular.descripcion || 'Movimiento'}» por {formatoMoneda(aCentimos(paraAnular.monto), paraAnular.moneda)} dejará de sumar en tus totales. No se borra: puedes restaurarlo cuando quieras.
            </p>
          )
        }
      />
      <Historial movimiento={historial} onCerrar={() => setHistorial(null)} />
    </div>
  )
}
