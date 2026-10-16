import { describe, expect, it } from 'vitest'
import { aCentimos, convertirCentimos, formatoPct, proporcion } from './dinero'
import { diasEnMes, diasTranscurridos, estadoDelMes, esFechaValida, mesesEntre, mismoDiaHaceMeses, sumarDias, sumarMeses } from './fechas'
import { aplicarFiltro, agruparPor, prepararMovimientos, totales } from './movimientos'
import { calcularPresupuestoMes, estadoCaja } from './presupuesto'
import { serieDiariaMes } from './serie'
import { caja, cajaMes, fuente, fuenteMedio, fuenteMes, mov, prng } from './fixtures'
import type { MovC } from './tipos'

const prep = (...m: Parameters<typeof mov>[0][]) => prepararMovimientos(m.map((x) => mov(x)))
const entrada = (movs: MovC[], extra: Partial<Parameters<typeof calcularPresupuestoMes>[0]> = {}) => ({
  mes: '2026-10', movs, fuentes: [], fuentesMes: [], fuenteMedios: [], cajas: [], cajasMes: [], monedaBase: 'PEN', tiposCambio: {}, ...extra,
})

describe('dinero (céntimos enteros)', () => {
  it('convierte sin errores de coma flotante', () => {
    expect(aCentimos(0.1 + 0.2)).toBe(30)
    expect(aCentimos(1.005)).toBe(101)
    expect(aCentimos(19.99)).toBe(1999)
    expect(aCentimos(1234567.89)).toBe(123456789)
    expect(aCentimos(-2.675)).toBe(-268)
  })
  it('convierte monedas con tipo de cambio o devuelve null si falta', () => {
    expect(convertirCentimos(10, 3.75)).toBe(3750)
    expect(convertirCentimos(10, null)).toBeNull()
    expect(convertirCentimos(10, 0)).toBeNull()
  })
  it('divisor cero muestra "—"', () => {
    expect(proporcion(5, 0)).toBeNull()
    expect(formatoPct(proporcion(5, 0))).toBe('—')
    expect(formatoPct(proporcion(1, 4))).toBe('25 %')
  })
})

describe('fechas', () => {
  it('días del mes y años bisiestos', () => {
    expect(diasEnMes('2026-02')).toBe(28)
    expect(diasEnMes('2028-02')).toBe(29)
    expect(diasEnMes('2026-12')).toBe(31)
    expect(esFechaValida('2028-02-29')).toBe(true)
    expect(esFechaValida('2026-02-29')).toBe(false)
    expect(esFechaValida('2026-13-01')).toBe(false)
  })
  it('suma meses y días cruzando años', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('mismo día de hace N meses recorta al fin de mes', () => {
    expect(mismoDiaHaceMeses('2026-03-31', 1)).toBe('2026-02-28')
    expect(mismoDiaHaceMeses('2026-05-31', 2)).toBe('2026-03-31')
  })
  it('días transcurridos: inclusivos y según la fecha viva', () => {
    expect(diasTranscurridos('2026-10', '2026-10-01')).toBe(1)
    expect(diasTranscurridos('2026-10', '2026-10-16')).toBe(16)
    expect(diasTranscurridos('2026-09', '2026-10-16')).toBe(30)
    expect(diasTranscurridos('2026-11', '2026-10-16')).toBe(0)
    expect(estadoDelMes('2026-10', '2026-10-31')).toBe('en_curso')
  })
})

describe('movimientos', () => {
  it('los anulados no cuentan y se muestran aparte', () => {
    const m = prep({ monto: 10 }, { monto: 5, estado: 'anulado' }, { monto: 2.5 })
    const t = totales(m)
    expect(t.total).toBe(1250)
    expect(t.cantidad).toBe(2)
    expect(t.anulados).toBe(1)
    expect(t.anuladosTotal).toBe(500)
  })
  it('usa monto_base congelado y excluye (y avisa) lo que no tiene tipo de cambio', () => {
    const m = prep({ monto: 10, moneda: 'USD', tipo_cambio: 3.75, monto_base: 37.5 }, { monto: 10, moneda: 'EUR', tipo_cambio: null, monto_base: null })
    const t = totales(m)
    expect(t.total).toBe(3750)
    expect(t.sinTipoCambio).toBe(1)
  })
  it('filtra por período, jerarquía, medio, tipo, recurrente y texto', () => {
    const m = prep(
      { fecha: '2026-10-01', categoria_id: 'a', descripcion: 'Taxi al trabajo' },
      { fecha: '2026-10-10', categoria_id: 'b', es_recurrente: true, tipo_gasto: 'fijo' },
      { fecha: '2026-11-01', categoria_id: 'a' },
    )
    const base = { desde: '2026-10-01', hasta: '2026-10-31' }
    expect(aplicarFiltro(m, base)).toHaveLength(2)
    expect(aplicarFiltro(m, { ...base, categorias: ['a'] })).toHaveLength(1)
    expect(aplicarFiltro(m, { ...base, recurrente: 'si' })).toHaveLength(1)
    expect(aplicarFiltro(m, { ...base, tipos: ['fijo'] })).toHaveLength(1)
    expect(aplicarFiltro(m, { ...base, texto: 'taxi' })).toHaveLength(1)
  })
  it('agrupa ordenado por total y desempata por id', () => {
    const m = prep({ ambito_id: 'a', monto: 5 }, { ambito_id: 'b', monto: 5 }, { ambito_id: 'c', monto: 9 })
    expect(agruparPor(m, (x) => x.ambito).map((g) => g.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('presupuesto del mes', () => {
  const f1 = fuente({ id: 'f1', orden: 1, es_principal: true })
  const f2 = fuente({ id: 'f2', orden: 2 })

  it('P = Σ fuentes aplicadas del mes de fuentes activas; R = Σ cajas aplicadas; libre inicial = P − R', () => {
    const c1 = caja({ id: 'c1' })
    const r = calcularPresupuestoMes(
      entrada([], {
        fuentes: [f1, f2, fuente({ id: 'f3', activo: false })],
        fuentesMes: [fuenteMes('f1', '2026-10', 3000), fuenteMes('f2', '2026-10', 500.5), fuenteMes('f3', '2026-10', 999), fuenteMes('f2', '2026-10', 700, 'omitida')],
        cajas: [c1],
        cajasMes: [cajaMes('c1', '2026-10', 800)],
      }),
    )
    expect(r.presupuesto).toBe(350050)
    expect(r.reservado).toBe(80000)
    expect(r.libreInicial).toBe(270050)
  })
  it('aislamiento por mes: nada se arrastra solo', () => {
    const e = entrada([], { fuentes: [f1], fuentesMes: [fuenteMes('f1', '2026-09', 3000)] })
    expect(calcularPresupuestoMes(e).presupuesto).toBe(0)
    expect(calcularPresupuestoMes({ ...e, mes: '2026-09' }).presupuesto).toBe(300000)
  })
  it('excluye y avisa las fuentes en otra moneda sin tipo de cambio', () => {
    const usd = fuente({ id: 'usd', moneda: 'USD' })
    const e = entrada([], { fuentes: [usd], fuentesMes: [fuenteMes('usd', '2026-10', 100)] })
    const r = calcularPresupuestoMes(e)
    expect(r.presupuesto).toBe(0)
    expect(r.avisos.fuentesSinTipoCambio).toEqual(['usd'])
    expect(calcularPresupuestoMes({ ...e, tiposCambio: { USD: 3.8 } }).presupuesto).toBe(38000)
  })
  it('asigna cada gasto a UNA caja: subcategoría > categoría > ámbito > medio; a igual nivel gana el orden', () => {
    const movs = prep(
      { id: 'm1', monto: 10, subcategoria_id: 's1', categoria_id: 'c1', ambito_id: 'a1', medio_pago_id: 'p1' },
      { id: 'm2', monto: 20, subcategoria_id: 's2', categoria_id: 'c1', ambito_id: 'a1', medio_pago_id: 'p1' },
      { id: 'm3', monto: 30, subcategoria_id: 's9', categoria_id: 'c9', ambito_id: 'a1', medio_pago_id: 'p1' },
      { id: 'm4', monto: 40, subcategoria_id: 's9', categoria_id: 'c9', ambito_id: 'a9', medio_pago_id: 'p1' },
      { id: 'm5', monto: 50, subcategoria_id: 's9', categoria_id: 'c9', ambito_id: 'a9', medio_pago_id: 'p9' },
    )
    const cs = [
      caja({ id: 'cs', alcance: 'subcategoria', alcance_id: 's1', orden: 4 }),
      caja({ id: 'cc', alcance: 'categoria', alcance_id: 'c1', orden: 3 }),
      caja({ id: 'ca', alcance: 'ambito', alcance_id: 'a1', orden: 2 }),
      caja({ id: 'cp', alcance: 'medio_pago', alcance_id: 'p1', orden: 1 }),
    ]
    const r = calcularPresupuestoMes(entrada(movs, { cajas: cs, cajasMes: cs.map((c) => cajaMes(c.id, '2026-10', 100)) }))
    expect(r.asignacion.get('m1')).toBe('cs')
    expect(r.asignacion.get('m2')).toBe('cc')
    expect(r.asignacion.get('m3')).toBe('ca')
    expect(r.asignacion.get('m4')).toBe('cp')
    expect(r.asignacion.get('m5')).toBeNull()
    expect(r.gastoFueraDeCajas).toBe(5000)
    expect(r.gastoEnCajas).toBe(10000)
  })
  it('a igual nivel (dos cajas del mismo alcance) gana el orden manual y se avisa el solapamiento', () => {
    const a = caja({ id: 'a', alcance: 'categoria', alcance_id: 'c1', orden: 2 })
    const b = caja({ id: 'b', alcance: 'categoria', alcance_id: 'c1', orden: 1 })
    const r = calcularPresupuestoMes(entrada(prep({ id: 'x', categoria_id: 'c1', monto: 10 }), { cajas: [a, b], cajasMes: [cajaMes('a', '2026-10', 50), cajaMes('b', '2026-10', 50)] }))
    expect(r.asignacion.get('x')).toBe('b')
    expect(r.avisos.solapamientos).toHaveLength(1)
    expect(r.avisos.solapamientos[0]!.cajaIds.sort()).toEqual(['a', 'b'])
  })
  it('una caja sin monto aplicado en el mes no participa (su gasto va fuera de cajas)', () => {
    const c = caja({ id: 'c', alcance: 'categoria', alcance_id: 'c1' })
    const r = calcularPresupuestoMes(entrada(prep({ categoria_id: 'c1', monto: 10 }), { cajas: [c], cajasMes: [cajaMes('c', '2026-10', 50, 'omitida')] }))
    expect(r.gastoFueraDeCajas).toBe(1000)
    expect(r.cajas).toHaveLength(0)
  })
  it('exceso, saldo libre y disponible con una caja excedida', () => {
    const c = caja({ id: 'c', alcance: 'categoria', alcance_id: 'c1' })
    const movs = prep({ categoria_id: 'c1', monto: 150 }, { categoria_id: 'otra', monto: 100 })
    const r = calcularPresupuestoMes(
      entrada(movs, { fuentes: [fuente({ id: 'f' })], fuentesMes: [fuenteMes('f', '2026-10', 1000)], cajas: [c], cajasMes: [cajaMes('c', '2026-10', 100)] }),
    )
    expect(r.exceso).toBe(5000)
    expect(r.saldoLibre).toBe(100000 - 10000 - 10000 - 5000) // P − R − Gl − exceso
    expect(r.disponible).toBe(100000 - 15000 - 10000) // P − Gs − Gl
    expect(r.cajas[0]!.estado).toBe('excedida')
    expect(r.cajas[0]!.disponible).toBe(-5000)
    expect(r.pctConsumido).toBeCloseTo(0.25)
  })
  it('% consumido con presupuesto cero es null (se muestra "—")', () => {
    expect(calcularPresupuestoMes(entrada(prep({ monto: 5 }))).pctConsumido).toBeNull()
  })
  it('estados de caja por umbral: 70 / 90 / excedida', () => {
    expect(estadoCaja(0.5)).toBe('al_dia')
    expect(estadoCaja(0.7)).toBe('atencion')
    expect(estadoCaja(0.9)).toBe('critico')
    expect(estadoCaja(1)).toBe('critico')
    expect(estadoCaja(1.01)).toBe('excedida')
  })

  it('INVARIANTE: disponible = P − Gs − Gl = saldo libre + reservas sin usar (500 escenarios aleatorios)', () => {
    for (let semilla = 1; semilla <= 500; semilla++) {
      const r = prng(semilla)
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
      const cats = ['c1', 'c2', 'c3'], subs = ['s1', 's2', ''], ambs = ['a1', 'a2'], meds = ['p1', 'p2', 'p3']
      const movs = prepararMovimientos(
        Array.from({ length: Math.floor(r() * 40) }, () =>
          mov({ monto: Math.round(r() * 50000) / 100 + 0.01, fecha: `2026-10-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, categoria_id: pick(cats), subcategoria_id: pick(subs), ambito_id: pick(ambs), medio_pago_id: pick(meds), estado: r() < 0.1 ? 'anulado' : 'activo' }),
        ),
      )
      const cajas = Array.from({ length: Math.floor(r() * 5) }, (_, i) => {
        const al = pick(['ambito', 'categoria', 'subcategoria', 'medio_pago'] as const)
        const ref = al === 'ambito' ? pick(ambs) : al === 'categoria' ? pick(cats) : al === 'subcategoria' ? pick(subs.filter(Boolean)) : pick(meds)
        return caja({ id: `c${i}`, alcance: al, alcance_id: ref, orden: Math.floor(r() * 5), activo: r() > 0.1 })
      })
      const fuentes = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => fuente({ id: `f${i}`, orden: i, es_principal: i === 0 }))
      const res = calcularPresupuestoMes(
        entrada(movs, {
          fuentes, fuentesMes: fuentes.map((f) => fuenteMes(f.id, '2026-10', Math.round(r() * 300000) / 100)),
          cajas, cajasMes: cajas.map((c) => cajaMes(c.id, '2026-10', Math.round(r() * 100000) / 100)),
        }),
      )
      expect(res.disponible, `semilla ${semilla}`).toBe(res.presupuesto - res.gastoEnCajas - res.gastoFueraDeCajas)
      expect(res.disponible, `semilla ${semilla}`).toBe(res.saldoLibre + res.reservasSinUsar)
      expect(res.gastado, `semilla ${semilla}`).toBe(res.gastoEnCajas + res.gastoFueraDeCajas)
      // Cada gasto del mes está en exactamente una caja o fuera
      expect(res.asignacion.size, `semilla ${semilla}`).toBe(movs.filter((m) => !m.anulado && m.cents !== null && m.mes === '2026-10').length)
    }
  })
})

describe('atribución por fuente', () => {
  it('las fuentes ligadas a medios cubren solo sus medios; las libres, en cascada con la principal primero', () => {
    const principal = fuente({ id: 'p', orden: 2, es_principal: true })
    const otra = fuente({ id: 'o', orden: 1 })
    const vale = fuente({ id: 'v', orden: 3 })
    const movs = prep(
      { id: '1', fecha: '2026-10-01', monto: 70, medio_pago_id: 'sodexo' },
      { id: '2', fecha: '2026-10-02', monto: 100, medio_pago_id: 'yape' },
      { id: '3', fecha: '2026-10-03', monto: 100, medio_pago_id: 'yape' },
    )
    const r = calcularPresupuestoMes(
      entrada(movs, {
        fuentes: [principal, otra, vale],
        fuentesMes: [fuenteMes('p', '2026-10', 120), fuenteMes('o', '2026-10', 100), fuenteMes('v', '2026-10', 50)],
        fuenteMedios: [fuenteMedio('v', 'sodexo')],
      }),
    )
    const por = Object.fromEntries(r.fuentes.map((f) => [f.fuente.id, f]))
    expect(por.v!.consumido).toBe(5000) // sodexo: 50 de 70 (tope), el resto pasa a libres
    expect(por.p!.consumido).toBe(12000) // la principal va primero hasta su tope
    expect(por.o!.consumido).toBe(10000)
    expect(r.sinFuente).toBe(0) // 50 + 120 + 100 = 270 = lo gastado
  })
  it('conservación: Σ consumido + sin fuente = gastado; nunca se multiplica un importe', () => {
    for (let s = 1; s <= 200; s++) {
      const r = prng(1000 + s)
      const meds = ['p1', 'p2', 'p3']
      const movs = prepararMovimientos(Array.from({ length: Math.floor(r() * 30) }, () => mov({ monto: Math.round(r() * 20000) / 100 + 1, medio_pago_id: meds[Math.floor(r() * 3)]!, fecha: `2026-10-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}` })))
      const fuentes = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => fuente({ id: `f${i}`, orden: i, es_principal: i === 1 }))
      const ligas = fuentes.flatMap((f, i) => (i % 2 === 1 && r() > 0.3 ? [fuenteMedio(f.id, meds[Math.floor(r() * 3)]!)] : []))
      const res = calcularPresupuestoMes(entrada(movs, { fuentes, fuentesMes: fuentes.map((f) => fuenteMes(f.id, '2026-10', Math.round(r() * 100000) / 100)), fuenteMedios: ligas }))
      const consumido = res.fuentes.reduce((a, f) => a + f.consumido, 0)
      expect(consumido + res.sinFuente, `semilla ${s}`).toBe(res.gastado)
      for (const f of res.fuentes) {
        expect(f.consumido + f.restante, `semilla ${s}`).toBe(f.asignado)
        expect(f.restante).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('serie diaria', () => {
  const movs = prep({ fecha: '2026-10-02', monto: 10 }, { fecha: '2026-10-05', monto: 30 }, { fecha: '2026-10-05', monto: 10, estado: 'anulado' })
  it('acumulado real, ritmo ideal y proyección de cierre en el mes en curso', () => {
    const s = serieDiariaMes(movs, '2026-10', '2026-10-10', 31000)
    expect(s.dias).toBe(31)
    expect(s.transcurridos).toBe(10)
    expect(s.gastado).toBe(4000)
    expect(s.promedioDiario).toBe(400)
    expect(s.proyeccionCierre).toBe(12400)
    expect(s.puntos[0]!.real).toBe(0)
    expect(s.puntos[4]!.real).toBe(4000)
    expect(s.puntos[10]!.real).toBeNull() // futuro
    expect(s.puntos[30]!.ideal).toBe(31000)
    expect(s.puntos[9]!.proyeccion).toBe(4000)
    expect(s.puntos[30]!.proyeccion).toBe(12400)
  })
  it('sin proyección fuera del mes en curso', () => {
    expect(serieDiariaMes(movs, '2026-10', '2026-11-03', 31000).proyeccionCierre).toBeNull()
    expect(serieDiariaMes(movs, '2026-10', '2026-11-03', 31000).transcurridos).toBe(31)
    expect(serieDiariaMes(movs, '2026-10', '2026-09-20', 31000).transcurridos).toBe(0)
  })
  it('FECHA VIVA: cruzar la medianoche cambia los días transcurridos y el promedio', () => {
    const antes = serieDiariaMes(movs, '2026-10', '2026-10-15', 0)
    const despues = serieDiariaMes(movs, '2026-10', '2026-10-16', 0)
    expect(antes.transcurridos).toBe(15)
    expect(despues.transcurridos).toBe(16)
    expect(despues.promedioDiario).toBe(Math.round(4000 / 16))
  })
})
