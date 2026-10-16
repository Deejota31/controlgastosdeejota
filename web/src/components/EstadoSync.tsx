import { leerParametrosDemo, urlSinDemo } from '@/demo/parametros'
import { CloudCheck, CloudOff, Loader2, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useConexion } from '@/store/conexion'
import { useDatos } from '@/store/datos'

/** Indicador de sincronización: "Al día", "Guardando…", "N pendientes" o "Sin conexión". */
export function EstadoSync({ className }: { className?: string }) {
  const modo = useConexion((s) => s.modo)
  const pendientes = useDatos((s) => s.pendientes.length)
  const enLinea = useDatos((s) => s.enLinea)
  const sincronizando = useDatos((s) => s.sincronizando)
  const estado = useDatos((s) => s.estado)
  const porConfirmar = useDatos((s) => s.porConfirmar)
  const pausada = useDatos((s) => s.pausada)
  const reintentar = useDatos((s) => s.reintentarAhora)
  if (modo === 'sin-config') return null

  let texto = 'Al día'
  let tono = 'bg-ok-soft text-ok'
  let Icono = CloudCheck
  if (pausada) {
    return (
      <button
        type="button"
        onClick={reintentar}
        className={cn('inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-sm font-medium text-warn', className)}
      >
        <CloudOff className="size-4" aria-hidden />
        {pendientes} sin enviar · Reintentar
      </button>
    )
  }
  if (!enLinea) {
    texto = pendientes ? `Sin conexión · ${pendientes} por enviar` : 'Sin conexión'
    tono = 'bg-warn-soft text-warn'
    Icono = CloudOff
  } else if (porConfirmar) {
    texto = porConfirmar === 1 ? 'Confirmando 1 cambio…' : `Confirmando ${porConfirmar} cambios…`
    tono = 'bg-warn-soft text-warn'
    Icono = Loader2
  } else if (pendientes) {
    texto = pendientes === 1 ? 'Guardando…' : `Guardando ${pendientes}…`
    tono = 'bg-primary-soft text-primary'
    Icono = Loader2
  } else if (sincronizando || estado === 'cargando') {
    texto = 'Actualizando…'
    tono = 'bg-primary-soft text-primary'
    Icono = Loader2
  }
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium', tono, className)}>
      <Icono className={cn('size-4', Icono === Loader2 && 'animate-spin')} aria-hidden />
      {texto}
    </span>
  )
}

export function BannerDemo() {
  const modo = useConexion((s) => s.modo)
  const desconectar = useConexion((s) => s.desconectar)
  const reiniciar = useDatos((s) => s.reiniciar)
  if (modo !== 'demo') return null
  const enUrl = leerParametrosDemo() !== null
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent-soft px-4 py-1.5 text-center text-sm text-ink">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span>{enUrl ? 'Estás en modo demo · los datos viven en memoria y se pierden al recargar' : 'Estás en modo demo · lo que registres vive solo en este navegador'}</span>
      <a className="font-semibold underline underline-offset-2" href="#/configuracion">
        Conectar mi hoja
      </a>
      <button
        type="button"
        className="font-semibold underline underline-offset-2"
        onClick={() => {
          if (enUrl) {
            location.href = urlSinDemo()
            return
          }
          desconectar()
          void reiniciar()
          window.location.hash = '#/'
        }}
      >
        Salir de la demo
      </button>
    </div>
  )
}
