/**
 * Identificador de entorno: separa colas, cachés e instantáneas por hoja conectada.
 * Se deriva de la URL (que ya no es secreta por sí sola: el acceso lo da el token) con un hash no reversible
 * para que el nombre de las bases locales no exponga la dirección completa.
 */
function hash53(str: string, semilla: number): number {
  let h1 = 0xdeadbeef ^ semilla
  let h2 = 0x41c6ce57 ^ semilla
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function idEntorno(url: string): string {
  const u = url.trim()
  return 'h' + hash53(u, 1).toString(36) + hash53(u, 2).toString(36)
}
