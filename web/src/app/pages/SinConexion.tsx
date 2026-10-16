import { useState } from 'react'
import { PlugZap } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { urlConDemo } from '@/demo/parametros'
import { navegador } from '@/lib/navegador'
import { navegar } from '@/lib/router'

/** Estado "sin conexión configurada": nunca muestra datos falsos. */
export function SinConexion({ modulo }: { modulo: string }) {
  const [cargando, setCargando] = useState(false)

  function conectar() {
    if (window.location.hash.replace(/^#/, '').split('?')[0] === '/configuracion') {
      document.querySelector<HTMLInputElement>('input[type="url"]')?.focus()
    } else navegar('/configuracion')
  }

  /** La demo es una sola: se abre con ?demo, vive en memoria y no toca la conexión ni los datos reales guardados. */
  function probarDemo() {
    setCargando(true)
    navegador.irA(urlConDemo())
  }

  return (
    <EmptyState
      icono={<PlugZap className="size-7" aria-hidden />}
      titulo="Conecta tu hoja para empezar"
      mensaje={`${modulo} muestra los datos de tu hoja de Google Sheets. Conéctala o prueba la app con datos de demostración.`}
      accion={{ etiqueta: 'Conectar mi hoja', onClick: conectar }}
      accionSecundaria={{ etiqueta: cargando ? 'Cargando demo…' : 'Probar en modo demo', onClick: probarDemo, cargando }}
    />
  )
}
