import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar, estadoPorPct } from './ProgressBar'

describe('estadoPorPct', () => {
  it.each([
    [0, 'ok'],
    [69.9, 'ok'],
    [70, 'atencion'],
    [89.9, 'atencion'],
    [90, 'critico'],
    [100, 'critico'],
    [100.1, 'excedido'],
  ] as const)('%s %% → %s', (pct, esperado) => {
    expect(estadoPorPct(pct)).toBe(esperado)
  })
})

describe('ProgressBar', () => {
  it('expone el valor y el estado de forma accesible', () => {
    render(<ProgressBar pct={118} etiqueta="Comida" />)
    const barra = screen.getByRole('progressbar', { name: 'Comida' })
    expect(barra).toHaveAttribute('aria-valuenow', '118')
    expect(barra).toHaveAttribute('aria-valuetext', '118 % · Excedida')
  })
})
