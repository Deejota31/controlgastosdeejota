import { describe, expect, it } from 'vitest'
import { validarUrlWebApp } from './url'

const ID = 'AKfycbxAbCdEfGhIjKlMnOpQrStUv'
describe('validarUrlWebApp (AUD-09)', () => {
  it('acepta las formas legítimas', () => {
    expect(validarUrlWebApp(`https://script.google.com/macros/s/${ID}/exec`)).toBeNull()
    expect(validarUrlWebApp(`https://script.google.com/a/macros/midominio.com/s/${ID}/exec`)).toBeNull()
  })
  it.each([
    ['', 'Pega'],
    ['no es url', 'no es válida'],
    [`http://script.google.com/macros/s/${ID}/exec`, 'https'],
    [`https://evil.com/macros/s/${ID}/exec`, 'script.google.com'],
    [`https://script.google.com.evil.com/macros/s/${ID}/exec`, 'script.google.com'],
    [`https://user:pw@script.google.com/macros/s/${ID}/exec`, 'usuario'],
    [`https://script.google.com:8443/macros/s/${ID}/exec`, 'puerto'],
    [`https://script.google.com/macros/s/${ID}/exec?token=1`, 'parámetros'],
    [`https://script.google.com/macros/s/${ID}/exec#x`, 'parámetros'],
    [`https://script.google.com/macros/s/${ID}/dev`, '/exec'],
    ['https://script.google.com/macros/s/corto/exec', 'ruta'],
    [`https://script.google.com/otra/s/${ID}/exec`, 'ruta'],
  ])('rechaza %s', (url, texto) => {
    expect(validarUrlWebApp(url)).toContain(texto)
  })
})
