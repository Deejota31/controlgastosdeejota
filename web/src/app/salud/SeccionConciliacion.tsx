import { Scale } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { GrupoFondos } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/Modal'
import { MoneyInput, parsearMonto } from '@/components/MoneyInput'
import { Switch } from '@/components/Switch'
import { aCentimos, deCentimos, formatoMoneda, formatoPct } from '@/engine/dinero'
import { primerDia, ultimoDia } from '@/engine/fechas'
import { cn } from '@/lib/cn'
import { navegar } from '@/lib/router'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { toast } from '@/store/toasts'
import { diferenciaDe, fechaCorteDefecto, fuenteEnOtroGrupo, saldoCalculadoGrupo, TEXTO_CONCILIACION, verificacionesDe, type EstadoConciliacion, type VerificacionVista } from './logica'

const TONO: Record<EstadoConciliacion, string> = {
  pendiente: 'bg-warn-soft text-warn',
  en_revision: 'bg-info-soft text-info',
  conciliada: 'bg-ok-soft text-ok',
  cerrada_justificada: 'bg-surface-2 text-ink',
  desactualizada: 'bg-danger-soft text-danger',
}
const signo = (c: number) => (c > 0 ? '+' : c < 0 ? '−' : '')

function horaAhora(zona: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}

/* ------------------------------ Grupo de fondos ------------------------------ */
function FormGrupo({ grupo, onCerrar }: { grupo?: GrupoFondos; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const mutar = useDatos((s) => s.mutar)
  const id = useRef(grupo?.id ?? nuevoId('gru')).current
  const [nombre, setNombre] = useState(grupo?.nombre ?? '')
  const [fuentes, setFuentes] = useState<string[]>(grupo?.fuente_ids_json ?? [])
  const [activo, setActivo] = useState(grupo?.activo ?? true)
  const [enviando, setEnviando] = useState(false)
  const repetido = vista.grupos_fondos.some((g) => g.id !== id && g.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())
  const error = !nombre.trim() ? 'Escribe un nombre.' : repetido ? 'Ya tienes un grupo con ese nombre.' : fuentes.length === 0 ? 'Elige al menos una fuente.' : null
  const guardar = async () => {
    if (error) return
    setEnviando(true)
    const r = await mutar('grupoFondos.guardar', { id, nombre: nombre.trim(), fuente_ids: fuentes, activo, ...(grupo ? { version: grupo.version } : {}) })
    setEnviando(false)
    if (r.ok) {
      toast.ok('Grupo guardado.')
      onCerrar()
    } else toast.error(`No se pudo guardar: ${r.error.message}`)
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={grupo ? 'Editar grupo de fondos' : 'Nuevo grupo de fondos'} pie={<><Button variante="secondary" onClick={onCerrar}>Cancelar</Button><Button loading={enviando} disabled={!!error} onClick={() => void guardar()}>Guardar grupo</Button></>}>
      <div className="grid gap-4">
        <Campo id="grupo-nombre" etiqueta="Nombre del grupo" requerido ayuda="Por ejemplo, «Cuentas bancarias» o «Efectivo».">
          <input id="grupo-nombre" className={claseCampo} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <fieldset className="grid gap-1">
          <legend className="font-medium">Fuentes de dinero</legend>
          {vista.fuentes.length === 0 && <p className="text-muted">Primero crea fuentes en Presupuesto.</p>}
          {vista.fuentes.map((f) => {
            const otro = activo ? fuenteEnOtroGrupo(vista.grupos_fondos, f.id, id) : undefined
            return (
              <div key={f.id}>
                <Checkbox checked={fuentes.includes(f.id)} disabled={!!otro} onChange={(v) => setFuentes(v ? [...fuentes, f.id] : fuentes.filter((x) => x !== f.id))}>
                  {f.nombre}
                </Checkbox>
                {otro && <p className="pl-7 text-sm text-muted">Ya está en «{otro.nombre}». Una fuente solo puede estar en un grupo activo.</p>}
              </div>
            )
          })}
        </fieldset>
        <div className="flex items-center gap-3"><Switch checked={activo} onChange={setActivo} etiqueta="Grupo activo" /><span>{activo ? 'Activo' : 'Inactivo'}</span></div>
      </div>
    </Modal>
  )
}

/* ------------------------------ Verificar saldo ------------------------------ */
function FormVerificar({ mes, hoy, reemplaza, grupoInicial, onCerrar }: { mes: string; hoy: string; reemplaza?: VerificacionVista; grupoInicial?: string; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const mutar = useDatos((s) => s.mutar)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const ids = useRef({ id: nuevoId('con'), conciliacion_id: nuevoId('cid') }).current
  const activos = vista.grupos_fondos.filter((g) => g.activo)
  const v0 = reemplaza?.verificacion
  const [grupoId, setGrupoId] = useState(v0?.grupo_id ?? grupoInicial ?? activos[0]?.id ?? '')
  const [periodo, setPeriodo] = useState(v0?.periodo ?? mes)
  const [corte, setCorte] = useState(v0 ? fechaCorteDefecto(v0.periodo, hoy) : fechaCorteDefecto(mes, hoy))
  const [real, setReal] = useState('')
  const [causa, setCausa] = useState('')
  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const hora = useMemo(() => horaAhora(zona), [zona])
  const grupo = vista.grupos_fondos.find((g) => g.id === grupoId)
  const calculado = useMemo(() => (grupo ? saldoCalculadoGrupo(vista, config, grupo, periodo, corte) : null), [vista, config, grupo, periodo, corte])
  const realNum = parsearMonto(real)
  const dif = calculado && realNum !== null ? diferenciaDe(calculado.cents, aCentimos(realNum)) : null
  const error = !grupo ? 'Elige un grupo.' : realNum === null ? 'Escribe el saldo real que ves en tu cuenta.' : null
  const guardar = async () => {
    if (error || !grupo || !calculado || realNum === null) return
    setEnviando(true)
    const r = await mutar('conciliacion.verificar', {
      id: ids.id, conciliacion_id: ids.conciliacion_id, grupo_id: grupo.id, periodo, fecha_corte: corte, hora, saldo_calculado: deCentimos(calculado.cents), saldo_real: realNum,
      causa: causa.trim(), observacion: obs.trim(), ...(v0 ? { reemplaza_a: v0.id } : {}),
    })
    setEnviando(false)
    if (r.ok) {
      toast.ok(v0 ? 'Verificación corregida. La anterior queda en el historial.' : 'Verificación guardada.')
      onCerrar()
    } else toast.error(`No se pudo guardar: ${r.error.message}`)
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={v0 ? 'Volver a verificar' : 'Verificar saldo'} pie={<><Button variante="secondary" onClick={onCerrar}>Cancelar</Button><Button loading={enviando} disabled={!!error} onClick={() => void guardar()}>Guardar verificación</Button></>}>
      <div className="grid gap-4">
        <Campo id="ver-grupo" etiqueta="Grupo de fondos" requerido>
          <select id="ver-grupo" className={claseCampo} value={grupoId} disabled={!!v0} onChange={(e) => setGrupoId(e.target.value)}>
            {activos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo id="ver-periodo" etiqueta="Período"><input id="ver-periodo" type="month" className={claseCampo} value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} /></Campo>
          <Campo id="ver-corte" etiqueta="Fecha de corte"><input id="ver-corte" type="date" className={claseCampo} value={corte} min={primerDia(periodo)} onChange={(e) => e.target.value && setCorte(e.target.value)} /></Campo>
          <Campo id="ver-hora" etiqueta="Hora"><input id="ver-hora" className={claseCampo} value={hora} readOnly /></Campo>
        </div>
        <dl className="grid gap-1 rounded-ctl bg-surface-2 p-3">
          <div className="flex justify-between gap-3"><dt className="text-muted">Disponible calculado</dt><dd className="num font-medium">{calculado ? formatoMoneda(calculado.cents, base) : '—'}</dd></div>
          {calculado?.sinAplicar.length ? <p className="text-sm text-warn">No suman por no estar aplicadas en {periodo}: {calculado.sinAplicar.join(', ')}.</p> : null}
        </dl>
        <Campo id="ver-real" etiqueta="Saldo real" requerido ayuda="Lo que muestra tu banco o tu billetera al momento de la fecha de corte.">
          <MoneyInput id="ver-real" valor={real} onChange={setReal} moneda={base} />
        </Campo>
        {dif && (
          <p role="status" className={cn('num rounded-ctl p-3 font-medium', dif.cents === 0 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
            Diferencia: {signo(dif.cents)}{formatoMoneda(Math.abs(dif.cents), base)}
            {dif.pct !== null && ` (${signo(dif.cents)}${formatoPct(Math.abs(dif.pct), 1)} del calculado)`}
            {dif.cents === 0 && ' · Cuadra'}
          </p>
        )}
        <Campo id="ver-causa" etiqueta="Causa (opcional)"><input id="ver-causa" className={claseCampo} maxLength={200} value={causa} onChange={(e) => setCausa(e.target.value)} /></Campo>
        <Campo id="ver-obs" etiqueta="Observación (opcional)"><textarea id="ver-obs" className={cn(claseCampo, 'min-h-20 py-2')} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        <p className="text-sm text-muted">Esto solo guarda una foto de la comparación. No crea movimientos ni cambia tus saldos.</p>
      </div>
    </Modal>
  )
}

/* ------------------------------ Revisar diferencia ------------------------------ */
function RevisarDiferencia({ v, onCerrar }: { v: VerificacionVista; onCerrar: () => void }) {
  const mutar = useDatos((s) => s.mutar)
  const config = useDatos((s) => s.config)
  const abrirMov = useFormMov((s) => s.abrir)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const ver = v.verificacion
  const id = useRef(nuevoId('seg')).current
  const [estado, setEstado] = useState<EstadoConciliacion>(v.estadoGuardado === 'pendiente' || v.estadoGuardado === 'desactualizada' ? 'en_revision' : v.estadoGuardado)
  const [causa, setCausa] = useState(v.causa)
  const [obs, setObs] = useState(v.observacion)
  const [enviando, setEnviando] = useState(false)
  const errorCausa = estado === 'cerrada_justificada' && !causa.trim() ? 'Documenta la causa para cerrar con diferencia justificada.' : null
  const guardar = async () => {
    if (errorCausa) return
    setEnviando(true)
    const r = await mutar('conciliacion.seguimiento', { id, conciliacion_id: ver.conciliacion_id, estado, causa: causa.trim(), observacion: obs.trim() })
    setEnviando(false)
    if (r.ok) {
      toast.ok('Seguimiento guardado.')
      onCerrar()
    } else toast.error(`No se pudo guardar: ${r.error.message}`)
  }
  const dif = ver.diferencia ?? 0
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Revisar diferencia" pie={<><Button variante="secondary" onClick={onCerrar}>Cerrar</Button><Button loading={enviando} disabled={!!errorCausa} onClick={() => void guardar()}>Guardar seguimiento</Button></>}>
      <div className="grid gap-4">
        <p className="num font-medium">Diferencia de {signo(dif)}{formatoMoneda(Math.abs(aCentimos(dif)), base)} al {ver.fecha_corte} {ver.hora}.</p>
        <ul className="grid gap-2">
          <li><Button variante="secondary" onClick={() => navegar('/movimientos', { p: 'personalizado', d: primerDia(ver.periodo), h: ver.fecha_corte })}>Revisar movimientos del período</Button></li>
          <li><Button variante="secondary" onClick={() => { onCerrar(); abrirMov('nuevo', undefined, { fecha: ver.fecha_corte }) }}>Registrar un gasto olvidado</Button></li>
          <li><Button variante="secondary" onClick={() => navegar('/presupuesto', { p: 'personalizado', d: primerDia(ver.periodo), h: ultimoDia(ver.periodo) })}>Ir a Fuentes</Button></li>
        </ul>
        <p className="text-sm text-muted">Registrar un gasto usa la fecha de corte. Nunca se crean movimientos solo para cuadrar el saldo.</p>
        <Campo id="seg-estado" etiqueta="Estado">
          <select id="seg-estado" className={claseCampo} value={estado} onChange={(e) => setEstado(e.target.value as EstadoConciliacion)}>
            <option value="en_revision">En revisión</option>
            <option value="conciliada">Conciliada</option>
            <option value="cerrada_justificada">Cerrada con diferencia justificada</option>
          </select>
        </Campo>
        <Campo id="seg-causa" etiqueta="Causa de la diferencia" error={errorCausa}><input id="seg-causa" className={claseCampo} maxLength={200} value={causa} aria-invalid={!!errorCausa} aria-describedby={errorCausa ? 'seg-causa-e' : undefined} onChange={(e) => setCausa(e.target.value)} /></Campo>
        <Campo id="seg-obs" etiqueta="Observación"><textarea id="seg-obs" className={cn(claseCampo, 'min-h-20 py-2')} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      </div>
    </Modal>
  )
}

/* ------------------------------ Sección ------------------------------ */
type Dialogo = { t: 'grupo'; grupo?: GrupoFondos } | { t: 'verificar'; reemplaza?: VerificacionVista } | { t: 'revisar'; v: VerificacionVista }

export function SeccionConciliacion({ mes, hoy }: { mes: string; hoy: string }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const m = (c: number) => formatoMoneda(c, base)
  const verifs = useMemo(() => verificacionesDe(vista, config), [vista, config])
  const vigentes = verifs.filter((v) => !v.reemplazada)
  const reemplazadas = verifs.filter((v) => v.reemplazada)
  const nombreGrupo = (id: string) => vista.grupos_fondos.find((g) => g.id === id)?.nombre ?? 'Grupo eliminado'
  const hayActivos = vista.grupos_fondos.some((g) => g.activo)

  return (
    <div className="grid grid-cols-1 gap-5">
      <section aria-labelledby="grupos" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="grupos" className="text-lg font-semibold">Grupos de fondos</h3>
          <Button variante="secondary" onClick={() => setDialogo({ t: 'grupo' })}>Nuevo grupo</Button>
        </div>
        {vista.grupos_fondos.length === 0 ? (
          <EmptyState icono={<Scale className="size-7" aria-hidden />} titulo="Agrupa tus fuentes para verificar saldos" mensaje="Un grupo reúne las fuentes que viven en la misma cuenta, por ejemplo «Cuentas bancarias». Luego comparas el disponible calculado con el saldo real." accion={{ etiqueta: 'Crear mi primer grupo', onClick: () => setDialogo({ t: 'grupo' }) }} />
        ) : (
          <ul className="grid gap-2">
            {vista.grupos_fondos.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.nombre}{!g.activo && <span className="ml-2 text-sm text-muted">(inactivo)</span>}</p>
                  <p className="truncate text-sm text-muted">{(g.fuente_ids_json ?? []).map((id) => vista.fuentes.find((f) => f.id === id)?.nombre ?? '—').join(' · ')}</p>
                </div>
                <Button variante="ghost" className="min-h-9" onClick={() => setDialogo({ t: 'grupo', grupo: g })} aria-label={`Editar grupo ${g.nombre}`}>Editar</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verifs" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="verifs" className="text-lg font-semibold">Verificaciones</h3>
          <Button disabled={!hayActivos} onClick={() => setDialogo({ t: 'verificar' })}>Verificar saldo</Button>
        </div>
        {!hayActivos && vista.grupos_fondos.length > 0 && <p className="text-muted">Activa o crea un grupo de fondos para poder verificar.</p>}
        {vigentes.length === 0 ? (
          hayActivos && <p className="text-muted">Aún no verificaste ningún saldo.</p>
        ) : (
          <ul className="grid gap-3">
            {vigentes.map((v) => {
              const ver = v.verificacion
              const dif = aCentimos(ver.diferencia ?? 0)
              const pct = diferenciaDe(aCentimos(ver.saldo_calculado ?? 0), aCentimos(ver.saldo_real ?? 0)).pct
              const abierta = v.estado !== 'conciliada' && v.estado !== 'cerrada_justificada'
              return (
                <li key={ver.id} className="rounded-ctl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{nombreGrupo(ver.grupo_id)} · {ver.periodo}</p>
                    <span className={cn('inline-flex min-h-6 items-center rounded-full px-2.5 text-sm font-medium', TONO[v.estado])}>{TEXTO_CONCILIACION[v.estado]}</span>
                  </div>
                  <p className="text-sm text-muted">Corte {ver.fecha_corte} {ver.hora}</p>
                  <dl className="num mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-sm min-[480px]:grid-cols-3">
                    <div><dt className="text-muted">Calculado</dt><dd>{m(aCentimos(ver.saldo_calculado ?? 0))}</dd></div>
                    <div><dt className="text-muted">Saldo real</dt><dd>{m(aCentimos(ver.saldo_real ?? 0))}</dd></div>
                    <div><dt className="text-muted">Diferencia</dt><dd className={cn(dif !== 0 && 'text-warn')}>{signo(dif)}{m(Math.abs(dif))}{pct !== null && dif !== 0 ? ` (${signo(dif)}${formatoPct(Math.abs(pct), 1)})` : ''}</dd></div>
                  </dl>
                  {v.estado === 'desactualizada' && <p className="mt-1 text-sm text-danger">Los datos cambiaron desde esta verificación: el calculado hoy es {v.calculadoActual === null ? '—' : m(aCentimos(v.calculadoActual))}. Vuelve a verificar.</p>}
                  {v.causa && <p className="mt-1 text-sm">Causa: {v.causa}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {abierta && dif !== 0 && <Button className="min-h-9" onClick={() => setDialogo({ t: 'revisar', v })}>Revisar diferencia</Button>}
                    <Button variante="secondary" className="min-h-9" onClick={() => setDialogo({ t: 'verificar', reemplaza: v })}>Volver a verificar</Button>
                  </div>
                  <details className="mt-2">
                    <summary className="min-h-9 cursor-pointer py-1.5 text-sm text-muted">Historial ({v.historial.length})</summary>
                    <ol className="grid gap-1 text-sm">
                      {v.historial.map((h) => (
                        <li key={h.id}>{h.creado_en.slice(0, 16).replace('T', ' ')} · {h.tipo === 'verificacion' ? 'Verificación' : 'Seguimiento'} · {TEXTO_CONCILIACION[h.estado]}{h.causa ? ` · ${h.causa}` : ''}</li>
                      ))}
                    </ol>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
        {reemplazadas.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Historial de verificaciones corregidas ({reemplazadas.length})</summary>
            <ul aria-label="Verificaciones reemplazadas" className="grid gap-1 text-sm">
              {reemplazadas.map((v) => (
                <li key={v.verificacion.id} className="num">
                  {nombreGrupo(v.verificacion.grupo_id)} · {v.verificacion.periodo} · corte {v.verificacion.fecha_corte} · real {m(aCentimos(v.verificacion.saldo_real ?? 0))} · {TEXTO_CONCILIACION[v.estadoGuardado]} · reemplazada
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {dialogo?.t === 'grupo' && <FormGrupo key={dialogo.grupo?.id ?? 'nuevo'} grupo={dialogo.grupo} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'verificar' && <FormVerificar key={dialogo.reemplaza?.verificacion.id ?? 'nueva'} mes={mes} hoy={hoy} reemplaza={dialogo.reemplaza} onCerrar={() => setDialogo(null)} />}
      {dialogo?.t === 'revisar' && <RevisarDiferencia key={dialogo.v.verificacion.id} v={dialogo.v} onCerrar={() => setDialogo(null)} />}
    </div>
  )
}
