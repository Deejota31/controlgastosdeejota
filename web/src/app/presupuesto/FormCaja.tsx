import { TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Caja } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ChipSelect } from '@/components/ChipSelect'
import { Combobox } from '@/components/Combobox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { IconColorPicker, type Apariencia } from '@/components/IconColorPicker'
import { Modal } from '@/components/Modal'
import { MoneyInput, parsearMonto } from '@/components/MoneyInput'
import { Switch } from '@/components/Switch'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { nombreRepetido } from '../catalogo/logica'
import { cajasSolapadas, ETIQUETA_ALCANCE, opcionesAlcance, type Alcance } from './logica'

export interface FormCajaProps {
  caja?: Caja
  semilla?: Partial<Caja>
  mes: string
  onCerrar: () => void
}

const ALCANCES: Alcance[] = ['ambito', 'categoria', 'subcategoria', 'medio_pago']

/** Alta y edición de una caja (reserva de dinero con un alcance). */
export function FormCaja({ caja, semilla, mes, onCerrar }: FormCajaProps) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const origen = caja ?? semilla
  const idForm = useRef(caja?.id ?? nuevoId('caj'))
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const [nombre, setNombre] = useState(origen?.nombre ?? '')
  const [alcance, setAlcance] = useState<Alcance>(origen?.alcance ?? 'categoria')
  const [alcanceId, setAlcanceId] = useState(origen?.alcance_id ?? '')
  const [monto, setMonto] = useState(origen?.monto_defecto !== undefined ? String(origen.monto_defecto) : '')
  const [descripcion, setDescripcion] = useState(origen?.descripcion ?? '')
  const [activo, setActivo] = useState(origen?.activo ?? true)
  const [ap, setAp] = useState<Apariencia>({ icono: origen?.icono ?? 'piggy-bank', color: origen?.color || '#2585E4' })
  const [aplicar, setAplicar] = useState(!caja)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const bloqueo = useRef(false)
  const baseline = useRef('')
  const estado = JSON.stringify([nombre, alcance, alcanceId, monto, descripcion, activo, ap, aplicar])
  if (!baseline.current) baseline.current = estado
  const sucio = baseline.current !== estado

  const opciones = useMemo(() => opcionesAlcance(vista, alcance), [vista, alcance])
  const solapes = useMemo(() => (activo ? cajasSolapadas(vista, alcance, alcanceId, caja?.id) : []), [vista, alcance, alcanceId, activo, caja?.id])
  const duplicada = solapes.find((c) => c.alcance === alcance && c.alcance_id === alcanceId)
  const parecidas = solapes.filter((c) => c !== duplicada)
  const editando = !!caja

  function validar(): Record<string, string> {
    const e: Record<string, string> = {}
    const n = nombre.trim().replace(/\s+/g, ' ')
    if (!n) e['nombre'] = 'Escribe un nombre.'
    else if (n.length > 60) e['nombre'] = 'Máximo 60 caracteres.'
    else if (nombreRepetido(vista.cajas, n, caja?.id)) e['nombre'] = 'Ya existe una caja con ese nombre.'
    if (!alcanceId) e['alcance'] = alcance === 'medio_pago' ? 'Elige un medio de pago.' : `Elige ${alcance === 'ambito' ? 'un ámbito' : alcance === 'categoria' ? 'una categoría' : 'una subcategoría'}.`
    else if (duplicada) e['alcance'] = `Ya hay una caja activa con este alcance («${duplicada.nombre}»). Desactívala o elige otro.`
    const m = parsearMonto(monto)
    if (monto.trim() === '') e['monto'] = 'Escribe el monto.'
    else if (m === null || m < 0) e['monto'] = 'El monto debe ser un número mayor o igual a 0, con máximo 2 decimales.'
    if (descripcion.length > 300) e['descripcion'] = 'Máximo 300 caracteres.'
    return e
  }

  async function guardar() {
    if (bloqueo.current) return
    const e = validar()
    setErrores(e)
    if (Object.keys(e).length) return
    bloqueo.current = true
    setEnviando(true)
    setErrorForm(null)
    const montoNum = parsearMonto(monto) ?? 0
    const r = await mutar('caja.guardar', {
      id: idForm.current,
      nombre: nombre.trim().replace(/\s+/g, ' '),
      alcance,
      alcance_id: alcanceId,
      monto_defecto: montoNum,
      descripcion: descripcion.trim(),
      activo,
      icono: ap.icono,
      color: ap.color,
      ...(caja ? { version: caja.version } : {}),
      ...(!editando && aplicar && activo ? { aplicar_mes: mes, monto_mes: montoNum } : {}),
    })
    setEnviando(false)
    if (r.ok) {
      toast.ok(editando ? 'Caja guardada.' : 'Caja creada.')
      baseline.current = estado
      onCerrar()
      return
    }
    bloqueo.current = false
    const c = r.error.campo
    const clave = c === 'nombre' ? 'nombre' : c === 'alcance_id' || c === 'alcance' ? 'alcance' : c === 'monto_defecto' ? 'monto' : ''
    if (clave) setErrores({ [clave]: r.error.message })
    else setErrorForm(r.error.message)
  }

  const pedirCerrar = () => (sucio && !enviando ? setDescartar(true) : onCerrar())

  return (
    <>
      <Modal
        abierto
        onCerrar={pedirCerrar}
        titulo={editando ? 'Editar caja' : semilla ? 'Clonar caja' : 'Nueva caja'}
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
        <form noValidate className="grid gap-4" onSubmit={(ev) => (ev.preventDefault(), void guardar())}>
          <Campo id="caj-nombre" etiqueta="Nombre" requerido error={errores['nombre']}>
            <input id="caj-nombre" autoFocus autoComplete="off" maxLength={60} className={claseCampo} value={nombre} onChange={(e) => (setNombre(e.target.value), setErrores({ ...errores, nombre: '' }))} aria-invalid={!!errores['nombre'] || undefined} aria-describedby={errores['nombre'] ? 'caj-nombre-e' : undefined} />
          </Campo>
          <div className="grid gap-1.5">
            <span className="font-medium">Alcance</span>
            <ChipSelect
              etiqueta="Alcance de la caja"
              valor={alcance}
              onChange={(v) => (setAlcance(v as Alcance), setAlcanceId(''), setErrores({ ...errores, alcance: '' }))}
              opciones={ALCANCES.map((a) => ({ valor: a, etiqueta: ETIQUETA_ALCANCE[a] }))}
            />
          </div>
          <Campo id="caj-alcance" etiqueta={ETIQUETA_ALCANCE[alcance]} requerido error={errores['alcance']}>
            <Combobox id="caj-alcance" etiqueta={ETIQUETA_ALCANCE[alcance]} opciones={opciones} valor={alcanceId} onChange={(v) => (setAlcanceId(v), setErrores({ ...errores, alcance: '' }))} invalido={!!errores['alcance']} describedBy={errores['alcance'] ? 'caj-alcance-e' : undefined} />
          </Campo>
          {parecidas.length > 0 && (
            <p role="status" className="flex gap-2 rounded-ctl border border-warn/40 bg-warn-soft px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Comparte gastos con {parecidas.map((c) => `«${c.nombre}»`).join(', ')}. Cada gasto cuenta solo en la caja más específica (subcategoría, categoría, ámbito, medio), así que no se duplica.
              </span>
            </p>
          )}
          <Campo id="caj-monto" etiqueta="Monto por defecto" requerido error={errores['monto']} ayuda="Cada mes puedes ajustarlo sin cambiar este valor.">
            <MoneyInput id="caj-monto" valor={monto} onChange={(v) => (setMonto(v), setErrores({ ...errores, monto: '' }))} moneda={base} invalido={!!errores['monto']} describedBy={errores['monto'] ? 'caj-monto-e' : undefined} />
          </Campo>
          <Campo id="caj-desc" etiqueta="Descripción" error={errores['descripcion']}>
            <textarea id="caj-desc" rows={2} maxLength={300} className={claseCampo + ' py-2'} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
          <div className="flex items-center gap-3">
            <Switch etiqueta="Caja activa" checked={activo} onChange={setActivo} />
            <span>{activo ? 'Activa' : 'Inactiva'}</span>
          </div>
          {!editando && activo && (
            <Checkbox checked={aplicar} onChange={setAplicar}>
              Aplicarla también a {mes}
            </Checkbox>
          )}
          <IconColorPicker valor={ap} onChange={setAp} />
          {errorForm && (
            <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
              {errorForm}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      <ConfirmDialog abierto={descartar} titulo="¿Descartar los cambios?" impacto="Lo que escribiste no se ha guardado y se perderá." confirmar="Descartar" peligro onCancelar={() => setDescartar(false)} onConfirmar={() => (setDescartar(false), onCerrar())} />
    </>
  )
}
