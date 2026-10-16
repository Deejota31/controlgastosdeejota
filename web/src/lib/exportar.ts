/** Exportación a CSV y XLSX sin dependencias. Todo texto que pudiera interpretarse como fórmula se neutraliza. */
export type Celda = string | number | boolean | null | undefined

/** Un texto que empieza por = + - @ tab o CR se guarda como texto literal (apóstrofo inicial). */
export function neutralizar(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function textoCelda(c: Celda): string {
  if (c === null || c === undefined) return ''
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : ''
  if (typeof c === 'boolean') return c ? 'SI' : 'NO'
  return neutralizar(c)
}

export function aCsv(filas: Celda[][]): string {
  const esc = (c: Celda) => {
    const s = textoCelda(c)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + filas.map((f) => f.map(esc).join(',')).join('\r\n')
}

const xml = (s: string) =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function columna(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** ZIP sin compresión (método «store»): suficiente y válido para un .xlsx. */
export function crearZip(archivos: Array<{ nombre: string; contenido: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder()
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let desplazamiento = 0
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre)
    const crc = crc32(a.contenido)
    const cab = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(a.contenido.length), ...u32(a.contenido.length), ...u16(nombre.length), ...u16(0),
    ])
    partes.push(cab, nombre, a.contenido)
    central.push(
      Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(a.contenido.length), ...u32(a.contenido.length), ...u16(nombre.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(desplazamiento),
      ]),
      nombre,
    )
    desplazamiento += cab.length + nombre.length + a.contenido.length
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0)
  const fin = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCentral), ...u32(desplazamiento), ...u16(0)])
  const todo = [...partes, ...central, fin]
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of todo) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function aXlsx(nombreHoja: string, filas: Celda[][]): Uint8Array {
  const enc = new TextEncoder()
  const filasXml = filas
    .map((f, r) => {
      const celdas = f
        .map((c, i) => {
          const ref = `${columna(i)}${r + 1}`
          if (c === null || c === undefined || c === '') return ''
          if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : ''
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(textoCelda(c))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${celdas}</row>`
    })
    .join('')
  const hoja = nombreHoja.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja1'
  const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const archivos = [
    { nombre: '[Content_Types].xml', texto: `${cabecera}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { nombre: '_rels/.rels', texto: `${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: `${cabecera}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(hoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `${cabecera}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', texto: `${cabecera}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>` },
  ]
  return crearZip(archivos.map((a) => ({ nombre: a.nombre, contenido: enc.encode(a.texto) })))
}

export function descargar(nombre: string, datos: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([datos], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
