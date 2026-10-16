import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBackendDemo } from '@/demo/backend-demo'
import { useConexion } from '@/store/conexion'
import { useDatos } from '@/store/datos'
import { Toaster } from '@/components/Toaster'
import { toast } from '@/store/toasts'
import { App } from './App'

beforeEach(() => {
  window.location.hash = '#/'
})

describe('App (fundaciones)', () => {
  it('sin conexión muestra onboarding, nunca datos falsos', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Conecta tu hoja para empezar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conectar mi hoja' })).toBeInTheDocument()
  })

  it('navega por hash y marca la sección activa', async () => {
    render(<App />)
    await act(async () => {
      window.location.hash = '#/movimientos'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Movimientos' })).toBeInTheDocument()
    const activos = screen.getAllByRole('link', { current: 'page' })
    expect(activos.length).toBeGreaterThan(0)
  })

  it('el catálogo /#/ui está disponible en desarrollo', async () => {
    render(<App />)
    await act(async () => {
      window.location.hash = '#/ui'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { name: 'Button / IconButton' })).toBeInTheDocument()
  })
})

describe('App con conexión (modo demo = Code.gs real)', () => {
  it('"Probar en modo demo" carga los datos, muestra el aviso de demo y "Al día"', async () => {
    localStorage.clear()
    render(<App />)
    await act(async () => {
      window.location.hash = '#/'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Probar en modo demo' }))
    expect(await screen.findByText(/Estás en modo demo/)).toBeInTheDocument()
    expect(await screen.findByText('Movimientos en total')).toBeInTheDocument()
    expect(await screen.findByText('Al día', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(useDatos.getState().vista.ambitos).toHaveLength(5)
    // Salir de la demo vuelve al onboarding y borra los datos locales
    await userEvent.click(screen.getByRole('button', { name: 'Salir de la demo' }))
    expect(await screen.findByRole('heading', { name: 'Conecta tu hoja para empezar' })).toBeInTheDocument()
    expect(useConexion.getState().modo).toBe('sin-config')
    expect(localStorage.getItem('dj.demo.v1')).toBeNull()
  })
})

describe('Toaster', () => {
  it('el error es persistente y ofrece acciones', async () => {
    render(<Toaster />)
    let reintentado = false
    act(() => {
      toast.error('No se pudo guardar.', [{ etiqueta: 'Reintentar', onClick: () => (reintentado = true) }])
    })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentado).toBe(true)
  })
})

describe('Conectar mi hoja', () => {
  beforeEach(async () => {
    localStorage.clear()
    useConexion.getState().desconectar()
    await useDatos.getState().reiniciar()
    window.location.hash = '#/'
  })
  afterEach(() => vi.unstubAllGlobals())

  const irA = async (hash: string) =>
    act(async () => {
      window.location.hash = hash
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

  it('lleva a un formulario real con el foco en la URL', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Conectar mi hoja' }))
    const url = await screen.findByLabelText('URL de la aplicación web de Apps Script')
    expect(url).toHaveFocus()
    expect(screen.getByLabelText('Token de acceso')).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar token' }))
    expect(screen.getByLabelText('Token de acceso')).toHaveAttribute('type', 'text')
  })

  it('valida la URL en línea y no guarda nada', async () => {
    render(<App />)
    await irA('#/configuracion')
    await userEvent.type(await screen.findByLabelText('URL de la aplicación web de Apps Script'), 'http://x.com/macros/s/abc/exec')
    await userEvent.click(screen.getByRole('button', { name: 'Probar y conectar' }))
    expect(await screen.findByText('La URL debe empezar con https://')).toBeInTheDocument()
    expect(localStorage.getItem('dj.conexion.v1')).toBeNull()
  })

  it('si falla la conexión muestra el error y revierte', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('red caída')))
    render(<App />)
    await irA('#/configuracion')
    await userEvent.type(await screen.findByLabelText('URL de la aplicación web de Apps Script'), 'https://script.google.com/macros/s/AKfyc123456/exec')
    await userEvent.type(screen.getByLabelText('Token de acceso'), 'tok')
    await userEvent.click(screen.getByRole('button', { name: 'Probar y conectar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay conexión/)
    expect(useConexion.getState().modo).toBe('sin-config')
    expect(localStorage.getItem('dj.conexion.v1')).toBeNull()
  })

  it('con URL y token correctos conecta, guarda y lleva a Inicio con datos', async () => {
    const mem = new Map<string, string>()
    const backend = await crearBackendDemo({ almacen: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) } })
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => new Response(JSON.stringify(await backend.enviar(JSON.parse(String(init.body)))))))
    render(<App />)
    await irA('#/configuracion')
    await userEvent.type(await screen.findByLabelText('URL de la aplicación web de Apps Script'), 'https://script.google.com/macros/s/AKfyc123456/exec')
    await userEvent.type(screen.getByLabelText('Token de acceso'), backend.token)
    await userEvent.click(screen.getByRole('button', { name: 'Probar y conectar' }))
    expect(await screen.findByText('Movimientos en total', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(useConexion.getState().modo).toBe('real')
    expect(JSON.parse(localStorage.getItem('dj.conexion.v1')!).url).toContain('/exec')
    expect(window.location.hash).toBe('#/')
  })
})
