import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HUELLA_HOJA_PRODUCCION, esHojaDeProduccion, exigirEntornoDePrueba, huella } from '../../shared/barrera-produccion.mjs'

// Se prueba la lógica con un ID inventado: el ID real no puede aparecer en ningún archivo del repositorio.
const FALSO_ID = 'hoja-de-produccion-inventada-0123456789ABCDEF'
const H = huella(FALSO_ID)

describe('barrera de producción', () => {
  it('reconoce la hoja protegida por su huella, sola o dentro de una URL', () => {
    expect(esHojaDeProduccion(FALSO_ID, H)).toBe(true)
    expect(esHojaDeProduccion(`https://docs.google.com/spreadsheets/d/${FALSO_ID}/edit#gid=0`, H)).toBe(true)
    expect(esHojaDeProduccion(`  ${FALSO_ID}\n`, H)).toBe(true)
  })
  it('no confunde otras hojas', () => {
    expect(esHojaDeProduccion('sim-libro-abc123', H)).toBe(false)
    expect(esHojaDeProduccion(FALSO_ID + 'x', H)).toBe(false)
    expect(esHojaDeProduccion('', H)).toBe(false)
    expect(esHojaDeProduccion(undefined, H)).toBe(false)
  })
  it('una suite de escritura aborta con un error claro si detecta la hoja protegida', () => {
    expect(() => exigirEntornoDePrueba(FALSO_ID, 'la suite E2E de escritura', H)).toThrow(/BARRERA DE PRODUCCIÓN/)
    expect(() => exigirEntornoDePrueba('hoja-de-pruebas-123', 'x', H)).not.toThrow()
  })
  it('la huella configurada es una huella SHA-256 válida', () => {
    expect(HUELLA_HOJA_PRODUCCION).toMatch(/^[0-9a-f]{64}$/)
  })
  it('el simulador usa libros de prueba (pasa la barrera)', async () => {
    const { crearEntorno } = await import('../../apps-script/test/gas-sim.mjs')
    expect(() => crearEntorno()).not.toThrow()
  })
  it('el ID de producción no aparece en ningún archivo versionado', () => {
    const raiz = path.resolve(import.meta.dirname, '..', '..')
    const archivos = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean)
    const ignorar = /package-lock\.json$|\.(png|ico|woff2?|svg)$/
    const hallazgos = []
    for (const f of archivos) {
      if (ignorar.test(f)) continue
      let texto
      try {
        texto = fs.readFileSync(path.join(raiz, f), 'utf8')
      } catch {
        continue
      }
      for (const palabra of texto.match(/[A-Za-z0-9_-]{30,60}/g) ?? []) {
        if (huella(palabra) === HUELLA_HOJA_PRODUCCION) hallazgos.push(f)
      }
    }
    expect(hallazgos).toEqual([])
  })
  it('no hay credenciales: ni despliegues reales de Apps Script, ni variables VITE_* con secretos', () => {
    const raiz = path.resolve(import.meta.dirname, '..', '..')
    const archivos = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean)
    const hallazgos = []
    for (const f of archivos) {
      if (/package-lock\.json$|\.(png|ico|woff2?)$/.test(f)) continue
      let texto
      try {
        texto = fs.readFileSync(path.join(raiz, f), 'utf8')
      } catch {
        continue
      }
      if (/AKfycb[A-Za-z0-9_-]{40,}/.test(texto)) hallazgos.push(`${f}: ID de despliegue real`)
      if (/VITE_[A-Z_]*(TOKEN|SECRET|PASSWORD|URL|SHEET)/.test(texto) && !f.endsWith('barrera.test.mjs')) hallazgos.push(`${f}: variable VITE_ sospechosa`)
      if (/\.env(\.|$)/.test(f)) hallazgos.push(`${f}: archivo .env versionado`)
    }
    expect(hallazgos).toEqual([])
  })
})
