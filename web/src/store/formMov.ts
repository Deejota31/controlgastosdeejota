import { create } from 'zustand'
import type { Movimiento } from '@/api/esquemas'
export type ModoForm = 'nuevo' | 'editar' | 'clonar'

/** Datos de partida para un movimiento nuevo (por ejemplo, desde una plantilla de «Gastos del mes»). */
export interface SemillaMov {
  ambito?: string
  categoria?: string
  sub?: string
  descripcion?: string
  /** YYYY-MM-DD; por defecto, hoy. */
  fecha?: string
  monto?: string
  moneda?: string
  medio?: string
  tipo?: Movimiento['tipo_gasto']
  recurrente?: boolean
  /** Si viene, al guardar el movimiento se vincula como pago de este compromiso. */
  compromisoId?: string
}

interface FormMovState {
  abierto: boolean
  modo: ModoForm
  movimiento?: Movimiento
  semilla?: SemillaMov
  abrir: (modo: ModoForm, movimiento?: Movimiento, semilla?: SemillaMov) => void
  cerrar: () => void
}

/** El formulario único de movimiento se abre desde cualquier pantalla (botón Nuevo, FAB, menú de fila). */
export const useFormMov = create<FormMovState>((set) => ({
  abierto: false,
  modo: 'nuevo',
  abrir: (modo, movimiento, semilla) => set({ abierto: true, modo, movimiento, semilla }),
  cerrar: () => set({ abierto: false }),
}))
