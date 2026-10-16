/**
 * Núcleo del simulador de Apps Script, SIN dependencias de Node: lo usan las pruebas (gas-sim.mjs)
 * y el modo demostración del navegador (que ejecuta el Code.gs real contra un libro en memoria).
 */
const reFecha = /^\d{4}-\d{2}-\d{2}$/

export function formatear(fecha, tz, patron) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha)
  const g = (t) => partes.find((p) => p.type === t).value
  return patron
    .replace('yyyy', g('year')).replace('MM', g('month')).replace('dd', g('day'))
    .replace('HH', g('hour')).replace('mm', g('minute')).replace('ss', g('second'))
}

const aleatorio = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * @param {{ tz: string, nuevaFecha: (s: string) => Date, extras?: object }} cfg
 *   extras.Utilities: funciones adicionales (gzip, ungzip, computeDigest...) según la plataforma.
 */
export function crearServicios(cfg) {
  const { tz } = cfg
  const stats = { lecturas: 0, escrituras: 0, cache: 0, props: 0, bloqueos: 0 }
  const logs = []
  const errores = []
  const archivosDrive = []
  // crashEn: la escritura n-ésima "mata" la ejecución (después nada más se escribe); falloEn: lanza un error y la ejecución sigue viva.
  const estado = { contiendaLock: false, cacheFalla: false, muerto: false, crashEn: 0, falloEn: 0 }
  const escritura = () => {
    if (estado.muerto) throw new Error('__CRASH__ la ejecución ya terminó')
    if (estado.crashEn > 0 && --estado.crashEn === 0) { estado.muerto = true; throw new Error('__CRASH__') }
    if (estado.falloEn > 0 && --estado.falloEn === 0) throw new Error('Fallo simulado de escritura (cuota o servicio)')
  }
  const entorno = { nuevaFecha: cfg.nuevaFecha }
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
      escritura()
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
      escritura()
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
      if (limpiar) { this.datos[r - 1][c - 1] = ''; return }
      const formato = this.formatos[c]
      let x = v
      if (formato === '@') x = typeof v === 'boolean' ? v : String(v)
      else if (typeof v === 'string' && reFecha.test(v)) x = entorno.nuevaFecha(`${v}T00:00:00-05:00`) // Sheets convierte a fecha
      this.datos[r - 1][c - 1] = x
    }
    getRange(r, c, nr = 1, nc = 1) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Los parámetros del rango son inválidos')
      if (r + nr - 1 > this.maxFilas || c + nc - 1 > this.maxCols) throw new Error('Las coordenadas o dimensiones del rango están fuera de las dimensiones de la hoja.')
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
    deleteRow(n) { return this.deleteRows(n, 1) }
    deleteRows(n, k) { escritura(); stats.escrituras++; this.datos.splice(n - 1, k); this.maxFilas = Math.max(1, this.maxFilas - k); return this }
    insertRowBefore(n) { escritura(); stats.escrituras++; while (this.datos.length < n - 1) this.datos.push([]); this.datos.splice(n - 1, 0, []); this.maxFilas++; return this }
    insertRowsAfter(n, k) { escritura(); stats.escrituras++; this.maxFilas += k; return this }
    getBandings() { return this.bandings }
    getProtections() { return this.protecciones }
    protect() {
      const p = { setWarningOnly() { return p }, setDescription() { return p } }
      this.protecciones.push(p); return p
    }
  }
  class Libro {
    constructor(nombre = 'Deejota Finanzas (sim)') {
      this.id = 'sim-libro-' + aleatorio(6); this.nombre = nombre; this.hojas = [new Hoja('Hoja 1')]
    }
    getId() { return this.id } getName() { return this.nombre } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id }
    getSpreadsheetTimeZone() { return this.zona ?? tz } setSpreadsheetTimeZone(z) { this.zona = z }
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
      put: (k, v) => { stats.cache++; if (estado.muerto) throw new Error('__CRASH__'); if (estado.cacheFalla) throw new Error('Cache no disponible'); if (String(v).length > 100000) throw new Error('Argumento demasiado grande: value'); mapaCache.set(k, String(v)) },
      putAll: (o) => { stats.cache++; if (estado.muerto) throw new Error('__CRASH__'); if (estado.cacheFalla) throw new Error('Cache no disponible'); Object.entries(o).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('Argumento demasiado grande: value'); mapaCache.set(k, String(v)) }) },
      remove: (k) => { mapaCache.delete(k) },
      removeAll: (ks) => ks.forEach((k) => mapaCache.delete(k)),
    }),
  }
  const props = new Map()
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => { stats.props++; return props.has(k) ? props.get(k) : null },
      setProperty: (k, v) => { stats.props++; if (estado.muerto) throw new Error('__CRASH__'); props.set(k, String(v)) },
      deleteProperty: (k) => { if (estado.muerto) throw new Error('__CRASH__'); props.delete(k) },
    }),
  }
  let bloqueado = false
  const LockService = {
    getScriptLock: () => ({
      waitLock: () => { stats.bloqueos++; if (estado.contiendaLock || bloqueado) throw new Error('No se pudo obtener el bloqueo: Se agotó el tiempo de espera'); bloqueado = true },
      releaseLock: () => { bloqueado = false },
    }),
  }
  const Utilities = {
    formatDate: (d, z, p) => formatear(d, z, p),
    getUuid: () => globalThis.crypto.randomUUID(),
    DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    base64Encode: (x) => cfg.extras.base64Encode(x),
    base64Decode: (s) => cfg.extras.base64Decode(s),
    ...cfg.extras?.Utilities,
  }
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (t) => { const o = { _t: t, setMimeType: () => o, getContent: () => t }; return o },
  }
  const MimeType = { CSV: 'text/csv' }
  const carpetas = new Map()
  const crearArchivo = (nombre, contenido, tipo) => { const a = { id: 'sim-file-' + aleatorio(5), nombre, contenido, tipo }; archivosDrive.push(a); return a }
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
    getActiveSpreadsheet: () => (cfg.sinLibroActivo ? null : principal),
    create: (nombre) => { const l = new Libro(nombre); libros.set(l.id, l); return l },
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


  return { SpreadsheetApp, CacheService, PropertiesService, LockService, Utilities, ContentService, MimeType, DriveApp, console: consola,
    stats, logs, errores, archivosDrive, estado, libro: principal, libros, props, cache: mapaCache, carpetas, Libro, Hoja, entorno }
}
