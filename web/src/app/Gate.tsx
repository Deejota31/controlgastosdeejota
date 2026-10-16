import type { ReactNode } from 'react'
import { ErrorState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { useConexion } from '@/store/conexion'
import { useDatos } from '@/store/datos'
import { SinConexion } from './pages/SinConexion'

/** Muestra el onboarding sin conexión, un esqueleto mientras carga o el contenido cuando hay datos. */
export function Gate({ modulo, children }: { modulo: string; children: ReactNode }) {
  const modo = useConexion((s) => s.modo)
  const estado = useDatos((s) => s.estado)
  const error = useDatos((s) => s.error)
  const refrescar = useDatos((s) => s.refrescar)
  const iniciar = useDatos((s) => s.iniciar)
  if (modo === 'sin-config') return <SinConexion modulo={modulo} />
  if (estado === 'listo') return <>{children}</>
  if (estado === 'error') {
    return <ErrorState mensaje={error ?? 'No se pudieron cargar tus datos.'} onReintentar={() => void (estado === 'error' ? iniciar() : refrescar())} />
  }
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  )
}
