import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fechaEnZona, msHastaMedianoche, useHoy } from './fecha'

describe('fechaEnZona', () => {
  it('usa la zona horaria configurada, no la del navegador', () => {
    // 2026-10-17 03:30 UTC = 2026-10-16 22:30 en Lima (UTC-5)
    const instante = new Date('2026-10-17T03:30:00Z')
    expect(fechaEnZona('America/Lima', instante)).toBe('2026-10-16')
    expect(fechaEnZona('UTC', instante)).toBe('2026-10-17')
  })
})

describe('msHastaMedianoche', () => {
  it('calcula el tiempo restante en la zona indicada', () => {
    // 23:59:00 en Lima → ~60 s (+250 ms de margen)
    const ms = msHastaMedianoche('America/Lima', new Date('2026-10-17T04:59:00Z'))
    expect(ms).toBeGreaterThan(59_000)
    expect(ms).toBeLessThan(62_000)
  })
})

describe('useHoy (fecha viva)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pasa de 23:59 a 00:01 y actualiza "hoy" sin recargar', () => {
    vi.setSystemTime(new Date('2026-10-17T04:59:00Z')) // 23:59 del 16 en Lima
    const { result } = renderHook(() => useHoy('America/Lima'))
    expect(result.current).toBe('2026-10-16')
    act(() => {
      vi.setSystemTime(new Date('2026-10-17T05:01:00Z'))
      vi.advanceTimersByTime(130_000)
    })
    expect(result.current).toBe('2026-10-17')
  })

  it('recalcula al volver a la pestaña (visibilitychange / focus)', () => {
    vi.setSystemTime(new Date('2026-10-16T15:00:00Z'))
    const { result } = renderHook(() => useHoy('America/Lima'))
    expect(result.current).toBe('2026-10-16')
    act(() => {
      vi.setSystemTime(new Date('2026-10-18T15:00:00Z'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe('2026-10-18')
  })
})
