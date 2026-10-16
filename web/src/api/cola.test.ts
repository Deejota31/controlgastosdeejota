import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Cola, almacenIndexedDb, almacenMemoria, claveDe, type Almacen } from './cola'

const rid = (() => { let n = 0; return () => `req-${String(++n).padStart(8, '0')}` })()

describe('Cola', () => {
  it('fusiona ediciones de una misma entidad mientras no se haya enviado', () => {
    const c = new Cola()
    const a = c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 10 } })
    c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 20, version: 1 } })
    expect(c.items()).toHaveLength(1)
    expect(a.payload['monto']).toBe(20)
  })
  it('no fusiona con lo ya enviado ni con lo incierto (el requestId llevaría otro contenido)', async () => {
    const c = new Cola()
    const a = c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 10 } })
    await c.marcarEnVuelo(a.requestId)
    c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 20 } })
    expect(c.items()).toHaveLength(2)
    c.liberar(a.requestId, true)
    // La segunda edición sigue pendiente (no enviada): una tercera sí se fusiona con ella, nunca con la incierta.
    c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 30 } })
    expect(c.items()).toHaveLength(2)
    expect(c.items()[0]!.payload['monto']).toBe(10)
    expect(c.items()[1]!.payload['monto']).toBe(30)
    expect(c.inciertos).toBe(1)
  })
  it('una edición posterior depende de la anterior y espera su confirmación', () => {
    const c = new Cola()
    const a = c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1' } }, { fusionar: false })
    const b = c.encolar({ requestId: rid(), action: 'movimiento.guardar', payload: { id: 'm1', monto: 5 } }, { fusionar: false })
    expect(b.depende).toEqual([a.requestId])
    expect(c.siguientes(2).map((i) => i.requestId)).toEqual([a.requestId])
    c.quitar(a.requestId)
    expect(c.siguientes(2).map((i) => i.requestId)).toEqual([b.requestId])
  })
  it('lo que referencia una entidad pendiente (id en el payload, también anidado) sale después de ella', () => {
    const c = new Cola()
    const cat = c.encolar({ requestId: rid(), action: 'categoria.guardar', payload: { id: 'cat-1', nombre: 'Mascotas' } })
    const mov = c.encolar({ requestId: rid(), action: 'movimientos.lote', payload: { lote_id: 'lote-1', items: [{ id: 'm9', categoria_id: 'cat-1' }] } })
    const otro = c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'amb-1' } })
    expect(mov.depende).toEqual([cat.requestId])
    expect(otro.depende).toEqual([])
    expect(c.siguientes(5).map((i) => i.requestId)).toEqual([cat.requestId, otro.requestId])
  })
  it('respeta el máximo de peticiones en vuelo', async () => {
    const c = new Cola()
    const items = ['a', 'b', 'c', 'd'].map((id) => c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id } }))
    expect(c.siguientes(2)).toHaveLength(2)
    await c.marcarEnVuelo(items[0]!.requestId)
    expect(c.siguientes(2).map((i) => i.payload['id'])).toEqual(['b'])
    await c.marcarEnVuelo(items[1]!.requestId)
    expect(c.siguientes(2)).toHaveLength(0)
  })
  it('la clave de una acción sin id es la propia acción', () => {
    expect(claveDe('config.guardar', { valor: 1 })).toBe('config.guardar')
    expect(claveDe('x', { lote_id: 'l1' })).toBe('l1')
  })
})

describe('persistencia de la cola', () => {
  it('lo que estaba en vuelo al cerrar vuelve como "por confirmar"', async () => {
    const almacen = almacenMemoria()
    const a = new Cola()
    await a.usarAlmacen(almacen)
    const it1 = a.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'x' } })
    a.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'y' } })
    await a.marcarEnVuelo(it1.requestId)
    const b = new Cola()
    await b.usarAlmacen(almacen)
    expect(b.items().map((i) => [i.payload['id'], i.incierto, i.enVuelo])).toEqual([['x', true, false], ['y', false, false]])
  })
  it('usa IndexedDB, separa por nombre de base y conserva el orden', async () => {
    const uno = almacenIndexedDb('dj-cola-prueba-uno')
    const dos = almacenIndexedDb('dj-cola-prueba-dos')
    const c = new Cola()
    await c.usarAlmacen(uno)
    c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'a' } })
    c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'b' } })
    expect(await c.persistido()).toBe(true)
    expect(await dos.todos()).toHaveLength(0)
    const d = new Cola()
    await d.usarAlmacen(almacenIndexedDb('dj-cola-prueba-uno'))
    expect(d.items().map((i) => i.payload['id'])).toEqual(['a', 'b'])
    d.quitar(d.items()[0]!.requestId)
    await d.persistido()
    expect((await uno.todos()).map((i) => i.payload['id'])).toEqual(['b'])
  })
  it('avisa cuando el almacenamiento local falla, sin perder la cola en memoria', async () => {
    const roto: Almacen = {
      todos: async () => [],
      poner: async () => { throw new Error('QuotaExceededError') },
      quitar: async () => undefined,
      limpiar: async () => undefined,
    }
    const c = new Cola()
    const avisos: boolean[] = []
    c.alCambiarAlmacen = (ok) => avisos.push(ok)
    await c.usarAlmacen(roto)
    c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'a' } })
    expect(await c.persistido()).toBe(false)
    expect(avisos).toEqual([false])
    expect(c.items()).toHaveLength(1)
  })
  it('cambiar de almacén no mezcla ni borra lo pendiente de la otra hoja', async () => {
    const hojaA = almacenMemoria()
    const hojaB = almacenMemoria()
    const c = new Cola()
    await c.usarAlmacen(hojaA)
    c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'de-a' } })
    await c.usarAlmacen(hojaB)
    expect(c.items()).toHaveLength(0)
    c.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'de-b' } })
    await c.usarAlmacen(hojaA)
    expect(c.items().map((i) => i.payload['id'])).toEqual(['de-a'])
    expect((await hojaB.todos()).map((i) => i.payload['id'])).toEqual(['de-b'])
  })
  it('recargar agrega lo que otra pestaña encoló', async () => {
    const almacen = almacenMemoria()
    const a = new Cola()
    const b = new Cola()
    await a.usarAlmacen(almacen)
    await b.usarAlmacen(almacen)
    b.encolar({ requestId: rid(), action: 'ambito.guardar', payload: { id: 'desde-b' } })
    await b.persistido()
    await a.recargar(false)
    expect(a.items().map((i) => i.payload['id'])).toEqual(['desde-b'])
  })
})
