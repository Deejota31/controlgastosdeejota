import { describe, expect, it } from 'vitest'
import { depurarDependientes, filtrosAMotor, filtrosAParams, filtrosAQuery, filtrosPorDefecto, hayFiltrosActivos, leerFiltros, moverFiltros, soloFiltros } from './filtros'

const HOY = '2026-10-16'
const q = (s: string) => new URLSearchParams(s)

describe('filtros globales en la URL', () => {
  it('sin parámetros equivale a «Este mes» y la URL queda limpia', () => {
    const f = leerFiltros(q(''), HOY)
    expect(f).toEqual(filtrosPorDefecto(HOY))
    expect(f.desde).toBe('2026-10-01')
    expect(f.hasta).toBe('2026-10-31')
    expect(filtrosAQuery(f)).toBe('')
    expect(hayFiltrosActivos(f)).toBe(false)
  })
  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const f = { ...filtrosPorDefecto(HOY), preset: 'ultimos_3' as const, ambitos: ['amb-1'], categorias: ['cat-1', 'cat-2'], subcategorias: ['sub-1'], medios: ['med-1'], tipos: ['fijo' as const], recurrente: 'si' as const }
    const g = leerFiltros(q(filtrosAQuery(f)), HOY)
    expect(g.preset).toBe('ultimos_3')
    expect(g.desde).toBe('2026-08-01')
    expect(g.categorias).toEqual(['cat-1', 'cat-2'])
    expect(g.tipos).toEqual(['fijo'])
    expect(g.recurrente).toBe('si')
    expect(filtrosAQuery(g)).toBe(filtrosAQuery(f))
  })
  it('personalizado exige fechas válidas y ordenadas; si no, vuelve a «Este mes»', () => {
    expect(leerFiltros(q('p=personalizado&d=2026-01-05&h=2026-02-10'), HOY)).toMatchObject({ preset: 'personalizado', desde: '2026-01-05', hasta: '2026-02-10' })
    expect(leerFiltros(q('p=personalizado&d=2026-02-30&h=2026-03-10'), HOY).preset).toBe('este_mes')
    expect(leerFiltros(q('p=personalizado&d=2026-05-01&h=2026-04-01'), HOY).preset).toBe('este_mes')
    expect(leerFiltros(q('p=personalizado'), HOY).preset).toBe('este_mes')
  })
  it('descarta valores fuera de la lista blanca, ids con símbolos, duplicados y exceso', () => {
    const f = leerFiltros(q('p=hack&a=ok-1,<script>,ok-1,"x",ok_2&t=fijo,otro,fijo&r=quizas&m=' + Array.from({ length: 80 }, (_, i) => 'm' + i).join(',')), HOY)
    expect(f.preset).toBe('este_mes')
    expect(f.ambitos).toEqual(['ok-1', 'ok_2'])
    expect(f.tipos).toEqual(['fijo'])
    expect(f.recurrente).toBe('todos')
    expect(f.medios).toHaveLength(50)
  })
  it('las fechas d/h se ignoran si el período no es personalizado', () => {
    const f = leerFiltros(q('p=este_ano&d=1999-01-01&h=1999-12-31'), HOY)
    expect(f.desde).toBe('2026-01-01')
    expect(filtrosAParams(f).d).toBeUndefined()
  })
  it('«Todo» no tiene fechas y el motor usa la primera fecha de los datos', () => {
    const f = leerFiltros(q('p=todo'), HOY)
    expect(f.desde).toBe('')
    expect(filtrosAMotor(f, HOY, '2025-03-02')).toMatchObject({ desde: '2025-03-02', hasta: HOY })
    expect(filtrosAMotor(f, HOY)).toMatchObject({ desde: HOY, hasta: HOY })
  })
  it('soloFiltros arrastra únicamente claves de filtro', () => {
    expect(soloFiltros(q('p=este_ano&resaltar=mov-1&volver=%2F&a=amb-1'))).toEqual({ p: 'este_ano', a: 'amb-1' })
  })
  it('las flechas mueven el período por su amplitud', () => {
    const f = leerFiltros(q('p=ultimos_3'), HOY)
    const atras = moverFiltros(f, -1)
    expect(atras).toMatchObject({ preset: 'personalizado', desde: '2026-05-01', hasta: '2026-07-31' })
    expect(moverFiltros(leerFiltros(q('p=todo'), HOY), 1).preset).toBe('todo')
  })
  it('depurar quita categorías y subcategorías que ya no pertenecen a lo elegido', () => {
    const cat = {
      ambito_categoria: [{ ambito_id: 'a1', categoria_id: 'c1' }, { ambito_id: 'a2', categoria_id: 'c2' }],
      subcategorias: [{ id: 's1', categoria_id: 'c1' }, { id: 's2', categoria_id: 'c2' }],
    }
    const base = { ...filtrosPorDefecto(HOY), ambitos: ['a1'], categorias: ['c1', 'c2'], subcategorias: ['s1', 's2'] }
    const r = depurarDependientes(base, cat)
    expect(r.categorias).toEqual(['c1'])
    expect(r.subcategorias).toEqual(['s1'])
    expect(depurarDependientes({ ...base, ambitos: [], categorias: ['c2'] }, cat).subcategorias).toEqual(['s2'])
  })
})
