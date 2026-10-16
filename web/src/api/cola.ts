/**
 * Cola de escrituras pendientes.
 *
 * - Cada elemento se guarda por separado en el almacén (IndexedDB) ANTES de comunicar que quedó guardado
 *   localmente, de modo que dos pestañas no se pisan entre sí.
 * - Un elemento puede estar: pendiente, en vuelo (enviándose) o incierto (se envió y no se conoce el resultado:
 *   "pendiente de confirmar"). Un incierto se reenvía con el mismo requestId; el servidor responde con el
 *   resultado original sin volver a aplicarlo.
 * - Cada elemento declara de qué otros pendientes depende (misma entidad o ids referenciados en su payload);
 *   solo sale cuando esos ya fueron confirmados. Hay un máximo de peticiones en paralelo.
 */
export interface ItemCola {
  requestId: string
  action: string
  payload: Record<string, unknown>
  creado: number
  intentos: number
  /** true mientras viaja al servidor: no se fusiona con ediciones posteriores. */
  enVuelo?: boolean
  /** Se envió y no se conoce el resultado (respuesta perdida o caída durante el envío). */
  incierto?: boolean
  /** Entidad que modifica: id del payload, lote_id o, si no hay, el nombre de la acción. */
  clave: string
  /** requestId de pendientes anteriores que deben confirmarse antes. */
  depende: string[]
}

export interface Almacen {
  todos(): Promise<ItemCola[]>
  poner(item: ItemCola): Promise<void>
  quitar(requestId: string): Promise<void>
  limpiar(): Promise<void>
}

export function almacenMemoria(): Almacen {
  const m = new Map<string, ItemCola>()
  return {
    async todos() {
      return [...m.values()].map((i) => structuredClone(i))
    },
    async poner(i) {
      m.set(i.requestId, structuredClone(i))
    },
    async quitar(id) {
      m.delete(id)
    },
    async limpiar() {
      m.clear()
    },
  }
}

export function almacenIndexedDb(nombre: string): Almacen {
  let abierta: Promise<IDBDatabase> | null = null
  const abrir = () =>
    (abierta ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no está disponible'))
      const r = indexedDB.open(nombre, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'requestId' })
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error ?? new Error('No se pudo abrir el almacenamiento local'))
      r.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña'))
    }).catch((e) => {
      abierta = null
      throw e
    }))
  async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await abrir()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('items', modo)
      const req = fn(tx.objectStore('items'))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error ?? new Error('Falló la escritura local'))
      tx.onabort = () => reject(tx.error ?? new Error('Se canceló la escritura local (¿almacenamiento lleno?)'))
    })
  }
  return {
    todos: () => operar('readonly', (s) => s.getAll() as IDBRequest<ItemCola[]>),
    poner: async (i) => void (await operar('readwrite', (s) => s.put(i))),
    quitar: async (id) => void (await operar('readwrite', (s) => s.delete(id))),
    limpiar: async () => void (await operar('readwrite', (s) => s.clear())),
  }
}

const textos = (v: unknown, salida: Set<string>, nivel = 0) => {
  if (typeof v === 'string') {
    if (v.length <= 80) salida.add(v)
  } else if (nivel < 5 && Array.isArray(v)) {
    for (const x of v.slice(0, 1000)) textos(x, salida, nivel + 1)
  } else if (nivel < 5 && v && typeof v === 'object') {
    for (const x of Object.values(v)) textos(x, salida, nivel + 1)
  }
}

export function claveDe(action: string, payload: Record<string, unknown>): string {
  const id = payload['id']
  if (typeof id === 'string' && id) return id
  const lote = payload['lote_id']
  if (typeof lote === 'string' && lote) return lote
  return action
}

const ordenar = (a: ItemCola, b: ItemCola) => a.creado - b.creado || (a.requestId < b.requestId ? -1 : 1)

export class Cola {
  private lista: ItemCola[] = []
  private oyentes = new Set<() => void>()
  private almacen: Almacen | null = null
  private cadena: Promise<unknown> = Promise.resolve()
  private ultimoCreado = 0
  /** false si alguna escritura al almacén local falló: lo pendiente solo vive en memoria. */
  almacenOk = true
  /** Se invoca cuando cambia `almacenOk` (para avisar a la persona). */
  alCambiarAlmacen?: (ok: boolean) => void

  /** Cambia de almacén (otra hoja) y carga lo que hubiera guardado. Lo pendiente de la hoja anterior queda en su almacén. */
  async usarAlmacen(almacen: Almacen | null) {
    await this.persistido()
    this.almacen = almacen
    this.lista = []
    this.almacenOk = true
    this.avisado = false
    if (almacen) {
      try {
        const guardados = (await almacen.todos()).sort(ordenar)
        // Lo que estaba en vuelo al cerrar pudo haber llegado al servidor: queda por confirmar.
        this.lista = guardados.map((i) => ({ ...i, incierto: i.incierto || i.enVuelo === true, enVuelo: false }))
        this.ultimoCreado = Math.max(this.ultimoCreado, ...this.lista.map((i) => i.creado), 0)
      } catch {
        this.fallaAlmacen()
      }
    }
    this.avisar()
  }

  /** Vuelve a leer el almacén: agrega lo que otra pestaña encoló y (si `completo`) olvida lo que ya confirmó. */
  async recargar(completo: boolean) {
    if (!this.almacen) return
    await this.persistido()
    try {
      const guardados = new Map((await this.almacen.todos()).map((i) => [i.requestId, i]))
      const locales = new Map(this.lista.map((i) => [i.requestId, i]))
      let cambio = false
      for (const [id, i] of guardados) {
        const local = locales.get(id)
        if (!local) {
          this.lista.push({ ...i, enVuelo: false })
          cambio = true
        } else if (completo && !local.enVuelo) {
          Object.assign(local, i, { enVuelo: false })
        }
      }
      if (completo) {
        const antes = this.lista.length
        this.lista = this.lista.filter((i) => guardados.has(i.requestId) || i.enVuelo)
        cambio = cambio || this.lista.length !== antes
      }
      this.lista.sort(ordenar)
      if (cambio || completo) this.avisar()
    } catch {
      this.fallaAlmacen()
    }
  }

  items(): readonly ItemCola[] {
    return this.lista
  }
  get largo() {
    return this.lista.length
  }
  get inciertos() {
    return this.lista.filter((i) => i.incierto).length
  }

  suscribir(fn: () => void) {
    this.oyentes.add(fn)
    return () => void this.oyentes.delete(fn)
  }
  private avisar() {
    this.oyentes.forEach((f) => f())
  }

  private avisado = false
  /** El almacén local no funciona. Solo se avisa cuando hay algo pendiente que se perdería (no al conectar con la cola vacía). */
  private fallaAlmacen() {
    this.almacenOk = false
    if (!this.avisado && this.lista.length > 0) {
      this.avisado = true
      this.alCambiarAlmacen?.(false)
    }
  }
  private escribir(fn: (a: Almacen) => Promise<void>) {
    const a = this.almacen
    if (!a) return
    this.cadena = this.cadena.then(() => fn(a)).catch(() => this.fallaAlmacen())
  }
  /** Resuelve cuando todo lo encolado ya se escribió. Devuelve si el almacenamiento local está funcionando. */
  async persistido(): Promise<boolean> {
    await this.cadena
    return this.almacenOk || this.almacen === null
  }

  /**
   * Encola una escritura. Con `fusionar`, si ya hay una pendiente (no enviada ni incierta) para la misma
   * entidad y acción de guardado, se combina conservando la versión base: el servidor ve un único cambio.
   */
  encolar(item: Pick<ItemCola, 'requestId' | 'action' | 'payload'>, opc: { fusionar?: boolean } = {}): ItemCola {
    const fusionar = opc.fusionar ?? true
    const id = item.payload['id']
    if (fusionar && item.action.endsWith('.guardar') && typeof id === 'string') {
      const previo = this.lista.find((i) => !i.enVuelo && !i.incierto && i.action === item.action && i.payload['id'] === id)
      if (previo) {
        const base = previo.payload['version']
        previo.payload = { ...item.payload, ...(base !== undefined ? { version: base } : {}) }
        if (base === undefined) delete previo.payload['version']
        const copia = previo
        this.escribir((a) => a.poner(copia))
        this.avisar()
        return previo
      }
    }
    const clave = claveDe(item.action, item.payload)
    const referenciados = new Set<string>()
    textos(item.payload, referenciados)
    const depende = this.lista.filter((p) => p.clave === clave || (p.clave !== p.action && referenciados.has(p.clave))).map((p) => p.requestId)
    this.ultimoCreado = Math.max(Date.now(), this.ultimoCreado + 1)
    const nuevo: ItemCola = { ...item, creado: this.ultimoCreado, intentos: 0, clave, depende }
    this.lista = [...this.lista, nuevo]
    this.escribir((a) => a.poner(nuevo))
    if (!this.almacenOk && this.almacen) this.fallaAlmacen()
    this.avisar()
    return nuevo
  }

  /** Elementos que pueden salir ahora: sin dependencias pendientes, hasta completar `max` en vuelo. */
  siguientes(max: number): ItemCola[] {
    const enVuelo = this.lista.filter((i) => i.enVuelo).length
    const libres = Math.max(0, max - enVuelo)
    if (!libres) return []
    const ids = new Set(this.lista.map((i) => i.requestId))
    const claves = new Set(this.lista.filter((i) => i.enVuelo).map((i) => i.clave))
    const salida: ItemCola[] = []
    for (const i of this.lista) {
      if (salida.length >= libres) break
      if (i.enVuelo) continue
      if (i.depende.some((d) => ids.has(d))) continue
      if (claves.has(i.clave)) continue
      claves.add(i.clave)
      salida.push(i)
    }
    return salida
  }

  /** Marca el envío (y lo guarda ANTES de enviar: si la app muere en vuelo, al reabrir queda por confirmar). */
  async marcarEnVuelo(requestId: string) {
    const i = this.lista.find((x) => x.requestId === requestId)
    if (!i) return
    i.enVuelo = true
    i.intentos++
    const copia = { ...i }
    this.escribir((a) => a.poner(copia))
    await this.cadena
  }
  /** Devuelve el elemento a la cola tras un fallo transitorio. `incierto`: pudo haber llegado al servidor. */
  liberar(requestId: string, incierto: boolean) {
    const i = this.lista.find((x) => x.requestId === requestId)
    if (!i) return
    i.enVuelo = false
    if (incierto) i.incierto = true
    const copia = { ...i }
    this.escribir((a) => a.poner(copia))
    this.avisar()
  }

  quitar(requestId: string) {
    this.lista = this.lista.filter((i) => i.requestId !== requestId)
    this.escribir((a) => a.quitar(requestId))
    this.avisar()
  }

  /** Olvida lo pendiente. Solo para descartar a propósito; desconectar NO lo usa. */
  vaciar() {
    this.lista = []
    this.escribir((a) => a.limpiar())
    this.avisar()
  }

  /** Olvida lo que está en memoria sin tocar el almacén (al cambiar de hoja o desconectar). */
  soltar() {
    this.lista = []
    this.avisar()
  }
}
