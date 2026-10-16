import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Movimiento } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ChipSelect } from '@/components/ChipSelect'
import { Combobox } from '@/components/Combobox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Modal } from '@/components/Modal'
import { MoneyInput, parsearMonto } from '@/components/MoneyInput'
import { Segmented } from '@/components/Segmented'
import { categoriasDeAmbito, monedasPermitidas, subcategoriasEfectivas, tipoCambioDe, urlComprobanteValida } from '@/lib/catalogo'
import { useHoy } from '@/lib/fecha'
import { aCentimos, convertirCentimos, formatoMoneda } from '@/engine/dinero'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'

import type { ModoForm, SemillaMov } from '@/store/formMov'
export type { ModoForm }

interface Estado {
  ambito: string
  categoria: string
  sub: string
  descripcion: string
  monto: string
  moneda: string
  fecha: string
  tipo: Movimiento['tipo_gasto']
  medio: string
  recurrente: boolean
  url: string
  notas: string
}

type Errores = Partial<Record<keyof Estado, string>>

function inicial(m: Movimiento | undefined, hoy: string, base: string, ambitoDef: string, medioDef: string, semilla?: SemillaMov): Estado {
  if (m)
    return {
      ambito: m.ambito_id, categoria: m.categoria_id, sub: m.subcategoria_id, descripcion: m.descripcion, monto: String(m.monto), moneda: m.moneda,
      fecha: m.fecha, tipo: m.tipo_gasto, medio: m.medio_pago_id, recurrente: m.es_recurrente, url: m.comprobante_url, notas: m.notas,
    }
  return {
    ambito: semilla?.ambito ?? ambitoDef, categoria: semilla?.categoria ?? '', sub: semilla?.sub ?? '', descripcion: semilla?.descripcion ?? '', monto: semilla?.monto ?? '',
    moneda: semilla?.moneda ?? base, fecha: semilla?.fecha ?? hoy, tipo: semilla?.tipo ?? 'variable', medio: semilla?.medio ?? medioDef, recurrente: semilla?.recurrente ?? false, url: '', notas: '',
  }
}

/**
 * Formulario único de movimiento: Nuevo, Editar y Clonar comparten componente.
 * Un ID fijo por formulario abierto (un doble envío no puede crear dos movimientos).
 */
export function FormMovimiento({ modo, movimiento, semilla, abierto, onCerrar, onGuardado }: { modo: ModoForm; movimiento?: Movimiento; semilla?: SemillaMov; abierto: boolean; onCerrar: () => void; onGuardado?: (id: string) => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const mutar = useDatos((s) => s.mutar)
  const hoy = useHoy(zona)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const idc = (s: string) => `mov-${s}`

  const ambitos = useMemo(() => vista.ambitos.filter((a) => a.activo || a.id === movimiento?.ambito_id).sort((a, b) => a.orden - b.orden), [vista.ambitos, movimiento])
  const medios = useMemo(() => vista.medios_pago.filter((m) => m.activo || m.id === movimiento?.medio_pago_id).sort((a, b) => a.orden - b.orden), [vista.medios_pago, movimiento])

  // Una sola vez por apertura: el ID y el estado inicial no cambian aunque lleguen datos nuevos.
  const idForm = useRef('')
  const original = useRef<Estado | null>(null)
  const [e, setE] = useState<Estado | null>(null)
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const [fechaTocada, setFechaTocada] = useState(false)
  const [descAuto, setDescAuto] = useState('')
  const [propuestaDesc, setPropuestaDesc] = useState<string | null>(null)
  const [sugerencia, setSugerencia] = useState<{ medio: string; tipo: Movimiento['tipo_gasto'] } | null>(null)
  const bloqueo = useRef(false)

  useEffect(() => {
    if (!abierto) {
      setE(null)
      return
    }
    idForm.current = modo === 'editar' && movimiento ? movimiento.id : nuevoId('mov')
    const ini = inicial(movimiento, hoy, base, ambitos[0]?.id ?? '', medios[0]?.id ?? '', modo === 'nuevo' ? semilla : undefined)
    original.current = ini
    setE(ini)
    setErrores({})
    setEnviando(false)
    setFechaTocada(modo !== 'nuevo')
    setDescAuto('')
    setPropuestaDesc(null)
    setSugerencia(null)
    bloqueo.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, modo, movimiento?.id])

  // Fecha viva: si la persona no tocó la fecha de un movimiento nuevo, sigue al «hoy» real (medianoche, volver a la pestaña).
  useEffect(() => {
    if (abierto && modo === 'nuevo' && !fechaTocada && original.current && e && e.fecha !== hoy) {
      original.current = { ...original.current, fecha: hoy }
      setE((x) => (x ? { ...x, fecha: hoy } : x))
    }
  }, [hoy, abierto, modo, fechaTocada, e])

  const cats = useMemo(() => (e ? categoriasDeAmbito(vista, e.ambito, movimiento?.categoria_id) : []), [vista, e?.ambito, movimiento])
  const subs = useMemo(() => (e && e.categoria ? subcategoriasEfectivas(vista, e.categoria, e.ambito, movimiento?.subcategoria_id) : []), [vista, e?.categoria, e?.ambito, movimiento])
  const monedas = useMemo(() => monedasPermitidas(config), [config])

  const sucio = useMemo(() => !!e && !!original.current && JSON.stringify(e) !== JSON.stringify(original.current), [e])

  if (!e) return null

  const monto = parsearMonto(e.monto)
  const tc = tipoCambioDe(config, e.moneda)
  // En una edición con la misma moneda se conserva el tipo de cambio ya congelado en el movimiento.
  const tcEfectivo = modo === 'editar' && movimiento && movimiento.moneda === e.moneda ? movimiento.tipo_cambio : tc
  const equivalente = monto !== null && monto > 0 && tcEfectivo !== null ? convertirCentimos(monto, tcEfectivo) : null

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => {
    setE((x) => (x ? { ...x, [k]: v } : x))
    setErrores((x) => (x[k] ? { ...x, [k]: undefined } : x))
  }

  const cambiarAmbito = (id: string) => {
    const categoriasNuevas = categoriasDeAmbito(vista, id).map((c) => c.id)
    setE((x) => {
      if (!x) return x
      const sigue = categoriasNuevas.includes(x.categoria)
      const subOk = sigue && subcategoriasEfectivas(vista, x.categoria, id).some((s) => s.id === x.sub)
      return { ...x, ambito: id, categoria: sigue ? x.categoria : '', sub: subOk ? x.sub : '' }
    })
    setErrores((x) => ({ ...x, ambito: undefined }))
  }

  const elegirCategoria = (id: string) => {
    setE((x) => (x ? { ...x, categoria: id, sub: '' } : x))
    setErrores((x) => ({ ...x, categoria: undefined, sub: undefined }))
    // Con una sola subcategoría efectiva se elige sola.
    const unicas = subcategoriasEfectivas(vista, id, e.ambito)
    if (unicas.length === 1) elegirSub(unicas[0]!.id, id)
  }

  const elegirSub = (id: string, categoria = e.categoria) => {
    const sub = vista.subcategorias.find((s) => s.id === id)
    setE((x) => (x ? { ...x, categoria, sub: id } : x))
    setErrores((x) => ({ ...x, sub: undefined }))
    if (!sub) return
    setE((x) => {
      if (!x) return x
      // Autocompletar la descripción solo si está vacía o es la que se puso sola antes.
      if (x.descripcion.trim() === '' || x.descripcion === descAuto) return { ...x, sub: id, categoria, descripcion: sub.nombre }
      if (x.descripcion !== sub.nombre) setPropuestaDesc(sub.nombre)
      return x
    })
    setDescAuto(sub.nombre)
    // Sugerencia: el medio y tipo del último movimiento con esta subcategoría (solo si aún no hay medio elegido manualmente).
    const ult = vista.movimientos.filter((m) => m.subcategoria_id === id && m.estado === 'activo').sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    setSugerencia(ult ? { medio: ult.medio_pago_id, tipo: ult.tipo_gasto } : null)
  }

  const validar = (): Errores => {
    const er: Errores = {}
    if (!e.ambito) er.ambito = 'Elige un ámbito.'
    if (!e.categoria) er.categoria = 'Elige una categoría.'
    if (e.categoria && subs.length > 0 && !e.sub) er.sub = 'Elige una subcategoría.'
    if (monto === null || !(monto > 0)) er.monto = 'Escribe un monto mayor que cero (máximo 2 decimales).'
    else if (aCentimos(monto) / 100 !== monto) er.monto = 'Usa como máximo 2 decimales.'
    if (!e.moneda) er.moneda = 'Elige la moneda.'
    else if (tcEfectivo === null) er.moneda = `Configura el tipo de cambio ${e.moneda} → ${base} en Configuración.`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) er.fecha = 'Elige una fecha válida.'
    if (!e.medio) er.medio = 'Elige el medio de pago.'
    if (e.descripcion.length > 200) er.descripcion = 'Máximo 200 caracteres.'
    if (!urlComprobanteValida(e.url)) er.url = 'El enlace debe empezar con https://.'
    if (e.notas.length > 1000) er.notas = 'Máximo 1000 caracteres.'
    return er
  }

  const pedirCerrar = () => {
    if (sucio && !enviando) setDescartar(true)
    else onCerrar()
  }

  async function enviar(ev?: FormEvent) {
    ev?.preventDefault()
    if (!e || bloqueo.current) return // doble clic / doble Enter: un solo envío
    const er = validar()
    setErrores(er)
    const primero = (Object.keys(er) as Array<keyof Estado>)[0]
    if (primero) {
      document.getElementById(idc(primero === 'medio' ? 'medio' : primero))?.focus()
      return
    }
    bloqueo.current = true
    setEnviando(true)
    const payload: Record<string, unknown> = {
      id: idForm.current,
      fecha: e.fecha,
      monto: monto!,
      moneda: e.moneda,
      ambito_id: e.ambito,
      categoria_id: e.categoria,
      subcategoria_id: e.sub,
      descripcion: e.descripcion.trim(),
      medio_pago_id: e.medio,
      tipo_gasto: e.tipo,
      es_recurrente: e.recurrente,
      comprobante_url: e.url.trim(),
      notas: e.notas.trim(),
    }
    if (modo === 'editar' && movimiento) payload['version'] = movimiento.version
    const id = idForm.current
    const nombre = modo === 'editar' ? 'Movimiento actualizado.' : modo === 'clonar' ? 'Movimiento clonado.' : 'Movimiento guardado.'
    const p = mutar('movimiento.guardar', payload) // la vista cambia al instante
    onGuardado?.(id)
    onCerrar()
    const r = await p
    if (!r.ok) {
      toast.error(`No se pudo guardar: ${r.error.message}`)
      return
    }
    toast.ok(nombre)
    // Un gasto creado desde una plantilla de compromiso queda vinculado a su pago (una sola vez por movimiento).
    if (modo === 'nuevo' && semilla?.compromisoId) {
      const v = await mutar('compromiso.vincular', { compromiso_id: semilla.compromisoId, movimiento_id: id, mes: e.fecha.slice(0, 7) })
      if (!v.ok) toast.error(`El gasto se guardó, pero no se pudo vincular al compromiso: ${v.error.message}`)
    }
  }

  const titulo = modo === 'editar' ? 'Editar movimiento' : modo === 'clonar' ? 'Clonar movimiento' : 'Nuevo movimiento'
  const ariaE = (k: keyof Estado) => (errores[k] ? `${idc(k)}-e` : undefined)

  return (
    <>
      <Modal
        abierto={abierto}
        onCerrar={pedirCerrar}
        titulo={titulo}
        ancho="lg"
        pie={
          <>
            <Button variante="secondary" onClick={pedirCerrar}>
              Cancelar
            </Button>
            <Button loading={enviando} onClick={() => void enviar()}>
              {modo === 'editar' ? 'Guardar cambios' : 'Guardar movimiento'}
            </Button>
          </>
        }
      >
        <form
          id="form-movimiento"
          noValidate
          onSubmit={(ev) => void enviar(ev)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
              ev.preventDefault()
              void enviar()
            }
          }}
          className="grid gap-4 md:grid-cols-2"
        >
          <Campo id={idc('ambito')} etiqueta="Ámbito" requerido error={errores.ambito} className="md:col-span-2">
            <ChipSelect etiqueta="Ámbito" opciones={ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))} valor={e.ambito} onChange={cambiarAmbito} invalido={!!errores.ambito} describedBy={ariaE('ambito')} />
          </Campo>
          <Campo id={idc('categoria')} etiqueta="Categoría" requerido error={errores.categoria} className="md:col-span-2">
            {cats.length === 0 ? (
              <p className="text-muted">Este ámbito no tiene categorías activas. Agrégalas en Catálogo.</p>
            ) : (
              <ChipSelect etiqueta="Categoría" opciones={cats.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} valor={e.categoria} onChange={elegirCategoria} invalido={!!errores.categoria} describedBy={ariaE('categoria')} />
            )}
          </Campo>
          {e.categoria && subs.length > 0 && (
            <Campo id={idc('sub')} etiqueta="Subcategoría" requerido error={errores.sub} className="md:col-span-2">
              <ChipSelect etiqueta="Subcategoría" opciones={subs.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} valor={e.sub} onChange={(v) => elegirSub(v)} invalido={!!errores.sub} describedBy={ariaE('sub')} />
            </Campo>
          )}
          <Campo id={idc('descripcion')} etiqueta="Descripción" error={errores.descripcion} ayuda="Se escribe con mayúscula inicial en cada palabra al guardar." className="md:col-span-2">
            <input
              id={idc('descripcion')}
              className={claseCampo}
              value={e.descripcion}
              maxLength={200}
              autoComplete="off"
              onChange={(ev) => {
                set('descripcion', ev.target.value)
                setPropuestaDesc(null)
              }}
              aria-invalid={!!errores.descripcion || undefined}
              aria-describedby={ariaE('descripcion')}
            />
            {propuestaDesc && (
              <div role="group" aria-label="Descripción propuesta" className="flex flex-wrap items-center gap-2 rounded-ctl bg-primary-soft px-3 py-2 text-sm">
                <span>
                  ¿Usar «{propuestaDesc}» como descripción?
                </span>
                <Button
                  variante="secondary"
                  className="min-h-9"
                  onClick={() => {
                    set('descripcion', propuestaDesc)
                    setPropuestaDesc(null)
                  }}
                >
                  Reemplazar
                </Button>
                <Button variante="ghost" className="min-h-9" onClick={() => setPropuestaDesc(null)}>
                  Conservar la mía
                </Button>
              </div>
            )}
          </Campo>
          <Campo id={idc('monto')} etiqueta="Monto" requerido error={errores.monto} ayuda={equivalente !== null && e.moneda !== base ? `≈ ${formatoMoneda(equivalente, base)} (tipo de cambio ${tcEfectivo})` : undefined}>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <MoneyInput id={idc('monto')} valor={e.monto} onChange={(v) => set('monto', v)} invalido={!!errores.monto} describedBy={ariaE('monto')} />
              </div>
              <select
                aria-label="Moneda"
                value={e.moneda}
                onChange={(ev) => set('moneda', ev.target.value)}
                className={`${claseCampo} w-24 shrink-0`}
                aria-invalid={!!errores.moneda || undefined}
              >
                {monedas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {errores.moneda && (
              <p role="alert" className="text-sm text-danger">
                {errores.moneda}
              </p>
            )}
          </Campo>
          <Campo id={idc('fecha')} etiqueta="Fecha" requerido error={errores.fecha}>
            <input
              id={idc('fecha')}
              type="date"
              className={claseCampo}
              value={e.fecha}
              onChange={(ev) => {
                setFechaTocada(true)
                set('fecha', ev.target.value)
              }}
              aria-invalid={!!errores.fecha || undefined}
              aria-describedby={ariaE('fecha')}
            />
          </Campo>
          <Campo id={idc('medio')} etiqueta="Medio de pago" requerido error={errores.medio}>
            <Combobox id={idc('medio')} etiqueta="Medio de pago" opciones={medios.map((m) => ({ valor: m.id, etiqueta: m.nombre, detalle: m.tipo }))} valor={e.medio} onChange={(v) => set('medio', v)} invalido={!!errores.medio} describedBy={ariaE('medio')} />
            {sugerencia && sugerencia.medio !== e.medio && medios.some((m) => m.id === sugerencia.medio) && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                Último pago similar: {medios.find((m) => m.id === sugerencia.medio)?.nombre}
                <Button
                  variante="ghost"
                  className="min-h-9"
                  onClick={() => {
                    setE((x) => (x ? { ...x, medio: sugerencia.medio, tipo: sugerencia.tipo } : x))
                    setSugerencia(null)
                  }}
                >
                  Usar
                </Button>
              </p>
            )}
          </Campo>
          <Campo id={idc('tipo')} etiqueta="Tipo de gasto">
            <Segmented
              etiqueta="Tipo de gasto"
              value={e.tipo}
              onChange={(v) => set('tipo', v)}
              opciones={[
                { valor: 'fijo', etiqueta: 'Fijo' },
                { valor: 'variable', etiqueta: 'Variable' },
                { valor: 'extraordinario', etiqueta: 'Extraordinario' },
              ]}
            />
          </Campo>
          <div className="flex items-end">
            <Checkbox checked={e.recurrente} onChange={(v) => set('recurrente', v)}>
              Gasto recurrente
            </Checkbox>
          </div>
          <Campo id={idc('url')} etiqueta="Enlace al comprobante" error={errores.url} ayuda="Opcional. Solo enlaces https://" className="md:col-span-2">
            <input
              id={idc('url')}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={claseCampo}
              value={e.url}
              onChange={(ev) => set('url', ev.target.value)}
              aria-invalid={!!errores.url || undefined}
              aria-describedby={ariaE('url')}
            />
          </Campo>
          <Campo id={idc('notas')} etiqueta="Notas" error={errores.notas} className="md:col-span-2">
            <textarea
              id={idc('notas')}
              rows={3}
              maxLength={1000}
              className={`${claseCampo} py-2`}
              value={e.notas}
              onChange={(ev) => set('notas', ev.target.value)}
              aria-describedby={ariaE('notas')}
            />
          </Campo>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      <ConfirmDialog
        abierto={descartar}
        titulo="¿Descartar los cambios?"
        impacto="Lo que escribiste en este formulario no se ha guardado y se perderá."
        confirmar="Descartar"
        peligro
        onCancelar={() => setDescartar(false)}
        onConfirmar={() => {
          setDescartar(false)
          onCerrar()
        }}
      />
    </>
  )
}
