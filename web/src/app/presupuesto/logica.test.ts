import { describe, expect, it } from 'vitest'
import { hojasPrueba, mov } from '@/test/fixtures'
import { cajasSolapadas, calcularMes, estadoEnMes, etiquetaEstadoCaja, filasDeCajas, filtrarCajas, fuenteVigente, impactoDeActivar, nombreAlcance, previsualizarCopia, previsualizarPlantillas } from './logica'

const meta = { creado_en: '', actualizado_en: '', version: 1 }
const cfg = { moneda_base: 'PEN' }

/** F3 del contrato: P=1000, cajas 200/300, gastos 250/100/100. */
function f3() {
  const h = hojasPrueba()
  h.fuentes = [{ id: 'f1', nombre: 'Sueldo', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-09', mes_fin: '', icono: 'wallet', color: '#16a34a', orden: 1, activo: true, es_principal: true, ...meta }]
  h.fuentes_mes = [{ id: 'fm1', fuente_id: 'f1', mes: '2026-10', monto: 1000, estado: 'aplicada', actualizado_en: '' }, { id: 'fm0', fuente_id: 'f1', mes: '2026-09', monto: 900, estado: 'aplicada', actualizado_en: '' }]
  h.cajas = [
    { id: 'c1', nombre: 'Comida', alcance: 'categoria', alcance_id: 'cat-a', monto_defecto: 200, icono: 'utensils', color: '#f59e0b', descripcion: '', orden: 1, activo: true, ...meta },
    { id: 'c2', nombre: 'Transporte', alcance: 'categoria', alcance_id: 'cat-t', monto_defecto: 300, icono: 'bus', color: '#6366f1', descripcion: '', orden: 2, activo: true, ...meta },
  ]
  h.cajas_mes = [
    { id: 'cm1', caja_id: 'c1', mes: '2026-10', monto: 200, estado: 'aplicada', actualizado_en: '' },
    { id: 'cm2', caja_id: 'c2', mes: '2026-10', monto: 300, estado: 'aplicada', actualizado_en: '' },
    { id: 'cm0', caja_id: 'c1', mes: '2026-09', monto: 180, estado: 'aplicada', actualizado_en: '' },
  ]
  h.movimientos = [
    mov({ id: 'm1', monto: 250, monto_base: 250, categoria_id: 'cat-a', subcategoria_id: 'sub-caf' }),
    mov({ id: 'm2', monto: 100, monto_base: 100, categoria_id: 'cat-t', subcategoria_id: 'sub-bus' }),
    mov({ id: 'm3', monto: 100, monto_base: 100, categoria_id: 'cat-s', subcategoria_id: 'sub-luz', ambito_id: 'amb-h' }),
  ]
  return h
}

describe('calcularMes · dataset F3', () => {
  it('P=1000, gastado 450, disponible 550, exceso 50, saldo libre 350, reservas sin usar 200', () => {
    const r = calcularMes(f3(), cfg, '2026-10')
    expect(r.presupuesto).toBe(100000)
    expect(r.gastado).toBe(45000)
    expect(r.disponible).toBe(55000)
    expect(r.exceso).toBe(5000)
    expect(r.saldoLibre).toBe(35000)
    expect(r.reservasSinUsar).toBe(20000)
  })
  it('un mes distinto no hereda nada (aislamiento por mes)', () => {
    const r = calcularMes(f3(), cfg, '2026-09')
    expect(r.presupuesto).toBe(90000)
    expect(r.reservado).toBe(18000)
    expect(r.gastado).toBe(0)
  })
})

describe('impactoDeActivar', () => {
  it('desactivar la única fuente baja P a 0 y el disponible refleja el gasto', () => {
    const i = impactoDeActivar(f3(), cfg, '2026-10', 'fuente', 'f1', false)
    expect(i.antes.presupuesto).toBe(100000)
    expect(i.despues.presupuesto).toBe(0)
    expect(i.despues.disponible).toBe(-45000)
    expect(i.sinEfecto).toBe(false)
  })
  it('no modifica los datos originales', () => {
    const h = f3()
    impactoDeActivar(h, cfg, '2026-10', 'caja', 'c1', false)
    expect(h.cajas[0]!.activo).toBe(true)
  })
  it('desactivar una caja sin aplicar este mes no tiene efecto', () => {
    const h = f3()
    h.cajas_mes = h.cajas_mes.filter((x) => x.caja_id !== 'c1' || x.mes !== '2026-10')
    expect(impactoDeActivar(h, cfg, '2026-10', 'caja', 'c1', false).sinEfecto).toBe(true)
  })
})

describe('cajas', () => {
  it('estado y porcentaje: excedida muestra el %', () => {
    const r = calcularMes(f3(), cfg, '2026-10')
    const c1 = r.cajas.find((c) => c.caja.id === 'c1')!
    expect(etiquetaEstadoCaja(c1)).toBe('Excedida 125 %')
    expect(c1.disponible).toBe(-5000)
    expect(etiquetaEstadoCaja(r.cajas.find((c) => c.caja.id === 'c2')!)).toBe('Al día')
  })
  it('alcance de subcategoría se muestra «Categoría › Sub»', () => {
    expect(nombreAlcance(f3(), 'subcategoria', 'sub-caf')).toBe('Alimentación › Café')
  })
  it('filtra por texto sin tildes, alcance y estado; ordena por uso', () => {
    const h = f3()
    const filas = filasDeCajas(h, calcularMes(h, cfg, '2026-10'), '2026-10')
    expect(filtrarCajas(filas, { texto: 'comida', alcance: '', estado: '', orden: 'manual' })).toHaveLength(1)
    expect(filtrarCajas(filas, { texto: '', alcance: 'medio_pago', estado: '', orden: 'manual' })).toHaveLength(0)
    expect(filtrarCajas(filas, { texto: '', alcance: '', estado: '', orden: 'uso' })[0]!.caja.id).toBe('c1')
    expect(filtrarCajas(filas, { texto: '', alcance: '', estado: '', orden: 'monto' })[0]!.caja.id).toBe('c2')
    expect(filtrarCajas(filas, { texto: '', alcance: '', estado: '', orden: 'gastadas' })[0]!.caja.id).toBe('c1')
  })
  it('avisa de solapes entre categoría y subcategoría, y con medios de pago', () => {
    const h = f3()
    expect(cajasSolapadas(h, 'subcategoria', 'sub-caf').map((c) => c.id)).toEqual(['c1'])
    expect(cajasSolapadas(h, 'subcategoria', 'sub-bus', 'c2').map((c) => c.id)).toEqual([])
    expect(cajasSolapadas(h, 'medio_pago', 'med-efe').map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(cajasSolapadas(h, 'categoria', 'cat-s')).toEqual([])
    expect(cajasSolapadas(h, 'ambito', 'amb-p').map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })
})

describe('vigencia y estado del mes', () => {
  it('única solo vale en su mes; mensual respeta inicio y fin', () => {
    expect(fuenteVigente({ recurrencia: 'unica', mes_inicio: '2026-10', mes_fin: '2026-10' }, '2026-11')).toBe(false)
    expect(fuenteVigente({ recurrencia: 'mensual', mes_inicio: '2026-09', mes_fin: '2026-11' }, '2026-12')).toBe(false)
    expect(fuenteVigente({ recurrencia: 'mensual', mes_inicio: '2026-09', mes_fin: '' }, '2027-03')).toBe(true)
  })
  it('estadoEnMes distingue aplicada, omitida y sin aplicar', () => {
    const h = f3()
    h.fuentes_mes.push({ id: 'fx', fuente_id: 'f1', mes: '2026-11', monto: 1, estado: 'omitida', actualizado_en: '' })
    expect(estadoEnMes(h.fuentes_mes, 'fuente_id', 'f1', '2026-10').estado).toBe('aplicada')
    expect(estadoEnMes(h.fuentes_mes, 'fuente_id', 'f1', '2026-11').estado).toBe('omitida')
    expect(estadoEnMes(h.fuentes_mes, 'fuente_id', 'f1', '2026-12')).toEqual({ estado: 'sin_aplicar', monto: null })
  })
})

describe('copiar del mes anterior', () => {
  it('ofrece crear lo del mes anterior, respeta lo ya existente y lo excluido', () => {
    const h = f3()
    const filas = previsualizarCopia(h, '2026-10')
    expect(filas.find((f) => f.id === 'f1')!.accion).toBe('existente')
    expect(filas.find((f) => f.id === 'c1')!.accion).toBe('existente')
    const nov = previsualizarCopia(h, '2026-11')
    expect(nov.map((f) => `${f.id}:${f.accion}`)).toEqual(['f1:crear', 'c1:crear', 'c2:crear'])
  })
  it('para un mes sin nada creado propone crear con los montos del anterior y permite editarlos o excluirlos', () => {
    const h = f3()
    h.fuentes_mes = h.fuentes_mes.filter((x) => x.mes !== '2026-10')
    h.cajas_mes = h.cajas_mes.filter((x) => x.mes !== '2026-10')
    const filas = previsualizarCopia(h, '2026-10', new Set(['caja:c1']), { 'fuente:f1': 950 })
    expect(filas.find((f) => f.id === 'f1')).toMatchObject({ accion: 'crear', montoAnterior: 900, monto: 950 })
    expect(filas.find((f) => f.id === 'c1')).toMatchObject({ accion: 'omitir', monto: 180 })
  })
  it('no copia fuentes únicas, inactivas ni fuera de vigencia', () => {
    const h = f3()
    h.fuentes_mes = h.fuentes_mes.filter((x) => x.mes !== '2026-10')
    h.cajas_mes = []
    h.fuentes[0] = { ...h.fuentes[0]!, recurrencia: 'unica', mes_fin: '2026-09' }
    expect(previsualizarCopia(h, '2026-10')).toEqual([])
  })
})

describe('plantillas mensuales', () => {
  const conPlantilla = () => {
    const h = f3()
    h.plantillas = [{ id: 'p1', tipo: 'caja', nombre: 'Comida base', datos_json: { caja_id: 'c1', monto: 220 }, orden: 1, activo: true, ...meta }]
    return h
  }
  it('crear / actualizar / sin cambios según lo que ya hay', () => {
    const h = conPlantilla()
    expect(previsualizarPlantillas(h, 'caja', '2026-11')[0]).toMatchObject({ accion: 'crear', monto: 220, estado: 'pendiente' })
    expect(previsualizarPlantillas(h, 'caja', '2026-10')[0]).toMatchObject({ accion: 'actualizar', monto: 220 })
    h.cajas_mes.find((x) => x.id === 'cm1')!.monto = 220
    expect(previsualizarPlantillas(h, 'caja', '2026-10')[0]).toMatchObject({ accion: 'sin_cambios', estado: 'aplicada' })
  })
  it('omitir marca «No aplica este mes» y una entidad inactiva se explica', () => {
    const h = conPlantilla()
    expect(previsualizarPlantillas(h, 'caja', '2026-11', new Set(['p1']))[0]).toMatchObject({ accion: 'omitir', estado: 'no_aplica' })
    h.cajas[0] = { ...h.cajas[0]!, activo: false }
    expect(previsualizarPlantillas(h, 'caja', '2026-11')[0]!.motivo).toMatch(/inactiva/)
  })
})
