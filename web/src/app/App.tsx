import { useEffect } from 'react'
import { Toaster } from '@/components/Toaster'
import { useRuta } from '@/lib/router'
import { useConexion } from '@/store/conexion'
import { conectarEventosDatos, useDatos } from '@/store/datos'
import { Gate } from './Gate'
import { Layout } from './Layout'
import { Mas } from './pages/Mas'
import { SinConexion } from './pages/SinConexion'
import { EnConstruccion } from './pages/EnConstruccion'
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
  if (item) {
    return (
      <Gate modulo={item.etiqueta}>
        <EnConstruccion modulo={item.etiqueta} />
      </Gate>
    )
  }
  return <SinConexion modulo="Esta sección" />
}

/** Arranca la sincronización cuando hay conexión y la mantiene viva (volver a la pestaña, intervalo, red). */
function useSincronizacion() {
  const modo = useConexion((s) => s.modo)
  const segundos = Number(useDatos((s) => s.config['auto_refresh_seg']) ?? 0)
  useEffect(() => {
    if (modo === 'sin-config') return
    void useDatos.getState().iniciar()
    const quitar = conectarEventosDatos()
    const alVolver = () => {
      if (document.visibilityState === 'visible') void useDatos.getState().refrescar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      quitar()
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [modo])
  useEffect(() => {
    if (modo === 'sin-config' || !(segundos > 0)) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void useDatos.getState().refrescar()
    }, segundos * 1000)
    return () => clearInterval(t)
  }, [modo, segundos])
}

export function App() {
  const { path } = useRuta()
  useSincronizacion()
  return (
    <>
      <Layout>
        <Pantalla path={path} />
      </Layout>
      <Toaster />
    </>
  )
}
