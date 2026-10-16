import { useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Caja, Fuente, Plantilla } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ChipSelect } from '@/components/ChipSelect'
import { Combobox } from '@/components/Combobox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Modal } from '@/components/Modal'
import { MoneyInput, parsearMonto } from '@/components/MoneyInput'
import { aCentimos, formatoMoneda } from '@/engine/dinero'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { nombreRepetido } from '../catalogo/logica'
import { ejecutar } from './acciones'
import { impactoDeActivar, previsualizarCopia, previsualizarPlantillas, TEXTO_ACCION, TEXTO_ESTADO_PLANTILLA } from './logica'

const dinero = (cents: number, moneda: string) => formatoMoneda(cents, moneda)
const rojoSiNegativo = (c: number) => (c < 0 ? 'text-danger' : '')

function FilaImpacto({ etiqueta, antes, despues, moneda }: { etiqueta: string; antes: number; despues: number; moneda: string }) {
  return (
    <tr>
      <th scope="row" className="py-1 pr-4 text-left font-normal text-muted">
        {etiqueta}
      </th>
      <td className="num py-1 pr-2 text-right">{dinero(antes, moneda)}</td>
      <td aria-hidden className="px-1 text-muted">
        →
      </td>
      <td className={`num py-1 text-right font-medium ${rojoSiNegativo(despues)}`}>{dinero(despues, moneda)}</td>
    </tr>
  )
}

/** Vista previa del impacto de activar o desactivar una fuente o una caja en el mes visible. */
export function DialogoImpacto({ tipo, id, nombre, activar, mes, enviando, onCancelar, onConfirmar }: { tipo: 'fuente' | 'caja'; id: string; nombre: string; activar: boolean; mes: string; enviando?: boolean; onCancelar: () => void; onConfirmar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const moneda = (config['moneda_base'] || 'PEN').toUpperCase()
  const imp = useMemo(() => impactoDeActivar(vista, config, mes, tipo, id, activar), [vista, config, mes, tipo, id, activar])
  const verbo = activar ? 'Activar' : 'Desactivar'
  return (
    <ConfirmDialog
      abierto
      titulo={`${verbo} ${tipo === 'fuente' ? 'la fuente' : 'la caja'} «${nombre}»`}
      confirmar={verbo}
      peligro={!activar}
      loading={enviando}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
      impacto={
        imp.sinEfecto ? (
          <p>No cambia ninguna cifra de {mes}: {tipo === 'fuente' ? 'no está aplicada a ese mes o no está vigente' : 'no está aplicada a ese mes'}. Sus datos y su historial se conservan.</p>
        ) : (
          <div className="grid gap-2">
            <p>Así quedaría {mes}:</p>
            <table className="text-sm">
              <caption className="sr-only">Cambio en las cifras de {mes}</caption>
              <tbody>
                <FilaImpacto etiqueta="Presupuesto" antes={imp.antes.presupuesto} despues={imp.despues.presupuesto} moneda={moneda} />
                <FilaImpacto etiqueta="Reservado en cajas" antes={imp.antes.reservado} despues={imp.despues.reservado} moneda={moneda} />
                <FilaImpacto etiqueta="Disponible" antes={imp.antes.disponible} despues={imp.despues.disponible} moneda={moneda} />
                <FilaImpacto etiqueta="Saldo libre" antes={imp.antes.saldoLibre} despues={imp.despues.saldoLibre} moneda={moneda} />
              </tbody>
            </table>
          </div>
        )
      }
    />
  )
}

/** Ajusta el monto de una fuente o caja en un mes. En fuentes también se puede aplicar desde este mes en adelante. */
export function DialogoAjusteMes({ tipo, entidad, mes, montoMes, estado, onCerrar }: { tipo: 'fuente' | 'caja'; entidad: Fuente | Caja; mes: string; montoMes: number | null; estado: 'aplicada' | 'omitida' | 'sin_aplicar'; onCerrar: () => void }) {
  const [monto, setMonto] = useState(String(montoMes ?? entidad.monto_defecto))
  const [alcance, setAlcance] = useState<'mes' | 'desde'>('mes')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)
  const clave = tipo === 'fuente' ? 'fuente_id' : 'caja_id'
  const moneda = tipo === 'fuente' ? (entidad as Fuente).moneda : (useDatos.getState().config['moneda_base'] || 'PEN').toUpperCase()
  const prefijo = tipo === 'fuente' ? 'fuenteMes' : 'cajaMes'

  async function guardar() {
    if (bloqueo.current) return
    const m = parsearMonto(monto)
    if (monto.trim() === '' || m === null || m < 0) return setError('Escribe un monto mayor o igual a 0, con máximo 2 decimales.')
    bloqueo.current = true
    setEnviando(true)
    const r = await ejecutar(`${prefijo}.aplicar`, { [clave]: entidad.id, mes, monto: m, ...(tipo === 'fuente' && alcance === 'desde' ? { desde_este_mes: true } : {}) }, 'Monto guardado.')
    setEnviando(false)
    bloqueo.current = false
    if (r) onCerrar()
  }
  async function quitar() {
    if (bloqueo.current) return
    bloqueo.current = true
    setEnviando(true)
    const r = await ejecutar(`${prefijo}.quitar`, { [clave]: entidad.id, mes }, 'Se quitó del mes.')
    setEnviando(false)
    bloqueo.current = false
    if (r) onCerrar()
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${estado === 'aplicada' ? 'Ajustar' : 'Aplicar'} «${entidad.nombre}» en ${mes}`}
      pie={
        <>
          {estado !== 'sin_aplicar' && (
            <Button variante="secondary" className="mr-auto" disabled={enviando} onClick={() => void quitar()}>
              Quitar del mes
            </Button>
          )}
          <Button variante="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button loading={enviando} onClick={() => void guardar()}>
            {estado === 'aplicada' ? 'Guardar ajuste' : 'Aplicar al mes'}
          </Button>
        </>
      }
    >
      <form noValidate className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void guardar())}>
        <Campo id="aj-monto" etiqueta={`Monto de ${mes}`} requerido error={error}>
          <MoneyInput id="aj-monto" valor={monto} onChange={(v) => (setMonto(v), setError(null))} moneda={moneda} invalido={!!error} describedBy={error ? 'aj-monto-e' : undefined} />
        </Campo>
        {tipo === 'fuente' && (
          <div className="grid gap-1.5">
            <span className="font-medium">¿Hasta dónde vale?</span>
            <ChipSelect
              etiqueta="Alcance del ajuste"
              valor={alcance}
              onChange={(v) => setAlcance(v as 'mes' | 'desde')}
              opciones={[
                { valor: 'mes', etiqueta: 'Solo este mes' },
                { valor: 'desde', etiqueta: 'Desde este mes' },
              ]}
            />
            <p className="text-sm text-muted">{alcance === 'mes' ? `Los demás meses no cambian. El monto por defecto sigue siendo ${entidad.monto_defecto}.` : 'Este monto pasa a ser el valor por defecto de la fuente para los meses que se apliquen después.'}</p>
          </div>
        )}
        <p className="text-sm text-muted">Los meses anteriores no se modifican.</p>
      </form>
    </Modal>
  )
}

/** Copia las fuentes y cajas aplicadas el mes anterior, con vista previa editable. Nunca duplica ni pisa lo existente. */
export function DialogoCopiar({ mes, onCerrar }: { mes: string; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const moneda = (config['moneda_base'] || 'PEN').toUpperCase()
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)
  const numeros = useMemo(() => {
    const o: Record<string, number> = {}
    for (const [k, v] of Object.entries(montos)) {
      const n = parsearMonto(v)
      if (n !== null && n >= 0) o[k] = n
    }
    return o
  }, [montos])
  const filas = useMemo(() => previsualizarCopia(vista, mes, excluidos, numeros), [vista, mes, excluidos, numeros])
  const invalidos = Object.entries(montos).filter(([, v]) => v.trim() === '' || parsearMonto(v) === null || (parsearMonto(v) ?? 0) < 0)
  const aCrear = filas.filter((f) => f.accion === 'crear')

  async function copiar() {
    if (bloqueo.current || !aCrear.length || invalidos.length) return
    bloqueo.current = true
    setEnviando(true)
    const cambios: Record<string, number> = {}
    for (const f of filas) if (f.monto !== f.montoAnterior) cambios[`${f.tipo}:${f.id}`] = f.monto
    const r = await ejecutar<{ aplicadas?: number }>('mes.copiarDeAnterior', {
      mes,
      excluir: [...excluidos].map((k) => ({ tipo: k.split(':')[0], id: k.split(':')[1] })),
      montos: cambios,
    })
    setEnviando(false)
    bloqueo.current = false
    if (r) {
      toast.ok(`Se copió la configuración a ${mes}.`)
      onCerrar()
    }
  }

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Copiar del mes anterior a ${mes}`}
      pie={
        <>
          <Button variante="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button loading={enviando} disabled={!aCrear.length || invalidos.length > 0} onClick={() => void copiar()}>
            {aCrear.length ? `Copiar ${aCrear.length} ${aCrear.length === 1 ? 'elemento' : 'elementos'}` : 'Nada que copiar'}
          </Button>
        </>
      }
    >
      {filas.length === 0 ? (
        <p>El mes anterior no tiene fuentes mensuales ni cajas aplicadas que copiar.</p>
      ) : (
        <div className="grid gap-3">
          <p className="text-muted">Lo que ya existe en {mes} no se toca. Puedes cambiar los montos o excluir elementos antes de copiar.</p>
          <ul className="grid gap-2">
            {filas.map((f) => {
              const clave = `${f.tipo}:${f.id}`
              const existente = f.accion === 'existente'
              return (
                <li key={clave} className="grid gap-2 rounded-ctl border border-line p-3 sm:grid-cols-[1fr_9rem_8rem] sm:items-center">
                  <div className="min-w-0">
                    <Checkbox checked={!existente && !excluidos.has(clave)} disabled={existente} onChange={(v) => setExcluidos((s) => { const n = new Set(s); if (v) n.delete(clave); else n.add(clave); return n })}>
                      <span className="truncate">
                        {f.nombre} <span className="text-muted">({f.tipo === 'fuente' ? 'fuente' : 'caja'})</span>
                      </span>
                    </Checkbox>
                    <p className="pl-7 text-sm text-muted">
                      {existente ? `Ya existe en ${mes}: no se modifica.` : excluidos.has(clave) ? 'Se omite.' : `Mes anterior: ${dinero(aCentimos(f.montoAnterior), moneda)}`}
                    </p>
                  </div>
                  <MoneyInput etiqueta={`Monto de ${f.nombre}`} valor={montos[clave] ?? String(f.montoAnterior)} onChange={(v) => setMontos({ ...montos, [clave]: v })} moneda={moneda} disabled={existente || excluidos.has(clave)} invalido={invalidos.some(([k]) => k === clave)} />
                  <span className="text-sm font-medium sm:text-right">{existente ? 'Sin cambios' : excluidos.has(clave) ? 'Omitir' : 'Crear'}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Modal>
  )
}

/** Aplica plantillas de fuentes o cajas a un mes con vista previa; reaplicar no duplica. */
export function DialogoAplicarPlantillas({ tipo, mes, ids, onCerrar }: { tipo: 'fuente' | 'caja'; mes: string; ids?: string[]; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const moneda = (config['moneda_base'] || 'PEN').toUpperCase()
  const [omitir, setOmitir] = useState<Set<string>>(new Set())
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const bloqueo = useRef(false)
  const numeros = useMemo(() => Object.fromEntries(Object.entries(montos).flatMap(([k, v]) => { const n = parsearMonto(v); return n !== null && n >= 0 ? [[k, n]] : [] })), [montos])
  const filas = useMemo(() => previsualizarPlantillas(vista, tipo, mes, omitir, numeros, ids), [vista, tipo, mes, omitir, numeros, ids])
  const invalidos = Object.entries(montos).some(([, v]) => v.trim() === '' || parsearMonto(v) === null)
  const hayCambios = filas.some((f) => f.accion === 'crear' || f.accion === 'actualizar' || (f.accion === 'omitir' && omitir.has(f.plantillaId)))

  async function aplicar() {
    if (bloqueo.current || !hayCambios || invalidos) return
    bloqueo.current = true
    setEnviando(true)
    const r = await ejecutar<{ escritas?: number }>('plantilla.aplicarMes', {
      tipo,
      mes,
      plantilla_ids: filas.map((f) => f.plantillaId),
      omitir_ids: [...omitir],
      montos: numeros,
    })
    setEnviando(false)
    bloqueo.current = false
    if (r) {
      toast.ok(`Plantillas aplicadas a ${mes}.`)
      onCerrar()
    }
  }

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Aplicar plantillas de ${tipo === 'fuente' ? 'fuentes' : 'cajas'} a ${mes}`}
      pie={
        <>
          <Button variante="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button loading={enviando} disabled={!hayCambios || invalidos} onClick={() => void aplicar()}>
            {hayCambios ? 'Aplicar' : 'Sin cambios'}
          </Button>
        </>
      }
    >
      {filas.length === 0 ? (
        <p>No hay plantillas activas de {tipo === 'fuente' ? 'fuentes' : 'cajas'}.</p>
      ) : (
        <ul className="grid gap-2">
          {filas.map((f) => {
            const sinEntidad = f.monto === null
            return (
              <li key={f.plantillaId} className="grid gap-2 rounded-ctl border border-line p-3 sm:grid-cols-[1fr_9rem_9rem] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.nombre}</p>
                  <p className="text-sm text-muted">{f.motivo || TEXTO_ESTADO_PLANTILLA[f.estado]}</p>
                  {!sinEntidad && (
                    <Checkbox checked={omitir.has(f.plantillaId)} onChange={(v) => setOmitir((s) => { const n = new Set(s); if (v) n.add(f.plantillaId); else n.delete(f.plantillaId); return n })}>
                      No aplica este mes
                    </Checkbox>
                  )}
                </div>
                {sinEntidad ? <span /> : <MoneyInput etiqueta={`Monto de ${f.nombre}`} valor={montos[f.plantillaId] ?? String(f.monto)} onChange={(v) => setMontos({ ...montos, [f.plantillaId]: v })} moneda={moneda} disabled={omitir.has(f.plantillaId)} />}
                <span className="text-sm font-medium sm:text-right">{sinEntidad ? 'Omitir' : TEXTO_ACCION[f.accion]}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

/** Crea o edita una plantilla de fuente o de caja (puede venir ya ligada a una fuente o caja). */
export function FormPlantilla({ plantilla, tipoInicial, entidadId, onCerrar }: { plantilla?: Plantilla; tipoInicial?: 'fuente' | 'caja'; entidadId?: string; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const idForm = useRef(plantilla?.id ?? nuevoId('pla'))
  const datos = (plantilla?.datos_json ?? {}) as Record<string, unknown>
  const tipo = (plantilla?.tipo === 'caja' ? 'caja' : plantilla?.tipo === 'fuente' ? 'fuente' : (tipoInicial ?? 'fuente')) as 'fuente' | 'caja'
  const [tipoSel, setTipoSel] = useState<'fuente' | 'caja'>(tipo)
  const [ent, setEnt] = useState<string>(String(datos['fuente_id'] ?? datos['caja_id'] ?? entidadId ?? ''))
  const entidades = tipoSel === 'fuente' ? vista.fuentes : vista.cajas
  const elegida = entidades.find((e) => e.id === ent)
  const [nombre, setNombre] = useState(plantilla?.nombre ?? (elegida ? `${elegida.nombre} · mensual` : ''))
  const [monto, setMonto] = useState(typeof datos['monto'] === 'number' ? String(datos['monto']) : elegida ? String(elegida.monto_defecto) : '')
  const [activo, setActivo] = useState(plantilla?.activo ?? true)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const bloqueo = useRef(false)
  const baseline = useRef('')
  const estado = JSON.stringify([tipoSel, ent, nombre, monto, activo])
  if (!baseline.current) baseline.current = estado
  const sucio = baseline.current !== estado
  const editando = !!plantilla

  async function guardar() {
    if (bloqueo.current) return
    const e: Record<string, string> = {}
    const n = nombre.trim().replace(/\s+/g, ' ')
    if (!n) e['nombre'] = 'Escribe un nombre.'
    else if (nombreRepetido(vista.plantillas.filter((p) => p.tipo === tipoSel), n, plantilla?.id)) e['nombre'] = 'Ya existe una plantilla con ese nombre.'
    if (!ent) e['ent'] = tipoSel === 'fuente' ? 'Elige una fuente.' : 'Elige una caja.'
    const m = parsearMonto(monto)
    if (monto.trim() === '' || m === null || m < 0) e['monto'] = 'Escribe un monto mayor o igual a 0, con máximo 2 decimales.'
    setErrores(e)
    if (Object.keys(e).length) return
    bloqueo.current = true
    setEnviando(true)
    const r = await useDatos.getState().mutar('plantilla.guardar', {
      id: idForm.current,
      tipo: tipoSel,
      nombre: n,
      datos: { [tipoSel === 'fuente' ? 'fuente_id' : 'caja_id']: ent, monto: m },
      activo,
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
    setErrores({ [r.error.campo === 'nombre' ? 'nombre' : 'general']: r.error.message })
  }
  const pedirCerrar = () => (sucio && !enviando ? setDescartar(true) : onCerrar())

  return (
    <>
      <Modal
        abierto
        onCerrar={pedirCerrar}
        titulo={editando ? 'Editar plantilla' : 'Nueva plantilla'}
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
          {!editando && !entidadId && (
            <div className="grid gap-1.5">
              <span className="font-medium">Tipo</span>
              <ChipSelect etiqueta="Tipo de plantilla" valor={tipoSel} onChange={(v) => (setTipoSel(v as 'fuente' | 'caja'), setEnt(''))} opciones={[{ valor: 'fuente', etiqueta: 'Fuente' }, { valor: 'caja', etiqueta: 'Caja' }]} />
            </div>
          )}
          <Campo id="pla-ent" etiqueta={tipoSel === 'fuente' ? 'Fuente' : 'Caja'} requerido error={errores['ent']}>
            <Combobox id="pla-ent" etiqueta={tipoSel === 'fuente' ? 'Fuente' : 'Caja'} opciones={entidades.filter((x) => x.activo || x.id === ent).map((x) => ({ valor: x.id, etiqueta: x.nombre }))} valor={ent} onChange={(v) => { setEnt(v); const x = entidades.find((q) => q.id === v); if (x && !monto) setMonto(String(x.monto_defecto)) }} invalido={!!errores['ent']} describedBy={errores['ent'] ? 'pla-ent-e' : undefined} />
          </Campo>
          <Campo id="pla-nombre" etiqueta="Nombre" requerido error={errores['nombre']}>
            <input id="pla-nombre" autoComplete="off" maxLength={60} className={claseCampo} value={nombre} onChange={(e) => (setNombre(e.target.value), setErrores({ ...errores, nombre: '' }))} aria-invalid={!!errores['nombre'] || undefined} aria-describedby={errores['nombre'] ? 'pla-nombre-e' : undefined} />
          </Campo>
          <Campo id="pla-monto" etiqueta="Monto" requerido error={errores['monto']}>
            <MoneyInput id="pla-monto" valor={monto} onChange={(v) => (setMonto(v), setErrores({ ...errores, monto: '' }))} invalido={!!errores['monto']} describedBy={errores['monto'] ? 'pla-monto-e' : undefined} />
          </Campo>
          <Checkbox checked={activo} onChange={setActivo}>
            Plantilla activa
          </Checkbox>
          {errores['general'] && (
            <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
              {errores['general']}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      <ConfirmDialog abierto={descartar} titulo="¿Descartar los cambios?" impacto="Lo que escribiste no se ha guardado y se perderá." confirmar="Descartar" peligro onCancelar={() => setDescartar(false)} onConfirmar={() => (setDescartar(false), onCerrar())} />
    </>
  )
}

