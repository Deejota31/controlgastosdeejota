import { describe, it, expect } from 'vitest'
import { crearEntorno } from '../../apps-script/test/gas-sim.mjs'

/* Fase A — durabilidad: idempotencia durable, requestId con otros datos, todo-o-nada y recuperación tras caídas. */
function entorno() {
  const e = crearEntorno()
  e.instalar()
  const b = e.datos('bootstrap', {})
  const por = (arr, nombre) => arr.find((x) => x.nombre === nombre)
  const personal = por(b.hojas.ambitos, 'Personal')
  const alim = por(b.hojas.categorias, 'Alimentación')
  const sub = b.hojas.subcategorias.find((s) => s.categoria_id === alim.id && s.nombre === 'Almuerzo')
  const yape = por(b.hojas.medios_pago, 'Yape')
  const gasto = (i) => ({
    id: `mov-fijo-${String(i).padStart(6, '0')}`, fecha: '2026-10-15', monto: 10 + i, moneda: 'PEN', ambito_id: personal.id,
    categoria_id: alim.id, subcategoria_id: sub.id, descripcion: `gasto ${i}`, medio_pago_id: yape.id,
  })
  return { e, gasto }
}
/** Foto de las hojas de datos (sin _meta: allí vive el diario) para comparar antes/después. */
function foto(e) {
  const nombres = e.libro.getSheets().map((h) => h.getName()).filter((x) => x !== '_meta' && x !== 'auditoria').sort()
  return JSON.stringify(nombres.map((x) => [x, e.filas(x)]))
}
const fotoMov = (e) => JSON.stringify(e.filas('movimientos').map((m) => [m.id, m.monto, m.descripcion, m.estado, m.version]))
const filasOp = (e) => e.filas('_meta').filter((f) => f.clave.startsWith('op:'))

describe('idempotencia durable', () => {
  it('sobrevive a la pérdida de la caché: repetir devuelve la respuesta original sin duplicar', () => {
    const { e, gasto } = entorno()
    const a = e.llamar('movimiento.guardar', gasto(1), { requestId: 'rid-durable-0001' })
    expect(a.ok).toBe(true)
    e.cache.clear()
    const aud = e.filas('auditoria').length
    const b = e.llamar('movimiento.guardar', gasto(1), { requestId: 'rid-durable-0001' })
    expect(b.ok).toBe(true)
    expect(b.repetido).toBe(true)
    expect(b.data.movimiento.id).toBe(a.data.movimiento.id)
    expect(b.generacion).toBe(a.generacion)
    expect(e.filas('movimientos')).toHaveLength(1)
    expect(e.filas('auditoria')).toHaveLength(aud)
  })
  it('el mismo requestId con otros datos es CONFLICT (con y sin caché) y no escribe nada', () => {
    const { e, gasto } = entorno()
    e.llamar('movimiento.guardar', gasto(1), { requestId: 'rid-durable-0002' })
    const antes = foto(e)
    const distinto = { ...gasto(1), monto: 999 }
    for (const vaciar of [false, true]) {
      if (vaciar) e.cache.clear()
      const r = e.llamar('movimiento.guardar', distinto, { requestId: 'rid-durable-0002' })
      expect(r.ok).toBe(false)
      expect(r.error.code).toBe('CONFLICT')
      expect(r.error.campo).toBe('requestId')
    }
    expect(foto(e)).toBe(antes)
  })
  it('la huella no depende del orden de las claves del payload', () => {
    const { e, gasto } = entorno()
    const g = gasto(1)
    e.llamar('movimiento.guardar', g, { requestId: 'rid-durable-0003' })
    e.cache.clear()
    const invertido = Object.fromEntries(Object.entries(g).reverse())
    expect(e.llamar('movimiento.guardar', invertido, { requestId: 'rid-durable-0003' }).repetido).toBe(true)
  })
  it('una petición inválida no deja rastro en el diario', () => {
    const { e } = entorno()
    const r = e.llamar('movimiento.guardar', { id: 'x' }, { requestId: 'rid-durable-0004' })
    expect(r.ok).toBe(false)
    expect(filasOp(e)).toHaveLength(0)
  })
  it('recorta las huellas antiguas y conserva las recientes', () => {
    const { e, gasto } = entorno()
    e.evaluar('MAX_OPERACIONES = 25; MANTENER_OPERACIONES = 20')
    for (let i = 1; i <= 30; i++) e.llamar('movimiento.guardar', gasto(i), { requestId: `rid-recorte-${String(i).padStart(4, '0')}` })
    const ops = filasOp(e)
    expect(ops.length).toBeLessThan(30)
    expect(ops.length).toBeGreaterThanOrEqual(20)
    expect(e.filas('_meta').some((f) => f.clave === 'op:rid-recorte-0030')).toBe(true)
    expect(e.filas('_meta').some((f) => f.clave === 'generacion')).toBe(true)
  })
})

describe('todo o nada', () => {
  it('un error a mitad de un lote revierte todo, en cada punto de fallo posible', () => {
    const { e: base, gasto: gBase } = entorno()
    base.reiniciarStats()
    expect(base.llamar('movimientos.lote', { lote_id: 'lote-todo-o-nada', items: [1, 2, 3, 4, 5].map(gBase) }).ok).toBe(true)
    const escrituras = base.stats.escrituras
    expect(escrituras).toBeGreaterThan(4)
    for (let k = 1; k <= escrituras; k++) {
      const { e, gasto } = entorno()
      const payload = { lote_id: 'lote-todo-o-nada', items: [1, 2, 3, 4, 5].map(gasto) }
      const antes = foto(e)
      e.estado.falloEn = k
      const r = e.llamar('movimientos.lote', payload, { requestId: 'rid-fallo-000001' })
      e.estado.falloEn = 0
      if (k === escrituras) {
        // La última escritura es solo limpieza posterior a la confirmación: el lote ya quedó aplicado.
        expect(r.ok).toBe(true)
        expect(e.filas('movimientos')).toHaveLength(5)
        continue
      }
      expect(r.ok, `fallo en la escritura ${k}`).toBe(false)
      expect(foto(e), `estado tras fallo en la escritura ${k}`).toBe(antes)
      // El reintento con el mismo requestId aplica el lote completo una sola vez.
      const r2 = e.llamar('movimientos.lote', payload, { requestId: 'rid-fallo-000001' })
      expect(r2.ok, `reintento tras fallo ${k}`).toBe(true)
      expect(e.filas('movimientos')).toHaveLength(5)
    }
  })
  it('un error a mitad de una acción masiva sobre movimientos existentes no deja cambios parciales', () => {
    const { e, gasto } = entorno()
    const ids = [1, 2, 3, 4].map((i) => gasto(i).id)
    expect(e.llamar('movimientos.lote', { lote_id: 'lote-masivo-0001', items: [1, 2, 3, 4].map(gasto) }).ok).toBe(true)
    e.reiniciarStats()
    expect(e.llamar('movimientos.accionLote', { accion: 'anular', ids }).ok).toBe(true)
    const escrituras = e.stats.escrituras
    expect(e.llamar('movimientos.accionLote', { accion: 'restaurar', ids }).ok).toBe(true)
    const antes = foto(e)
    for (let k = 1; k < escrituras; k++) {
      e.estado.falloEn = k
      const r = e.llamar('movimientos.accionLote', { accion: 'anular', ids })
      e.estado.falloEn = 0
      expect(r.ok, `escritura ${k}`).toBe(false)
      expect(foto(e), `escritura ${k}`).toBe(antes)
    }
  })
  it('revierte también las eliminaciones en cascada (restaura cada fila en su posición original)', () => {
    const { e: base } = entorno()
    const idAlim = (x) => x.datos('bootstrap', {}).hojas.categorias.find((c) => c.nombre === 'Alimentación').id
    base.reiniciarStats()
    const ok = base.llamar('categoria.eliminar', { id: idAlim(base), confirmar: true, cascada: true })
    expect(ok.ok, JSON.stringify(ok.error)).toBe(true)
    const escrituras = base.stats.escrituras
    expect(base.filas('subcategorias').length).toBeLessThan(entorno().e.filas('subcategorias').length)
    for (let k = 1; k < escrituras; k++) {
      const { e } = entorno()
      const antes = foto(e)
      const id = idAlim(e)
      e.estado.falloEn = k
      const r = e.llamar('categoria.eliminar', { id, confirmar: true, cascada: true })
      e.estado.falloEn = 0
      expect(r.ok, `escritura ${k}`).toBe(false)
      expect(foto(e), `escritura ${k}`).toBe(antes)
    }
  })
})

describe('recuperación tras caídas', () => {
  it('si la ejecución muere en cualquier escritura, la siguiente petición deja el estado antes o después, nunca a medias', () => {
    const { e: ref, gasto: gRef } = entorno()
    ref.reiniciarStats()
    expect(ref.llamar('movimientos.lote', { lote_id: 'lote-caida-0001', items: [1, 2, 3].map(gRef) }).ok).toBe(true)
    const escrituras = ref.stats.escrituras
    const despues = fotoMov(ref)
    let revertidas = 0, aplicadas = 0
    for (let k = 1; k <= escrituras; k++) {
      const { e, gasto } = entorno()
      const payload = { lote_id: 'lote-caida-0001', items: [1, 2, 3].map(gasto) }
      const antes = foto(e)
      e.estado.crashEn = k
      const perdida = e.llamar('movimientos.lote', payload, { requestId: 'rid-caida-000001' })
      expect(perdida.ok, `la respuesta de la caída ${k} no debe ser un éxito`).toBe(false)
      // Cualquier lectura posterior ya ve un estado consistente.
      e.datos('bootstrap', {})
      if (foto(e) === antes) revertidas++
      else { expect(fotoMov(e), `caída ${k}`).toBe(despues); aplicadas++ }
      expect(e.props.get('OP_EN_CURSO') ?? null, `caída ${k}`).toBeNull()
      // El cliente reintenta con el mismo requestId: se aplica exactamente una vez.
      const r = e.llamar('movimientos.lote', payload, { requestId: 'rid-caida-000001' })
      expect(r.ok, `reintento tras caída ${k}`).toBe(true)
      expect(fotoMov(e), `reintento tras caída ${k}`).toBe(despues)
      expect(e.filas('movimientos')).toHaveLength(3)
    }
    expect(revertidas).toBeGreaterThan(0)
    expect(aplicadas).toBeGreaterThan(0) // caídas posteriores al punto de confirmación
  })
  it('una escritura posterior también recupera antes de ejecutarse', () => {
    const { e, gasto } = entorno()
    e.estado.crashEn = 3
    e.llamar('movimientos.lote', { lote_id: 'lote-caida-0002', items: [1, 2, 3].map(gasto) }, { requestId: 'rid-caida-000002' })
    const r = e.llamar('movimiento.guardar', gasto(9), { requestId: 'rid-caida-000003' })
    expect(r.ok).toBe(true)
    expect(e.filas('movimientos').map((m) => m.id)).toEqual([gasto(9).id])
  })
  it('una caída durante la propia recuperación es reanudable', () => {
    const { e, gasto } = entorno()
    const payload = { lote_id: 'lote-caida-0003', items: [1, 2, 3].map(gasto) }
    const antes = foto(e)
    e.estado.crashEn = 7 // tras escribir filas y auditoría, antes de confirmar
    e.llamar('movimientos.lote', payload, { requestId: 'rid-caida-000004' })
    expect(e.props.get('OP_EN_CURSO')).toBe('rid-caida-000004')
    e.estado.crashEn = 2 // la recuperación muere a medias
    expect(e.llamar('bootstrap', {}).ok).toBe(false) // la recuperación muere a medias
    expect(e.props.get('OP_EN_CURSO')).toBe('rid-caida-000004')
    e.datos('bootstrap', {}) // la siguiente la reanuda y la termina
    expect(foto(e)).toBe(antes)
    expect(e.props.get('OP_EN_CURSO') ?? null).toBeNull()
  })
})

describe('crecimiento de la hoja', () => {
  it('acepta más de 1000 filas (la cuadrícula crece en vez de fallar)', () => {
    const { e, gasto } = entorno()
    let total = 0
    for (let l = 0; l < 6; l++) {
      const items = Array.from({ length: 200 }, (_, i) => gasto(l * 200 + i + 1))
      const r = e.llamar('movimientos.lote', { lote_id: `lote-grande-${l}-0001`, items })
      expect(r.ok, JSON.stringify(r.error)).toBe(true)
      total += 200
    }
    expect(e.filas('movimientos')).toHaveLength(total)
    expect(e.hoja('movimientos').getMaxRows()).toBeGreaterThanOrEqual(total + 1)
  })
})
