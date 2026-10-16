import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DragList, mover } from './DragList'

describe('mover', () => {
  it('no muta y respeta los límites', () => {
    const a = [1, 2, 3, 4]
    expect(mover(a, 0, 2)).toEqual([2, 3, 1, 4])
    expect(mover(a, 3, 0)).toEqual([4, 1, 2, 3])
    expect(mover(a, 1, 1)).toEqual(a)
    expect(mover(a, 1, 9)).toEqual(a)
    expect(a).toEqual([1, 2, 3, 4])
  })
})

describe('DragList', () => {
  const items = [{ id: 'x', n: 'Uno' }, { id: 'y', n: 'Dos' }, { id: 'z', n: 'Tres' }]
  const montar = (onReordenar = vi.fn()) => {
    render(<DragList etiqueta="Lista" items={items} id={(t) => t.id} nombre={(t) => t.n} render={(t) => t.n} onReordenar={onReordenar} />)
    return onReordenar
  }
  it('botones Subir/Bajar (sin arrastrar)', async () => {
    const fn = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Bajar Uno' }))
    expect(fn).toHaveBeenCalledWith(['y', 'x', 'z'])
    expect(screen.getByRole('button', { name: 'Subir Uno' })).toBeDisabled()
  })
  it('teclado: Espacio agarra, flechas mueven, Espacio suelta', async () => {
    const fn = montar()
    screen.getByRole('button', { name: /^Reordenar Tres/ }).focus()
    await userEvent.keyboard(' {ArrowUp}{ArrowUp} ')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(['z', 'x', 'y'])
  })
  it('Escape cancela sin enviar nada', async () => {
    const fn = montar()
    screen.getByRole('button', { name: /^Reordenar Uno/ }).focus()
    await userEvent.keyboard(' {ArrowDown}{Escape}')
    expect(fn).not.toHaveBeenCalled()
  })
})
