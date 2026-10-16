import { describe, expect, it } from 'vitest'
import type { Compromiso, CompromisoPago, Revision } from '@/api/esquemas'
import { calcularCalidad, claveTexto, detectarDuplicados } from './calidad'
import { calcularCompromisos } from './compromisos'
import { ahorroPotencial, calcularEvolucion } from './evolucion'
import { calcularKpis } from './kpis'
import { prepararMovimientos } from './movimientos'
import { calcularPanel, presupuestoPeriodo } from './panel'
import { ETIQUETA_PRESET, etiquetaPeriodo, mesesCompletos, moverPeriodo, periodoDePreset } from './periodo'
import { caja, cajaMes, datos, fuente, fuenteMes, mov, prng } from './fixtures'

const prep = (...m: Parameters<typeof mov>[0][]) => prepararMovimientos(m.map((x) => mov(x)))
const comp = (p: Partial<Compromiso> = {}): Compromiso => ({
  id: 'k1', plantilla_id: 'pl', nombre: 'Luz', monto_previsto: 100, moneda: 'PEN', dia_vencimiento: 20, activo: true, creado_en: '', actualizado_en: '', version: 1, ...p,
})
const pago = (compromiso: string, movimiento: string, mes = '2026-10'): CompromisoPago => ({ id: `${compromiso}-${movimiento}`, compromiso_id: compromiso, movimiento_id: movimiento, mes, creado_en: '' })

describe('compromisos', () => {
  const sinCambio = () => null
  it('estados cubierto / parcial / pendiente / sin monto y pendiente = max(0, previsto − pagado)', () => {
    const movs = prep({ id: 'a', monto: 60 }, { id: 'b', monto: 100 }, { id: 'c', monto: 150 })
    const r = calcularCompromisos(
      '2026-10',
      [comp({ id: 'k1', monto_previsto: 100 }), comp({ id: 'k2', monto_previsto: 100 }), comp({ id: 'k3', monto_previsto: 100 }), comp({ id: 'k4', monto_previsto: null }), comp({ id: 'k5', monto_previsto: 100 })],
      [pago('k1', 'a'), pago('k2', 'b'), pago('k5', 'c')],
      movs, sinCambio, 'PEN',
    )
    const e = Object.fromEntries(r.items.map((i) => [i.compromiso.id, i]))
    expect(e.k1!.estado).toBe('parcial')
    expect(e.k1!.pendiente).toBe(4000)
    expect(e.k2!.estado).toBe('cubierto')
    expect(e.k3!.estado).toBe('pendiente')
    expect(e.k4!.estado).toBe('sin_monto')
    expect(e.k5!.estado).toBe('cubierto')
    expect(e.k5!.pendiente).toBe(0) // nunca negativo
    expect(r.previsto).toBe(40000)
    expect(r.pagado).toBe(6000 + 10000 + 15000)
    expect(r.pendiente).toBe(4000 + 10000)
  })
  it('anular un pago deja de cubrir y restaurarlo vuelve a cubrir', () => {
    const activo = prep({ id: 'a', monto: 100 })
    const anulado = prep({ id: 'a', monto: 100, estado: 'anulado' })
    const c = [comp()]
    const p = [pago('k1', 'a')]
    expect(calcularCompromisos('2026-10', c, p, activo, sinCambio, 'PEN').items[0]!.estado).toBe('cubierto')
    expect(calcularCompromisos('2026-10', c, p, anulado, sinCambio, 'PEN').items[0]!.estado).toBe('pendiente')
    expect(calcularCompromisos('2026-10', c, p, activo, sinCambio, 'PEN').items[0]!.estado).toBe('cubierto')
  })
  it('solo cuentan los pagos del mes y los compromisos activos', () => {
    const r = calcularCompromisos('2026-11', [comp(), comp({ id: 'k2', activo: false })], [pago('k1', 'a', '2026-10')], prep({ id: 'a', monto: 100 }), sinCambio, 'PEN')
    expect(r.items).toHaveLength(1)
    expect(r.items[0]!.estado).toBe('pendiente')
  })
})

describe('duplicados y calidad de datos', () => {
  const rev = (firma: string, estado: Revision['estado']): Revision => ({ id: firma, tipo_alerta: 'duplicado', firma, movimiento_ids: [], estado, creado_en: '', actualizado_en: '' })
  it('agrupa posibles duplicados por clave hash e ignora los anulados', () => {
    const m = prep(
      { id: '1', descripcion: 'Menú  del día' }, { id: '2', descripcion: 'menu del dia' }, { id: '3', descripcion: 'Menú del día', estado: 'anulado' },
      { id: '4', descripcion: 'Menú del día', monto: 11, monto_base: 11 }, { id: '5', descripcion: 'Taxi' },
    )
    const g = detectarDuplicados(m, [])
    expect(g).toHaveLength(1)
    expect(g[0]!.movimientoIds.sort()).toEqual(['1', '2'])
    expect(claveTexto('  Menú  DEL día ')).toBe('menu del dia')
  })
  it('recuerda la revisión por firma', () => {
    const m = prep({ id: '1' }, { id: '2' })
    const [g] = detectarDuplicados(m, [])
    expect(detectarDuplicados(m, [rev(g!.firma, 'legitimo')])[0]!.estado).toBe('legitimo')
  })
  it('detecta 10 000 movimientos con duplicados en tiempo lineal', () => {
    const m = prepararMovimientos(Array.from({ length: 10000 }, (_, i) => mov({ id: `m${i}`, monto: 1 + (i % 500), fecha: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, descripcion: `d${i % 40}` })))
    const t = performance.now()
    const g = detectarDuplicados(m, [])
    expect(performance.now() - t).toBeLessThan(150)
    expect(g.length).toBeGreaterThan(0)
  })

  const catalogo = () => ({
    ambitos: [{ id: 'amb-personal', nombre: 'Personal', icono: 'user', color: '#000', orden: 1, activo: true, creado_en: '', actualizado_en: '', version: 1 }],
    categorias: [{ id: 'cat-alim', nombre: 'Alimentación', icono: 'x', color: '#000', creado_en: '', actualizado_en: '', version: 1 }],
    subcategorias: [{ id: 'sub-almuerzo', categoria_id: 'cat-alim', nombre: 'Almuerzo', icono: 'x', orden: 1, activo: true, creado_en: '', actualizado_en: '', version: 1 }],
    ambitoCategoria: [{ id: 'ac', ambito_id: 'amb-personal', categoria_id: 'cat-alim', orden: 1, activo: true }],
    ambitoSubcategoria: [],
    cajas: [], plantillas: [], mediosActivos: new Set(['med-yape']),
  })
  it('puntaje 0–100 con pesos 30/30/20/20', () => {
    const base = { ...catalogo(), movs: prep({ id: '1' }, { id: '2', fecha: '2026-10-06' }), duplicados: [] }
    const perfecto = calcularCalidad(base)
    expect(perfecto.puntaje).toBe(100)
    expect(perfecto.dimensiones.map((d) => d.peso)).toEqual([0.3, 0.3, 0.2, 0.2])
    // 1 de 2 movimientos con clasificación inválida → clasificación 50 → 100 − 0.3·50 = 85
    const roto = calcularCalidad({ ...base, movs: prep({ id: '1' }, { id: '2', subcategoria_id: 'sub-inexistente' }) })
    expect(roto.dimensiones[1]!.valor).toBe(50)
    expect(roto.puntaje).toBe(85)
    expect(roto.clasificacionInactiva).toHaveLength(1)
  })
  it('integridad: sin medio, sin descripción, sin tipo de cambio', () => {
    const q = calcularCalidad({ ...catalogo(), movs: prep({ id: '1', medio_pago_id: '' }, { id: '2', descripcion: ' ' }, { id: '3', moneda: 'EUR', monto_base: null, tipo_cambio: null }, { id: '4' }), duplicados: [] })
    expect(q.dimensiones[0]!.valor).toBe(25)
    expect(q.incompletos.map((i) => i.id).sort()).toEqual(['1', '2', '3'])
  })
  it('"Otros" y "Por Clasificar" pueden quedar sin descripción', () => {
    const q = calcularCalidad({ ...catalogo(), movs: prep({ id: '1', descripcion: '' }), duplicados: [], descripcionOpcionalSub: new Set(['sub-almuerzo']) })
    expect(q.dimensiones[0]!.valor).toBe(100)
  })
  it('duplicados resueltos: pendiente cuenta en contra, legítimo o confirmado a favor', () => {
    const grupos = [{ firma: 'a', movimientoIds: ['1', '2'], estado: 'pendiente' as const }, { firma: 'b', movimientoIds: ['3', '4'], estado: 'legitimo' as const }]
    const q = calcularCalidad({ ...catalogo(), movs: [], duplicados: grupos })
    expect(q.dimensiones[3]!.valor).toBe(50)
    expect(q.sinDatos).toBe(true)
  })
  it('consistencia del catálogo penaliza cajas solapadas y categorías huérfanas', () => {
    const c = catalogo()
    const q = calcularCalidad({ ...c, ambitoCategoria: [], cajas: [caja({ id: '1', alcance: 'categoria', alcance_id: 'cat-alim' }), caja({ id: '2', alcance: 'categoria', alcance_id: 'cat-alim' })], movs: [], duplicados: [] })
    expect(q.dimensiones[2]!.valor).toBeLessThan(100)
    expect(q.dimensiones[2]!.problemas.join(' ')).toMatch(/solapadas/)
    expect(q.dimensiones[2]!.problemas.join(' ')).toMatch(/ningún ámbito/)
  })
})

describe('evolución y KPIs', () => {
  const movs = prep(
    { fecha: '2026-09-03', ambito_id: 'a', monto: 100 }, { fecha: '2026-09-10', ambito_id: 'b', monto: 50 }, { fecha: '2026-09-25', ambito_id: 'a', monto: 999 },
    { fecha: '2026-10-03', ambito_id: 'a', monto: 160 }, { fecha: '2026-10-10', ambito_id: 'c', monto: 40 }, { fecha: '2026-10-05', ambito_id: 'b', monto: 10 },
  )
  const filtro = { desde: '2026-10-01', hasta: '2026-10-15' }
  it('compara el mismo tramo del mes anterior y marca "Nuevo" lo que no tiene base', () => {
    const ev = calcularEvolucion(movs, filtro, 'ambito', 1)
    expect(ev.tramoPrevio).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' })
    const f = Object.fromEntries(ev.filas.map((x) => [x.id, x]))
    expect(f.a).toMatchObject({ actual: 16000, previo: 10000, delta: 6000, nuevo: false })
    expect(f.a!.pct).toBeCloseTo(0.6)
    expect(f.b).toMatchObject({ actual: 1000, previo: 5000, delta: -4000 })
    expect(f.c).toMatchObject({ nuevo: true, pct: null, previo: 0 })
    expect(ev.subidas.map((x) => x.id)).toEqual(['a', 'c'])
    expect(ev.bajadas.map((x) => x.id)).toEqual(['b'])
    expect(ev.totalActual).toBe(21000)
    expect(ev.totalPrevio).toBe(15000)
  })
  it('ahorro potencial = % configurable sobre los gastos variables', () => {
    const m = prep({ monto: 100, tipo_gasto: 'variable' }, { monto: 200, tipo_gasto: 'fijo' }, { monto: 50, tipo_gasto: 'variable' })
    expect(ahorroPotencial(m, { desde: '2026-10-01', hasta: '2026-10-31' }, 15)).toEqual({ baseVariable: 15000, ahorro: 2250 })
  })
  it('KPIs con variación frente al mismo tramo del mes anterior y días inclusivos con fecha viva', () => {
    const k = calcularKpis(movs, { desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-15')
    expect(k.diasTranscurridos).toBe(15)
    expect(k.gastado.valor).toBe(21000)
    expect(k.gastado.previo).toBe(15000)
    expect(k.gastado.variacion).toBeCloseTo(0.4)
    expect(k.promedioDiario.valor).toBe(1400)
    expect(k.ticketPromedio.valor).toBe(7000)
    expect(k.mayorGasto.valor).toBe(16000)
    expect(k.movimientos.valor).toBe(3)
    const manana = calcularKpis(movs, { desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-16')
    expect(manana.diasTranscurridos).toBe(16)
  })
  it('sin movimientos no hay divisiones por cero', () => {
    const k = calcularKpis([], { desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-15')
    expect(k.ticketPromedio.valor).toBe(0)
    expect(k.gastado.variacion).toBeNull()
  })
})

describe('período', () => {
  it('presets contra la fecha viva y flechas ← →', () => {
    const p = periodoDePreset('este_mes', '2026-10-16')
    expect(p).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(periodoDePreset('mes_anterior', '2026-01-10')).toMatchObject({ desde: '2025-12-01', hasta: '2025-12-31' })
    expect(periodoDePreset('ultimos_3', '2026-10-16')).toMatchObject({ desde: '2026-08-01', hasta: '2026-10-31' })
    expect(periodoDePreset('este_ano', '2026-10-16')).toMatchObject({ desde: '2026-01-01', hasta: '2026-12-31' })
    expect(moverPeriodo(p, -1)).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(moverPeriodo(periodoDePreset('ultimos_3', '2026-10-16'), -1)).toMatchObject({ desde: '2026-05-01', hasta: '2026-07-31' })
    expect(moverPeriodo({ preset: 'personalizado', desde: '2026-10-05', hasta: '2026-10-11' }, 1)).toMatchObject({ desde: '2026-10-12', hasta: '2026-10-18' })
    expect(mesesCompletos({ desde: '2026-10-05', hasta: '2026-10-31' })).toBeNull()
    expect(Object.keys(ETIQUETA_PRESET)).toHaveLength(7)
    expect(etiquetaPeriodo(p)).toMatch(/octubre/i)
  })
})

describe('reconciliación: todas las vistas suman el mismo total', () => {
  it('gráficos, jerarquía, flujo y presupuesto coinciden con el total (200 escenarios)', () => {
    for (let s = 1; s <= 200; s++) {
      const r = prng(5000 + s)
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
      const ms = Array.from({ length: Math.floor(r() * 60) }, () => {
        const moneda = pick(['PEN', 'PEN', 'USD', 'EUR'])
        const monto = Math.round(r() * 100000) / 100 + 0.01
        const tc = moneda === 'PEN' ? 1 : moneda === 'USD' ? 3.75 : null
        return mov({ monto, moneda, tipo_cambio: tc, monto_base: tc === null ? null : Math.round(monto * tc * 100) / 100, ambito_id: pick(['a1', 'a2', 'a3']), categoria_id: pick(['c1', 'c2', 'c3']), subcategoria_id: pick(['s1', 's2', '']), medio_pago_id: pick(['p1', 'p2']), fecha: `2026-10-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`, estado: r() < 0.15 ? 'anulado' : 'activo' })
      })
      const f1 = fuente({ id: 'f1' })
      const cj = caja({ id: 'cj', alcance: 'categoria', alcance_id: 'c1' })
      const d = datos({ movimientos: ms, fuentes: [f1], fuentes_mes: [fuenteMes('f1', '2026-10', 2000)], cajas: [cj], cajas_mes: [cajaMes('cj', '2026-10', 300)] })
      const p = calcularPanel(d, { desde: '2026-10-01', hasta: '2026-10-31' }, '2026-10-31')
      const total = p.totales.total
      const suma = (xs: Array<{ total: number }>) => xs.reduce((a, x) => a + x.total, 0)
      expect(suma(p.porAmbito), `s${s} ámbito`).toBe(total)
      expect(suma(p.porCategoria), `s${s} categoría`).toBe(total)
      expect(suma(p.porSubcategoria), `s${s} subcategoría`).toBe(total)
      expect(suma(p.porMedio), `s${s} medio`).toBe(total)
      expect(suma(p.jerarquia), `s${s} jerarquía`).toBe(total)
      expect(suma(p.flujo), `s${s} flujo`).toBe(total)
      expect(p.presupuesto!.gastado, `s${s} presupuesto`).toBe(total)
      expect(p.serie!.gastado, `s${s} serie`).toBe(total)
      expect(p.avisos.sinTipoCambio.length, `s${s} avisos`).toBe(p.totales.sinTipoCambio)
    }
  })
  it('presupuesto del período = suma de meses; un período a mitad de mes no calcula presupuesto', () => {
    const f1 = fuente({ id: 'f1' })
    const d = datos({ movimientos: [mov({ fecha: '2026-09-10', monto: 10 }), mov({ fecha: '2026-10-10', monto: 20 })], fuentes: [f1], fuentes_mes: [fuenteMes('f1', '2026-09', 100), fuenteMes('f1', '2026-10', 200)] })
    const p = calcularPanel(d, { desde: '2026-09-01', hasta: '2026-10-31' }, '2026-10-16')
    expect(p.presupuesto!.presupuesto).toBe(30000)
    expect(p.presupuesto!.gastado).toBe(3000)
    expect(p.serie).toBeNull()
    const medio = calcularPanel(d, { desde: '2026-10-05', hasta: '2026-10-20' }, '2026-10-16')
    expect(medio.presupuesto).toBeNull()
    expect(presupuestoPeriodo(d, prepararMovimientos(d.movimientos), ['2026-10']).presupuesto).toBe(20000)
  })
})
