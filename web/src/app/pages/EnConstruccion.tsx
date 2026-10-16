import { Hammer } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

/** Marcador temporal mientras se construye cada módulo; desaparece al completar su fase. */
export function EnConstruccion({ modulo }: { modulo: string }) {
  return <EmptyState icono={<Hammer className="size-7" aria-hidden />} titulo={`${modulo} llega en la siguiente fase`} mensaje="Tus datos ya están conectados y sincronizados; esta pantalla se habilita en el próximo avance." />
}
