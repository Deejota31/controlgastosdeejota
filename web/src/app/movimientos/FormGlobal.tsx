import { toast } from '@/store/toasts'
import { navegar, useRuta } from '@/lib/router'
import { useConexion } from '@/store/conexion'
import { useFormMov } from '@/store/formMov'
import { FormMovimiento } from './FormMovimiento'

/** Una única instancia del formulario para toda la app. Sin conexión no se abre (no hay dónde guardar). */
export function FormMovimientoGlobal() {
  const { abierto, modo, movimiento, cerrar } = useFormMov()
  const conectado = useConexion((s) => s.modo !== 'sin-config')
  const { path } = useRuta()
  if (!conectado) return null
  return (
    <FormMovimiento
      abierto={abierto}
      modo={modo}
      movimiento={movimiento}
      onCerrar={cerrar}
      onGuardado={(id) => {
        if (path === '/movimientos') navegar('/movimientos', { resaltar: id })
        else toast.info('Movimiento guardado. Puedes verlo en Movimientos.')
      }}
    />
  )
}
