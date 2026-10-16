import { Toaster } from '@/components/Toaster'
import { useRuta } from '@/lib/router'
import { Layout } from './Layout'
import { Mas } from './pages/Mas'
import { SinConexion } from './pages/SinConexion'
import { UiCatalog } from './pages/UiCatalog'
import { NAV_PRINCIPAL } from './nav'

/** El catálogo /#/ui solo existe en desarrollo y en modo demo (?demo). */
export function catalogoDisponible(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('demo')
}

function Pantalla({ path }: { path: string }) {
  if (path === '/ui' && catalogoDisponible()) return <UiCatalog />
  if (path === '/mas') return <Mas />
  const item = NAV_PRINCIPAL.find((n) => n.path === path)
  if (item) return <SinConexion modulo={item.etiqueta} />
  return <SinConexion modulo="Esta sección" />
}

export function App() {
  const { path } = useRuta()
  return (
    <>
      <Layout>
        <Pantalla path={path} />
      </Layout>
      <Toaster />
    </>
  )
}
