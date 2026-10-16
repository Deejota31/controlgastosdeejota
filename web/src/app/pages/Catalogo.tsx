import { ArrowDown, ArrowUp, ListOrdered, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { Fragment, useMemo, useRef, useState } from 'react'
import type { Ambito, Categoria, MedioPago, Subcategoria } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DragList } from '@/components/DragList'
import { EmptyState } from '@/components/EmptyState'
import { Icono, InsigniaIcono } from '@/components/Icono'
import { claseCampo } from '@/components/Campo'
import { MenuAcciones, type AccionMenu } from '@/components/MenuAcciones'
import { Flotante } from '@/components/Flotante'
import { Modal } from '@/components/Modal'
import { Switch } from '@/components/Switch'
import { cn } from '@/lib/cn'
import { normalizarBusqueda } from '@/lib/texto'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { FormCatalogo, type EntidadForm } from '../catalogo/FormCatalogo'
import { contadores, describirDependencias, esOtros, moverId, partesResaltadas, type DependenciasServidor } from '../catalogo/logica'
import { useInterruptores } from '../catalogo/useCatalogo'

type Eliminable = { tipo: 'categoria' | 'subcategoria' | 'medio'; id: string; nombre: string }
type Estado =
  | { fase: 'confirmar'; objetivo: Eliminable }
  | { fase: 'en_uso'; objetivo: Eliminable; dependencias: DependenciasServidor }
  | { fase: 'cascada'; objetivo: Eliminable; hijos: number }

function Resaltado({ texto, q }: { texto: string; q: string }) {
  return (
    <>
      {partesResaltadas(texto, q).map((p, i) => (p.ok ? <mark key={i} className="rounded bg-warn-soft px-0.5 text-ink">{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}
    </>
  )
}

function Contador({ etiqueta, a, t }: { etiqueta: string; a: number; t: number }) {
  return (
    <span className="rounded-full bg-surface-2 px-3 py-1 text-sm">
      {etiqueta}: <b className="num">{a}</b> activas · <span className="num">{t}</span> en total
    </span>
  )
}

export function Catalogo() {
  const vista = useDatos((s) => s.vista)
  const mutar = useDatos((s) => s.mutar)
  const [ambitoSel, setAmbitoSel] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<EntidadForm | null>(null)
  const [elim, setElim] = useState<Estado | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [ordenar, setOrdenar] = useState<Categoria | null>(null)

  const ambitos = useMemo(() => [...vista.ambitos].sort((a, b) => a.orden - b.orden), [vista.ambitos])
  const ambito = ambitos.find((a) => a.id === ambitoSel) ?? ambitos[0]
  const cnt = useMemo(() => (ambito ? contadores(vista, ambito.id) : null), [vista, ambito])

  const interrAmb = useInterruptores(useMemo(() => Object.fromEntries(vista.ambitos.map((a) => [a.id, a.activo])), [vista.ambitos]))
  const interrCat = useInterruptores(useMemo(() => Object.fromEntries(vista.ambito_categoria.map((v) => [`${v.ambito_id}:${v.categoria_id}`, v.activo])), [vista.ambito_categoria]))
  const interrMed = useInterruptores(useMemo(() => Object.fromEntries(vista.medios_pago.map((m) => [m.id, m.activo])), [vista.medios_pago]))

  const nq = normalizarBusqueda(q)
  const cats = useMemo(() => {
    if (!ambito) return []
    const porId = new Map(vista.categorias.map((c) => [c.id, c]))
    return vista.ambito_categoria
      .filter((v) => v.ambito_id === ambito.id)
      .sort((a, b) => a.orden - b.orden)
      .map((v) => ({ v, c: porId.get(v.categoria_id)! }))
      .filter((x) => x.c)
      .map((x) => {
        const subs = vista.subcategorias.filter((s) => s.categoria_id === x.c.id).sort((a, b) => a.orden - b.orden)
        const subsOk = nq ? subs.filter((s) => normalizarBusqueda(s.nombre).includes(nq)) : subs
        const coincideCat = !nq || normalizarBusqueda(x.c.nombre).includes(nq)
        return { ...x, subs: coincideCat ? subs : subsOk, visible: coincideCat || subsOk.length > 0 }
      })
      .filter((x) => x.visible)
  }, [ambito, vista, nq])
  const medios = useMemo(() => [...vista.medios_pago].sort((a, b) => a.orden - b.orden).filter((m) => !nq || normalizarBusqueda(m.nombre).includes(nq)), [vista.medios_pago, nq])

  const reordenar = async (accion: string, payload: Record<string, unknown>) => {
    const r = await mutar(accion, payload)
    if (!r.ok) toast.error(`No se pudo guardar el orden: ${r.error.message}`)
  }

  const eliminar = async (o: Eliminable, extra: Record<string, unknown> = {}) => {
    setEliminando(true)
    const r = await mutar<{ eliminado: boolean; motivo?: string; dependencias?: DependenciasServidor; hijos?: number }>(`${o.tipo}.eliminar`, { id: o.id, confirmar: true, ...extra })
    setEliminando(false)
    if (!r.ok) {
      toast.error(`No se pudo eliminar: ${r.error.message}`)
      setElim(null)
    } else if (r.data.eliminado) {
      toast.ok(`«${o.nombre}» eliminado.`)
      setElim(null)
    } else if (r.data.motivo === 'en_uso') setElim({ fase: 'en_uso', objetivo: o, dependencias: r.data.dependencias ?? {} })
    else if (r.data.motivo === 'tiene_hijos') setElim({ fase: 'cascada', objetivo: o, hijos: r.data.hijos ?? 0 })
  }

  const desactivarEnSuLugar = async (o: Eliminable) => {
    setEliminando(true)
    let r
    if (o.tipo === 'categoria' && ambito) {
      const c = vista.categorias.find((x) => x.id === o.id)!
      // Una categoría se desactiva en cada ámbito donde está vinculada.
      const vinculos = vista.ambito_categoria.filter((v) => v.categoria_id === o.id).map((v) => ({ ambito_id: v.ambito_id, activo: false }))
      r = await mutar('categoria.guardar', { id: c.id, nombre: c.nombre, version: c.version, vinculos })
    } else if (o.tipo === 'subcategoria') {
      const s = vista.subcategorias.find((x) => x.id === o.id)!
      r = await mutar('subcategoria.guardar', { id: s.id, categoria_id: s.categoria_id, nombre: s.nombre, version: s.version, activo: false })
    } else {
      const m = vista.medios_pago.find((x) => x.id === o.id)!
      r = await mutar('medio.guardar', { id: m.id, nombre: m.nombre, version: m.version, activo: false })
    }
    setEliminando(false)
    if (r.ok) toast.ok(`«${o.nombre}» desactivado. Sigue en tu historial.`)
    else toast.error(`No se pudo desactivar: ${r.error.message}`)
    setElim(null)
  }

  if (ambitos.length === 0 && medios.length === 0)
    return (
      <>
        <EmptyState icono={<Tags className="size-7" aria-hidden />} titulo="Tu catálogo está vacío" mensaje="Crea tu primer ámbito para empezar a clasificar gastos." accion={{ etiqueta: 'Nuevo ámbito', onClick: () => setForm({ tipo: 'ambito' }) }} />
        <FormCatalogo entidad={form} onCerrar={() => setForm(null)} />
      </>
    )

  const accionesAmbito = (a: Ambito, i: number): AccionMenu[] => {
    const arriba = moverId(ambitos, a.id, -1)
    const abajo = moverId(ambitos, a.id, 1)
    return [
      { id: 'editar', etiqueta: 'Editar', icono: <Pencil className="size-4" aria-hidden />, onSelect: () => setForm({ tipo: 'ambito', fila: a }) },
      { id: 'subir', etiqueta: 'Subir', icono: <ArrowUp className="size-4" aria-hidden />, deshabilitada: !arriba || i === 0, onSelect: () => arriba && void reordenar('ambito.reordenar', { ids: arriba }) },
      { id: 'bajar', etiqueta: 'Bajar', icono: <ArrowDown className="size-4" aria-hidden />, deshabilitada: !abajo, onSelect: () => abajo && void reordenar('ambito.reordenar', { ids: abajo }) },
    ]
  }

  const catItems = cats.map((x) => ({ id: x.c.id, nombre: x.c.nombre }))
  const accionesCategoria = (c: Categoria): AccionMenu[] => {
    const arriba = moverId(catItems, c.id, -1)
    const abajo = moverId(catItems, c.id, 1)
    return [
      { id: 'editar', etiqueta: 'Editar', icono: <Pencil className="size-4" aria-hidden />, onSelect: () => setForm({ tipo: 'categoria', fila: c, ambitoId: ambito!.id }) },
      { id: 'ordenar', etiqueta: 'Ordenar subcategorías', icono: <ListOrdered className="size-4" aria-hidden />, onSelect: () => setOrdenar(c) },
      { id: 'subir', etiqueta: 'Subir', icono: <ArrowUp className="size-4" aria-hidden />, deshabilitada: !arriba || !!nq, onSelect: () => arriba && void reordenar('categoria.reordenar', { ambito_id: ambito!.id, ids: arriba }) },
      { id: 'bajar', etiqueta: 'Bajar', icono: <ArrowDown className="size-4" aria-hidden />, deshabilitada: !abajo || !!nq, onSelect: () => abajo && void reordenar('categoria.reordenar', { ambito_id: ambito!.id, ids: abajo }) },
      { id: 'eliminar', etiqueta: 'Eliminar', icono: <Trash2 className="size-4" aria-hidden />, peligro: true, onSelect: () => setElim({ fase: 'confirmar', objetivo: { tipo: 'categoria', id: c.id, nombre: c.nombre } }) },
    ]
  }
  const medItems = medios.map((m) => ({ id: m.id, nombre: m.nombre }))
  const accionesMedio = (m: MedioPago): AccionMenu[] => {
    const arriba = moverId(medItems, m.id, -1)
    const abajo = moverId(medItems, m.id, 1)
    return [
      { id: 'editar', etiqueta: 'Editar', icono: <Pencil className="size-4" aria-hidden />, onSelect: () => setForm({ tipo: 'medio', fila: m }) },
      { id: 'subir', etiqueta: 'Subir', icono: <ArrowUp className="size-4" aria-hidden />, deshabilitada: !arriba || !!nq, onSelect: () => arriba && void reordenar('medio.reordenar', { ids: arriba }) },
      { id: 'bajar', etiqueta: 'Bajar', icono: <ArrowDown className="size-4" aria-hidden />, deshabilitada: !abajo || !!nq, onSelect: () => abajo && void reordenar('medio.reordenar', { ids: abajo }) },
      { id: 'eliminar', etiqueta: 'Eliminar', icono: <Trash2 className="size-4" aria-hidden />, peligro: true, onSelect: () => setElim({ fase: 'confirmar', objetivo: { tipo: 'medio', id: m.id, nombre: m.nombre } }) },
    ]
  }

  const subActivaEn = (s: Subcategoria) => s.activo

  return (
    <div className="grid grid-cols-1 gap-6">
      <section aria-label="Resumen y búsqueda" className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap gap-2">
          {cnt && (
            <>
              <Contador etiqueta="Ámbitos" a={cnt.ambitos.activas} t={cnt.ambitos.total} />
              <Contador etiqueta="Categorías" a={cnt.categorias.activas} t={cnt.categorias.total} />
              <Contador etiqueta="Subcategorías" a={cnt.subcategorias.activas} t={cnt.subcategorias.total} />
              <Contador etiqueta="Medios" a={cnt.medios.activas} t={cnt.medios.total} />
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input type="search" aria-label="Buscar en el catálogo" placeholder="Buscar categoría, subcategoría o medio…" className={cn(claseCampo, 'pl-9')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <MenuAgregar
            acciones={[
              { id: 'ambito', etiqueta: 'Ámbito', onSelect: () => setForm({ tipo: 'ambito' }) },
              { id: 'categoria', etiqueta: 'Categoría', onSelect: () => ambito && setForm({ tipo: 'categoria', ambitoId: ambito.id }) },
              { id: 'subcategoria', etiqueta: 'Subcategoría', deshabilitada: cats.length === 0, onSelect: () => cats[0] && setForm({ tipo: 'subcategoria', categoriaId: cats[0].c.id, ambitoId: ambito!.id }) },
              { id: 'medio', etiqueta: 'Medio de pago', onSelect: () => setForm({ tipo: 'medio' }) },
            ]}
          />
        </div>
        {nq && (
          <p role="status" className="text-sm text-muted">
            {cats.length} {cats.length === 1 ? 'categoría' : 'categorías'} y {medios.length} {medios.length === 1 ? 'medio' : 'medios'} coinciden en «{ambito?.nombre}».
          </p>
        )}
      </section>

      <section aria-labelledby="h-ambitos" className="grid grid-cols-1 gap-3">
        <h2 id="h-ambitos" className="text-lg font-semibold">Ámbitos</h2>
        <div role="tablist" aria-label="Ámbito" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ambitos.map((a, i) => {
            const sel = a.id === ambito?.id
            const activo = interrAmb.valor(a.id)
            return (
              <div key={a.id} className={cn('flex items-center gap-2 rounded-card border bg-surface p-2 shadow-1', sel ? 'border-primary ring-2 ring-primary/20' : 'border-line', !activo && 'opacity-70')}>
                <button type="button" role="tab" aria-selected={sel} onClick={() => setAmbitoSel(a.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                  <InsigniaIcono icono={a.icono} color={a.color} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.nombre}</span>
                    <span className="block text-xs text-muted">{activo ? 'Activo' : 'Inactivo'}</span>
                  </span>
                </button>
                <Switch etiqueta={`Ámbito ${a.nombre} activo`} checked={activo} onChange={(v) => void interrAmb.cambiar(a.id, v, 'ambito.guardar', { id: a.id, nombre: a.nombre, icono: a.icono, color: a.color, activo: v, version: a.version })} />
                <MenuAcciones etiqueta={`Acciones del ámbito ${a.nombre}`} acciones={accionesAmbito(a, i)} />
              </div>
            )
          })}
        </div>
      </section>

      {ambito && (
        <section aria-labelledby="h-cats" className="grid grid-cols-1 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-cats" className="text-lg font-semibold">Categorías de {ambito.nombre}</h2>
            <Button variante="secondary" icono={<Plus className="size-4" aria-hidden />} onClick={() => setForm({ tipo: 'categoria', ambitoId: ambito.id })}>
              Categoría
            </Button>
          </div>
          {cats.length === 0 ? (
            <EmptyState icono={<Tags className="size-7" aria-hidden />} titulo={nq ? 'Sin coincidencias' : 'Este ámbito no tiene categorías'} mensaje={nq ? 'Prueba con otra palabra.' : 'Agrega una categoría para poder registrar gastos en este ámbito.'} accion={nq ? undefined : { etiqueta: 'Nueva categoría', onClick: () => setForm({ tipo: 'categoria', ambitoId: ambito.id }) }} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cats.map(({ c, v, subs }) => {
                const k = `${ambito.id}:${c.id}`
                const activa = interrCat.valor(k)
                return (
                  <li key={c.id} className={cn('rounded-card border border-line bg-surface p-3 shadow-1', !activa && 'opacity-70')}>
                    <div className="flex items-center gap-3">
                      <InsigniaIcono icono={c.icono} color={c.color} />
                      <p className="min-w-0 flex-1 truncate font-medium">
                        <Resaltado texto={c.nombre} q={q} />
                        {esOtros(c.nombre) && <span className="ml-2 text-xs text-muted">(siempre al final)</span>}
                      </p>
                      <Switch etiqueta={`Categoría ${c.nombre} activa en ${ambito.nombre}`} checked={activa} onChange={(val) => void interrCat.cambiar(k, val, 'categoria.guardar', { id: c.id, nombre: c.nombre, icono: c.icono, color: c.color, version: c.version, vinculos: [{ ambito_id: ambito.id, activo: val }] })} />
                      <button type="button" aria-label={`Agregar subcategoría a ${c.nombre}`} title="Agregar subcategoría" className="inline-flex size-11 items-center justify-center rounded-ctl hover:bg-surface-2" onClick={() => setForm({ tipo: 'subcategoria', categoriaId: c.id, ambitoId: ambito.id })}>
                        <Plus className="size-5" aria-hidden />
                      </button>
                      <MenuAcciones etiqueta={`Acciones de ${c.nombre}`} acciones={accionesCategoria(c)} />
                    </div>
                    {subs.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Subcategorías de ${c.nombre}`}>
                        {subs.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setForm({ tipo: 'subcategoria', fila: s, categoriaId: c.id, ambitoId: ambito.id })}
                              aria-label={`Editar subcategoría ${s.nombre}${subActivaEn(s) ? '' : ' (inactiva)'}`}
                              className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:bg-surface-2', !subActivaEn(s) && 'text-muted line-through', !activa && 'text-muted')}
                            >
                              <Icono nombre={s.icono} className="size-4" />
                              <Resaltado texto={s.nombre} q={q} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {v && !v.activo && <p className="mt-2 text-xs text-muted">Inactiva en este ámbito: sus subcategorías no se ofrecen al registrar gastos.</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="h-medios" className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-medios" className="text-lg font-semibold">Medios de pago</h2>
          <Button variante="secondary" icono={<Plus className="size-4" aria-hidden />} onClick={() => setForm({ tipo: 'medio' })}>
            Medio de pago
          </Button>
        </div>
        {medios.length === 0 ? (
          <p className="text-muted">{nq ? 'Ningún medio coincide con la búsqueda.' : 'Aún no hay medios de pago.'}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {medios.map((m) => {
              const activo = interrMed.valor(m.id)
              return (
                <li key={m.id} className={cn('flex items-center gap-3 rounded-card border border-line bg-surface p-2 shadow-1', !activo && 'opacity-70')}>
                  <InsigniaIcono icono={m.icono} color={m.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium"><Resaltado texto={m.nombre} q={q} /></span>
                    <span className="block text-xs text-muted capitalize">{m.tipo}</span>
                  </span>
                  <Switch etiqueta={`Medio ${m.nombre} activo`} checked={activo} onChange={(v) => void interrMed.cambiar(m.id, v, 'medio.guardar', { id: m.id, nombre: m.nombre, icono: m.icono, color: m.color, tipo: m.tipo, activo: v, version: m.version })} />
                  <MenuAcciones etiqueta={`Acciones de ${m.nombre}`} acciones={accionesMedio(m)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <FormCatalogo entidad={form} onCerrar={() => setForm(null)} />

      <ConfirmDialog
        abierto={elim?.fase === 'confirmar'}
        titulo={elim ? `Eliminar «${elim.objetivo.nombre}»` : ''}
        confirmar="Eliminar"
        peligro
        loading={eliminando}
        onCancelar={() => setElim(null)}
        onConfirmar={() => elim && void eliminar(elim.objetivo)}
        impacto={<p>Se revisa primero si está en uso. Si tiene movimientos, cajas o plantillas, no se borra y te ofrecemos desactivarlo.</p>}
      />
      <ConfirmDialog
        abierto={elim?.fase === 'en_uso'}
        titulo="Está en uso"
        confirmar="Desactivar en su lugar"
        loading={eliminando}
        onCancelar={() => setElim(null)}
        onConfirmar={() => elim && void desactivarEnSuLugar(elim.objetivo)}
        impacto={
          elim?.fase === 'en_uso' && (
            <p>
              «{elim.objetivo.nombre}» tiene {describirDependencias(elim.dependencias) || 'datos asociados'}. No se puede eliminar sin perder historial. Si lo desactivas, deja de ofrecerse pero tus movimientos se conservan.
            </p>
          )
        }
      />
      <ConfirmDialog
        abierto={elim?.fase === 'cascada'}
        titulo="Eliminar también sus subcategorías"
        confirmar="Eliminar todo"
        peligro
        loading={eliminando}
        onCancelar={() => setElim(null)}
        onConfirmar={() => elim && void eliminar(elim.objetivo, { cascada: true })}
        impacto={elim?.fase === 'cascada' && <p>«{elim.objetivo.nombre}» tiene {elim.hijos} {elim.hijos === 1 ? 'subcategoría' : 'subcategorías'} sin uso. Se eliminarán junto con ella.</p>}
      />

      <Modal abierto={!!ordenar} onCerrar={() => setOrdenar(null)} titulo={ordenar ? `Ordenar subcategorías de ${ordenar.nombre}` : ''} pie={<Button variante="secondary" onClick={() => setOrdenar(null)}>Listo</Button>}>
        {ordenar && (
          <DragList
            etiqueta={`Subcategorías de ${ordenar.nombre}`}
            items={vista.subcategorias.filter((s) => s.categoria_id === ordenar.id).sort((a, b) => a.orden - b.orden)}
            id={(s) => s.id}
            nombre={(s) => s.nombre}
            render={(s) => (
              <span className="flex items-center gap-2">
                <Icono nombre={s.icono} className="size-4" />
                {s.nombre}
              </span>
            )}
            onReordenar={(ids) => void reordenar('subcategoria.reordenar', { categoria_id: ordenar.id, ids })}
          />
        )}
      </Modal>
    </div>
  )
}

function MenuAgregar({ acciones }: { acciones: AccionMenu[] }) {
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl bg-primary px-4 font-medium text-primary-ink hover:brightness-110"
      >
        <Plus className="size-4" aria-hidden />
        Agregar
      </button>
      <Flotante ancla={boton} abierto={abierto} onCerrar={() => setAbierto(false)} role="menu" etiqueta="Agregar" ancho={208} className="py-1">
        <div onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}>
          {acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              aria-disabled={a.deshabilitada || undefined}
              className="flex min-h-11 w-full items-center px-3 text-left hover:bg-surface-2 aria-disabled:opacity-50"
              onClick={() => {
                if (a.deshabilitada) return
                setAbierto(false)
                a.onSelect()
              }}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      </Flotante>
    </>
  )
}
