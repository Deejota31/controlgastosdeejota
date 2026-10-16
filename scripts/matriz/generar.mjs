import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUD, GEN } from './filas-a.mjs'
import { FIN, UX } from './filas-b.mjs'
import { BKD, FRT, BAR, MOV, CTL, SAL, PLN, CFG, E2E, QA, DEP } from './filas-c.mjs'
import { ESTADOS } from './estado.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const filas = [...AUD, ...GEN, ...FIN, ...UX, ...BKD, ...FRT, ...BAR, ...MOV, ...CTL, ...SAL, ...PLN, ...CFG, ...E2E, ...QA, ...DEP]
const VALIDOS = new Set(['pendiente', 'en curso', 'implementado sin verificar', 'verificado en demo', 'verificado en integración', 'bloqueado'])
const ids = new Set()
for (const f of filas) {
  if (ids.has(f[0])) throw new Error(`ID repetido ${f[0]}`)
  ids.add(f[0])
}
for (const k of Object.keys(ESTADOS)) if (!ids.has(k)) throw new Error(`Estado de un ID inexistente: ${k}`)
const esc = (s = '') => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ')
const cuenta = {}
const cuerpo = filas.map(([id, req, origen, pantalla, api]) => {
  const s = ESTADOS[id] ?? {}
  const e = s.e ?? 'pendiente'
  if (!VALIDOS.has(e)) throw new Error(`Estado inválido en ${id}: ${e}`)
  cuenta[e] = (cuenta[e] ?? 0) + 1
  // La evidencia citada como archivo debe existir.
  for (const t of String(s.test ?? '').split(/[,+]/).map((x) => x.trim()).filter((x) => /\.(test|spec)\./.test(x))) {
    const nombre = t.split(' ')[0]
    const candidatos = [nombre, `web/src/${nombre}`, `web/tests-backend/${nombre}`, `web/e2e/${nombre}`, `web/${nombre}`]
    if (!candidatos.some((c) => existsSync(join(raiz, c))) && !process.argv.includes('--sin-comprobar')) {
      // Búsqueda por nombre de archivo en todo el árbol de pruebas conocido
      const base = nombre.split('/').pop()
      const hallado = ['web/src', 'web/tests-backend', 'web/e2e'].some((d) => existsSync(join(raiz, d)) && JSON.stringify(listar(join(raiz, d))).includes(base))
      if (!hallado) throw new Error(`${id}: la prueba "${nombre}" no existe`)
    }
  }
  return `| ${id} | ${esc(req)} | ${origen} | ${esc(pantalla)} | ${esc(s.impl)} | ${esc(api)} | ${esc(s.test)} | ${esc(s.integ)} | ${esc(s.evid)} | ${e} | ${esc(s.bloq)} |`
})
import { readdirSync, statSync } from 'node:fs'
function listar(d, acc = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) {
      if (n !== 'node_modules') listar(p, acc)
    } else acc.push(n)
  }
  return acc
}
const resumen = Object.entries(cuenta).map(([k, v]) => `- ${k}: **${v}**`).join('\n')
const md = `# Matriz de requisitos — Deejota Finanzas

> Generada con \`node scripts/matriz/generar.mjs\` desde \`scripts/matriz/filas-*.mjs\` (requisitos) y \`scripts/matriz/estado.mjs\` (estado y evidencia). No editar a mano.
>
> **Criterio:** «verificado en demo» significa probado con el simulador de Apps Script, la demo en memoria o el navegador; **no** equivale a integración real. «verificado en integración» exige backend y Google Sheets reales de prueba con relectura independiente.

## Resumen (${filas.length} requisitos)

${resumen}

## Requisitos

| ID | requisito | origen/sección | pantalla/acción | implementación | API/hoja implicada | prueba automatizada | prueba de integración | evidencia | estado | bloqueo |
|---|---|---|---|---|---|---|---|---|---|---|
${cuerpo.join('\n')}
`
const destino = join(raiz, 'docs', 'MATRIZ-REQUISITOS.md')
if (process.argv.includes('--check')) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : ''
  if (actual !== md) {
    console.error('docs/MATRIZ-REQUISITOS.md está desactualizada. Ejecuta: node scripts/matriz/generar.mjs')
    process.exit(1)
  }
  console.log('Matriz al día')
} else {
  writeFileSync(destino, md)
  console.log(`Matriz: ${filas.length} filas`, cuenta)
}
