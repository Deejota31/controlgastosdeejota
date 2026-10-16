import { Bookmark, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Modal } from '@/components/Modal'
import { MultiSelect } from '@/components/MultiSelect'
import { Segmented } from '@/components/Segmented'
import { ETIQUETA_PRESET } from '@/engine/periodo'
import { categoriasDeAmbitos, depurarDependientes, filtrosPorDefecto, hayFiltrosActivos, moverFiltros, periodoDeFiltros, type FiltrosGlobales, type PresetFiltro, type TipoGasto } from '@/lib/filtros'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { CLAVE_VISTAS, filtrosDeVista, leerVistas, validarNombreVista, vistaActiva, consultaDeVista, type VistaGuardada } from './vistas'

const ETIQUETA_TIPO: Record<TipoGasto, string> = { fijo: 'Fijo', variable: 'Variable', extraordinario: 'Extraordinario' }
const PRESETS_VISIBLES: Array<{ valor: PresetFiltro; etiqueta: string }> = [
  { valor: 'este_mes', etiqueta: ETIQUETA_PRESET.este_mes },
  { valor: 'mes_anterior', etiqueta: ETIQUETA_PRESET.mes_anterior },
  { valor: 'ultimos_3', etiqueta: '3 meses' },
  { valor: 'ultimos_6', etiqueta: '6 meses' },
  { valor: 'ultimos_12', etiqueta: '12 meses' },
  { valor: 'este_ano', etiqueta: ETIQUETA_PRESET.este_ano },
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'personalizado', etiqueta: 'Otro' },
]

export interface BarraFiltrosProps {
  hoy: string
  filtros: FiltrosGlobales
  onCambiar: (f: FiltrosGlobales) => void
  /** Prefijo de ids para tener varios en pantalla sin colisiones. */
  idBase?: string
}

/** Filtros globales: período con ← →, ámbito→categoría→subcategoría, medio, tipo, recurrente, chips y vistas guardadas. */
export function BarraFiltros({ hoy, filtros, onCambiar, idBase = 'flt' }: BarraFiltrosProps) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const vistas = useMemo(() => leerVistas(config), [config])
  const activa = useMemo(() => vistaActiva(vistas, filtros, hoy), [vistas, filtros, hoy])
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cat = useMemo(() => ({ ambito_categoria: vista.ambito_categoria, subcategorias: vista.subcategorias }), [vista.ambito_categoria, vista.subcategorias])
  const cambiar = (parcial: Partial<FiltrosGlobales>) => onCambiar(depurarDependientes({ ...filtros, ...parcial }, cat))

  const opcAmb = vista.ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))
  const enAmbitos = filtros.ambitos.length ? categoriasDeAmbitos(cat, filtros.ambitos) : null
  const catsVisibles = enAmbitos ? vista.categorias.filter((c) => enAmbitos.has(c.id)) : vista.categorias
  const opcCat = catsVisibles.map((c) => ({ valor: c.id, etiqueta: c.nombre }))
  const catIds = filtros.categorias.length ? filtros.categorias : catsVisibles.map((c) => c.id)
  const opcSub = vista.subcategorias.filter((s) => catIds.includes(s.categoria_id)).map((s) => ({ valor: s.id, etiqueta: s.nombre }))
  const opcMed = vista.medios_pago.map((m) => ({ valor: m.id, etiqueta: m.nombre }))

  const elegirPreset = (preset: PresetFiltro) => {
    if (preset === 'personalizado') {
      const r = filtros.preset === 'todo' ? periodoDeFiltros('este_mes', hoy) : { desde: filtros.desde, hasta: filtros.hasta }
      cambiar({ preset, ...r })
    } else cambiar({ preset, ...periodoDeFiltros(preset, hoy) })
  }
  const cambiarFecha = (campo: 'desde' | 'hasta', valor: string) => {
    if (!valor) return
    const n = { ...filtros, [campo]: valor }
    if (n.desde > n.hasta) {
      if (campo === 'desde') n.hasta = valor
      else n.desde = valor
    }
    cambiar({ preset: 'personalizado', desde: n.desde, hasta: n.hasta })
  }

  const nombreDe = (lista: Array<{ id: string; nombre: string }>, id: string) => lista.find((x) => x.id === id)?.nombre ?? id
  const chips: Array<{ clave: string; texto: string; quitar: () => void }> = [
    ...(filtros.preset !== 'este_mes' ? [{ clave: 'p', texto: filtros.preset === 'personalizado' ? `${filtros.desde} → ${filtros.hasta}` : (PRESETS_VISIBLES.find((p) => p.valor === filtros.preset)?.etiqueta ?? ''), quitar: () => elegirPreset('este_mes') }] : []),
    ...filtros.ambitos.map((id) => ({ clave: `a-${id}`, texto: nombreDe(vista.ambitos, id), quitar: () => cambiar({ ambitos: filtros.ambitos.filter((x) => x !== id) }) })),
    ...filtros.categorias.map((id) => ({ clave: `c-${id}`, texto: nombreDe(vista.categorias, id), quitar: () => cambiar({ categorias: filtros.categorias.filter((x) => x !== id) }) })),
    ...filtros.subcategorias.map((id) => ({ clave: `s-${id}`, texto: nombreDe(vista.subcategorias, id), quitar: () => cambiar({ subcategorias: filtros.subcategorias.filter((x) => x !== id) }) })),
    ...filtros.medios.map((id) => ({ clave: `m-${id}`, texto: nombreDe(vista.medios_pago, id), quitar: () => cambiar({ medios: filtros.medios.filter((x) => x !== id) }) })),
    ...filtros.tipos.map((t) => ({ clave: `t-${t}`, texto: ETIQUETA_TIPO[t], quitar: () => cambiar({ tipos: filtros.tipos.filter((x) => x !== t) }) })),
    ...(filtros.recurrente !== 'todos' ? [{ clave: 'r', texto: filtros.recurrente === 'si' ? 'Recurrentes' : 'No recurrentes', quitar: () => cambiar({ recurrente: 'todos' }) }] : []),
  ]

  const guardarVistas = async (lista: VistaGuardada[], ok: string) => {
    setOcupado(true)
    const r = await mutar('config.guardar', { items: [{ clave: CLAVE_VISTAS, valor: JSON.stringify(lista) }] })
    setOcupado(false)
    if (r.ok) toast.ok(ok)
    else toast.error(`No se pudo guardar: ${r.error.message}`)
    return r.ok
  }
  const errorNombre = guardando && nombre ? validarNombreVista(nombre, vistas) : null
  const guardarActual = async () => {
    if (validarNombreVista(nombre, vistas)) return
    const nueva: VistaGuardada = { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre: nombre.trim(), query: consultaDeVista(filtros) }
    if (await guardarVistas([...vistas, nueva], 'Vista guardada.')) {
      setGuardando(false)
      setNombre('')
    }
  }

  return (
    <section aria-label="Filtros globales" className="grid grid-cols-1 gap-3 rounded-card border border-line bg-surface p-3 shadow-1 md:p-4">
      <div className="flex flex-wrap items-end gap-2">
        <IconButton etiqueta="Período anterior" disabled={filtros.preset === 'todo'} onClick={() => onCambiar(moverFiltros(filtros, -1))}>
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <Segmented etiqueta="Período" value={filtros.preset} onChange={elegirPreset} opciones={PRESETS_VISIBLES} />
        <IconButton etiqueta="Período siguiente" disabled={filtros.preset === 'todo'} onClick={() => onCambiar(moverFiltros(filtros, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
        {filtros.preset === 'personalizado' && (
          <>
            <Campo id={`${idBase}-desde`} etiqueta="Desde">
              <input id={`${idBase}-desde`} type="date" className={claseCampo} value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiarFecha('desde', e.target.value)} />
            </Campo>
            <Campo id={`${idBase}-hasta`} etiqueta="Hasta">
              <input id={`${idBase}-hasta`} type="date" className={claseCampo} value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiarFecha('hasta', e.target.value)} />
            </Campo>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MultiSelect etiqueta="Ámbito" placeholder="Todos los ámbitos" opciones={opcAmb} valor={filtros.ambitos} onChange={(ambitos) => cambiar({ ambitos })} />
        <MultiSelect etiqueta="Categoría" placeholder="Todas las categorías" opciones={opcCat} valor={filtros.categorias} onChange={(categorias) => cambiar({ categorias })} />
        <MultiSelect etiqueta="Subcategoría" placeholder="Todas las subcategorías" opciones={opcSub} valor={filtros.subcategorias} onChange={(subcategorias) => cambiar({ subcategorias })} />
        <MultiSelect etiqueta="Medio de pago" placeholder="Todos los medios" opciones={opcMed} valor={filtros.medios} onChange={(medios) => cambiar({ medios })} />
        <MultiSelect
          etiqueta="Tipo de gasto"
          placeholder="Todos los tipos"
          opciones={(Object.keys(ETIQUETA_TIPO) as TipoGasto[]).map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO[t] }))}
          valor={filtros.tipos}
          onChange={(t) => cambiar({ tipos: t as TipoGasto[] })}
        />
        <div className="flex items-end">
          <Segmented
            etiqueta="Recurrente"
            value={filtros.recurrente}
            onChange={(recurrente) => cambiar({ recurrente })}
            opciones={[{ valor: 'todos', etiqueta: 'Cualquiera' }, { valor: 'si', etiqueta: 'Recurrentes' }, { valor: 'no', etiqueta: 'No recurrentes' }]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 && (
          <ul aria-label="Filtros activos" className="flex min-w-0 flex-wrap gap-1.5">
            {chips.map((c) => (
              <li key={c.clave} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-0.5 pl-3 text-sm text-primary">
                <span className="truncate">{c.texto}</span>
                <button type="button" aria-label={`Quitar filtro ${c.texto}`} onClick={c.quitar} className="grid size-7 place-items-center rounded-full hover:bg-primary/10">
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hayFiltrosActivos(filtros) && (
          <Button variante="ghost" onClick={() => onCambiar(filtrosPorDefecto(hoy))}>
            Limpiar filtros
          </Button>
        )}
        <span className="mr-auto" />
        {vistas.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-muted">
            Vistas
            <select
              aria-label="Vistas guardadas"
              className="min-h-11 min-w-0 rounded-ctl border border-line bg-surface px-2 text-ink"
              value={activa?.id ?? ''}
              onChange={(e) => {
                const v = vistas.find((x) => x.id === e.target.value)
                if (v) onCambiar(filtrosDeVista(v, hoy))
              }}
            >
              <option value="">Elegir vista…</option>
              {vistas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        {activa && (
          <Button variante="ghost" loading={ocupado} onClick={() => void guardarVistas(vistas.filter((v) => v.id !== activa.id), `Vista «${activa.nombre}» eliminada.`)}>
            Eliminar vista
          </Button>
        )}
        <Button variante="secondary" icono={<Bookmark className="size-4" aria-hidden />} onClick={() => setGuardando(true)}>
          Guardar vista
        </Button>
      </div>
      <Modal
        abierto={guardando}
        onCerrar={() => setGuardando(false)}
        titulo="Guardar vista"
        pie={
          <>
            <Button variante="secondary" onClick={() => setGuardando(false)}>
              Cancelar
            </Button>
            <Button loading={ocupado} disabled={!nombre.trim() || !!errorNombre} onClick={() => void guardarActual()}>
              Guardar vista
            </Button>
          </>
        }
      >
        <Campo id={`${idBase}-nombre-vista`} etiqueta="Nombre de la vista" error={errorNombre} ayuda="Guarda el período y los filtros de ahora para volver a ellos con un clic.">
          <input id={`${idBase}-nombre-vista`} className={claseCampo} maxLength={40} value={nombre} aria-invalid={!!errorNombre} aria-describedby={errorNombre ? `${idBase}-nombre-vista-e` : undefined} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void guardarActual()} />
        </Campo>
      </Modal>
    </section>
  )
}
