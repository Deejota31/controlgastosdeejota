import { describe, expect, it } from 'vitest'
import { ApiError } from './cliente'
import { compararVersiones, verificarCompatibilidad } from './compat'

describe('compatibilidad backend/app', () => {
  it('compara versiones numéricamente', () => {
    expect(compararVersiones('1.0.0', '1.0.0')).toBe(0)
    expect(compararVersiones('1.10.0', '1.9.9')).toBe(1)
    expect(compararVersiones('0.9.9', '1.0.0')).toBe(-1)
    expect(compararVersiones('2', '1.9')).toBe(1)
  })
  it('acepta la versión y el esquema esperados (y posteriores del backend)', () => {
    expect(() => verificarCompatibilidad({ version_backend: '1.0.0', esquema: 1 })).not.toThrow()
    expect(() => verificarCompatibilidad({ version_backend: '1.4.2', esquema: 1 })).not.toThrow()
  })
  it.each([
    [{ esquema: 1 }, /no informa su versión/],
    [{ version_backend: '0.9.0', esquema: 1 }, /necesita 1\.0\.0/],
    [{ version_backend: '1.0.0', esquema: 2 }, /esquema 2/],
    [{ version_backend: '1.0.0' }, /esquema desconocido/],
    [null, /no informa su versión/],
  ])('rechaza %j con SCHEMA', (d, texto) => {
    try {
      verificarCompatibilidad(d)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).code).toBe('SCHEMA')
      expect((e as ApiError).message).toMatch(texto)
    }
  })
})
