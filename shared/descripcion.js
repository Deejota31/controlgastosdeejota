/**
 * Normalización de descripciones — ÚNICA fuente de verdad.
 * Se importa en el frontend y se inyecta tal cual en apps-script/Code.gs
 * (scripts/sync-shared.mjs). No usar sintaxis que Apps Script (V8) no soporte.
 *
 * Reglas:
 *  - Mayúscula inicial en cada palabra; conectores en minúscula (salvo la primera).
 *  - Las excepciones (ChatGPT, iPhone, YouTube, USD, API…) conservan su escritura exacta,
 *    sin distinguir mayúsculas al detectarlas.
 *  - Idempotente: normalizar(normalizar(x)) === normalizar(x).
 *  - No reescribe registros antiguos: solo se aplica al guardar.
 */
export var EXCEPCIONES_DESCRIPCION_DEFECTO = ['ChatGPT', 'iPhone', 'YouTube', 'USD', 'PEN', 'API', 'SOAT', 'HBO', 'WiFi']

export var CONECTORES_DESCRIPCION = ['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'u', 'un', 'una', 'y']

export function normalizarDescripcion(texto, excepciones) {
  var base = String(texto == null ? '' : texto)
    .replace(/\s+/g, ' ')
    .trim()
  if (!base) return ''
  var lista = excepciones && excepciones.length ? excepciones : EXCEPCIONES_DESCRIPCION_DEFECTO
  var mapaExc = {}
  for (var i = 0; i < lista.length; i++) {
    var ex = String(lista[i]).trim()
    if (ex) mapaExc[ex.toLowerCase()] = ex
  }
  var palabras = base.split(' ')
  for (var j = 0; j < palabras.length; j++) {
    var p = palabras[j]
    // separa puntuación final/inicial para detectar excepciones ("ChatGPT," → "chatgpt")
    var m = /^([^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*)(.*?)([^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*)$/.exec(p)
    var pre = m ? m[1] : ''
    var nucleo = m ? m[2] : p
    var post = m ? m[3] : ''
    var nucleoMin = nucleo.toLowerCase()
    var nuevo
    if (mapaExc[nucleoMin]) {
      nuevo = mapaExc[nucleoMin]
    } else if (j > 0 && CONECTORES_DESCRIPCION.indexOf(nucleoMin) !== -1) {
      nuevo = nucleoMin
    } else if (nucleo.length === 0) {
      nuevo = nucleo
    } else {
      nuevo = nucleoMin.charAt(0).toUpperCase() + nucleoMin.slice(1)
    }
    palabras[j] = pre + nuevo + post
  }
  return palabras.join(' ')
}
