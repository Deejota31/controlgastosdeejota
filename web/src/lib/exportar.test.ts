import { describe, expect, it } from 'vitest'
import { aCsv, aXlsx, crc32, neutralizar } from './exportar'

describe('neutralización de fórmulas', () => {
  it.each(['=1+1', '+SUMA(A1)', '-2', '@cmd', '\tx', '\rx'])('%j se guarda como texto', (s) => {
    expect(neutralizar(s)).toBe(`'${s}`)
  })
  it('no toca texto normal', () => expect(neutralizar('Café')).toBe('Café'))
})

describe('CSV', () => {
  it('escapa comillas, comas y saltos, y neutraliza fórmulas', () => {
    const csv = aCsv([['a', 'b,c', 'd"e', '=HYPERLINK("x")'], [1.5, null, true, 'x\ny']])
    expect(csv.startsWith('﻿')).toBe(true)
    const lineas = csv.slice(1).split('\r\n')
    expect(lineas[0]).toBe('a,"b,c","d""e",\'=HYPERLINK("x")'.replace(`'=HYPERLINK("x")`, `"'=HYPERLINK(""x"")"`))
    expect(csv).toContain('1.5,,SI,"x\ny"')
  })
})

describe('XLSX', () => {
  const zip = aXlsx('Mov', [['=EVIL()', 12.5, 'a<b&c']])
  const texto = new TextDecoder().decode(zip)
  it('es un zip con la firma y el fin de directorio', () => {
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(texto).toContain('xl/worksheets/sheet1.xml')
  })
  it('neutraliza fórmulas, escapa XML y guarda números como números', () => {
    expect(texto).toContain("'=EVIL()")
    expect(texto).not.toMatch(/<f>/)
    expect(texto).toContain('a&lt;b&amp;c')
    expect(texto).toContain('<v>12.5</v>')
  })
  it('el directorio central lista las 5 partes y cada CRC coincide con su contenido', () => {
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const fin = zip.length - 22
    expect(dv.getUint32(fin, true)).toBe(0x06054b50)
    const n = dv.getUint16(fin + 10, true)
    expect(n).toBe(5)
    let o = dv.getUint32(fin + 16, true)
    for (let i = 0; i < n; i++) {
      expect(dv.getUint32(o, true)).toBe(0x02014b50)
      const crc = dv.getUint32(o + 16, true)
      const tam = dv.getUint32(o + 24, true)
      const nom = dv.getUint16(o + 28, true)
      const extra = dv.getUint16(o + 30, true)
      const com = dv.getUint16(o + 32, true)
      const local = dv.getUint32(o + 42, true)
      const datos = zip.slice(local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true))
      expect(crc32(datos.slice(0, tam))).toBe(crc)
      o += 46 + nom + extra + com
    }
  })
  it('crc32 conocido', () => expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926))
})
