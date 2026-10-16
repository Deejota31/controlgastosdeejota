import { PlugZap } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { navegar } from '@/lib/router'
import { useConexion } from '@/store/conexion'
import { useDatos } from '@/store/datos'

/** Estado "sin conexión configurada": nunca muestra datos falsos. */
export function SinConexion({ modulo }: { modulo: string }) {
  return (
    <EmptyState
      icono={<PlugZap className="size-7" aria-hidden />}
      titulo="Conecta tu hoja para empezar"
      mensaje={`${modulo} muestra los datos de tu hoja de Google Sheets. Conéctala o prueba la app con datos de demostración.`}
      accion={{ etiqueta: 'Conectar mi hoja', onClick: () => navegar('/configuracion') }}
      accionSecundaria={{
        etiqueta: 'Probar en modo demo',
        onClick: () => {
          void useConexion.getState().usarDemo().then(() => useDatos.getState().iniciar())
        },
      }}
    />
  )
}
