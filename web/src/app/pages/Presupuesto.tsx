import { ChevronLeft, ChevronRight, Copy, Plus, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Caja, Fuente, Plantilla } from '@/api/esquemas'
import { Button, IconButton } from '@/components/Button'
import { claseCampo } from '@/components/Campo'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { KpiCard } from '@/components/KpiCard'
import { MenuAcciones } from '@/components/MenuAcciones'
import { Switch } from '@/components/Switch'
import { Tabs } from '@/components/Tabs'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { sumarMeses } from '@/engine/fechas'
import { useHoy } from '@/lib/fecha'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { ejecutar, moverUno, payloadCaja, payloadFuente } from '../presupuesto/acciones'
import { DialogoAjusteMes, DialogoAplicarPlantillas, DialogoCopiar, DialogoImpacto, FormPlantilla } from '../presupuesto/Dialogos'
import { FormCaja } from '../presupuesto/FormCaja'
import { FormFuente } from '../presupuesto/FormFuente'
import { calcularMes, ETIQUETA_ALCANCE, estadoEnMes, filasDeCajas, filtrarCajas, previsualizarPlantillas, TEXTO_ACCION, TEXTO_ESTADO_PLANTILLA, type Alcance, type FiltroCajas, type OrdenCajas } from '../presupuesto/logica'
import { InsigniaEstado, TarjetaCaja, TarjetaFuente } from '../presupuesto/Tarjetas'

type Pestana = 'fuentes' | 'cajas' | 'plantillas'
type Dialogo =
  | { t: 'fuente'; fuente?: Fuente; semilla?: Partial<Fuente> }
  | { t: 'caja'; caja?: Caja; semilla?: Partial<Caja> }
  | { t: 'impacto'; tipo: 'fuente' | 'caja'; id: string; nombre: string; activar: boolean }
  | { t: 'ajuste'; tipo: 'fuente' | 'caja'; id: string }
  | { t: 'copiar' }
  | { t: 'aplicar'; tipo: 'fuente' | 'caja' }
  | { t: 'plantilla'; plantilla?: Plantilla; tipo?: 'fuente' | 'caja'; entidadId?: string }
  | { t: 'eliminar'; tipo: 'fuente' | 'caja' | 'plantilla'; id: string; nombre: string }
  | { t: 'en_uso'; tipo: 'fuente' | 'caja'; id: string; nombre: string; detalle: string }

const ORDENES: Array<{ v: OrdenCajas; e: string }> = [
  { v: 'manual', e: 'Orden manual' },
  { v: 'nombre', e: 'Nombre' },
  { v: 'monto', e: 'Monto asignado' },
  { v: 'uso', e: '% de uso' },
  { v: 'gastadas', e: 'Más gastadas' },
]

export function Presupuesto() {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const pendientes = useDatos((s) => s.pendientes)
  const hoy = useHoy(zona)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [pestana, setPestana] = useState<Pestana>('fuentes')
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [filtro, setFiltro] = useState<FiltroCajas>({ texto: '', alcance: '', estado: '', orden: 'manual' })

  const r = useMemo(() => calcularMes(vista, config, mes), [vista, config, mes])
  const fuentes = useMemo(() => [...vista.fuentes].sort((a, b) => a.orden - b.orden), [vista.fuentes])
  const filasCajas = useMemo(() => filasDeCajas(vista, r, mes), [vista, r, mes])
  const cajasVisibles = useMemo(() => filtrarCajas(filasCajas, filtro), [filasCajas, filtro])
  const enCola = (id: string) => pendientes.some((p) => p.payload['id'] === id || p.payload['fuente_id'] === id || p.payload['caja_id'] === id)
  const medioNombre = (id: string) => vista.medios_pago.find((m) => m.id === id)?.nombre ?? '—'

  const cambiarMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && setMes(m)

  async function conmutarActivo() {
    const d = dialogo
    if (d?.t !== 'impacto') return
    setEnviando(true)
    if (d.tipo === 'fuente') {
      const f = vista.fuentes.find((x) => x.id === d.id)
      if (f) await ejecutar('fuente.guardar', payloadFuente(vista, f, { activo: d.activar }), d.activar ? 'Fuente activada.' : 'Fuente desactivada.')
    } else {
      const c = vista.cajas.find((x) => x.id === d.id)
      if (c) await ejecutar('caja.guardar', payloadCaja(c, { activo: d.activar }), d.activar ? 'Caja activada.' : 'Caja desactivada.')
    }
    setEnviando(false)
    setDialogo(null)
  }

  async function omitir(tipo: 'fuente' | 'caja', id: string) {
    await ejecutar(tipo === 'fuente' ? 'fuenteMes.omitir' : 'cajaMes.omitir', { [tipo === 'fuente' ? 'fuente_id' : 'caja_id']: id, mes }, `No aplica en ${mes}.`)
  }

  async function mover(tipo: 'fuente' | 'caja' | 'plantilla', ids: string[], id: string, delta: -1 | 1, tipoPlantilla?: string) {
    const nuevo = moverUno(ids, id, delta)
    if (!nuevo) return
    await ejecutar(tipo === 'plantilla' ? 'plantilla.reordenar' : `${tipo}.reordenar`, tipo === 'plantilla' ? { tipo: tipoPlantilla, ids: nuevo } : { ids: nuevo })
  }

  async function eliminar() {
    const d = dialogo
    if (d?.t !== 'eliminar') return
    setEnviando(true)
    const accion = `${d.tipo}.eliminar`
    const res = await useDatos.getState().mutar<{ eliminado?: boolean; motivo?: string; dependencias?: Record<string, number> }>(accion, { id: d.id, confirmar: true })
    setEnviando(false)
    if (!res.ok) {
      toast.error(`No se pudo eliminar: ${res.error.message}`)
      setDialogo(null)
      return
    }
    if (res.data.eliminado === false && res.data.motivo === 'en_uso' && d.tipo !== 'plantilla') {
      const dep = res.data.dependencias ?? {}
      const detalle = Object.entries(dep).map(([k, v]) => `${v} ${k.replaceAll('_', ' ')}`).join(', ')
      setDialogo({ t: 'en_uso', tipo: d.tipo, id: d.id, nombre: d.nombre, detalle })
      return
    }
    toast.ok('Eliminado.')
    setDialogo(null)
  }

  const idsFuentes = fuentes.map((f) => f.id)
  const idsCajas = [...vista.cajas].sort((a, b) => a.orden - b.orden).map((c) => c.id)
  const hayDatos = vista.fuentes.length + vista.cajas.length + vista.plantillas.length > 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold">Presupuesto</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Mes del presupuesto">
          <IconButton etiqueta="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>
            <ChevronLeft className="size-5" aria-hidden />
          </IconButton>
          <input aria-label="Mes" type="month" className={claseCampo + ' w-44'} value={mes} onChange={(e) => cambiarMes(e.target.value)} />
          <IconButton etiqueta="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))}>
            <ChevronRight className="size-5" aria-hidden />
          </IconButton>
          {mes !== hoy.slice(0, 7) && (
            <Button variante="secondary" onClick={() => setMes(hoy.slice(0, 7))}>
              Este mes
            </Button>
          )}
        </div>
        <Button variante="secondary" icono={<Copy className="size-4" aria-hidden />} onClick={() => setDialogo({ t: 'copiar' })}>
          Copiar del mes anterior
        </Button>
      </header>

      <section aria-label={`Resumen de ${mes}`} className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Presupuesto del mes" valor={formatoMoneda(r.presupuesto, base)} pie={r.avisos.fuentesSinTipoCambio.length ? `${r.avisos.fuentesSinTipoCambio.length} fuente(s) sin tipo de cambio (excluidas)` : undefined} />
        <KpiCard titulo="Reservado en cajas" valor={formatoMoneda(r.reservado, base)} />
        <KpiCard titulo="Gastado" valor={formatoMoneda(r.gastado, base)} />
        <KpiCard titulo="Disponible" valor={<span className={r.disponible < 0 ? 'text-danger' : ''}>{formatoMoneda(r.disponible, base)}</span>} pie={r.exceso > 0 ? `Exceso en cajas: ${formatoMoneda(r.exceso, base)}` : undefined} />
      </section>

      {!hayDatos ? (
        <EmptyState
          icono={<Wallet className="size-7" aria-hidden />}
          titulo="Aún no tienes fuentes ni cajas"
          mensaje="Empieza con tu fuente de ingreso (por ejemplo, tu sueldo). Después reserva dinero en cajas por categoría o medio de pago."
          accion={{ etiqueta: 'Crear mi primera fuente', onClick: () => setDialogo({ t: 'fuente' }) }}
        />
      ) : (
        <Tabs
          etiqueta="Secciones del presupuesto"
          activa={pestana}
          onChange={(id) => setPestana(id as Pestana)}
          tabs={[
            { id: 'fuentes', etiqueta: `Fuentes (${vista.fuentes.length})` },
            { id: 'cajas', etiqueta: `Cajas (${vista.cajas.length})` },
            { id: 'plantillas', etiqueta: `Plantillas (${vista.plantillas.filter((p) => p.tipo !== 'gasto').length})` },
          ]}
        >
          {pestana === 'fuentes' && (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Button icono={<Plus className="size-4" aria-hidden />} onClick={() => setDialogo({ t: 'fuente' })}>
                  Nueva fuente
                </Button>
              </div>
              {fuentes.length === 0 ? (
                <EmptyState icono={<Wallet className="size-7" aria-hidden />} titulo="Sin fuentes" mensaje="Crea la primera para poder calcular tu presupuesto." />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2" aria-label="Fuentes de ingreso">
                  {fuentes.map((f) => {
                    const e = estadoEnMes(vista.fuentes_mes, 'fuente_id', f.id, mes)
                    const i = idsFuentes.indexOf(f.id)
                    return (
                      <TarjetaFuente
                        key={f.id}
                        fuente={f}
                        mes={mes}
                        estado={e.estado}
                        montoMes={e.monto}
                        calculo={r.fuentes.find((x) => x.fuente.id === f.id) ?? null}
                        mediosLigados={vista.fuente_medios.filter((x) => x.fuente_id === f.id).map((x) => medioNombre(x.medio_pago_id))}
                        baseMoneda={base}
                        pendiente={enCola(f.id)}
                        onActivo={(v) => setDialogo({ t: 'impacto', tipo: 'fuente', id: f.id, nombre: f.nombre, activar: v })}
                        onAjustar={() => setDialogo({ t: 'ajuste', tipo: 'fuente', id: f.id })}
                        onOmitir={() => void omitir('fuente', f.id)}
                        acciones={[
                          { id: 'editar', etiqueta: 'Editar', onSelect: () => setDialogo({ t: 'fuente', fuente: f }) },
                          { id: 'clonar', etiqueta: 'Clonar', onSelect: () => setDialogo({ t: 'fuente', semilla: { ...f, nombre: `${f.nombre} (copia)`, activo: false, es_principal: false } }) },
                          { id: 'plantilla', etiqueta: 'Guardar como plantilla', onSelect: () => setDialogo({ t: 'plantilla', tipo: 'fuente', entidadId: f.id }) },
                          { id: 'subir', etiqueta: 'Subir', deshabilitada: i <= 0, onSelect: () => void mover('fuente', idsFuentes, f.id, -1) },
                          { id: 'bajar', etiqueta: 'Bajar', deshabilitada: i >= idsFuentes.length - 1, onSelect: () => void mover('fuente', idsFuentes, f.id, 1) },
                          { id: 'eliminar', etiqueta: 'Eliminar', peligro: true, onSelect: () => setDialogo({ t: 'eliminar', tipo: 'fuente', id: f.id, nombre: f.nombre }) },
                        ]}
                      />
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {pestana === 'cajas' && (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="relative min-w-48 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input type="search" aria-label="Buscar cajas" placeholder="Buscar cajas" className={claseCampo + ' pl-9'} value={filtro.texto} onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })} />
                </div>
                <select aria-label="Alcance" className={claseCampo + ' w-auto'} value={filtro.alcance} onChange={(e) => setFiltro({ ...filtro, alcance: e.target.value as Alcance | '' })}>
                  <option value="">Todos los alcances</option>
                  {(Object.keys(ETIQUETA_ALCANCE) as Alcance[]).map((a) => (
                    <option key={a} value={a}>
                      {ETIQUETA_ALCANCE[a]}
                    </option>
                  ))}
                </select>
                <select aria-label="Estado" className={claseCampo + ' w-auto'} value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value as FiltroCajas['estado'] })}>
                  <option value="">Activas e inactivas</option>
                  <option value="activas">Solo activas</option>
                  <option value="inactivas">Solo inactivas</option>
                </select>
                <select aria-label="Ordenar por" className={claseCampo + ' w-auto'} value={filtro.orden} onChange={(e) => setFiltro({ ...filtro, orden: e.target.value as OrdenCajas })}>
                  {ORDENES.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.e}
                    </option>
                  ))}
                </select>
                <Button icono={<Plus className="size-4" aria-hidden />} onClick={() => setDialogo({ t: 'caja' })}>
                  Nueva caja
                </Button>
              </div>
              {r.avisos.solapamientos.length > 0 && (
                <p role="status" className="rounded-ctl border border-warn/40 bg-warn-soft px-3 py-2 text-sm">
                  Hay cajas activas con el mismo alcance. Desactiva una para que el gasto no se reparta de forma ambigua.
                </p>
              )}
              {cajasVisibles.length === 0 ? (
                <EmptyState icono={<Wallet className="size-7" aria-hidden />} titulo={vista.cajas.length ? 'Ninguna caja coincide' : 'Sin cajas'} mensaje={vista.cajas.length ? 'Cambia la búsqueda o los filtros.' : 'Una caja reserva dinero para una categoría, un ámbito o un medio de pago.'} />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2" aria-label="Cajas">
                  {cajasVisibles.map((fila) => {
                    const c = fila.caja
                    const i = idsCajas.indexOf(c.id)
                    const manual = filtro.orden === 'manual' && !filtro.texto && !filtro.alcance && !filtro.estado
                    return (
                      <TarjetaCaja
                        key={c.id}
                        caja={c}
                        mes={mes}
                        estado={fila.estadoMes}
                        montoMes={fila.montoMes}
                        calculo={fila.calculo}
                        etiquetaAlcance={fila.etiquetaAlcance}
                        tipoAlcance={ETIQUETA_ALCANCE[c.alcance]}
                        baseMoneda={base}
                        pendiente={enCola(c.id)}
                        onActivo={(v) => setDialogo({ t: 'impacto', tipo: 'caja', id: c.id, nombre: c.nombre, activar: v })}
                        onAjustar={() => setDialogo({ t: 'ajuste', tipo: 'caja', id: c.id })}
                        onOmitir={() => void omitir('caja', c.id)}
                        acciones={[
                          { id: 'editar', etiqueta: 'Editar', onSelect: () => setDialogo({ t: 'caja', caja: c }) },
                          { id: 'clonar', etiqueta: 'Clonar', onSelect: () => setDialogo({ t: 'caja', semilla: { ...c, nombre: `${c.nombre} (copia)`, activo: false } }) },
                          { id: 'plantilla', etiqueta: 'Guardar como plantilla', onSelect: () => setDialogo({ t: 'plantilla', tipo: 'caja', entidadId: c.id }) },
                          { id: 'subir', etiqueta: 'Subir', deshabilitada: !manual || i <= 0, onSelect: () => void mover('caja', idsCajas, c.id, -1) },
                          { id: 'bajar', etiqueta: 'Bajar', deshabilitada: !manual || i >= idsCajas.length - 1, onSelect: () => void mover('caja', idsCajas, c.id, 1) },
                          { id: 'eliminar', etiqueta: 'Eliminar', peligro: true, onSelect: () => setDialogo({ t: 'eliminar', tipo: 'caja', id: c.id, nombre: c.nombre }) },
                        ]}
                      />
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {pestana === 'plantillas' && (
            <div className="grid gap-6">
              <div className="flex flex-wrap gap-2">
                <Button icono={<Plus className="size-4" aria-hidden />} onClick={() => setDialogo({ t: 'plantilla' })}>
                  Nueva plantilla
                </Button>
              </div>
              {(['fuente', 'caja'] as const).map((tipo) => {
                const lista = vista.plantillas.filter((p) => p.tipo === tipo).sort((a, b) => a.orden - b.orden)
                const ids = lista.map((p) => p.id)
                const filas = previsualizarPlantillas(vista, tipo, mes)
                return (
                  <section key={tipo} aria-labelledby={`pl-${tipo}`} className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={`pl-${tipo}`} className="mr-auto font-semibold">
                        Plantillas de {tipo === 'fuente' ? 'fuentes' : 'cajas'}
                      </h3>
                      <Button variante="secondary" disabled={!lista.some((p) => p.activo)} onClick={() => setDialogo({ t: 'aplicar', tipo })}>
                        Aplicar a {mes}
                      </Button>
                    </div>
                    {lista.length === 0 ? (
                      <p className="text-muted">Todavía no hay plantillas de {tipo === 'fuente' ? 'fuentes' : 'cajas'}. Crea una desde el menú de una {tipo} con «Guardar como plantilla».</p>
                    ) : (
                      <ul className="grid gap-2" aria-label={`Plantillas de ${tipo === 'fuente' ? 'fuentes' : 'cajas'}`}>
                        {lista.map((p, i) => {
                          const d = (p.datos_json ?? {}) as Record<string, unknown>
                          const fila = filas.find((x) => x.plantillaId === p.id)
                          const entNombre = (tipo === 'fuente' ? vista.fuentes : vista.cajas).find((x) => x.id === (d['fuente_id'] ?? d['caja_id']))?.nombre ?? 'Eliminada'
                          return (
                            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-1">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{p.nombre}</p>
                                <p className="text-sm text-muted">
                                  {entNombre} · {typeof d['monto'] === 'number' ? formatoMoneda(aCentimos(d['monto']), base) : 'monto de la entidad'}
                                  {fila && p.activo && ` · ${TEXTO_ACCION[fila.accion]} en ${mes}`}
                                </p>
                              </div>
                              {fila && p.activo && <InsigniaEstado estado={fila.estado === 'aplicada' ? 'aplicada' : fila.estado === 'no_aplica' ? 'omitida' : 'sin_aplicar'} />}
                              <span className="sr-only">{fila ? TEXTO_ESTADO_PLANTILLA[fila.estado] : ''}</span>
                              <Switch etiqueta={`Plantilla ${p.nombre} activa`} checked={p.activo} onChange={(v) => void ejecutar('plantilla.guardar', { id: p.id, tipo: p.tipo, nombre: p.nombre, datos: p.datos_json, activo: v, version: p.version })} />
                              <MenuAcciones
                                etiqueta={`Acciones de ${p.nombre}`}
                                acciones={[
                                  { id: 'editar', etiqueta: 'Editar', onSelect: () => setDialogo({ t: 'plantilla', plantilla: p }) },
                                  { id: 'aplicar', etiqueta: `Aplicar a ${mes}`, deshabilitada: !p.activo, onSelect: () => setDialogo({ t: 'aplicar', tipo }) },
                                  { id: 'subir', etiqueta: 'Subir', deshabilitada: i === 0, onSelect: () => void mover('plantilla', ids, p.id, -1, tipo) },
                                  { id: 'bajar', etiqueta: 'Bajar', deshabilitada: i === ids.length - 1, onSelect: () => void mover('plantilla', ids, p.id, 1, tipo) },
                                  { id: 'eliminar', etiqueta: 'Eliminar', peligro: true, onSelect: () => setDialogo({ t: 'eliminar', tipo: 'plantilla', id: p.id, nombre: p.nombre }) },
                                ]}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </Tabs>
      )}

      {dialogo?.t === 'fuente' && <FormFuente key={dialogo.fuente?.id ?? 'nueva'} fuente={dialogo.fuente} semilla={dialogo.semilla} mes={mes} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'caja' && <FormCaja key={dialogo.caja?.id ?? 'nueva'} caja={dialogo.caja} semilla={dialogo.semilla} mes={mes} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'impacto' && <DialogoImpacto tipo={dialogo.tipo} id={dialogo.id} nombre={dialogo.nombre} activar={dialogo.activar} mes={mes} enviando={enviando} onCancelar={() => setDialogo(null)} onConfirmar={() => void conmutarActivo()} />}
      {dialogo?.t === 'ajuste' &&
        (() => {
          const ent = dialogo.tipo === 'fuente' ? vista.fuentes.find((x) => x.id === dialogo.id) : vista.cajas.find((x) => x.id === dialogo.id)
          if (!ent) return null
          const e = estadoEnMes(dialogo.tipo === 'fuente' ? vista.fuentes_mes : vista.cajas_mes, dialogo.tipo === 'fuente' ? 'fuente_id' : 'caja_id', ent.id, mes)
          return <DialogoAjusteMes key={ent.id} tipo={dialogo.tipo} entidad={ent} mes={mes} montoMes={e.monto} estado={e.estado} onCerrar={() => setDialogo(null)} />
        })()}
      {dialogo?.t === 'copiar' && <DialogoCopiar mes={mes} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'aplicar' && <DialogoAplicarPlantillas tipo={dialogo.tipo} mes={mes} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'plantilla' && <FormPlantilla key={dialogo.plantilla?.id ?? 'nueva'} plantilla={dialogo.plantilla} tipoInicial={dialogo.tipo} entidadId={dialogo.entidadId} onCerrar={() => setDialogo(null)} />}
      <ConfirmDialog
        abierto={dialogo?.t === 'eliminar'}
        titulo={dialogo?.t === 'eliminar' ? `Eliminar «${dialogo.nombre}»` : ''}
        impacto={dialogo?.t === 'eliminar' && dialogo.tipo === 'plantilla' ? 'Se elimina la plantilla. Lo ya aplicado a los meses no cambia.' : 'Se elimina de forma permanente, junto con sus ajustes de meses sin gastos. Si ya se usó en meses con gastos, te ofreceremos desactivarla en su lugar.'}
        confirmar="Eliminar"
        peligro
        loading={enviando}
        onCancelar={() => setDialogo(null)}
        onConfirmar={() => void eliminar()}
      />
      <ConfirmDialog
        abierto={dialogo?.t === 'en_uso'}
        titulo="Está en uso"
        impacto={dialogo?.t === 'en_uso' ? `«${dialogo.nombre}» tiene ${dialogo.detalle}. Para no perder esa historia no se puede eliminar, pero puedes desactivarla: deja de contar y se conserva todo.` : ''}
        confirmar="Desactivar en su lugar"
        onCancelar={() => setDialogo(null)}
        onConfirmar={() => {
          const d = dialogo
          if (d?.t !== 'en_uso') return
          const f = d.tipo === 'fuente' ? vista.fuentes.find((x) => x.id === d.id) : undefined
          const c = d.tipo === 'caja' ? vista.cajas.find((x) => x.id === d.id) : undefined
          if (f) void ejecutar('fuente.guardar', payloadFuente(vista, f, { activo: false }), 'Fuente desactivada.')
          if (c) void ejecutar('caja.guardar', payloadCaja(c, { activo: false }), 'Caja desactivada.')
          setDialogo(null)
        }}
      />
    </div>
  )
}
