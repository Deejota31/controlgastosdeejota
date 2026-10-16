import { useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Plantilla } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ChipSelect } from '@/components/ChipSelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Modal } from '@/components/Modal'
import { MoneyInput, parsearMonto } from '@/components/MoneyInput'
import { categoriasDeAmbito, monedasPermitidas, subcategoriasEfectivas } from '@/lib/catalogo'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { nombreRepetido } from '../catalogo/logica'
import { datosDe, plantillaDuplicada, plantillasDeGasto, type DatosGasto } from './logica'

export interface FormPlantillaGastoProps {
  plantilla?: Plantilla
  /** Clonar: datos de partida sin id propio. */
  semilla?: { nombre: string; datos: DatosGasto }
  onCerrar: () => void
}

/** Alta, edición y clonado de una plantilla de gasto. */
export function FormPlantillaGasto({ plantilla, semilla, onCerrar }: FormPlantillaGastoProps) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const monedas = monedasPermitidas(config)
  const origen: DatosGasto | null = plantilla ? datosDe(plantilla) : (semilla?.datos ?? null)
  const idForm = useRef(plantilla?.id ?? nuevoId('pla'))

  // Lo que ya no es elegible (inactivo) se vacía: la persona debe volver a elegirlo al "revisar" la plantilla.
  const ambitoIni = vista.ambitos.some((a) => a.activo && a.id === origen?.ambito_id) ? origen!.ambito_id : ''
  const catIni = ambitoIni && categoriasDeAmbito(vista, ambitoIni).some((c) => c.id === origen?.categoria_id) ? origen!.categoria_id : ''
  const subIni = catIni && subcategoriasEfectivas(vista, catIni, ambitoIni).some((s) => s.id === origen?.subcategoria_id) ? origen!.subcategoria_id : ''
  const medioIni = vista.medios_pago.some((m) => m.activo && m.id === origen?.medio_pago_id) ? origen!.medio_pago_id : ''

  const [nombre, setNombre] = useState(plantilla?.nombre ?? semilla?.nombre ?? '')
  const [ambito, setAmbito] = useState(ambitoIni)
  const [categoria, setCategoria] = useState(catIni)
  const [sub, setSub] = useState(subIni)
  const [descripcion, setDescripcion] = useState(origen?.descripcion ?? '')
  const [monto, setMonto] = useState(origen?.monto != null ? String(origen.monto) : '')
  const [moneda, setMoneda] = useState(origen?.moneda || base)
  const [medio, setMedio] = useState(medioIni)
  const [tipo, setTipo] = useState<DatosGasto['tipo_gasto']>(origen?.tipo_gasto ?? 'variable')
  const [recurrente, setRecurrente] = useState(origen?.es_recurrente ?? false)
  const [compromiso, setCompromiso] = useState(origen?.es_compromiso ?? false)
  const [dia, setDia] = useState(origen?.dia_vencimiento != null ? String(origen.dia_vencimiento) : '')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const bloqueo = useRef(false)
  const baseline = useRef('')
  const estado = JSON.stringify([nombre, ambito, categoria, sub, descripcion, monto, moneda, medio, tipo, recurrente, compromiso, dia])
  if (!baseline.current) baseline.current = estado
  const sucio = baseline.current !== estado

  const cats = useMemo(() => (ambito ? categoriasDeAmbito(vista, ambito) : []), [vista, ambito])
  const subs = useMemo(() => (categoria && ambito ? subcategoriasEfectivas(vista, categoria, ambito) : []), [vista, categoria, ambito])
  const requiereRevision = !!plantilla && (ambitoIni !== origen?.ambito_id || catIni !== origen?.categoria_id || subIni !== (origen?.subcategoria_id ?? '') || medioIni !== origen?.medio_pago_id)
  const editando = !!plantilla
  const limpiar = (k: string) => setErrores((e) => (e[k] ? { ...e, [k]: '' } : e))

  function validar(): Record<string, string> {
    const e: Record<string, string> = {}
    const n = nombre.trim().replace(/\s+/g, ' ')
    if (!n) e['nombre'] = 'Escribe un nombre.'
    else if (n.length > 60) e['nombre'] = 'Máximo 60 caracteres.'
    else if (nombreRepetido(plantillasDeGasto(vista), n, plantilla?.id)) e['nombre'] = 'Ya existe una plantilla con ese nombre.'
    if (!ambito) e['ambito'] = 'Elige el ámbito.'
    if (!categoria) e['categoria'] = 'Elige la categoría.'
    if (categoria && subs.length > 0 && !sub) e['sub'] = 'Elige la subcategoría.'
    if (!medio) e['medio'] = 'Elige el medio de pago.'
    if (monto.trim() !== '') {
      const m = parsearMonto(monto)
      if (m === null || !(m > 0)) e['monto'] = 'El monto debe ser mayor que cero, con máximo 2 decimales.'
    }
    if (descripcion.length > 200) e['descripcion'] = 'Máximo 200 caracteres.'
    if (compromiso) {
      const d = Number(dia)
      if (!dia.trim() || !Number.isInteger(d) || d < 1 || d > 31) e['dia'] = 'Escribe un día de vencimiento entre 1 y 31.'
    }
    return e
  }

  function datosActuales(): DatosGasto {
    return {
      ambito_id: ambito,
      categoria_id: categoria,
      subcategoria_id: sub,
      descripcion: descripcion.trim(),
      monto: monto.trim() === '' ? null : parsearMonto(monto),
      moneda,
      medio_pago_id: medio,
      tipo_gasto: tipo,
      es_recurrente: recurrente,
      es_compromiso: compromiso,
      dia_vencimiento: compromiso ? Number(dia) : null,
    }
  }

  async function guardar() {
    if (bloqueo.current) return
    const e = validar()
    const datos = datosActuales()
    if (!Object.keys(e).length) {
      const igual = plantillaDuplicada(vista, datos, plantilla?.id)
      if (igual) e['general'] = `Ya existe una plantilla idéntica («${igual.nombre}»).`
    }
    setErrores(e)
    if (Object.keys(e).length) return
    bloqueo.current = true
    setEnviando(true)
    setErrorForm(null)
    const payloadDatos: Record<string, unknown> = { ...datos }
    if (datos.monto === null) delete payloadDatos['monto']
    if (!datos.es_compromiso) delete payloadDatos['dia_vencimiento']
    const r = await mutar('plantilla.guardar', {
      id: idForm.current,
      tipo: 'gasto',
      nombre: nombre.trim().replace(/\s+/g, ' '),
      datos: payloadDatos,
      activo: plantilla?.activo ?? true,
      ...(plantilla ? { version: plantilla.version } : {}),
    })
    setEnviando(false)
    if (r.ok) {
      toast.ok(editando ? 'Plantilla guardada.' : 'Plantilla creada.')
      baseline.current = estado
      onCerrar()
      return
    }
    bloqueo.current = false
    if (r.error.campo === 'nombre') setErrores({ nombre: r.error.message })
    else setErrorForm(r.error.message)
  }

  const pedirCerrar = () => (sucio && !enviando ? setDescartar(true) : onCerrar())
  const e = (k: string) => errores[k] || null

  return (
    <>
      <Modal
        abierto
        ancho="lg"
        onCerrar={pedirCerrar}
        titulo={editando ? 'Editar plantilla de gasto' : semilla ? 'Clonar plantilla de gasto' : 'Nueva plantilla de gasto'}
        pie={
          <>
            <Button variante="secondary" onClick={pedirCerrar}>
              Cancelar
            </Button>
            <Button loading={enviando} onClick={() => void guardar()}>
              {editando ? 'Guardar cambios' : 'Crear'}
            </Button>
          </>
        }
      >
        <form noValidate className="grid gap-4 md:grid-cols-2" onSubmit={(ev) => (ev.preventDefault(), void guardar())}>
          {requiereRevision && (
            <p role="status" className="rounded-ctl border border-warn/40 bg-warn-soft px-3 py-2 text-sm md:col-span-2">
              Esta plantilla requiere revisión: parte de su clasificación o su medio de pago ya no está disponible. Vuelve a elegir lo que falta para poder usarla.
            </p>
          )}
          <Campo id="pg-nombre" etiqueta="Nombre" requerido error={e('nombre')} className="md:col-span-2">
            <input id="pg-nombre" autoFocus autoComplete="off" maxLength={60} className={claseCampo} value={nombre} onChange={(ev) => (setNombre(ev.target.value), limpiar('nombre'))} aria-invalid={!!e('nombre') || undefined} aria-describedby={e('nombre') ? 'pg-nombre-e' : undefined} />
          </Campo>
          <Campo id="pg-ambito" etiqueta="Ámbito" requerido error={e('ambito')}>
            <select id="pg-ambito" className={claseCampo} value={ambito} aria-invalid={!!e('ambito') || undefined} onChange={(ev) => (setAmbito(ev.target.value), setCategoria(''), setSub(''), limpiar('ambito'))}>
              <option value="">Elegir…</option>
              {vista.ambitos.filter((a) => a.activo).sort((a, b) => a.orden - b.orden).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="pg-categoria" etiqueta="Categoría" requerido error={e('categoria')}>
            <select id="pg-categoria" className={claseCampo} value={categoria} disabled={!ambito} aria-invalid={!!e('categoria') || undefined} onChange={(ev) => (setCategoria(ev.target.value), setSub(''), limpiar('categoria'))}>
              <option value="">Elegir…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="pg-sub" etiqueta="Subcategoría" requerido={subs.length > 0} error={e('sub')}>
            <select id="pg-sub" className={claseCampo} value={sub} disabled={!categoria || subs.length === 0} aria-invalid={!!e('sub') || undefined} onChange={(ev) => (setSub(ev.target.value), limpiar('sub'))}>
              <option value="">{categoria && subs.length === 0 ? 'No tiene subcategorías' : 'Elegir…'}</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="pg-medio" etiqueta="Medio de pago" requerido error={e('medio')}>
            <select id="pg-medio" className={claseCampo} value={medio} aria-invalid={!!e('medio') || undefined} onChange={(ev) => (setMedio(ev.target.value), limpiar('medio'))}>
              <option value="">Elegir…</option>
              {vista.medios_pago.filter((m) => m.activo).sort((a, b) => a.orden - b.orden).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="pg-desc" etiqueta="Descripción" error={e('descripcion')} className="md:col-span-2">
            <input id="pg-desc" autoComplete="off" maxLength={200} className={claseCampo} value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} />
          </Campo>
          <Campo id="pg-monto" etiqueta="Monto predeterminado" error={e('monto')} ayuda="Opcional. Siempre podrás cambiarlo al registrar.">
            <MoneyInput id="pg-monto" valor={monto} onChange={(v) => (setMonto(v), limpiar('monto'))} moneda={moneda} invalido={!!e('monto')} describedBy={e('monto') ? 'pg-monto-e' : undefined} />
          </Campo>
          <Campo id="pg-moneda" etiqueta="Moneda">
            <select id="pg-moneda" className={claseCampo} value={moneda} onChange={(ev) => setMoneda(ev.target.value)}>
              {monedas.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          <div className="grid gap-1.5 md:col-span-2">
            <span className="font-medium">Tipo de gasto</span>
            <ChipSelect etiqueta="Tipo de gasto" valor={tipo} onChange={(v) => setTipo(v as DatosGasto['tipo_gasto'])} opciones={[{ valor: 'fijo', etiqueta: 'Fijo' }, { valor: 'variable', etiqueta: 'Variable' }, { valor: 'extraordinario', etiqueta: 'Extraordinario' }]} />
          </div>
          <div className="flex flex-wrap gap-x-8 md:col-span-2">
            <Checkbox checked={recurrente} onChange={setRecurrente}>
              Es recurrente
            </Checkbox>
            <Checkbox checked={compromiso} onChange={setCompromiso}>
              Es un compromiso (se paga cada mes)
            </Checkbox>
          </div>
          {compromiso && (
            <Campo id="pg-dia" etiqueta="Día de vencimiento" requerido error={e('dia')} ayuda="Día del mes en que vence (1 a 31).">
              <input id="pg-dia" inputMode="numeric" autoComplete="off" maxLength={2} className={claseCampo + ' num'} value={dia} onChange={(ev) => (setDia(ev.target.value.replace(/\D/g, '')), limpiar('dia'))} aria-invalid={!!e('dia') || undefined} aria-describedby={e('dia') ? 'pg-dia-e' : undefined} />
            </Campo>
          )}
          {(errorForm || errores['general']) && (
            <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm md:col-span-2">
              {errorForm || errores['general']}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      <ConfirmDialog abierto={descartar} titulo="¿Descartar los cambios?" impacto="Lo que escribiste no se ha guardado y se perderá." confirmar="Descartar" peligro onCancelar={() => setDescartar(false)} onConfirmar={() => (setDescartar(false), onCerrar())} />
    </>
  )
}
