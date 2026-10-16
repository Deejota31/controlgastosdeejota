import { create } from 'zustand'

interface GastosMesState {
  abierto: boolean
  abrir: () => void
  cerrar: () => void
}

/** El modal «Gastos del mes» se abre desde Inicio y Movimientos. */
export const useGastosMes = create<GastosMesState>((set) => ({
  abierto: false,
  abrir: () => set({ abierto: true }),
  cerrar: () => set({ abierto: false }),
}))
