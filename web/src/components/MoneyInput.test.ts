import { describe, expect, it } from 'vitest'
import { parsearMonto } from './MoneyInput'

describe('parsearMonto', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['12,5', 12.5],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1,234', 1234],
    ['1.234', 1234],
    ['0.99', 0.99],
    [' 7 ', 7],
  ])('%j → %d', (txt, n) => expect(parsearMonto(txt)).toBe(n))
  it.each(['', 'abc', '1.2.3,4,5x', '12-3', '1,2345', '1e3'])('%j no es un monto', (txt) => expect(parsearMonto(txt)).toBeNull())
})
