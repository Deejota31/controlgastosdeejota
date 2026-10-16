/** Almacenamiento local tolerante a fallos (modo privado, cuota llena, sin API). Nunca lanza. */

export function leerJson<T>(clave: string, def: T): T {
  try {
    const t = localStorage.getItem(clave)
    return t ? (JSON.parse(t) as T) : def
  } catch {
    return def
  }
}

export function guardarJson(clave: string, valor: unknown): boolean {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

export function borrarClave(clave: string) {
  try {
    localStorage.removeItem(clave)
  } catch {
    /* sin almacenamiento */
  }
}

/* ---- Instantánea grande en IndexedDB (con respaldo en memoria si no existe) ---- */
const BD = 'deejota-finanzas'
const TABLA = 'kv'
const memoria = new Map<string, unknown>()

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const r = indexedDB.open(BD, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(TABLA)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function leerGrande<T>(clave: string): Promise<T | undefined> {
  const db = await abrir()
  if (!db) return memoria.get(clave) as T | undefined
  return new Promise((resolve) => {
    try {
      const q = db.transaction(TABLA).objectStore(TABLA).get(clave)
      q.onsuccess = () => resolve(q.result as T | undefined)
      q.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function guardarGrande(clave: string, valor: unknown): Promise<void> {
  const db = await abrir()
  if (!db) {
    memoria.set(clave, valor)
    return
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(TABLA, 'readwrite')
      tx.objectStore(TABLA).put(valor, clave)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function borrarGrande(clave: string): Promise<void> {
  memoria.delete(clave)
  const db = await abrir()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(TABLA, 'readwrite')
      tx.objectStore(TABLA).delete(clave)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
