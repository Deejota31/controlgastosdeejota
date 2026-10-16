// Presupuesto de bundle inicial: JS + CSS de entrada ≤ 130 KB gzip.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const LIMITE_KB = 130
const dir = new URL('../dist/assets/', import.meta.url).pathname
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const usados = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]))
let total = 0
for (const f of readdirSync(dir)) {
  if (!usados.has(f)) continue
  const kb = gzipSync(readFileSync(join(dir, f))).length / 1024
  total += kb
  console.log(`${f}: ${kb.toFixed(1)} KB gzip`)
}
console.log(`Bundle inicial: ${total.toFixed(1)} KB gzip (límite ${LIMITE_KB} KB)`)
if (total > LIMITE_KB) {
  console.error('Presupuesto de bundle superado')
  process.exit(1)
}
