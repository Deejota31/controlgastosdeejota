import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(await screen.findByText(/Modo demostración/)).toBeInTheDocument()
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
