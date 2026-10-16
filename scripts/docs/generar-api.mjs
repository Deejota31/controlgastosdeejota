// Genera docs/API.md a partir de Code.gs (tabla de acciones y campos) + texto fijo del contrato.
//   node scripts/docs/generar-api.mjs          → reescribe docs/API.md
//   node scripts/docs/generar-api.mjs --check  → falla si docs/API.md está desactualizado
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const gs = fs.readFileSync(path.join(raiz, 'apps-script/Code.gs'), 'utf8')
const num = (n) => Number(new RegExp(`var ${n} = (\\d+)`).exec(gs)?.[1])
const VERSION = /var VERSION = '([^']+)'/.exec(gs)[1]
const ESQUEMA = num('SCHEMA_VERSION')
const MAX_LOTE = num('MAX_LOTE')
const LIMITE = num('LIMITE_PETICIONES_MIN')

const acciones = [...gs.matchAll(/'([A-Za-z.]+)': \{ fn: (?:function \(\) \{ return )?(\w+)(?:\(\); \})?, escribe: (true|false) \}/g)].map(([, nombre, fn, esc]) => {
  const cuerpo = new RegExp(`\\nfunction ${fn}\\(p\\) \\{(.*?)\\n\\}\\n`, 's').exec(gs)?.[1] ?? ''
  const campos = []
  for (const c of [...cuerpo.matchAll(/\bv[A-Z][A-Za-z]*\(p, '([a-z_0-9]+)'/g), ...cuerpo.matchAll(/\bp\.([a-z_0-9]+)/g), ...cuerpo.matchAll(/p\['([a-z_0-9]+)'\]/g)].map((m) => m[1])) {
    if (!campos.includes(c)) campos.push(c)
  }
  return { nombre, escribe: esc === 'true', campos }
})

const grupo = (n) => n.split('.')[0]
const filas = acciones.map((a) => `| \`${a.nombre}\` | ${a.escribe ? 'escritura' : 'lectura'} | ${a.campos.length ? a.campos.map((c) => `\`${c}\``).join(', ') : '—'} |`).join('\n')

const md = `# API de Deejota Finanzas (Apps Script)

> Generado por \`node scripts/docs/generar-api.mjs\` desde \`apps-script/Code.gs\` (versión **${VERSION}**, esquema **${ESQUEMA}**). No editar a mano: CI comprueba que coincide.
> Ningún ejemplo contiene secretos reales: los tokens y URLs son marcadores.

## 1. Transporte

- **POST** a la URL de la aplicación web (\`https://script.google.com/macros/s/<id>/exec\`), cuerpo JSON como \`text/plain;charset=utf-8\` (evita el preflight de CORS). Se siguen las redirecciones de Google.
- El token viaja **en el cuerpo**, nunca en la URL. No se usa \`no-cors\` para lecturas ni escrituras de negocio; el único \`GET\` es un ping opaco de calentamiento que no autentica.
- **GET** público: devuelve solo \`{ "ok": true, "ping": true, "version": "${VERSION}" }\`.
- Tamaño máximo del cuerpo: 1 000 000 de caracteres → \`VALIDATION\`.
- La app valida la URL antes de enviar el token: https, host \`script.google.com\`, ruta \`/macros/s/<id>/exec\` (o \`/a/macros/<dominio>/s/<id>/exec\`), sin usuario/contraseña, puerto, parámetros ni \`#\`.

## 2. Petición

\`\`\`json
{ "action": "movimiento.guardar", "payload": { "...": "..." }, "token": "<token>", "requestId": "r0123456789abcdef0123456789abcd" }
\`\`\`

- \`requestId\` es **obligatorio en toda escritura** (\`^[A-Za-z0-9_-]{8,64}$\`) y se genera **una sola vez por operación lógica**; los reintentos usan el mismo.
- Los ids de entidades (\`id\`, \`lote_id\`) los genera el cliente (UUID con prefijo) para que reintentar no duplique.
- Hay dos tokens: el **maestro** (todas las acciones) y el del **atajo** (solo \`atajo.*\`). Cinco fallos seguidos bloquean temporalmente con espera creciente. Límite: ${LIMITE} peticiones por minuto → \`QUOTA\`.

## 3. Respuesta

Éxito:
\`\`\`json
{ "ok": true, "data": { }, "ms": 120, "version": "${VERSION}", "generacion": "<uuid>", "repetido": true }
\`\`\`
\`repetido: true\` indica que el servidor devolvió el resultado original de una petición ya aplicada (nada se volvió a escribir).

Error:
\`\`\`json
{ "ok": false, "error": { "code": "CONFLICT", "message": "…", "campo": "version", "detalle": { } }, "ms": 8, "version": "${VERSION}" }
\`\`\`

| Código | Significado | ¿Reintentar igual? |
|---|---|---|
| \`AUTH\` | Token inválido o bloqueo temporal | No (se espera a corregir la conexión; lo escrito se conserva) |
| \`VALIDATION\` | Datos inválidos (\`campo\` indica cuál) | No |
| \`NOT_FOUND\` | La entidad ya no existe | No |
| \`CONFLICT\` | Versión desactualizada **o** \`requestId\` reutilizado con otros datos (\`campo: "requestId"\`) | No: releer y decidir |
| \`SCHEMA\` | Hoja, encabezados o versión incompatibles | No |
| \`BUSY\` | El bloqueo de escritura no se obtuvo en 10 s; **no se ejecutó nada** | Sí |
| \`QUOTA\` | Límite de Google o de peticiones por minuto | Sí, con espera |
| \`SERVER_ERROR\` | Error interno (el detalle queda solo en los registros) | Sí |
| \`RED\`, \`TIEMPO\` | (cliente) sin conexión o sin respuesta: el resultado es **desconocido** | Sí, con el mismo \`requestId\` |

## 4. Idempotencia y operaciones todo-o-nada

1. Antes de ejecutar, el servidor calcula una **huella** estable de \`acción + payload\` (independiente del orden de las claves).
2. Si el \`requestId\` ya se aplicó: con la **misma huella** devuelve la respuesta original (\`repetido: true\`) sin escribir; con **otra huella** responde \`CONFLICT\` (\`campo: "requestId"\`).
3. El registro de operaciones aplicadas es **durable**: vive en la hoja interna \`_meta\` (\`op:<requestId>\`), no solo en la caché de 500 entradas. Se conservan las últimas ${num('MANTENER_OPERACIONES')} (se recorta al superar ${num('MAX_OPERACIONES')}).
4. Cada escritura toma el bloqueo del script y recorre **preparar → aplicar → confirmar**:
   - *preparar*: se crea \`op:<requestId>\` (estado \`en_curso\`) y se marca \`OP_EN_CURSO\` en las propiedades del script;
   - *aplicar*: antes de cada escritura a una hoja se guarda cómo deshacerla (\`opu:<n>\`, imagen previa de las filas);
   - *confirmar*: una sola celda deja la operación en \`ok\` junto con la respuesta (punto de commit). Después se limpia el deshacer y se recortan huellas y auditoría.
5. Si algo falla antes de confirmar, la operación se **revierte** (en orden inverso) y el cliente recibe el error: lo que ve el cliente nunca es un estado a medias.
6. Si la ejecución muere (por ejemplo, tiempo agotado), \`OP_EN_CURSO\` queda marcado y **la siguiente petición —lectura o escritura— la deshace** antes de continuar (la recuperación es reanudable). Si la caída fue posterior al commit, solo se limpia.
7. La auditoría y la generación de caché forman parte de la operación: se revierten con ella.

**Respuesta perdida**: el cliente deja la escritura como *por confirmar* y la reenvía con el mismo \`requestId\`; recibe la respuesta original. Nunca se duplica.

## 5. Versionado

- \`bootstrap\` devuelve \`version_backend\` y \`esquema\`. La app exige \`version_backend ≥ 1.0.0\` y \`esquema = ${ESQUEMA}\` **antes** de guardar la conexión o enviar escrituras; si no, muestra un mensaje accionable y deja lo pendiente en la cola.
- Las entidades mutables llevan \`version\` (entero) y \`actualizado_en\`. Editar exige enviar la versión leída; si cambió, \`CONFLICT\` con \`detalle.actual\` (la fila vigente).

## 6. Lotes

- \`movimientos.lote\`: máximo ${MAX_LOTE} filas; se prevalidan **todas** (campos y referencias) antes de escribir; se deduplican por \`lote_id\`; se aplican como una sola operación (todo o nada).
- \`movimientos.accionLote\`: acción masiva sobre ids existentes, también todo o nada.
- \`movimientos.estadoLote\`: consulta de solo lectura de un \`lote_id\`.

## 7. Acciones

Los campos listados son los que el servidor lee del \`payload\` (los obligatorios y sus formatos los valida el servidor y se describen en \`docs/MODELO-DATOS.md\`).

| Acción | Tipo | Campos del payload |
|---|---|---|
${filas}

Total: ${acciones.length} acciones en ${new Set(acciones.map((a) => grupo(a.nombre))).size} grupos.

## 8. Ejemplos (sin secretos)

Alta de un gasto:
\`\`\`json
{
  "action": "movimiento.guardar",
  "requestId": "r7c1e2d3a4b5f60718293a4b5c6d7e8",
  "token": "<token>",
  "payload": { "id": "mov-1f0c…", "fecha": "2026-10-15", "monto": 25.5, "moneda": "PEN", "ambito_id": "<id>", "categoria_id": "<id>", "subcategoria_id": "<id>", "medio_pago_id": "<id>", "descripcion": "menú del día" }
}
\`\`\`
Reenvío con otros datos y el mismo \`requestId\` → \`{ "ok": false, "error": { "code": "CONFLICT", "campo": "requestId", … } }\`.

Lectura incremental:
\`\`\`json
{ "action": "cambios", "payload": { "generacion": "<última>", "desde": "2026-10-15T20:00:00.000Z" }, "token": "<token>" }
\`\`\`
`

const destino = path.join(raiz, 'docs/API.md')
if (process.argv.includes('--check')) {
  const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : ''
  if (actual !== md) {
    console.error('docs/API.md está desactualizado. Ejecuta: node scripts/docs/generar-api.mjs')
    process.exit(1)
  }
  console.log('docs/API.md al día')
} else {
  fs.writeFileSync(destino, md)
  console.log(`docs/API.md generado (${acciones.length} acciones)`)
}
