import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
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
