import { create } from 'zustand'

export interface ToastAccion {
  etiqueta: string
  onClick: () => void
}
export interface Toast {
  id: number
  tipo: 'ok' | 'error' | 'info'
  mensaje: string
  acciones?: ToastAccion[]
}

let seq = 0
interface ToastState {
  items: Toast[]
  push: (t: Omit<Toast, 'id'>) => number
  quitar: (id: number) => void
}

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (t) => {
    const id = ++seq
    set({ items: [...get().items, { ...t, id }] })
    // Éxito/info se cierran solos a los 4 s; los errores son persistentes.
    if (t.tipo !== 'error') setTimeout(() => get().quitar(id), 4000)
    return id
  },
  quitar: (id) => set({ items: get().items.filter((x) => x.id !== id) }),
}))

export const toast = {
  ok: (mensaje: string) => useToasts.getState().push({ tipo: 'ok', mensaje }),
  info: (mensaje: string) => useToasts.getState().push({ tipo: 'info', mensaje }),
  error: (mensaje: string, acciones?: ToastAccion[]) =>
    useToasts.getState().push({ tipo: 'error', mensaje, acciones }),
}
