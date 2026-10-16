import { describe, expect, it } from 'vitest'
import { hojasPrueba } from '@/test/fixtures'
import { contadores, describirDependencias, moverId, nombreRepetido, partesResaltadas } from './logica'

describe('nombreRepetido', () => {
  const l = [{ id: '1', nombre: 'Alimentación' }, { id: '2', nombre: 'Transporte' }]
  it('ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(nombreRepetido(l, 'alimentacion')).toBe(true)
    expect(nombreRepetido(l, '  ALIMENTACIÓN ')).toBe(true)
    expect(nombreRepetido(l, 'Ali  mentación')).toBe(false)
  })
  it('no se choca consigo mismo al editar', () => {
    expect(nombreRepetido(l, 'Transporte', '2')).toBe(false)
    expect(nombreRepetido(l, 'Transporte', '1')).toBe(true)
  })
})

describe('moverId', () => {
  const l = [{ id: 'a', nombre: 'Uno' }, { id: 'b', nombre: 'Dos' }, { id: 'c', nombre: 'Tres' }, { id: 'o', nombre: 'Otros' }]
  it('intercambia con el vecino', () => expect(moverId(l, 'b', -1)).toEqual(['b', 'a', 'c', 'o']))
  it('no sale de los bordes', () => expect(moverId(l, 'a', -1)).toBeNull())
  it('«Otros» se queda al final: ni se mueve ni se le pasa por encima', () => {
    expect(moverId(l, 'o', -1)).toBeNull()
    expect(moverId(l, 'c', 1)).toBeNull()
  })
})

describe('partesResaltadas', () => {
  it('marca coincidencias sin importar tildes', () => {
    expect(partesResaltadas('Alimentación y café', 'cafe')).toEqual([{ t: 'Alimentación y ', ok: false }, { t: 'café', ok: true }])
  })
  it('sin búsqueda devuelve el texto entero', () => expect(partesResaltadas('Hola', '')).toEqual([{ t: 'Hola', ok: false }]))
  it('varias coincidencias', () => expect(partesResaltadas('ana banana', 'an').filter((p) => p.ok)).toHaveLength(3))
})

describe('contadores', () => {
  it('una subcategoría de una categoría inactiva no cuenta como activa', () => {
    const h = hojasPrueba()
    h.ambito_categoria[0]!.activo = false // Alimentación inactiva en Personal
    const c = contadores(h, 'amb-p')
    expect(c.categorias).toEqual({ activas: 1, total: 2 })
    expect(c.subcategorias).toEqual({ activas: 1, total: 3 }) // solo Bus
    expect(c.medios).toEqual({ activas: 2, total: 2 })
  })
})

describe('describirDependencias', () => {
  it('lista solo lo que existe', () => expect(describirDependencias({ movimientos: 3, cajas: 1, plantillas: 0 })).toBe('3 movimientos, 1 caja'))
})
