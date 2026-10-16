/**
 * Simulador mínimo de Google Apps Script para probar Code.gs sin Google.
 * Modela fielmente lo que el backend usa: hojas como matrices, formato de texto "@" que
 * conserva cadenas (y fechas AAAA-MM-DD que se vuelven Date si la columna NO es texto),
 * límite de 100 KB por valor de caché, LockService con contención simulable, gzip/base64,
 * Date controlable y contadores de llamadas para verificar el costo de cada operación.
 */
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { crearServicios } from './gas-core.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const RUTA_CODE_GS = path.join(AQUI, '..', 'Code.gs')

export function crearEntorno(opciones = {}) {
  const tz = opciones.tz ?? 'America/Lima'
  let ahora = new Date(opciones.ahora ?? '2026-10-16T15:00:00-05:00').getTime()
  const aSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b))
  const blob = (bytes, tipo) => ({ _b: Buffer.from(bytes), getBytes: () => aSigned(Buffer.from(bytes)), getDataAsString: () => Buffer.from(bytes).toString('utf8'), getContentType: () => tipo })
  let entorno // se asigna más abajo; el núcleo solo lo usa en tiempo de ejecución
  const S = crearServicios({
    tz,
    sinLibroActivo: opciones.sinLibroActivo,
    nuevaFecha: (s) => entorno.nuevaFecha(s),
    extras: {
      base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : x).toString('base64'),
      base64Decode: (s) => aSigned(Buffer.from(s, 'base64')),
      Utilities: {
        computeDigest: (alg, txt) => aSigned(crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(typeof txt === 'string' ? txt : Buffer.from(txt)).digest()),
        newBlob: (datos, tipo) => blob(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : Buffer.from(datos), tipo),
        gzip: (b) => blob(zlib.gzipSync(b._b), 'application/x-gzip'),
        ungzip: (b) => blob(zlib.gunzipSync(b._b), 'text/plain'),
      },
    },
  })
  const { stats, logs, errores, archivosDrive, estado, libro: principal, libros, props, cache: mapaCache, carpetas } = S
  const { SpreadsheetApp, CacheService, PropertiesService, LockService, Utilities, ContentService, MimeType, DriveApp } = S
  const consola = S.console
  const Libro = S.Libro, Hoja = S.Hoja

  /* ------------------------------ Contexto ------------------------------ */
  const FechaReal = Date
  const ctx = vm.createContext({
    SpreadsheetApp, CacheService, PropertiesService, LockService, Utilities, ContentService, MimeType, DriveApp, console: consola, Intl, JSON, Math,
    __ahora: () => ahora, FechaReal,
  })
  vm.runInContext(`
    var Date = (function (R) {
      function F(a, b, c, d, e, f, g) {
        if (!(this instanceof F)) return new R(__ahora()).toString();
        var n = arguments.length;
        var x = n === 0 ? new R(__ahora()) : n === 1 ? new R(a) : new R(a, b, c || 1, d || 0, e || 0, f || 0, g || 0);
        return x;
      }
      F.prototype = R.prototype; F.now = function () { return __ahora(); }; F.UTC = R.UTC; F.parse = R.parse;
      return F;
    })(FechaReal);
  `, ctx)
  const codigo = opciones.codigo ?? fs.readFileSync(RUTA_CODE_GS, 'utf8')
  vm.runInContext(codigo, ctx, { filename: 'Code.gs' })

  entorno = {
    ctx, stats, logs, errores, archivosDrive, estado, libro: principal, libros, props, cache: mapaCache, tz,
    nuevaFecha: (s) => vm.runInContext(`new Date(${JSON.stringify(s)})`, ctx),
    setAhora(iso) { ahora = new FechaReal(iso).getTime() },
    avanzar(ms) { ahora += ms },
    get ahora() { return ahora },
    crearCarpeta(nombre = 'Respaldos') { const id = 'sim-folder-' + crypto.randomBytes(4).toString('hex'); carpetas.set(id, nombre); return id },
    reiniciarStats() { Object.keys(stats).forEach((k) => (stats[k] = 0)) },
    /** Ejecuta código arbitrario dentro del contexto de Code.gs (para pruebas unitarias de funciones internas). */
    evaluar(js) { return vm.runInContext(js, ctx) },
    /** Instala el backend como lo haría el usuario desde el editor y devuelve el reporte con el token. */
    instalar() {
      vm.runInContext('CTX = null', ctx)
      const rep = JSON.parse(JSON.stringify(ctx.setup()))
      entorno.token = rep.token ?? props.get('TOKEN')
      return rep
    },
    /** Simula una petición HTTP POST completa (doPost) y devuelve la respuesta ya parseada. */
    post(cuerpo) {
      vm.runInContext('CTX = null', ctx)
      const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
      const salida = ctx.doPost({ postData: { contents: texto } })
      return JSON.parse(salida.getContent())
    },
    /** Crea otro libro (por ejemplo, una hoja antigua v1) con hojas dadas como matrices; devuelve su id. */
    crearLibro(nombre, hojas) {
      const l = new Libro(nombre)
      l.hojas = Object.entries(hojas).map(([n, filas]) => {
        const h = new Hoja(n, Math.max(filas.length + 10, 1000))
        filas.forEach((f, i) => f.forEach((v, j) => { h.datos[i] = h.datos[i] || []; h.datos[i][j] = v }))
        return h
      })
      libros.set(l.id, l)
      return l.id
    },
    contador: 0,
    /** Atajo para llamar a una acción con token y requestId automáticos. */
    llamar(action, payload = {}, extra = {}) {
      entorno.contador++
      const req = { action, payload, token: extra.token ?? entorno.token, requestId: extra.requestId ?? `req-${String(entorno.contador).padStart(6, '0')}-${crypto.randomBytes(3).toString('hex')}` }
      return entorno.post(req)
    },
    /** Igual que llamar() pero exige ok y devuelve data. */
    datos(action, payload = {}, extra = {}) {
      const r = entorno.llamar(action, payload, extra)
      if (!r.ok) throw new Error(`${action} falló: ${r.error.code} - ${r.error.message}`)
      return r.data
    },
    /** Lee una hoja completa como objetos (para verificar el estado real, no la respuesta). */
    filas(nombre) {
      const h = principal.getSheetByName(nombre)
      if (!h) return []
      const enc = h.datos[0] ?? []
      return h.datos.slice(1).filter((f) => f.some((v) => v !== '' && v !== undefined)).map((f) => Object.fromEntries(enc.map((n, i) => [n, f[i] === undefined ? '' : f[i]])))
    },
    hoja(nombre) { return principal.getSheetByName(nombre) },
  }
  return entorno
}
