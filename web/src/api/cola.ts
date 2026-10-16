import { guardarJson, leerJson } from '@/lib/almacen'

export interface ItemCola {
  requestId: string
  action: string
  payload: Record<string, unknown>
  creado: number
  intentos: number
  /** true mientras viaja al servidor: no se fusiona con ediciones posteriores. */
  enVuelo?: boolean
}

const CLAVE = 'dj.cola.v1'

/** Cola persistente de escrituras pendientes. Sobrevive a recargas y a cortes de red. */
export class Cola {
  private lista: ItemCola[]
  private oyentes = new Set<() => void>()
  private persistir: boolean

  constructor(persistir = true) {
    this.persistir = persistir
    this.lista = persistir ? leerJson<ItemCola[]>(CLAVE, []).map((i) => ({ ...i, enVuelo: false })) : []
  }

  items(): readonly ItemCola[] {
    return this.lista
  }
  get largo() {
    return this.lista.length
  }

  suscribir(fn: () => void) {
    this.oyentes.add(fn)
    return () => void this.oyentes.delete(fn)
  }

  private cambio() {
    if (this.persistir) guardarJson(CLAVE, this.lista)
    this.oyentes.forEach((f) => f())
  }

  /**
   * Encola una escritura. Si ya hay una pendiente (no en vuelo) para la misma entidad y acción de guardado,
   * se fusiona conservando la versión base: el servidor ve un único cambio con el resultado final.
   */
  encolar(item: Omit<ItemCola, 'creado' | 'intentos'>): ItemCola {
    const id = item.payload['id']
    const guarda = item.action.endsWith('.guardar')
    if (guarda && typeof id === 'string') {
      const previo = this.lista.find((i) => !i.enVuelo && i.action === item.action && i.payload['id'] === id)
      if (previo) {
        const base = previo.payload['version']
        previo.payload = { ...item.payload, ...(base !== undefined ? { version: base } : {}) }
        if (base === undefined) delete previo.payload['version']
        this.cambio()
        return previo
      }
    }
    const nuevo: ItemCola = { ...item, creado: Date.now(), intentos: 0 }
    this.lista = [...this.lista, nuevo]
    this.cambio()
    return nuevo
  }

  marcarEnVuelo(requestId: string, v: boolean) {
    const i = this.lista.find((x) => x.requestId === requestId)
    if (i) {
      i.enVuelo = v
      if (v) i.intentos++
      if (this.persistir) guardarJson(CLAVE, this.lista)
    }
  }

  quitar(requestId: string) {
    this.lista = this.lista.filter((i) => i.requestId !== requestId)
    this.cambio()
  }

  vaciar() {
    this.lista = []
    this.cambio()
  }
}
