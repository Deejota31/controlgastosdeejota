import { Bell, ChevronsLeft, ChevronsRight, Menu, Plus, Search, Settings, CloudCheck, ExternalLink } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { IconButton } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/cn'
import { navegar, useRuta } from '@/lib/router'
import { useUi } from '@/store/ui'
import { NAV_MOVIL, NAV_PRINCIPAL, tituloDe, type ItemNav } from './nav'

function activo(path: string, actual: string) {
  return path === '/' ? actual === '/' : actual.startsWith(path)
}

function NavLink({ item, mini, onClick }: { item: ItemNav; mini?: boolean; onClick?: () => void }) {
  const { path: actual } = useRuta()
  const on = activo(item.path, actual)
  const Icon = item.icono
  return (
    <a
      href={`#${item.path}`}
      onClick={onClick}
      aria-current={on ? 'page' : undefined}
      title={mini ? item.etiqueta : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-ctl px-3 font-medium transition-colors duration-150',
        mini && 'justify-center px-0',
        on ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {!mini && <span>{item.etiqueta}</span>}
    </a>
  )
}

function Sidebar({ mini }: { mini: boolean }) {
  const toggle = useUi((s) => s.toggleSidebar)
  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface xl:flex"
      style={{ width: mini ? 'var(--sidebar-w-mini)' : 'var(--sidebar-w)' }}
    >
      <div className={cn('flex h-[var(--topbar-h)] items-center px-4', mini && 'justify-center px-0')}>
        <Logo mini={mini} />
      </div>
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_PRINCIPAL.map((n) => (
          <NavLink key={n.path} item={n} mini={mini} />
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <IconButton etiqueta={mini ? 'Expandir barra lateral' : 'Contraer barra lateral'} onClick={toggle} className="w-full">
          {mini ? <ChevronsRight className="size-5" aria-hidden /> : <ChevronsLeft className="size-5" aria-hidden />}
        </IconButton>
      </div>
    </aside>
  )
}

function Drawer() {
  const abierto = useUi((s) => s.drawerAbierto)
  const setDrawer = useUi((s) => s.setDrawer)
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto, setDrawer])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <div className="absolute inset-0 bg-black/50 [animation:fade_150ms_ease-out]" onClick={() => setDrawer(false)} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface pt-[var(--safe-top)] shadow-2"
      >
        <div className="flex h-[var(--topbar-h)] items-center px-4">
          <Logo />
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1 px-3 py-2">
          {NAV_PRINCIPAL.map((n) => (
            <NavLink key={n.path} item={n} onClick={() => setDrawer(false)} />
          ))}
        </nav>
      </aside>
    </div>
  )
}

function Topbar() {
  const { path } = useRuta()
  const setDrawer = useUi((s) => s.setDrawer)
  return (
    <header className="sticky top-0 z-20 flex h-[calc(var(--topbar-h)+var(--safe-top))] items-center gap-2 border-b border-line bg-surface/90 px-3 pt-[var(--safe-top)] backdrop-blur md:px-5">
      <IconButton etiqueta="Abrir menú" className="xl:hidden" onClick={() => setDrawer(true)}>
        <Menu className="size-5" aria-hidden />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{tituloDe(path)}</h1>
      <button
        type="button"
        className="hidden min-h-11 items-center gap-2 rounded-ctl border border-line bg-surface-2 px-3 text-muted hover:text-ink md:inline-flex md:w-64"
        aria-label="Buscar (Ctrl K)"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="rounded bg-surface px-1.5 text-xs">⌘K</kbd>
      </button>
      <IconButton etiqueta="Recordatorios">
        <Bell className="size-5" aria-hidden />
      </IconButton>
      <span className="hidden items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-sm font-medium text-ok md:inline-flex" role="status">
        <CloudCheck className="size-4" aria-hidden />
        Al día
      </span>
      <a
        href="#/configuracion"
        className="hidden min-h-11 items-center gap-1.5 rounded-ctl px-3 font-medium text-muted hover:bg-surface-2 hover:text-ink lg:inline-flex"
      >
        <ExternalLink className="size-4" aria-hidden />
        Mi hoja
      </a>
      <IconButton etiqueta="Configuración" className="hidden md:inline-flex" onClick={() => navegar('/configuracion')}>
        <Settings className="size-5" aria-hidden />
      </IconButton>
    </header>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[var(--safe-bottom)] md:hidden"
    >
      {NAV_MOVIL.map((n) => (
        <NavTab key={n.path} item={n} />
      ))}
    </nav>
  )
}

function NavTab({ item }: { item: ItemNav }) {
  const { path: actual } = useRuta()
  const on = activo(item.path, actual)
  const Icon = item.icono
  return (
    <a
      href={`#${item.path}`}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex min-h-[var(--bottombar-h)] flex-col items-center justify-center gap-0.5 text-xs font-medium',
        on ? 'text-primary' : 'text-muted',
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.etiqueta}
    </a>
  )
}

function Fab() {
  return (
    <button
      type="button"
      aria-label="Nuevo gasto"
      className="fixed right-4 bottom-[calc(var(--bottombar-h)+var(--safe-bottom)+16px)] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-2 transition-transform duration-150 active:scale-95 md:hidden"
    >
      <Plus className="size-7" aria-hidden />
    </button>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const mini = useUi((s) => s.sidebarMini)
  return (
    <div className="min-h-full">
      <Sidebar mini={mini} />
      <Drawer />
      <div
        className="flex min-h-[100dvh] min-w-0 flex-col transition-[padding] duration-200 xl:pl-[var(--pl)]"
        style={{ ['--pl' as string]: mini ? 'var(--sidebar-w-mini)' : 'var(--sidebar-w)' }}
      >
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-5 pb-[calc(var(--bottombar-h)+var(--safe-bottom)+88px)] md:px-6 md:pb-8">
          {children}
        </main>
      </div>
      <BottomNav />
      <Fab />
    </div>
  )
}
