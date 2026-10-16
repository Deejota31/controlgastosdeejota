import { create } from 'zustand'

export type Tema = 'claro' | 'oscuro' | 'sistema'

function leerLS<T extends string>(clave: string, def: T): T {
  try {
    return (localStorage.getItem(clave) as T | null) ?? def
  } catch {
    return def
  }
}
function guardarLS(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* almacenamiento no disponible: la preferencia vive solo en memoria */
  }
}

export function aplicarTema(tema: Tema) {
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = oscuro ? 'dark' : 'light'
}

interface UiState {
  tema: Tema
  sidebarMini: boolean
  drawerAbierto: boolean
  setTema: (t: Tema) => void
  toggleSidebar: () => void
  setDrawer: (v: boolean) => void
}

export const useUi = create<UiState>((set, get) => ({
  tema: leerLS<Tema>('dj.tema', 'sistema'),
  sidebarMini: leerLS<string>('dj.sidebar', 'full') === 'mini',
  drawerAbierto: false,
  setTema: (tema) => {
    guardarLS('dj.tema', tema)
    aplicarTema(tema)
    set({ tema })
  },
  toggleSidebar: () => {
    const mini = !get().sidebarMini
    guardarLS('dj.sidebar', mini ? 'mini' : 'full')
    set({ sidebarMini: mini })
  },
  setDrawer: (drawerAbierto) => set({ drawerAbierto }),
}))

if (typeof window !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUi.getState().tema === 'sistema') aplicarTema('sistema')
  })
}
