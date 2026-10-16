import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, EyeOff, PlugZap, Unplug } from 'lucide-react'
import { ApiError } from '@/api/cliente'
import { Button, IconButton } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { navegar } from '@/lib/router'
import { probarConexion, useConexion, validarUrlWebApp, type ResultadoPrueba } from '@/store/conexion'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'

const campo =
  'min-h-11 w-full rounded-ctl border border-line bg-surface px-3 text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'

/** Muestra solo el inicio y el final de la URL: el identificador de la implementación es parte del acceso. */
export function urlEnmascarada(url: string): string {
  try {
    const u = new URL(url)
    const id = u.pathname.split('/').filter(Boolean).at(-2) ?? ''
    return `${u.host}/…${id.slice(-6)}/exec`
  } catch {
    return '—'
  }
}

function Pasos() {
  return (
    <details className="rounded-card border border-line bg-surface p-4 shadow-1">
      <summary className="cursor-pointer font-medium">¿Cómo obtengo la URL y el token?</summary>
      <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-muted">
        <li>
          En <b>script.google.com</b> crea un proyecto y pega el contenido de <code>Code.gs</code> y de <code>appsscript.json</code>.
        </li>
        <li>
          Ejecuta la función <code>setup</code> y acepta los permisos. En el registro verás el <b>token</b> y el enlace a tu hoja.
        </li>
        <li>
          Pulsa <b>Implementar → Nueva implementación → Aplicación web</b> (ejecutar como «Yo», acceso «Cualquier persona»).
        </li>
        <li>
          Copia la <b>URL que termina en /exec</b>, pégala aquí junto al token y pulsa «Probar y conectar».
        </li>
      </ol>
    </details>
  )
}

function ConexionForm({ onCancelar }: { onCancelar?: () => void }) {
  const idUrl = useId()
  const idTok = useId()
  const refUrl = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [ver, setVer] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [errUrl, setErrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prueba, setPrueba] = useState<ResultadoPrueba | null>(null)

  useEffect(() => {
    refUrl.current?.focus()
  }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPrueba(null)
    const v = validarUrlWebApp(url)
    setErrUrl(v)
    if (v) {
      refUrl.current?.focus()
      return
    }
    setCargando(true)
    const previo = useConexion.getState()
    try {
      const r = await probarConexion(url, token)
      setPrueba(r)
      // Solo se guarda la conexión si la prueba salió bien.
      await useDatos.getState().reiniciar()
      useConexion.getState().conectar(url, token)
      useDatos.getState().adoptarBootstrap(r.datos) // se reutiliza el bootstrap de la prueba: no se pide dos veces
      await useDatos.getState().iniciar()
      if (useDatos.getState().estado !== 'listo') throw new ApiError('SERVER_ERROR', useDatos.getState().error ?? 'No se pudieron cargar los datos de tu hoja.')
      toast.ok(`Conectado · versión ${r.version} · ${r.ms} ms`)
      navegar('/')
    } catch (err) {
      // Revierte: nada de la conexión fallida queda guardada.
      if (previo.modo === 'real' && previo.url) useConexion.getState().conectar(previo.url, previo.token)
      else useConexion.getState().desconectar()
      const ae = err instanceof ApiError ? err : null
      setError(
        ae?.code === 'AUTH'
          ? 'El token no es correcto. Copia de nuevo el que mostró setup (o ejecuta mostrarToken).'
          : (ae?.message ?? 'No se pudo conectar. Revisa la URL y que la aplicación esté publicada para «Cualquier persona».'),
      )
      setPrueba(null)
    } finally {
      setCargando(false)
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate aria-busy={cargando || undefined} className="grid gap-4 rounded-card border border-line bg-surface p-4 shadow-1 md:p-6">
      <div className="grid gap-1.5">
        <label htmlFor={idUrl} className="font-medium">
          URL de la aplicación web de Apps Script
        </label>
        <input
          id={idUrl}
          ref={refUrl}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://script.google.com/macros/s/…/exec"
          className={campo}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setErrUrl(null)
          }}
          aria-invalid={errUrl ? true : undefined}
          aria-describedby={errUrl ? `${idUrl}-e` : undefined}
          disabled={cargando}
        />
        {errUrl && (
          <p id={`${idUrl}-e`} role="alert" className="text-sm text-danger">
            {errUrl}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={idTok} className="font-medium">
          Token de acceso
        </label>
        <div className="flex gap-2">
          <input
            id={idTok}
            type={ver ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className={campo}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={cargando}
          />
          <IconButton etiqueta={ver ? 'Ocultar token' : 'Mostrar token'} onClick={() => setVer((x) => !x)} aria-pressed={ver}>
            {ver ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </IconButton>
        </div>
        <p className="text-sm text-muted">Se guarda solo en este navegador y nunca viaja en la dirección de la página.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {prueba && !error && (
        <p role="status" className="flex items-center gap-2 text-sm text-ok">
          <CheckCircle2 className="size-4" aria-hidden />
          Respuesta correcta: versión {prueba.version}, {prueba.hojas} hojas, {prueba.ms} ms. Cargando tus datos…
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={cargando} icono={<PlugZap className="size-4" aria-hidden />}>
          {cargando ? 'Probando conexión…' : 'Probar y conectar'}
        </Button>
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar} disabled={cargando}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

function ConexionActual({ onCambiar }: { onCambiar: () => void }) {
  const modo = useConexion((s) => s.modo)
  const url = useConexion((s) => s.url)
  const desconectar = useConexion((s) => s.desconectar)
  const reiniciar = useDatos((s) => s.reiniciar)
  const sinEnviar = useDatos((s) => s.pendientes.length)
  const [confirmar, setConfirmar] = useState(false)
  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-1 md:p-6" aria-label="Conexión actual">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="size-5 text-ok" aria-hidden />
        {modo === 'demo' ? 'Modo demostración (datos de ejemplo en este navegador)' : 'Conectado a tu hoja de Google Sheets'}
      </p>
      {modo === 'real' && (
        <p className="text-muted">
          Dirección: <span className="num">{urlEnmascarada(url)}</span> · token guardado (oculto)
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variante="secondary" onClick={onCambiar}>
          {modo === 'demo' ? 'Conectar mi hoja' : 'Cambiar hoja'}
        </Button>
        <Button variante="danger" icono={<Unplug className="size-4" aria-hidden />} onClick={() => setConfirmar(true)}>
          {modo === 'demo' ? 'Salir de la demo' : 'Desconectar'}
        </Button>
      </div>
      <ConfirmDialog
        abierto={confirmar}
        titulo={modo === 'demo' ? 'Salir de la demo' : 'Desconectar esta hoja'}
        impacto={
          modo === 'demo'
            ? 'Se borran los datos de ejemplo de este navegador. No se toca ninguna hoja real.'
            : `Se olvida la URL y el token de este navegador y se borran los datos en caché. Tu hoja de Google Sheets no se modifica.${
                sinEnviar
                  ? ` Hay ${sinEnviar} ${sinEnviar === 1 ? 'cambio' : 'cambios'} sin enviar: se conservan en este dispositivo y se enviarán si vuelves a conectar esta misma hoja.`
                  : ''
              }`
        }
        confirmar={modo === 'demo' ? 'Salir' : 'Desconectar'}
        peligro
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => {
          desconectar()
          void reiniciar()
          setConfirmar(false)
          toast.info(modo === 'demo' ? 'Saliste de la demo.' : 'Hoja desconectada.')
        }}
      />
    </section>
  )
}

/** Configuración › Conexión. Siempre disponible, también sin conexión. */
export function Configuracion() {
  const modo = useConexion((s) => s.modo)
  const [cambiando, setCambiando] = useState(false)
  const mostrarForm = modo === 'sin-config' || cambiando
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div>
        <h2 className="text-lg font-semibold">Conexión con tu hoja</h2>
        <p className="text-muted">Deejota Finanzas guarda tus datos en tu propia hoja de Google Sheets. Aquí la conectas.</p>
      </div>
      {modo !== 'sin-config' && <ConexionActual onCambiar={() => setCambiando(true)} />}
      {mostrarForm && <ConexionForm onCancelar={modo !== 'sin-config' ? () => setCambiando(false) : undefined} />}
      <Pasos />
    </div>
  )
}
