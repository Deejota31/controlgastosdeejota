import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHoy } from '@/lib/fecha'
import { diasTranscurridos, mesDe } from './fechas'
import { serieDiariaMes } from './serie'
import { periodoDePreset } from './periodo'

function Panel() {
  const hoy = useHoy('America/Lima')
  const mes = mesDe(hoy)
  const serie = serieDiariaMes([], mes, hoy, 0)
  const periodo = periodoDePreset('este_mes', hoy)
  return (
    <p>
      <span data-testid="hoy">{hoy}</span>
      <span data-testid="dias">{diasTranscurridos(mes, hoy)}</span>
      <span data-testid="serie">{serie.transcurridos}</span>
      <span data-testid="desde">{periodo.desde}</span>
    </p>
  )
}

describe('fecha viva (23:59 → 00:01 en America/Lima)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('al pasar la medianoche se actualizan "hoy", los días transcurridos y los valores por defecto', () => {
    vi.setSystemTime(new Date('2026-10-16T23:59:00-05:00'))
    render(<Panel />)
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-10-16')
    expect(screen.getByTestId('dias')).toHaveTextContent('16')
    act(() => {
      vi.advanceTimersByTime(2 * 60_000) // → 00:01 del 17
    })
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-10-17')
    expect(screen.getByTestId('dias')).toHaveTextContent('17')
    expect(screen.getByTestId('serie')).toHaveTextContent('17')
  })
  it('al cruzar fin de mes cambia el mes por defecto del período', () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:30-05:00'))
    render(<Panel />)
    expect(screen.getByTestId('desde')).toHaveTextContent('2026-10-01')
    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-11-01')
    expect(screen.getByTestId('desde')).toHaveTextContent('2026-11-01')
    expect(screen.getByTestId('dias')).toHaveTextContent('1')
  })
  it('al volver a la pestaña (visibilitychange) recalcula aunque el temporizador haya dormido', () => {
    vi.setSystemTime(new Date('2026-10-16T20:00:00-05:00'))
    render(<Panel />)
    vi.setSystemTime(new Date('2026-10-18T09:00:00-05:00')) // el equipo estuvo suspendido
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByTestId('hoy')).toHaveTextContent('2026-10-18')
  })
})
