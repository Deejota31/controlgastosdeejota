import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Movimiento } from '@/api/esquemas'
import { hojasVacias } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { Inicio } from './Inicio'

const mov = (id: string, fecha: string, monto: number): Movimiento => ({
  id, fecha, monto, moneda: 'PEN', tipo_cambio: 1, monto_base: monto, ambito_id: 'a', categoria_id: 'c', subcategoria_id: 's', descripcion: id,
  medio_pago_id: 'm', tipo_gasto: 'variable', es_recurrente: false, estado: 'activo', origen: 'web', plantilla_id: '', lote_id: '', comprobante_url: '',
  notas: '', creado_en: '2026-10-01T00:00:00Z', actualizado_en: '2026-10-01T00:00:00Z', version: 1,
})
const valorDe = (titulo: string) => within(screen.getByText(titulo).closest('section')!).getByText(/./, { selector: 'div.num' }).textContent

describe('Inicio con fecha viva', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('al cruzar el fin de mes (23:59 → 00:01 en Lima) el resumen cambia de mes sin recargar', () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:30-05:00'))
    const vacias = hojasVacias()
    useDatos.setState({
      zona: 'America/Lima',
      vista: { ...vacias, movimientos: [mov('a', '2026-10-30', 100), mov('b', '2026-10-31', 20), mov('c', '2026-11-01', 5)] },
    })
    render(<Inicio />)
    expect(valorDe('Movimientos del mes')).toBe('2')
    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    expect(valorDe('Movimientos del mes')).toBe('1')
  })
})
