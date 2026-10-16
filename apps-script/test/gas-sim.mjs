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

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const RUTA_CODE_GS = path.join(AQUI, '..', 'Code.gs')

const reFecha = /^\d{4}-\d{2}-\d{2}$/

function formatear(fecha, tz, patron) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha)
  const g = (t) => partes.find((p) => p.type === t).value
  return patron
    .replace('yyyy', g('year')).replace('MM', g('month')).replace('dd', g('day'))
    .replace('HH', g('hour')).replace('mm', g('minute')).replace('ss', g('second'))
}

export function crearEntorno(opciones = {}) {
  const tz = opciones.tz ?? 'America/Lima'
  let ahora = new Date(opciones.ahora ?? '2026-10-16T15:00:00-05:00').getTime()
  const stats = { lecturas: 0, escrituras: 0, cache: 0, props: 0, bloqueos: 0 }
  const logs = []
  const errores = []
  const archivosDrive = []
  const estado = { contiendaLock: false, cacheFalla: false }

  /* ------------------------------ Hojas ------------------------------ */
  class Rango {
    constructor(hoja, r, c, nr, nc) { Object.assign(this, { hoja, r, c, nr, nc }) }
    getValues() {
      stats.lecturas++
      const out = []
      for (let i = 0; i < this.nr; i++) {
        const fila = []
        for (let j = 0; j < this.nc; j++) fila.push(this.hoja._get(this.r + i, this.c + j))
        out.push(fila)
      }
      return out
    }
    getValue() { stats.lecturas++; return this.hoja._get(this.r, this.c) }
    setValues(m) {
      stats.escrituras++
      if (m.length !== this.nr || (m[0] && m[0].length !== this.nc)) throw new Error('Las dimensiones del rango no coinciden con las de los datos')
      m.forEach((fila, i) => fila.forEach((v, j) => this.hoja._set(this.r + i, this.c + j, v)))
      return this
    }
    getRow() { return this.r }
    setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.hoja.formatos[this.c + j] = f; return this }
    setDataValidation(v) { this.hoja.validaciones.push({ r: this.r, c: this.c, v }); return this }
    setFontWeight() { return this } setBackground() { return this } setFontColor() { return this }
    applyRowBanding() { this.hoja.bandings.push({}); return this }
    clearContent() {
      stats.escrituras++
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.hoja._set(this.r + i, this.c + j, '', true)
      return this
    }
    createTextFinder(texto) {
      const rango = this
      let entera = false
      const f = {
        matchEntireCell(b) { entera = b; return f },
        findNext() {
          stats.lecturas++
          for (let i = 0; i < rango.nr; i++) for (let j = 0; j < rango.nc; j++) {
            const v = String(rango.hoja._get(rango.r + i, rango.c + j))
            if (entera ? v === texto : v.includes(texto)) return new Rango(rango.hoja, rango.r + i, rango.c + j, 1, 1)
          }
          return null
        },
      }
      return f
    }
  }
  class Hoja {
    constructor(nombre, filas = 1000, cols = 26) {
      this.nombre = nombre; this.datos = []; this.maxFilas = filas; this.maxCols = cols
      this.formatos = {}; this.validaciones = []; this.bandings = []; this.protecciones = []; this.congeladas = 0
    }
    _get(r, c) { const f = this.datos[r - 1]; const v = f ? f[c - 1] : undefined; return v === undefined ? '' : v }
    _set(r, c, v, limpiar = false) {
      if (r < 1 || c < 1) throw new Error('Rango fuera de los límites')
      while (this.datos.length < r) this.datos.push([])
      if (r > this.maxFilas) this.maxFilas = r
      if (c > this.maxCols) this.maxCols = c
      if (limpiar) { this.datos[r - 1][c - 1] = ''; return }
      const formato = this.formatos[c]
      let x = v
      if (formato === '@') x = typeof v === 'boolean' ? v : String(v)
      else if (typeof v === 'string' && reFecha.test(v)) x = entorno.nuevaFecha(`${v}T00:00:00-05:00`) // Sheets convierte a fecha
      this.datos[r - 1][c - 1] = x
    }
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Los parámetros del rango son inválidos')
      return new Rango(this, r, c, nr, nc)
    }
    getLastRow() {
      for (let i = this.datos.length - 1; i >= 0; i--) if ((this.datos[i] || []).some((v) => v !== '' && v !== undefined)) return i + 1
      return 0
    }
    getLastColumn() {
      let m = 0
      this.datos.forEach((f) => f.forEach((v, j) => { if (v !== '' && v !== undefined) m = Math.max(m, j + 1) }))
      return m
    }
    getMaxRows() { return this.maxFilas }
    getName() { return this.nombre }
    setFrozenRows(n) { this.congeladas = n; return this }
    setColumnWidth() { return this }
    deleteRow(n) { stats.escrituras++; this.datos.splice(n - 1, 1); return this }
    deleteRows(n, k) { stats.escrituras++; this.datos.splice(n - 1, k); return this }
    getBandings() { return this.bandings }
    getProtections() { return this.protecciones }
    protect() {
      const p = { setWarningOnly() { return p }, setDescription() { return p } }
      this.protecciones.push(p); return p
    }
  }
  class Libro {
    constructor(nombre = 'Deejota Finanzas (sim)') {
      this.id = 'sim-libro-' + crypto.randomBytes(6).toString('hex'); this.nombre = nombre; this.hojas = [new Hoja('Hoja 1')]
    }
    getId() { return this.id } getName() { return this.nombre } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id }
    getSpreadsheetTimeZone() { return tz }
    getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) ?? null }
    getSheets() { return [...this.hojas] }
    insertSheet(n) {
      if (this.getSheetByName(n)) throw new Error(`Ya existe una hoja con el nombre "${n}".`)
      const h = new Hoja(n); this.hojas.push(h); return h
    }
    deleteSheet(h) { this.hojas = this.hojas.filter((x) => x !== h) }
  }
  const libros = new Map()
  const principal = new Libro()
  libros.set(principal.id, principal)

  /* ------------------------------ Servicios ------------------------------ */
  const mapaCache = new Map()
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => { stats.cache++; if (estado.cacheFalla) throw new Error('Cache no disponible'); return mapaCache.has(k) ? mapaCache.get(k) : null },
      put: (k, v) => { stats.cache++; if (estado.cacheFalla) throw new Error('Cache no disponible'); if (String(v).length > 100000) throw new Error('Argumento demasiado grande: value'); mapaCache.set(k, String(v)) },
      putAll: (o) => { stats.cache++; if (estado.cacheFalla) throw new Error('Cache no disponible'); Object.entries(o).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('Argumento demasiado grande: value'); mapaCache.set(k, String(v)) }) },
      remove: (k) => { mapaCache.delete(k) },
      removeAll: (ks) => ks.forEach((k) => mapaCache.delete(k)),
    }),
  }
  const props = new Map()
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => { stats.props++; return props.has(k) ? props.get(k) : null },
      setProperty: (k, v) => { stats.props++; props.set(k, String(v)) },
      deleteProperty: (k) => { props.delete(k) },
    }),
  }
  let bloqueado = false
  const LockService = {
    getScriptLock: () => ({
      waitLock: () => { stats.bloqueos++; if (estado.contiendaLock || bloqueado) throw new Error('No se pudo obtener el bloqueo: Se agotó el tiempo de espera'); bloqueado = true },
      releaseLock: () => { bloqueado = false },
    }),
  }
  const aSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b))
  const blob = (bytes, tipo) => ({ _b: Buffer.from(bytes), getBytes: () => aSigned(Buffer.from(bytes)), getDataAsString: () => Buffer.from(bytes).toString('utf8'), getContentType: () => tipo })
  const Utilities = {
    formatDate: (d, z, p) => formatear(d, z, p),
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, txt) => aSigned(crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(typeof txt === 'string' ? txt : Buffer.from(txt)).digest()),
    base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : x).toString('base64'),
    base64Decode: (s) => aSigned(Buffer.from(s, 'base64')),
    newBlob: (datos, tipo) => blob(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : Buffer.from(datos), tipo),
    gzip: (b) => blob(zlib.gzipSync(b._b), 'application/x-gzip'),
    ungzip: (b) => blob(zlib.gunzipSync(b._b), 'text/plain'),
  }
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (t) => { const o = { _t: t, setMimeType: () => o, getContent: () => t }; return o },
  }
  const MimeType = { CSV: 'text/csv' }
  const carpetas = new Map()
  const crearArchivo = (nombre, contenido, tipo) => { const a = { id: 'sim-file-' + crypto.randomBytes(5).toString('hex'), nombre, contenido, tipo }; archivosDrive.push(a); return a }
  const DriveApp = {
    getFileById: (id) => {
      const l = libros.get(id)
      if (!l) throw new Error('No se encontró el archivo')
      return { makeCopy: (nombre) => { const c = new Libro(nombre); c.hojas = l.hojas.map((h) => Object.assign(new Hoja(h.nombre), { datos: JSON.parse(JSON.stringify(h.datos)) })); libros.set(c.id, c); archivosDrive.push({ id: c.id, nombre, copiaDe: id }); return { getId: () => c.id, getUrl: () => c.getUrl() } } }
    },
    getFolderById: (id) => {
      if (!carpetas.has(id)) throw new Error('No se encontró la carpeta')
      return { getName: () => carpetas.get(id), createFile: (n, c, t) => crearArchivo(n, c, t) }
    },
    createFile: (n, c, t) => crearArchivo(n, c, t),
  }
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => principal,
    openById: (id) => { const l = libros.get(id); if (!l) throw new Error('No se encontró el documento con ID ' + id); return l },
    newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b },
    BandingTheme: { LIGHT_GREY: 'LIGHT_GREY' },
    ProtectionType: { SHEET: 'SHEET' },
  }
  const consola = {
    log: (...a) => logs.push(a.join(' ')),
    error: (...a) => errores.push(a.join(' ')),
    warn: (...a) => logs.push(a.join(' ')),
  }

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

  const entorno = {
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
