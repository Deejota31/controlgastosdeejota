import { Hammer } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useConexion } from '@/store/conexion'

/** Marcador temporal mientras se construye cada módulo; desaparece al completar su fase. */
export function EnConstruccion({ modulo }: { modulo: string }) {
  const demo = useConexion((s) => s.modo === 'demo')
  return (
    <EmptyState
      icono={<Hammer className="size-7" aria-hidden />}
      titulo={`${modulo} llega en la siguiente fase`}
      mensaje={demo ? 'Modo demo activo: esta sección estará disponible pronto.' : 'Tus datos ya están conectados y sincronizados; esta pantalla se habilita en el próximo avance.'}
    />
  )
}
