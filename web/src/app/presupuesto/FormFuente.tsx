import { useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Fuente } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ChipSelect } from '@/components/ChipSelect'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { IconColorPicker, type Apariencia } from '@/components/IconColorPicker'
import { parsearMonto } from '@/components/MoneyInput'
import { MoneyInput } from '@/components/MoneyInput'
import { Modal } from '@/components/Modal'
import { MultiSelect } from '@/components/MultiSelect'
import { Switch } from '@/components/Switch'
import { monedasPermitidas, tipoCambioDe } from '@/lib/catalogo'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { nombreRepetido } from '../catalogo/logica'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

export interface FormFuenteProps {
  /** Fuente a editar; sin ella se crea una nueva. */
  fuente?: Fuente
  /** Datos de partida al clonar o crear desde una plantilla (no tienen id propio). */
  semilla?: Partial<Fuente>
  mes: string
  onCerrar: () => void
}

/** Alta y edición de una fuente de ingreso. Se monta al abrirse: el id queda fijo hasta cerrar. */
export function FormFuente({ fuente, semilla, mes, onCerrar }: FormFuenteProps) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const mutar = useDatos((s) => s.mutar)
  const origen = fuente ?? semilla
  const idForm = useRef(fuente?.id ?? nuevoId('fue'))
  const monedas = monedasPermitidas(config)
  const [nombre, setNombre] = useState(origen?.nombre ?? '')
  const [monto, setMonto] = useState(origen?.monto_defecto !== undefined ? String(origen.monto_defecto) : '')
  const [moneda, setMoneda] = useState(origen?.moneda ?? monedas[0] ?? 'PEN')
  const [recurrencia, setRecurrencia] = useState<Fuente['recurrencia']>(origen?.recurrencia ?? 'mensual')
  const [mesInicio, setMesInicio] = useState(origen?.mes_inicio ?? mes)
  const [mesFin, setMesFin] = useState(origen?.mes_fin ?? '')
  const [medios, setMedios] = useState<string[]>(() => (fuente ? vista.fuente_medios.filter((x) => x.fuente_id === fuente.id).map((x) => x.medio_pago_id) : []))
  const [principal, setPrincipal] = useState(fuente?.es_principal ?? false)
  const [activo, setActivo] = useState(origen?.activo ?? true)
  const [ap, setAp] = useState<Apariencia>({ icono: origen?.icono ?? 'wallet', color: origen?.color || '#16a34a' })
  const [aplicar, setAplicar] = useState(!fuente)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const bloqueo = useRef(false)
  const baseline = useRef('')
  const estado = JSON.stringify([nombre, monto, moneda, recurrencia, mesInicio, mesFin, medios, principal, activo, ap, aplicar])
  if (!baseline.current) baseline.current = estado
  const sucio = baseline.current !== estado

  const editando = !!fuente
  const sinTC = tipoCambioDe(config, moneda) === null
  const vigenteAhora = recurrencia === 'unica' ? mesInicio === mes : mes >= mesInicio && (!mesFin || mes <= mesFin)

  function validar(): Record<string, string> {
    const e: Record<string, string> = {}
    const n = nombre.trim().replace(/\s+/g, ' ')
    if (!n) e['nombre'] = 'Escribe un nombre.'
    else if (n.length > 60) e['nombre'] = 'Máximo 60 caracteres.'
    else if (nombreRepetido(vista.fuentes, n, fuente?.id)) e['nombre'] = 'Ya existe una fuente con ese nombre.'
    const m = parsearMonto(monto)
    if (monto.trim() === '') e['monto'] = 'Escribe el monto.'
    else if (m === null || m < 0) e['monto'] = 'El monto debe ser un número mayor o igual a 0, con máximo 2 decimales.'
    if (!MES.test(mesInicio)) e['inicio'] = 'Elige el mes de inicio.'
    if (recurrencia === 'mensual' && mesFin && (!MES.test(mesFin) || mesFin < mesInicio)) e['fin'] = 'El mes final no puede ser anterior al inicial.'
    if (principal && !activo) e['principal'] = 'La fuente principal debe estar activa.'
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
    const payload: Record<string, unknown> = {
      id: idForm.current,
      nombre: nombre.trim().replace(/\s+/g, ' '),
      monto_defecto: montoNum,
      moneda,
      recurrencia,
      mes_inicio: mesInicio,
      mes_fin: recurrencia === 'unica' ? mesInicio : mesFin,
      activo,
      es_principal: principal,
      medios,
      icono: ap.icono,
      color: ap.color,
      ...(fuente ? { version: fuente.version } : {}),
      ...(!editando && aplicar && activo && vigenteAhora ? { aplicar_mes: mes, monto_mes: montoNum } : {}),
    }
    const r = await mutar('fuente.guardar', payload)
    setEnviando(false)
    if (r.ok) {
      toast.ok(editando ? 'Fuente guardada.' : 'Fuente creada.')
      baseline.current = estado
      onCerrar()
      return
    }
    bloqueo.current = false
    const campo = r.error.campo
    const clave = campo === 'nombre' ? 'nombre' : campo === 'monto_defecto' ? 'monto' : campo === 'mes_inicio' ? 'inicio' : campo === 'mes_fin' ? 'fin' : campo === 'es_principal' ? 'principal' : ''
    if (clave) setErrores({ [clave]: r.error.message })
    else setErrorForm(r.error.message)
  }

  const pedirCerrar = () => (sucio && !enviando ? setDescartar(true) : onCerrar())

  return (
    <>
      <Modal
        abierto
        onCerrar={pedirCerrar}
        titulo={editando ? 'Editar fuente' : semilla ? 'Clonar fuente' : 'Nueva fuente'}
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
          <Campo id="fue-nombre" etiqueta="Nombre" requerido error={errores['nombre']}>
            <input id="fue-nombre" autoFocus autoComplete="off" maxLength={60} className={claseCampo} value={nombre} onChange={(e) => (setNombre(e.target.value), setErrores({ ...errores, nombre: '' }))} aria-invalid={!!errores['nombre'] || undefined} aria-describedby={errores['nombre'] ? 'fue-nombre-e' : undefined} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="fue-monto" etiqueta="Monto por defecto" requerido error={errores['monto']}>
              <MoneyInput id="fue-monto" valor={monto} onChange={(v) => (setMonto(v), setErrores({ ...errores, monto: '' }))} moneda={moneda} invalido={!!errores['monto']} describedBy={errores['monto'] ? 'fue-monto-e' : undefined} />
            </Campo>
            <Campo id="fue-moneda" etiqueta="Moneda" ayuda={sinTC ? `Sin tipo de cambio para ${moneda}: la fuente quedará fuera del presupuesto hasta configurarlo en Configuración.` : undefined}>
              <select id="fue-moneda" className={claseCampo} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {monedas.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid gap-1.5">
            <span className="font-medium">Recurrencia</span>
            <ChipSelect
              etiqueta="Recurrencia"
              valor={recurrencia}
              onChange={(v) => setRecurrencia(v as Fuente['recurrencia'])}
              opciones={[
                { valor: 'mensual', etiqueta: 'Todos los meses' },
                { valor: 'unica', etiqueta: 'Solo un mes' },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="fue-inicio" etiqueta={recurrencia === 'unica' ? 'Mes' : 'Desde el mes'} requerido error={errores['inicio']}>
              <input id="fue-inicio" type="month" className={claseCampo} value={mesInicio} onChange={(e) => (setMesInicio(e.target.value), setErrores({ ...errores, inicio: '' }))} aria-invalid={!!errores['inicio'] || undefined} aria-describedby={errores['inicio'] ? 'fue-inicio-e' : undefined} />
            </Campo>
            {recurrencia === 'mensual' && (
              <Campo id="fue-fin" etiqueta="Hasta el mes" ayuda="Déjalo vacío si no termina." error={errores['fin']}>
                <input id="fue-fin" type="month" className={claseCampo} value={mesFin} onChange={(e) => (setMesFin(e.target.value), setErrores({ ...errores, fin: '' }))} aria-invalid={!!errores['fin'] || undefined} aria-describedby={errores['fin'] ? 'fue-fin-e' : undefined} />
              </Campo>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className="font-medium" id="fue-medios-l">
              Medios de pago ligados
            </span>
            <MultiSelect etiqueta="Medios de pago ligados" placeholder="Ninguno (cubre cualquier medio)" opciones={vista.medios_pago.filter((m) => m.activo || medios.includes(m.id)).map((m) => ({ valor: m.id, etiqueta: m.nombre }))} valor={medios} onChange={setMedios} />
            <p className="text-sm text-muted">Si ligas medios, esta fuente solo cubre los gastos hechos con ellos.</p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div className="flex items-center gap-3">
              <Switch etiqueta="Fuente principal" checked={principal} onChange={setPrincipal} />
              <span>Principal</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch etiqueta="Fuente activa" checked={activo} onChange={setActivo} />
              <span>{activo ? 'Activa' : 'Inactiva'}</span>
            </div>
          </div>
          {errores['principal'] && (
            <p role="alert" className="text-sm text-danger">
              {errores['principal']}
            </p>
          )}
          {!editando && activo && vigenteAhora && (
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
