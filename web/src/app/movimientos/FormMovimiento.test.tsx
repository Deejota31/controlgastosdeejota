import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatos } from '@/store/datos'
import { hojasPrueba, mov } from '@/test/fixtures'
import { FormMovimiento } from './FormMovimiento'

const mutar = vi.fn()

function preparar(extra: Record<string, string> = {}) {
  const h = hojasPrueba()
  h.movimientos = [mov({ id: 'm1', descripcion: 'Café Del Barrio', monto: 8, monto_base: 8, medio_pago_id: 'med-tar', version: 3 })]
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  useDatos.setState({ vista: h, confirmado: h, config: { moneda_base: 'PEN', monedas_permitidas: 'PEN,USD', ...extra }, zona: 'America/Lima', mutar } as never)
}

const abrir = (props: Partial<React.ComponentProps<typeof FormMovimiento>> = {}) => {
  const onCerrar = vi.fn()
  render(<FormMovimiento abierto modo="nuevo" onCerrar={onCerrar} {...props} />)
  return { onCerrar }
}
const chip = (grupo: string, nombre: string) => within(screen.getByRole('radiogroup', { name: grupo })).getByRole('radio', { name: nombre })

beforeEach(() => preparar())
afterEach(() => vi.restoreAllMocks())

describe('FormMovimiento · clasificación', () => {
  it('las categorías dependen del ámbito y las subcategorías de la categoría', async () => {
    abrir()
    expect(within(screen.getByRole('radiogroup', { name: 'Categoría' })).queryByRole('radio', { name: 'Servicios' })).toBeNull()
    await userEvent.click(chip('Categoría', 'Alimentación'))
    expect(screen.getByRole('radiogroup', { name: 'Subcategoría' })).toBeInTheDocument()
    expect(chip('Subcategoría', 'Café')).toBeInTheDocument()
    await userEvent.click(chip('Ámbito', 'Hogar'))
    expect(chip('Categoría', 'Servicios')).toBeInTheDocument()
  })

  it('al cambiar de ámbito conserva la categoría si sigue siendo válida y la limpia si no', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Transporte'))
    await userEvent.click(chip('Ámbito', 'Hogar')) // Hogar no tiene Transporte
    expect(chip('Categoría', 'Servicios')).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('radiogroup', { name: 'Subcategoría' })).toBeNull()
  })

  it('una categoría con una sola subcategoría la elige sola', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Transporte'))
    expect(chip('Subcategoría', 'Bus')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Bus')
  })

  it('la subcategoría es obligatoria cuando la categoría las tiene', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Alimentación'))
    await userEvent.type(screen.getByLabelText('Monto'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(await screen.findByText('Elige una subcategoría.')).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })
})

describe('FormMovimiento · descripción', () => {
  it('se autocompleta con la subcategoría', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Alimentación'))
    await userEvent.click(chip('Subcategoría', 'Café'))
    expect(screen.getByLabelText('Descripción')).toHaveValue('Café')
    await userEvent.click(chip('Subcategoría', 'Almuerzo'))
    expect(screen.getByLabelText('Descripción')).toHaveValue('Almuerzo') // seguía siendo la automática
  })

  it('si la persona escribió la suya pregunta antes de reemplazarla', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Alimentación'))
    await userEvent.click(chip('Subcategoría', 'Café'))
    await userEvent.clear(screen.getByLabelText('Descripción'))
    await userEvent.type(screen.getByLabelText('Descripción'), 'Con Ana')
    await userEvent.click(chip('Subcategoría', 'Almuerzo'))
    expect(screen.getByLabelText('Descripción')).toHaveValue('Con Ana')
    await userEvent.click(screen.getByRole('button', { name: 'Conservar la mía' }))
    expect(screen.getByLabelText('Descripción')).toHaveValue('Con Ana')
    await userEvent.click(chip('Subcategoría', 'Café'))
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar' }))
    expect(screen.getByLabelText('Descripción')).toHaveValue('Café')
  })
})

describe('FormMovimiento · monto y moneda', () => {
  it('muestra el equivalente en moneda base con el tipo de cambio vigente', async () => {
    preparar({ tipo_cambio_USD: '3.8' })
    abrir()
    await userEvent.type(screen.getByLabelText('Monto'), '10')
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'USD')
    expect(screen.getByText(/≈ S\/\s*38\.00/)).toBeInTheDocument()
  })

  it('no deja guardar en una moneda sin tipo de cambio configurado', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Transporte'))
    await userEvent.type(screen.getByLabelText('Monto'), '10')
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'USD')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(await screen.findByText(/Configura el tipo de cambio USD/)).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })

  it.each(['0', 'abc', '1.234,567'])('rechaza el monto %j', async (txt) => {
    abrir()
    await userEvent.click(chip('Categoría', 'Transporte'))
    await userEvent.type(screen.getByLabelText('Monto'), txt)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(await screen.findByText(/monto mayor que cero|2 decimales/)).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })

  it('el campo de monto no admite signos ni letras', async () => {
    abrir()
    await userEvent.type(screen.getByLabelText('Monto'), '-5x')
    expect(screen.getByLabelText('Monto')).toHaveValue('5')
  })

  it('valida el enlace del comprobante', async () => {
    abrir()
    await userEvent.click(chip('Categoría', 'Transporte'))
    await userEvent.type(screen.getByLabelText('Monto'), '4')
    await userEvent.type(screen.getByLabelText('Enlace al comprobante'), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(await screen.findByText('El enlace debe empezar con https://.')).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })
})

describe('FormMovimiento · envío', () => {
  async function llenar() {
    await userEvent.click(chip('Categoría', 'Alimentación'))
    await userEvent.click(chip('Subcategoría', 'Café'))
    await userEvent.type(screen.getByLabelText('Monto'), '12,50')
  }

  it('envía el payload completo con un ID propio', async () => {
    const { onCerrar } = abrir()
    await llenar()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(mutar).toHaveBeenCalledTimes(1)
    const [accion, p] = mutar.mock.calls[0] as [string, Record<string, unknown>]
    expect(accion).toBe('movimiento.guardar')
    expect(p).toMatchObject({ monto: 12.5, moneda: 'PEN', ambito_id: 'amb-p', categoria_id: 'cat-a', subcategoria_id: 'sub-caf', descripcion: 'Café', medio_pago_id: 'med-efe', tipo_gasto: 'variable', es_recurrente: false })
    expect(String(p['id'])).toMatch(/^mov-/)
    expect(p['version']).toBeUndefined()
    expect(onCerrar).toHaveBeenCalled()
  })

  it('doble clic y doble Enter envían una sola vez', async () => {
    abrir()
    await llenar()
    const guardar = screen.getByRole('button', { name: 'Guardar movimiento' })
    await act(async () => {
      guardar.click()
      guardar.click()
    })
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(mutar).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter guarda desde cualquier campo', async () => {
    abrir()
    await llenar()
    await userEvent.type(screen.getByLabelText('Notas'), 'hola{Control>}{Enter}{/Control}')
    expect(mutar).toHaveBeenCalledTimes(1)
    expect((mutar.mock.calls[0] as [string, Record<string, unknown>])[1]['notas']).toBe('hola')
  })

  it('Editar conserva el ID y envía la versión; Clonar usa un ID nuevo y no envía versión', async () => {
    const original = useDatos.getState().vista.movimientos[0]!
    const { onCerrar } = abrir({ modo: 'editar', movimiento: original })
    expect(screen.getByLabelText('Descripción')).toHaveValue('Café Del Barrio')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const [, p] = mutar.mock.calls[0] as [string, Record<string, unknown>]
    expect(p['id']).toBe('m1')
    expect(p['version']).toBe(3)
    expect(onCerrar).toHaveBeenCalled()
  })

  it('Clonar crea otro movimiento', async () => {
    const original = useDatos.getState().vista.movimientos[0]!
    abrir({ modo: 'clonar', movimiento: original })
    expect(screen.getByRole('heading', { name: 'Clonar movimiento' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    const [, p] = mutar.mock.calls[0] as [string, Record<string, unknown>]
    expect(p['id']).not.toBe('m1')
    expect(p['version']).toBeUndefined()
    expect(p['descripcion']).toBe('Café Del Barrio')
  })

  it('un error de validación no consume el ID: el reintento usa el mismo', async () => {
    abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(mutar).not.toHaveBeenCalled()
    await llenar()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }))
    expect(mutar).toHaveBeenCalledTimes(1)
  })
})

describe('FormMovimiento · borrador protegido', () => {
  it('sin cambios cierra directamente', async () => {
    const { onCerrar } = abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('con cambios pide confirmar antes de descartar', async () => {
    const { onCerrar } = abrir()
    await userEvent.type(screen.getByLabelText('Notas'), 'algo')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCerrar).not.toHaveBeenCalled()
    expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('Escape también protege el borrador y volver al formulario lo conserva', async () => {
    const { onCerrar } = abrir()
    await userEvent.type(screen.getByLabelText('Notas'), 'algo')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument()
    await userEvent.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Cancelar' }))
    expect(onCerrar).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Notas')).toHaveValue('algo')
  })
})
