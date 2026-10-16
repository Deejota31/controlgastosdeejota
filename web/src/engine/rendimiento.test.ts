import { describe, expect, it } from 'vitest'
import { calcularPanel } from './panel'
import { caja, cajaMes, datos, fuente, fuenteMes, mov, prng } from './fixtures'
import { prepararMovimientos } from './movimientos'
import { detectarDuplicados } from './calidad'

function escenario(n: number) {
  const r = prng(n)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
  const ambs = ['a1', 'a2', 'a3', 'a4', 'a5']
  const cats = Array.from({ length: 18 }, (_, i) => `c${i}`)
  const subs = Array.from({ length: 60 }, (_, i) => `s${i}`)
  const movimientos = Array.from({ length: n }, () => {
    const monto = Math.round(r() * 30000) / 100 + 1
    const mes = 1 + Math.floor(r() * 12)
    return mov({ monto, monto_base: monto, ambito_id: pick(ambs), categoria_id: pick(cats), subcategoria_id: pick(subs), medio_pago_id: pick(['p1', 'p2', 'p3', 'p4']), fecha: `2026-${String(mes).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, descripcion: `d${Math.floor(r() * 300)}` })
  })
  const fuentes = [fuente({ id: 'f1', es_principal: true }), fuente({ id: 'f2', orden: 2 })]
  const cajas = cats.slice(0, 8).map((c, i) => caja({ id: `cj${i}`, alcance: 'categoria', alcance_id: c, orden: i }))
  const meses = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
  return datos({
    movimientos, fuentes, cajas,
    fuentes_mes: meses.flatMap((m) => fuentes.map((f) => fuenteMes(f.id, m, 5000))),
    cajas_mes: meses.flatMap((m) => cajas.map((c) => cajaMes(c.id, m, 800))),
  })
}

const mediana = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

describe('rendimiento del motor', () => {
  for (const [n, limiteMs] of [[1000, 10], [10000, 30], [50000, 150]] as const) {
    it(`${n.toLocaleString('es-PE')} movimientos: panel del mes en ≤ ${limiteMs} ms (mediana)`, () => {
      const d = escenario(n)
      const filtro = { desde: '2026-10-01', hasta: '2026-10-31' }
      calcularPanel(d, filtro, '2026-10-16') // calentamiento + preparación memoizada
      const tiempos: number[] = []
      for (let i = 0; i < 9; i++) {
        const t = performance.now()
        calcularPanel(d, filtro, '2026-10-16')
        tiempos.push(performance.now() - t)
      }
      const med = mediana(tiempos)
      console.log(`[motor] ${n} movimientos → panel del mes: ${med.toFixed(2)} ms (mediana de 9)`)
      expect(med).toBeLessThan(limiteMs * 3) // margen para CI compartida; el objetivo real es limiteMs
    })
  }
  it('10 000 movimientos: año completo (12 meses de presupuesto) y preparación en frío', () => {
    const d = escenario(10000)
    let t = performance.now()
    prepararMovimientos(d.movimientos)
    const prep = performance.now() - t
    t = performance.now()
    calcularPanel(d, { desde: '2026-01-01', hasta: '2026-12-31' }, '2026-10-16')
    const anio = performance.now() - t
    t = performance.now()
    detectarDuplicados(prepararMovimientos(d.movimientos), [])
    const dup = performance.now() - t
    console.log(`[motor] 10000 → preparación en frío ${prep.toFixed(1)} ms · año completo ${anio.toFixed(1)} ms · duplicados ${dup.toFixed(1)} ms`)
    expect(anio).toBeLessThan(250)
  })
})
