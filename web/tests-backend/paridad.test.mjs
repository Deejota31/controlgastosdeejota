import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bloques } from '../../scripts/sync-shared.mjs'
import { normalizarDescripcion } from '../../shared/descripcion.js'
import { crearEntorno } from '../../apps-script/test/gas-sim.mjs'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('paridad frontend ↔ Code.gs', () => {
  it('los bloques compartidos de Code.gs están sincronizados con shared/', () => {
    const codigo = fs.readFileSync(path.join(raiz, 'apps-script', 'Code.gs'), 'utf8')
    const b = bloques()
    for (const [marca, texto] of Object.entries(b)) {
      expect(codigo, `bloque ${marca}`).toContain(texto.trim())
    }
  })
  it('normalizarDescripcion da el mismo resultado en el navegador y en Apps Script', () => {
    const e = crearEntorno()
    e.instalar()
    const casos = [
      'menú   del DÍA', 'pago de netflix', 'compra en ChatGPT plus', 'iphone 15 con funda', 'soat del auto', 'a la de', '  ',
      'cena (con amigos)', 'Hbo MAX y youtube', 'PEN usd api', 'wifi del mes', 'café - desayuno',
    ]
    const exc = ['ChatGPT', 'iPhone', 'YouTube', 'USD', 'PEN', 'API', 'SOAT', 'HBO', 'WiFi']
    for (const c of casos) {
      const enGas = e.evaluar(`normalizarDescripcion(${JSON.stringify(c)}, ${JSON.stringify(exc)})`)
      expect(enGas, c).toBe(normalizarDescripcion(c, exc))
    }
  })
  it('normalizarDescripcion es idempotente', () => {
    for (const c of ['menú del DÍA', 'compra en chatgpt', 'a la de']) {
      const una = normalizarDescripcion(c)
      expect(normalizarDescripcion(una)).toBe(una)
    }
  })
  it('el catálogo sembrado coincide exactamente con shared/catalogo-inicial.json', () => {
    const json = JSON.parse(fs.readFileSync(path.join(raiz, 'shared', 'catalogo-inicial.json'), 'utf8'))
    const e = crearEntorno()
    e.instalar()
    const b = e.datos('bootstrap', {})
    expect(b.hojas.ambitos.map((a) => a.nombre)).toEqual(json.ambitos.map((a) => a.nombre))
    for (const a of json.ambitos) {
      const amb = b.hojas.ambitos.find((x) => x.nombre === a.nombre)
      const activas = b.hojas.ambito_categoria.filter((r) => r.ambito_id === amb.id && r.activo)
      expect(activas.map((r) => b.hojas.categorias.find((c) => c.id === r.categoria_id).nombre).sort(), a.nombre).toEqual(a.categorias.map((c) => c.nombre).sort())
      for (const c of a.categorias) {
        const cg = b.hojas.categorias.find((x) => x.nombre === c.nombre)
        const efectivas = b.hojas.subcategorias
          .filter((s) => s.categoria_id === cg.id)
          .filter((s) => !b.hojas.ambito_subcategoria.some((r) => r.ambito_id === amb.id && r.subcategoria_id === s.id && r.activo === false))
          .map((s) => s.nombre)
        expect(efectivas.sort(), `${a.nombre} > ${c.nombre}`).toEqual([...c.subcategorias].sort())
      }
    }
  })
  it('cada categoría y subcategoría tiene icono y color válidos de la paleta', () => {
    const paleta = JSON.parse(fs.readFileSync(path.join(raiz, 'shared', 'paleta-colores.json'), 'utf8'))
    const lista = Array.isArray(paleta) ? paleta : paleta.colores
    const e = crearEntorno()
    e.instalar()
    const b = e.datos('bootstrap', {})
    for (const c of b.hojas.categorias) {
      expect(c.icono, c.nombre).toBeTruthy()
      expect(lista, c.nombre).toContain(c.color)
    }
    for (const s of b.hojas.subcategorias) expect(s.icono, s.nombre).toBeTruthy()
  })
})
