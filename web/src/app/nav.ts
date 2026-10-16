import { Home, Receipt, Wallet, Tags, HeartPulse, CalendarCheck, Settings, MoreHorizontal, type LucideIcon } from 'lucide-react'

export interface ItemNav {
  path: string
  etiqueta: string
  icono: LucideIcon
}

export const NAV_PRINCIPAL: ItemNav[] = [
  { path: '/', etiqueta: 'Inicio', icono: Home },
  { path: '/movimientos', etiqueta: 'Movimientos', icono: Receipt },
  { path: '/presupuesto', etiqueta: 'Presupuesto', icono: Wallet },
  { path: '/catalogo', etiqueta: 'Catálogo', icono: Tags },
  { path: '/salud', etiqueta: 'Salud financiera', icono: HeartPulse },
  { path: '/planificacion', etiqueta: 'Prepara tu mes', icono: CalendarCheck },
  { path: '/configuracion', etiqueta: 'Configuración', icono: Settings },
]

/** Barra inferior móvil: Inicio · Movimientos · Presupuesto · Más */
export const NAV_MOVIL: ItemNav[] = [
  NAV_PRINCIPAL[0]!,
  NAV_PRINCIPAL[1]!,
  NAV_PRINCIPAL[2]!,
  { path: '/mas', etiqueta: 'Más', icono: MoreHorizontal },
]

export function tituloDe(path: string): string {
  if (path === '/ui') return 'Catálogo de componentes'
  if (path === '/mas') return 'Más'
  return NAV_PRINCIPAL.find((n) => n.path === path)?.etiqueta ?? 'Deejota Finanzas'
}
