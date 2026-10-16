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
  if (modo === 'sin-config') return null

  let texto = 'Al día'
  let tono = 'bg-ok-soft text-ok'
  let Icono = CloudCheck
  if (!enLinea) {
    texto = pendientes ? `Sin conexión · ${pendientes} por enviar` : 'Sin conexión'
    tono = 'bg-warn-soft text-warn'
    Icono = CloudOff
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent-soft px-4 py-1.5 text-center text-sm text-ink">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span>Modo demostración: lo que registres vive solo en este navegador.</span>
      <button
        type="button"
        className="font-semibold underline underline-offset-2"
        onClick={() => {
          desconectar()
          void reiniciar()
          localStorage.removeItem('dj.demo.v1')
        }}
      >
        Salir de la demo
      </button>
    </div>
  )
}
