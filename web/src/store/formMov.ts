import { create } from 'zustand'
import type { Movimiento } from '@/api/esquemas'
export type ModoForm = 'nuevo' | 'editar' | 'clonar'

interface FormMovState {
  abierto: boolean
  modo: ModoForm
  movimiento?: Movimiento
  abrir: (modo: ModoForm, movimiento?: Movimiento) => void
  cerrar: () => void
}

/** El formulario único de movimiento se abre desde cualquier pantalla (botón Nuevo, FAB, menú de fila). */
export const useFormMov = create<FormMovState>((set) => ({
  abierto: false,
  modo: 'nuevo',
  abrir: (modo, movimiento) => set({ abierto: true, modo, movimiento }),
  cerrar: () => set({ abierto: false }),
}))
