// Inyecta shared/descripcion.js y shared/catalogo-inicial.json dentro de apps-script/Code.gs
// entre marcadores // <<GENERADO:x>> … // <</GENERADO:x>>.
//   node scripts/sync-shared.mjs          → reescribe Code.gs
//   node scripts/sync-shared.mjs --check  → falla si Code.gs no coincide con shared/
import { readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
const leer = (p) => readFileSync(new URL(p, raiz), 'utf8')

export function bloques() {
  const desc = leer('shared/descripcion.js').replace(/^export\s+/gm, '').trim()
  const cat = JSON.stringify(JSON.parse(leer('shared/catalogo-inicial.json')), null, 2)
  const pal = JSON.stringify(JSON.parse(leer('shared/paleta-colores.json')))
  return {
    descripcion: desc,
    catalogo: `var CATALOGO_INICIAL = ${cat};\nvar PALETA_COLORES = ${pal};`,
  }
}

export function aplicar(codigo) {
  let out = codigo
  for (const [nombre, contenido] of Object.entries(bloques())) {
    const re = new RegExp(`(// <<GENERADO:${nombre}>>\\n)[\\s\\S]*?(\\n// <</GENERADO:${nombre}>>)`)
    if (!re.test(out)) throw new Error(`Faltan los marcadores GENERADO:${nombre} en Code.gs`)
    out = out.replace(re, (_m, a, b) => `${a}${contenido}${b}`)
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ruta = new URL('apps-script/Code.gs', raiz)
  const actual = readFileSync(ruta, 'utf8')
  const nuevo = aplicar(actual)
  if (process.argv.includes('--check')) {
    if (nuevo !== actual) {
      console.error('Code.gs está desincronizado con shared/. Ejecuta: node scripts/sync-shared.mjs')
      process.exit(1)
    }
    console.log('Code.gs sincronizado con shared/')
  } else {
    writeFileSync(ruta, nuevo)
    console.log('Code.gs actualizado desde shared/')
  }
}
