/** Geometría de los gráficos propios: funciones puras para poder probarlas sin dibujar. */

export interface BurbujaEntrada {
  id: string
  x: number
  y: number
  total: number
}
export interface BurbujaPosicionada extends BurbujaEntrada {
  cx: number
  cy: number
  r: number
}

/**
 * Posiciona burbujas en un área (ancho × alto): x = frecuencia, y = promedio, radio ∝ √total.
 * Después de escalar, separa las que se solapan empujándolas en la dirección que las aleja (relajación iterativa),
 * sin salirse del área. El resultado es determinista.
 */
export function posicionarBurbujas(datos: readonly BurbujaEntrada[], ancho: number, alto: number, margen = 8, rMin = 8, rMax = 34): BurbujaPosicionada[] {
  if (!datos.length) return []
  const maxT = Math.max(...datos.map((d) => d.total), 1)
  const xs = datos.map((d) => d.x)
  const ys = datos.map((d) => d.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const esc = (v: number, a: number, b: number, lo: number, hi: number) => (b === a ? (lo + hi) / 2 : lo + ((v - a) / (b - a)) * (hi - lo))
  const out: BurbujaPosicionada[] = datos.map((d) => {
    const r = Math.max(rMin, Math.min(rMax, rMin + Math.sqrt(d.total / maxT) * (rMax - rMin)))
    return { ...d, r, cx: esc(d.x, x0, x1, margen + r, ancho - margen - r), cy: esc(d.y, y0, y1, alto - margen - r, margen + r) }
  })
  for (let it = 0; it < 200; it++) {
    let movido = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        let dx = b.cx - a.cx
        let dy = b.cy - a.cy
        let d = Math.hypot(dx, dy)
        const min = a.r + b.r + 2
        if (d >= min) continue
        if (d === 0) {
          dx = 1
          dy = 0
          d = 1
        }
        const push = (min - d) / 2
        const ux = dx / d
        const uy = dy / d
        a.cx -= ux * push
        a.cy -= uy * push
        b.cx += ux * push
        b.cy += uy * push
        movido = true
      }
      const a = out[i]!
      a.cx = Math.max(margen + a.r, Math.min(ancho - margen - a.r, a.cx))
      a.cy = Math.max(margen + a.r, Math.min(alto - margen - a.r, a.cy))
    }
    if (!movido) break
  }
  return out
}

export interface EnlaceEntrada {
  origen: string
  destino: string
  valor: number
}
export interface NodoSankey {
  id: string
  total: number
  y: number
  alto: number
}
export interface EnlaceSankey extends EnlaceEntrada {
  y0: number
  y1: number
  grosor: number
}

/**
 * Sankey de dos columnas (origen → destino). La altura es proporcional al valor; los nodos se apilan con un hueco fijo
 * y cada enlace ocupa un tramo propio dentro de su origen y de su destino (sin solaparse).
 */
export function layoutSankey(enlaces: readonly EnlaceEntrada[], alto: number, hueco = 8): { origenes: NodoSankey[]; destinos: NodoSankey[]; enlaces: EnlaceSankey[] } {
  const validos = enlaces.filter((e) => e.valor > 0)
  const suma = (key: 'origen' | 'destino') => {
    const m = new Map<string, number>()
    for (const e of validos) m.set(e[key], (m.get(e[key]) ?? 0) + e.valor)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  }
  const o = suma('origen')
  const d = suma('destino')
  const total = o.reduce((s, [, v]) => s + v, 0)
  if (!total) return { origenes: [], destinos: [], enlaces: [] }
  const apilar = (lista: Array<[string, number]>) => {
    const libre = Math.max(1, alto - hueco * (lista.length - 1))
    let y = 0
    return lista.map(([id, t]) => {
      const h = (t / total) * libre
      const n: NodoSankey = { id, total: t, y, alto: h }
      y += h + hueco
      return n
    })
  }
  const origenes = apilar(o)
  const destinos = apilar(d)
  const cursorO = new Map(origenes.map((n) => [n.id, n.y]))
  const cursorD = new Map(destinos.map((n) => [n.id, n.y]))
  const porOrigen = [...validos].sort((a, b) => origenes.findIndex((n) => n.id === a.origen) - origenes.findIndex((n) => n.id === b.origen) || destinos.findIndex((n) => n.id === a.destino) - destinos.findIndex((n) => n.id === b.destino))
  const nodoO = new Map(origenes.map((n) => [n.id, n]))
  const nodoD = new Map(destinos.map((n) => [n.id, n]))
  const res: EnlaceSankey[] = porOrigen.map((e) => {
    const g = (e.valor / nodoO.get(e.origen)!.total) * nodoO.get(e.origen)!.alto
    const gd = (e.valor / nodoD.get(e.destino)!.total) * nodoD.get(e.destino)!.alto
    const y0 = cursorO.get(e.origen)!
    const y1 = cursorD.get(e.destino)!
    cursorO.set(e.origen, y0 + g)
    cursorD.set(e.destino, y1 + gd)
    return { ...e, y0: y0 + g / 2, y1: y1 + gd / 2, grosor: Math.max(1, Math.min(g, gd)) }
  })
  return { origenes, destinos, enlaces: res }
}
