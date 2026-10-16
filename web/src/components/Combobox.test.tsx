import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Combobox } from './Combobox'

const ops = [
  { valor: 'a', etiqueta: 'Café' },
  { valor: 'b', etiqueta: 'Cena' },
  { valor: 'c', etiqueta: 'Almuerzo', deshabilitada: true },
]
function Demo() {
  const [v, setV] = useState('')
  return <Combobox etiqueta="Plato" opciones={ops} valor={v} onChange={setV} />
}

describe('Combobox', () => {
  it('filtra sin importar tildes y elige con teclado', async () => {
    render(<Demo />)
    const c = screen.getByRole('combobox', { name: 'Plato' })
    await userEvent.click(c)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await userEvent.type(c, 'cafe')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.keyboard('{Enter}')
    expect(c).toHaveValue('Café')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('flechas, Home/End y Escape', async () => {
    render(<Demo />)
    const c = screen.getByRole('combobox')
    await userEvent.click(c)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(c).toHaveValue('Cena')
    await userEvent.click(c)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('no permite elegir opciones deshabilitadas y avisa si no hay resultados', async () => {
    render(<Demo />)
    const c = screen.getByRole('combobox')
    await userEvent.click(c)
    await userEvent.click(screen.getByRole('option', { name: 'Almuerzo' }))
    expect(c).toHaveValue('')
    await userEvent.type(c, 'zzz')
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })
  it('la lista vive en un portal (no dentro de un contenedor con overflow)', async () => {
    const { container } = render(<div style={{ overflow: 'hidden' }}><Demo /></div>)
    await userEvent.click(screen.getByRole('combobox'))
    expect(container.querySelector('[role=listbox]')).toBeNull()
    expect(document.body.querySelector('[role=listbox]')).not.toBeNull()
  })
})
