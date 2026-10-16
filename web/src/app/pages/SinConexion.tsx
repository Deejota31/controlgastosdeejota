import { useState } from 'react'
import { PlugZap } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { navegar } from '@/lib/router'
import { useConexion } from '@/store/conexion'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'

/** Estado "sin conexión configurada": nunca muestra datos falsos. */
export function SinConexion({ modulo }: { modulo: string }) {
  const [cargando, setCargando] = useState(false)

  function conectar() {
    if (window.location.hash.replace(/^#/, '').split('?')[0] === '/configuracion') {
      document.querySelector<HTMLInputElement>('input[type="url"]')?.focus()
    } else navegar('/configuracion')
  }

  async function probarDemo() {
    setCargando(true)
    try {
      await useConexion.getState().usarDemo()
      await useDatos.getState().iniciar()
      if (useDatos.getState().estado === 'error') throw new Error(useDatos.getState().error ?? 'No se pudo cargar la demo.')
      toast.ok('Modo demo activado')
      navegar('/')
    } catch (e) {
      useConexion.getState().desconectar()
      toast.error(e instanceof Error ? e.message : 'No se pudo activar el modo demo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <EmptyState
      icono={<PlugZap className="size-7" aria-hidden />}
      titulo="Conecta tu hoja para empezar"
      mensaje={`${modulo} muestra los datos de tu hoja de Google Sheets. Conéctala o prueba la app con datos de demostración.`}
      accion={{ etiqueta: 'Conectar mi hoja', onClick: conectar }}
      accionSecundaria={{ etiqueta: cargando ? 'Cargando demo…' : 'Probar en modo demo', onClick: () => void probarDemo(), cargando }}
    />
  )
}
