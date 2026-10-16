import { describe, it, expect, beforeEach } from 'vitest'
import { crearEntorno } from '../../apps-script/test/gas-sim.mjs'

let e
let cat // ids de referencia
const nuevoId = (() => { let n = 0; return (p = 'id') => `${p}-test-${String(++n).padStart(6, '0')}` })()

function referencias() {
  const b = e.datos('bootstrap', {})
  const porNombre = (arr, n) => arr.find((x) => x.nombre === n)
  const personal = porNombre(b.hojas.ambitos, 'Personal')
  const alim = porNombre(b.hojas.categorias, 'Alimentación')
  const almuerzo = b.hojas.subcategorias.find((s) => s.categoria_id === alim.id && s.nombre === 'Almuerzo')
  const yape = porNombre(b.hojas.medios_pago, 'Yape')
  return { b, personal, alim, almuerzo, yape }
}
function gasto(extra = {}) {
  return {
    id: nuevoId('mov'), fecha: '2026-10-15', monto: 25.5, moneda: 'PEN', ambito_id: cat.personal.id, categoria_id: cat.alim.id,
    subcategoria_id: cat.almuerzo.id, descripcion: 'menú del día', medio_pago_id: cat.yape.id, ...extra,
  }
}

beforeEach(() => {
  e = crearEntorno()
  e.instalar()
  cat = referencias()
})

describe('setup() en un proyecto suelto (sin hoja asociada)', () => {
  it('crea el libro "Control de Gastos Deejota", lo recuerda y deja todo instalado', () => {
    const x = crearEntorno({ sinLibroActivo: true })
    const rep = x.instalar()
    expect(rep.libro_creado).toBe(true)
    expect(rep.libro_url).toMatch(/docs\.google\.com\/spreadsheets/)
    const creado = [...x.libros.values()].find((l) => l.getName() === 'Control de Gastos Deejota')
    expect(creado).toBeTruthy()
    expect(creado.getSheets()).toHaveLength(23)
    expect(x.props.get('SHEET_ID')).toBe(creado.getId())
    expect(x.props.get('TOKEN')).toBeTruthy()
    // una segunda ejecución reutiliza el mismo libro
    const rep2 = x.instalar()
    expect(rep2.libro_creado).toBe(false)
    expect([...x.libros.values()].filter((l) => l.getName() === 'Control de Gastos Deejota')).toHaveLength(1)
  })
  it('una petición web antes de ejecutar setup se rechaza y no crea nada', () => {
    const x = crearEntorno({ sinLibroActivo: true })
    const r = x.llamar('bootstrap', {})
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('AUTH')
    expect([...x.libros.values()].filter((l) => l.getName() === 'Control de Gastos Deejota')).toHaveLength(0)
  })
})

describe('setup()', () => {
  it('crea las 23 hojas, quita la hoja inicial y siembra el catálogo', () => {
    const nombres = e.libro.getSheets().map((h) => h.getName())
    expect(nombres).toHaveLength(23)
    expect(nombres).not.toContain('Hoja 1')
    expect(cat.b.hojas.ambitos.map((a) => a.nombre)).toEqual(['Personal', 'Trabajo', 'Pareja', 'Familia', 'Amigos'])
    expect(cat.b.hojas.medios_pago.map((m) => m.nombre)).toEqual(['Yape', 'Plin', 'Sodexo', 'Transferencia', 'Efectivo', 'Otros'])
  })
  it('es idempotente: una segunda ejecución no duplica nada ni cambia el token', () => {
    const antes = { amb: e.filas('ambitos').length, subs: e.filas('subcategorias').length, cfg: e.filas('config').length, tk: e.props.get('TOKEN') }
    const rep = e.instalar()
    expect(rep.hojas_creadas).toEqual([])
    expect(rep.semilla_catalogo).toBe(false)
    expect(rep.token_nuevo).toBe(false)
    expect(e.filas('ambitos')).toHaveLength(antes.amb)
    expect(e.filas('subcategorias')).toHaveLength(antes.subs)
    expect(e.filas('config')).toHaveLength(antes.cfg)
    expect(e.props.get('TOKEN')).toBe(antes.tk)
  })
  it('se detiene sin tocar nada si una hoja tiene encabezados distintos', () => {
    e.libro.getSheetByName('ambitos').getRange(1, 2).setValues([['nombre_raro']])
    const foto = JSON.stringify(e.libro.getSheets().map((h) => h.datos))
    expect(() => e.instalar()).toThrow(/encabezados distintos/)
    expect(JSON.stringify(e.libro.getSheets().map((h) => h.datos))).toBe(foto)
  })
  it('deja "Otros" siempre al final en medios, categorías de cada ámbito y subcategorías', () => {
    const { b } = cat
    expect(b.hojas.medios_pago.at(-1).nombre).toBe('Otros')
    for (const a of b.hojas.ambitos) {
      const vinc = b.hojas.ambito_categoria.filter((r) => r.ambito_id === a.id).sort((x, y) => x.orden - y.orden)
      const ultima = b.hojas.categorias.find((c) => c.id === vinc.at(-1).categoria_id)
      expect(ultima.nombre).toBe('Otros')
    }
    for (const c of b.hojas.categorias) {
      const subs = b.hojas.subcategorias.filter((s) => s.categoria_id === c.id).sort((x, y) => x.orden - y.orden)
      expect(subs.at(-1).nombre).toBe('Otros')
    }
  })
  it('guarda texto como texto: las columnas de texto tienen formato "@" y las fechas no se vuelven Date', () => {
    const r = e.llamar('movimiento.guardar', gasto())
    expect(r.ok).toBe(true)
    const fila = e.filas('movimientos')[0]
    expect(typeof fila.fecha).toBe('string')
    expect(fila.fecha).toBe('2026-10-15')
  })
})

describe('seguridad', () => {
  it('rechaza token inválido sin revelar nada', () => {
    const r = e.llamar('bootstrap', {}, { token: 'incorrecto' })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('AUTH')
    expect(r.generacion).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain(e.token)
  })
  it('bloquea tras 5 intentos fallidos, incluso con el token correcto', () => {
    for (let i = 0; i < 5; i++) e.llamar('bootstrap', {}, { token: 'mal' + i })
    const r = e.llamar('bootstrap', {})
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('AUTH')
    expect(r.error.message).toMatch(/intentos/i)
    e.avanzar(61_000)
    expect(e.llamar('bootstrap', {}).ok).toBe(true)
  })
  it('el token del atajo solo sirve para acciones atajo.*', () => {
    const { token } = e.datos('atajo.tokenCrear', {})
    expect(e.llamar('bootstrap', {}, { token }).error.code).toBe('AUTH')
    expect(e.llamar('movimiento.anular', { id: 'x'.repeat(10) }, { token }).error.code).toBe('AUTH')
    expect(e.llamar('atajo.catalogo', {}, { token }).ok).toBe(true)
  })
  it('revocar el token del atajo lo invalida', () => {
    const { token } = e.datos('atajo.tokenCrear', {})
    e.datos('atajo.tokenRevocar', {})
    expect(e.llamar('atajo.catalogo', {}, { token }).error.code).toBe('AUTH')
  })
  it('rechaza acciones desconocidas y cuerpos inválidos', () => {
    expect(e.llamar('formatear.todo', {}).error.code).toBe('VALIDATION')
    expect(e.llamar('constructor', {}).error.code).toBe('VALIDATION')
    expect(e.llamar('__proto__', {}).error.code).toBe('VALIDATION')
    expect(e.post('no es json').error.code).toBe('VALIDATION')
    expect(e.post('[1,2]').error.code).toBe('VALIDATION')
    expect(e.post({ action: 'bootstrap', token: e.token, payload: 5 }).error.code).toBe('VALIDATION')
  })
  it('limita las peticiones por minuto', () => {
    let ultimo
    for (let i = 0; i < 305; i++) ultimo = e.llamar('bootstrap', {})
    expect(ultimo.ok).toBe(false)
    expect(ultimo.error.code).toBe('QUOTA')
    e.avanzar(120_000)
    expect(e.llamar('bootstrap', {}).ok).toBe(true)
  })
  it('nunca devuelve trazas internas', () => {
    const r = e.llamar('movimiento.guardar', { id: 'abc' })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toMatch(/at \w+|\.gs:|stack/i)
  })
})

describe('movimientos', () => {
  it('crea un movimiento, normaliza la descripción y congela monto_base', () => {
    const g = gasto({ descripcion: '  menú   del DÍA  con chatgpt ' })
    const r = e.datos('movimiento.guardar', g)
    expect(r.movimiento.descripcion).toBe('Menú del Día con ChatGPT')
    expect(r.movimiento.monto_base).toBe(25.5)
    expect(r.movimiento.tipo_cambio).toBe(1)
    expect(r.movimiento.version).toBe(1)
    expect(r.movimiento.origen).toBe('web')
    expect(e.filas('movimientos')).toHaveLength(1)
  })
  it('es idempotente por requestId: repetir la petición no duplica ni audita dos veces', () => {
    const g = gasto()
    const rid = 'rid-idempotente-0001'
    const a = e.llamar('movimiento.guardar', g, { requestId: rid })
    const auditoriaAntes = e.filas('auditoria').length
    const b = e.llamar('movimiento.guardar', g, { requestId: rid })
    expect(a.ok && b.ok).toBe(true)
    expect(b.repetido).toBe(true)
    expect(b.data.movimiento.id).toBe(a.data.movimiento.id)
    expect(e.filas('movimientos')).toHaveLength(1)
    expect(e.filas('auditoria')).toHaveLength(auditoriaAntes)
  })
  it('un alta repetida con otro requestId pero el mismo id no duplica', () => {
    const g = gasto()
    e.datos('movimiento.guardar', g)
    const r = e.datos('movimiento.guardar', g)
    expect(r.existente).toBe(true)
    expect(e.filas('movimientos')).toHaveLength(1)
  })
  it('edita con la versión correcta y sube la versión', () => {
    const g = gasto()
    const { movimiento } = e.datos('movimiento.guardar', g)
    const ed = e.datos('movimiento.guardar', { ...g, monto: 30, version: movimiento.version })
    expect(ed.movimiento.version).toBe(2)
    expect(ed.movimiento.monto).toBe(30)
    expect(e.filas('movimientos')[0].monto).toBe(30)
  })
  it('detecta conflictos de versión y devuelve el registro actual', () => {
    const g = gasto()
    const { movimiento } = e.datos('movimiento.guardar', g)
    e.datos('movimiento.guardar', { ...g, monto: 40, version: movimiento.version })
    const r = e.llamar('movimiento.guardar', { ...g, monto: 50, version: movimiento.version })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('CONFLICT')
    expect(r.error.detalle.actual.monto).toBe(40)
    expect(e.filas('movimientos')[0].monto).toBe(40)
  })
  it('anula y restaura sin borrar la fila; un anulado no se edita', () => {
    const g = gasto()
    const { movimiento } = e.datos('movimiento.guardar', g)
    e.datos('movimiento.anular', { id: g.id })
    expect(e.filas('movimientos')).toHaveLength(1)
    expect(e.filas('movimientos')[0].estado).toBe('anulado')
    const bloqueado = e.llamar('movimiento.guardar', { ...g, monto: 99, version: movimiento.version + 1 })
    expect(bloqueado.ok).toBe(false)
    e.datos('movimiento.restaurar', { id: g.id })
    expect(e.filas('movimientos')[0].estado).toBe('activo')
  })
  it.each([
    ['monto negativo', { monto: -5 }, 'monto'],
    ['monto cero', { monto: 0 }, 'monto'],
    ['monto con texto', { monto: 'abc' }, 'monto'],
    ['fecha imposible', { fecha: '2026-02-30' }, 'fecha'],
    ['fecha mal formada', { fecha: '15/10/2026' }, 'fecha'],
    ['moneda no permitida', { moneda: 'USD' }, 'moneda'],
    ['medio inexistente', { medio_pago_id: 'no-existe-123' }, 'medio_pago_id'],
    ['comprobante no https', { comprobante_url: 'http://x.com/a' }, 'comprobante_url'],
    ['tipo de gasto inválido', { tipo_gasto: 'otro' }, 'tipo_gasto'],
  ])('valida: %s', (_n, cambio, campo) => {
    const r = e.llamar('movimiento.guardar', gasto(cambio))
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION')
    expect(r.error.campo).toBe(campo)
    expect(e.filas('movimientos')).toHaveLength(0)
  })
  it('rechaza una subcategoría que no pertenece a la categoría', () => {
    const otra = cat.b.hojas.subcategorias.find((s) => s.categoria_id !== cat.alim.id)
    const r = e.llamar('movimiento.guardar', gasto({ subcategoria_id: otra.id }))
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION')
  })
  it('rechaza una categoría que el ámbito no tiene', () => {
    const trabajo = cat.b.hojas.ambitos.find((a) => a.nombre === 'Trabajo')
    const bebe = cat.b.hojas.categorias.find((c) => c.nombre === 'Bebé')
    const r = e.llamar('movimiento.guardar', gasto({ ambito_id: trabajo.id, categoria_id: bebe.id, subcategoria_id: '' }))
    expect(r.ok).toBe(false)
  })
  it('neutraliza fórmulas: un texto que empieza con "=" se guarda como texto', () => {
    e.datos('movimiento.guardar', gasto({ notas: '=IMPORTXML("http://x")' }))
    const fila = e.filas('movimientos')[0]
    expect(String(fila.notas)).toContain('IMPORTXML')
    expect(e.hoja('movimientos').formatos[19]).toBe('@')
  })
  it('importa un lote y es idempotente', () => {
    const payload = { lote_id: nuevoId('lote'), items: [gasto(), gasto({ descripcion: 'cena' })] }
    const r1 = e.datos('movimientos.lote', payload)
    expect(r1.creados).toBe(2)
    expect(e.filas('movimientos')).toHaveLength(2)
    expect(e.filas('movimientos').every((m) => m.origen === 'lote')).toBe(true)
    const r2 = e.datos('movimientos.lote', payload)
    expect(r2.existente).toBe(true)
    expect(e.filas('movimientos')).toHaveLength(2)
  })
  it('una escritura cuesta pocas llamadas a la hoja', () => {
    e.datos('movimiento.guardar', gasto()) // calienta cachés
    e.reiniciarStats()
    e.datos('movimiento.guardar', gasto())
    expect(e.stats.escrituras).toBeLessThanOrEqual(6)
    expect(e.stats.lecturas).toBeLessThanOrEqual(40)
  })
})

describe('concurrencia y consistencia', () => {
  it('responde BUSY si no consigue el bloqueo y no escribe nada', () => {
    e.estado.contiendaLock = true
    const r = e.llamar('movimiento.guardar', gasto())
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('BUSY')
    e.estado.contiendaLock = false
    expect(e.filas('movimientos')).toHaveLength(0)
  })
  it('las lecturas no toman el bloqueo', () => {
    e.estado.contiendaLock = true
    expect(e.llamar('bootstrap', {}).ok).toBe(true)
  })
  it('cada escritura cambia la generación; las lecturas no', () => {
    const g0 = e.datos('bootstrap', {}).generacion
    const g1 = e.llamar('movimiento.guardar', gasto()).generacion
    expect(g1).not.toBe(g0)
    expect(e.datos('bootstrap', {}).generacion).toBe(g1)
  })
  it('el bootstrap se sirve desde caché y se invalida al escribir', () => {
    e.datos('bootstrap', {})
    expect(e.datos('bootstrap', {}).desde_cache).toBe(true)
    e.datos('movimiento.guardar', gasto())
    const b = e.datos('bootstrap', {})
    expect(b.desde_cache).toBe(false)
    expect(b.hojas.movimientos).toHaveLength(1)
  })
  it('sigue funcionando (más lento) si la caché falla, y el token se sigue validando', () => {
    e.estado.cacheFalla = true
    expect(e.llamar('bootstrap', {}, { token: 'mal' }).error.code).toBe('AUTH')
    expect(e.llamar('bootstrap', {}).ok).toBe(true)
    const g = gasto()
    expect(e.llamar('movimiento.guardar', g).ok).toBe(true)
    expect(e.llamar('movimiento.guardar', g).data.existente).toBe(true) // sin caché de idempotencia, el id evita el duplicado
    expect(e.filas('movimientos')).toHaveLength(1)
  })
  it('cambios devuelve solo lo nuevo y las bajas', () => {
    const g = gasto()
    e.datos('movimiento.guardar', g)
    e.avanzar(5000)
    const t0 = new Date(e.ahora).toISOString()
    e.avanzar(5000)
    const g2 = gasto({ descripcion: 'cena' })
    e.datos('movimiento.guardar', g2)
    const c = e.datos('cambios', { desde: t0 })
    expect(c.hojas.movimientos.map((m) => m.id)).toEqual([g2.id])
    const gen = c.generacion
    expect(e.datos('cambios', { generacion: gen }).sin_cambios).toBe(true)
  })
})

describe('catálogo', () => {
  it('eliminar exige confirmación explícita', () => {
    const r = e.llamar('categoria.eliminar', { id: cat.alim.id })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION')
  })
  it('no elimina lo que está en uso y sugiere desactivar', () => {
    e.datos('movimiento.guardar', gasto())
    const r = e.datos('categoria.eliminar', { id: cat.alim.id, confirmar: true, cascada: true })
    expect(r.eliminado).toBe(false)
    expect(r.sugerencia).toBe('desactivar')
    expect(r.dependencias.movimientos).toBeGreaterThan(0)
    expect(e.filas('categorias').some((c) => c.id === cat.alim.id)).toBe(true)
  })
  it('crea una categoría nueva y la deja antes de "Otros"', () => {
    const id = nuevoId('cat')
    e.datos('categoria.guardar', { id, nombre: 'Mascotas', vinculos: [{ ambito_id: cat.personal.id }] })
    const b = e.datos('bootstrap', {})
    const vinc = b.hojas.ambito_categoria.filter((r) => r.ambito_id === cat.personal.id).sort((x, y) => x.orden - y.orden)
    const nombres = vinc.map((r) => b.hojas.categorias.find((c) => c.id === r.categoria_id).nombre)
    expect(nombres.at(-1)).toBe('Otros')
    expect(nombres).toContain('Mascotas')
  })
  it('rechaza nombres duplicados sin distinguir mayúsculas ni tildes', () => {
    const r = e.llamar('categoria.guardar', { id: nuevoId('cat'), nombre: 'ALIMENTACION', vinculos: [{ ambito_id: cat.personal.id }] })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION')
  })
  it('elimina una categoría sin uso en cascada y deja auditoría', () => {
    const id = nuevoId('cat')
    e.datos('categoria.guardar', { id, nombre: 'Temporal', vinculos: [{ ambito_id: cat.personal.id }] })
    const r = e.datos('categoria.eliminar', { id, confirmar: true, cascada: true })
    expect(r.eliminado).toBe(true)
    expect(e.filas('categorias').some((c) => c.id === id)).toBe(false)
    expect(e.filas('auditoria').some((a) => a.accion === 'categoria.eliminar' && a.entidad_id === id)).toBe(true)
  })
})

describe('presupuesto', () => {
  it('crea una fuente y aplica un mes de forma aislada', () => {
    const id = nuevoId('fte')
    e.datos('fuente.guardar', { id, nombre: 'Sueldo', monto_defecto: 4000, recurrencia: 'mensual', mes_inicio: '2026-10', es_principal: true, moneda: 'PEN' })
    e.datos('fuenteMes.aplicar', { fuente_id: id, mes: '2026-10' })
    const meses = e.filas('fuentes_mes')
    expect(meses).toHaveLength(1)
    expect(meses[0].mes).toBe('2026-10')
    expect(meses[0].monto).toBe(4000)
    expect(e.filas('fuentes_mes').filter((m) => m.mes === '2026-11')).toHaveLength(0)
  })
  it('una fuente única termina en su mes de inicio', () => {
    const id = nuevoId('fte')
    e.datos('fuente.guardar', { id, nombre: 'Bono', monto_defecto: 500, recurrencia: 'unica', mes_inicio: '2026-12', moneda: 'PEN' })
    const f = e.filas('fuentes')[0]
    expect(f.mes_fin).toBe('2026-12')
  })
  it('solo puede haber una fuente principal', () => {
    const a = nuevoId('fte'), b = nuevoId('fte')
    e.datos('fuente.guardar', { id: a, nombre: 'A', monto_defecto: 1, recurrencia: 'mensual', mes_inicio: '2026-10', es_principal: true })
    e.datos('fuente.guardar', { id: b, nombre: 'B', monto_defecto: 1, recurrencia: 'mensual', mes_inicio: '2026-10', es_principal: true })
    expect(e.filas('fuentes').filter((f) => f.es_principal === true)).toHaveLength(1)
  })
})

describe('configuración', () => {
  it('acepta solo claves de la lista blanca', () => {
    expect(e.llamar('config.guardar', { items: [{ clave: 'cualquier_cosa', valor: 'x' }] }).ok).toBe(false)
    expect(e.llamar('config.guardar', { items: [{ clave: 'tema', valor: 'oscuro' }] }).ok).toBe(true)
  })
  it('valida las monedas y no inventa tipos de cambio', () => {
    expect(e.llamar('movimiento.guardar', gasto({ moneda: 'USD' })).ok).toBe(false)
    e.datos('config.guardar', { items: [{ clave: 'monedas_permitidas', valor: 'PEN,USD' }] })
    expect(e.llamar('movimiento.guardar', gasto({ moneda: 'USD' })).ok).toBe(false) // sin tipo de cambio
    e.datos('config.guardar', { items: [{ clave: 'tipo_cambio_USD', valor: '3.75' }] })
    const r = e.datos('movimiento.guardar', gasto({ moneda: 'USD', monto: 10 }))
    expect(r.movimiento.monto_base).toBe(37.5)
  })
  it('valida días del plan según el año (bisiesto)', () => {
    expect(e.llamar('config.guardar', { items: [{ clave: 'plan_dias_2025', valor: '2025-02-29' }] }).ok).toBe(false)
  })
})

describe('mantenimiento', () => {
  it('diagnóstico reporta hojas, esquema y atajo', () => {
    const d = e.datos('diagnostico', {})
    expect(d.problemas).toEqual([])
    expect(d.esquema).toBe(1)
    expect(Object.keys(d.filas)).toHaveLength(23)
    expect(d.atajo_activo).toBe(false)
  })
  it('repararHoja agrega columnas faltantes al final pero no toca hojas ambiguas', () => {
    const h = e.hoja('ambitos')
    h.datos[0] = h.datos[0].slice(0, -1) // quita "version"
    const r = e.datos('repararHoja', { hoja: 'ambitos' })
    expect(r.reparadas.join()).toMatch(/ambitos/)
    expect(e.hoja('ambitos').datos[0].at(-1)).toBe('version')
    e.hoja('categorias').getRange(1, 2).setValues([['otra']])
    const r2 = e.datos('repararHoja', { hoja: 'categorias' })
    expect(r2.errores).toHaveLength(1)
  })
  it('respaldo.crear genera una copia del libro', () => {
    const r = e.datos('respaldo.crear', {})
    expect(r.nombre).toMatch(/^Respaldo Deejota Finanzas \d{4}-\d{2}-\d{2} \d{2}-\d{2}$/)
    expect(e.libros.size).toBe(2)
  })
  it('datos de prueba: genera con prefijo TEST- y borra solo esos, con confirmación', () => {
    e.datos('movimiento.guardar', gasto())
    const g = e.datos('datosPrueba.generar', { cantidad: 12 })
    expect(g.generados).toBe(12)
    const test = e.filas('movimientos').filter((m) => m.origen === 'prueba')
    expect(test).toHaveLength(12)
    expect(test.every((m) => m.descripcion.startsWith('TEST-'))).toBe(true)
    expect(e.llamar('datosPrueba.borrar', {}).ok).toBe(false)
    const b = e.datos('datosPrueba.borrar', { confirmar: true })
    expect(b.eliminados).toBe(12)
    expect(e.filas('movimientos')).toHaveLength(1)
  })
  it('exportar.csv escapa celdas peligrosas y respeta el periodo', () => {
    e.datos('movimiento.guardar', gasto({ notas: '=HYPERLINK("x")', fecha: '2026-10-10' }))
    e.datos('movimiento.guardar', gasto({ fecha: '2026-09-01' }))
    const todo = e.datos('exportar.csv', { alcance: 'todo' })
    expect(todo.filas).toBe(2)
    expect(todo.csv.startsWith('﻿')).toBe(true)
    expect(todo.csv).not.toMatch(/,=HYPERLINK/)
    const periodo = e.datos('exportar.csv', { alcance: 'periodo', desde: '2026-10-01', hasta: '2026-10-31' })
    expect(periodo.filas).toBe(1)
  })
  it('la auditoría registra cada escritura con antes y después', () => {
    const g = gasto()
    const { movimiento } = e.datos('movimiento.guardar', g)
    e.datos('movimiento.guardar', { ...g, monto: 77, version: movimiento.version })
    const q = e.datos('auditoria.consultar', { entidad: 'movimientos', entidad_id: g.id })
    expect(q.filas.map((a) => a.accion)).toEqual(['movimiento.editar', 'movimiento.crear'])
    expect(q.filas[0].antes_json.monto).toBe(25.5)
    expect(q.filas[0].despues_json.monto).toBe(77)
  })
  it('rota la auditoría a Drive al superar 20 000 filas y conserva las 2 000 últimas', () => {
    const h = e.hoja('auditoria')
    const n = 20_005
    const fila = (i) => [`aud-${i}`, '2026-10-01T00:00:00.000Z', 'x', 'movimientos', `m-${i}`, '', '', 'web']
    for (let i = 0; i < n; i++) h.datos.push(fila(i))
    h.maxFilas = n + 10
    e.datos('movimiento.guardar', gasto())
    expect(e.archivosDrive.some((a) => /^auditoria-.*\.csv$/.test(a.nombre))).toBe(true)
    expect(e.filas('auditoria').length).toBeLessThanOrEqual(2100)
    expect(e.filas('auditoria').length).toBeGreaterThanOrEqual(2000)
  })
})

describe('atajo iPhone', () => {
  it('registra un gasto por nombres con origen "atajo" y es idempotente por requestId', () => {
    const { token } = e.datos('atajo.tokenCrear', {})
    const payload = { monto: 12, ambito: 'Personal', categoria: 'Alimentación', subcategoria: 'Almuerzo', medio: 'Yape', descripcion: 'menu' }
    const a = e.llamar('atajo.gasto', payload, { token, requestId: 'atajo-req-0001' })
    const b = e.llamar('atajo.gasto', payload, { token, requestId: 'atajo-req-0001' })
    expect(a.ok).toBe(true)
    expect(a.data.movimiento.origen).toBe('atajo')
    expect(b.repetido).toBe(true)
    expect(e.filas('movimientos')).toHaveLength(1)
  })
  it('devuelve un error claro si el nombre no existe', () => {
    const { token } = e.datos('atajo.tokenCrear', {})
    const r = e.llamar('atajo.gasto', { monto: 1, ambito: 'Inexistente', categoria: 'Alimentación', medio: 'Yape' }, { token })
    expect(r.ok).toBe(false)
    expect(r.error.message).toMatch(/Inexistente/)
  })
})

describe('importador desde la hoja v1', () => {
  const origen = () =>
    e.crearLibro('Control v1', {
      GASTOS: [
        ['Fecha', 'Monto', 'Moneda', 'Ámbito', 'Categoría', 'Subcategoría', 'Descripción', 'Medio de pago', 'Tipo', 'Notas'],
        ['15/10/2026', 'S/ 1,250.50', 'PEN', 'Personal', 'Alimentación', 'Almuerzo', 'menú', 'Yape', 'variable', ''],
        ['2026-10-14', 18, 'PEN', 'Personal', 'Mascotas', 'Veterinario', 'vacuna', 'Efectivo', 'extraordinario', 'nota'],
        ['2026-10-13', 18, 'PEN', 'Personal', 'Mascotas', 'Veterinario', 'vacuna', 'Efectivo', 'extraordinario', 'idéntico en otra fila'],
        ['no-es-fecha', 5, 'PEN', 'Personal', 'Alimentación', '', 'x', 'Yape', '', ''],
        ['2026-10-12', -3, 'PEN', 'Personal', 'Alimentación', '', 'x', 'Yape', '', ''],
        ['2026-10-12', 9, 'EUR', 'Personal', 'Alimentación', '', 'x', 'Yape', '', ''],
        ['2026-10-11', 7, 'PEN', 'Personal', 'Alimentación', '', 'sin medio', '', '', ''],
      ],
      CATALOGO: [
        ['Ámbito', 'Categoría', 'Subcategoría'],
        ['Personal', 'Mascotas', 'Veterinario'],
        ['Personal', 'Mascotas', 'Alimento'],
      ],
      MEDIOS_PAGO: [['Nombre'], ['Yape'], ['Tarjeta Interbank']],
      PRESUPUESTOS: [['Mes'], ['2026-10']],
    })

  it('simular no escribe nada y reporta lo que hará', () => {
    const id = origen()
    const foto = JSON.stringify(e.libro.getSheets().map((h) => h.datos))
    const r = e.datos('importar.simular', { origen_id: id })
    expect(r.modo).toBe('simulacion')
    expect(r.movimientos.en_origen).toBe(7)
    expect(r.movimientos.a_importar).toBe(3)
    expect(r.movimientos.omitidos.map((o) => o.motivo)).toEqual(expect.arrayContaining(['fecha inválida', 'monto inválido', 'moneda no permitida: EUR', 'sin medio de pago']))
    expect(r.a_crear.categorias).toBe(1)
    expect(r.a_crear.medios).toBe(2 - 1) // Interbank (Yape ya existe) + Efectivo ya existe
    expect(r.no_importado.join()).toMatch(/PRESUPUESTOS/)
    expect(JSON.stringify(e.libro.getSheets().map((h) => h.datos))).toBe(foto)
  })
  it('ejecuta con respaldo previo, mapea nombres a ids y crea lo que falta', () => {
    const id = origen()
    const r = e.datos('importar.ejecutar', { origen_id: id })
    expect(r.importados).toBe(3)
    expect(r.respaldo.id).toBeTruthy()
    const movs = e.filas('movimientos')
    expect(movs).toHaveLength(3)
    expect(movs.every((m) => m.origen === 'importacion')).toBe(true)
    const m1 = movs.find((m) => m.fecha === '2026-10-15')
    expect(m1.monto).toBe(1250.5)
    expect(m1.ambito_id).toBe(cat.personal.id)
    const nuevaCat = e.filas('categorias').find((c) => c.nombre === 'Mascotas')
    expect(nuevaCat).toBeTruthy()
    expect(movs.find((m) => m.fecha === '2026-10-14').categoria_id).toBe(nuevaCat.id)
    expect(e.filas('subcategorias').filter((s) => s.categoria_id === nuevaCat.id).map((s) => s.nombre).sort()).toEqual(['Alimento', 'Veterinario'])
  })
  it('es idempotente: importar dos veces no duplica', () => {
    const id = origen()
    e.datos('importar.ejecutar', { origen_id: id })
    const r2 = e.datos('importar.ejecutar', { origen_id: id })
    expect(r2.importados).toBe(0)
    expect(r2.movimientos.ya_importados).toBe(3)
    expect(e.filas('movimientos')).toHaveLength(3)
    expect(e.filas('categorias').filter((c) => c.nombre === 'Mascotas')).toHaveLength(1)
  })
  it('distingue dos filas con la misma firma pero distinta fecha', () => {
    e.datos('importar.ejecutar', { origen_id: origen() })
    expect(new Set(e.filas('movimientos').map((m) => m.id)).size).toBe(3)
  })
  it('si falla el respaldo no importa nada', () => {
    const id = origen()
    e.evaluar('crearCopiaRespaldo = function () { throw new Error("sin permisos") }')
    const r = e.llamar('importar.ejecutar', { origen_id: id })
    expect(r.ok).toBe(false)
    expect(e.filas('movimientos')).toHaveLength(0)
    expect(e.filas('categorias').some((c) => c.nombre === 'Mascotas')).toBe(false)
  })
  it('informa un error claro si no puede abrir el origen', () => {
    const r = e.llamar('importar.simular', { origen_id: 'no-existe-123456' })
    expect(r.ok).toBe(false)
    expect(r.error.message).toMatch(/No se pudo abrir/)
  })
})

describe('plantillas y compromisos', () => {
  const plantillaLuz = (extra = {}) => ({
    id: nuevoId('pl'), tipo: 'gasto', nombre: 'Luz',
    datos: {
      ambito_id: cat.personal.id, categoria_id: cat.alim.id, subcategoria_id: cat.almuerzo.id, descripcion: 'recibo de luz',
      monto: 120, moneda: 'PEN', medio_pago_id: cat.yape.id, tipo_gasto: 'fijo', es_compromiso: true, dia_vencimiento: 20,
    },
    ...extra,
  })
  it('una plantilla de gasto marcada como compromiso crea su compromiso', () => {
    e.datos('plantilla.guardar', plantillaLuz())
    const comp = e.filas('compromisos')
    expect(comp).toHaveLength(1)
    expect(comp[0].dia_vencimiento).toBe(20)
    expect(e.filas('movimientos')).toHaveLength(0) // las plantillas nunca son movimientos
  })
  it('rechaza plantillas idénticas y días de vencimiento fuera de rango', () => {
    e.datos('plantilla.guardar', plantillaLuz())
    const dup = e.llamar('plantilla.guardar', plantillaLuz({ nombre: 'Luz 2' }))
    expect(dup.ok).toBe(false)
    const p = plantillaLuz({ nombre: 'Otra' })
    p.datos.dia_vencimiento = 40
    expect(e.llamar('plantilla.guardar', p).ok).toBe(false)
  })
  it('vincula un pago a su compromiso y al registrar con compromiso_id', () => {
    e.datos('plantilla.guardar', plantillaLuz())
    const comp = e.filas('compromisos')[0]
    e.datos('movimiento.guardar', gasto({ compromiso_id: comp.id, fecha: '2026-10-20' }))
    const pagos = e.filas('compromiso_pagos')
    expect(pagos).toHaveLength(1)
    expect(pagos[0].mes).toBe('2026-10')
  })
  it('no permite vincular un movimiento anulado y desvincular es idempotente', () => {
    e.datos('plantilla.guardar', plantillaLuz())
    const comp = e.filas('compromisos')[0]
    const g = gasto()
    e.datos('movimiento.guardar', g)
    e.datos('movimiento.anular', { id: g.id })
    expect(e.llamar('compromiso.vincular', { compromiso_id: comp.id, movimiento_id: g.id }).ok).toBe(false)
    expect(e.datos('compromiso.desvincular', { compromiso_id: comp.id, movimiento_id: g.id }).sin_cambios).toBe(true)
  })
})

describe('cajas y copia de mes', () => {
  it('crea una caja ligada a una categoría y aplica el mes', () => {
    const id = nuevoId('caja')
    e.datos('caja.guardar', { id, nombre: 'Comida', alcance: 'categoria', alcance_id: cat.alim.id, monto_defecto: 600 })
    e.datos('cajaMes.aplicar', { caja_id: id, mes: '2026-10' })
    const m = e.filas('cajas_mes')
    expect(m).toHaveLength(1)
    expect(m[0].monto).toBe(600)
    expect(m[0].estado).toBe('aplicada')
  })
  it('rechaza cajas con alcance inexistente', () => {
    const r = e.llamar('caja.guardar', { id: nuevoId('caja'), nombre: 'X', alcance: 'categoria', alcance_id: 'no-existe-123', monto_defecto: 1 })
    expect(r.ok).toBe(false)
  })
  it('copia el mes anterior solo si se pide y puede previsualizar sin escribir', () => {
    const f = nuevoId('fte')
    e.datos('fuente.guardar', { id: f, nombre: 'Sueldo', monto_defecto: 3000, recurrencia: 'mensual', mes_inicio: '2026-09' })
    e.datos('fuenteMes.aplicar', { fuente_id: f, mes: '2026-09', monto: 3200 })
    const prev = e.datos('mes.copiarDeAnterior', { mes: '2026-10', previsualizar: true })
    expect(prev).toBeTruthy()
    expect(e.filas('fuentes_mes').filter((m) => m.mes === '2026-10')).toHaveLength(0)
    e.datos('mes.copiarDeAnterior', { mes: '2026-10' })
    const oct = e.filas('fuentes_mes').filter((m) => m.mes === '2026-10')
    expect(oct).toHaveLength(1)
    expect(oct[0].monto).toBe(3200)
    expect(e.filas('fuentes_mes').filter((m) => m.mes === '2026-11')).toHaveLength(0) // nada se arrastra solo
  })
})

describe('conciliación (solo agregar)', () => {
  it('verifica, detecta diferencia y agrega seguimientos sin editar lo anterior', () => {
    const f = nuevoId('fte')
    e.datos('fuente.guardar', { id: f, nombre: 'Sueldo', monto_defecto: 100, recurrencia: 'mensual', mes_inicio: '2026-10' })
    const gid = nuevoId('grp')
    e.datos('grupoFondos.guardar', { id: gid, nombre: 'Cuentas', fuente_ids: [f] })
    const cid = nuevoId('con')
    const v = e.datos('conciliacion.verificar', { grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '10:30', saldo_calculado: 500, saldo_real: 480.5, conciliacion_id: cid })
    expect(v.conciliacion.diferencia).toBe(-19.5)
    expect(v.conciliacion.estado).toBe('pendiente')
    const antes = JSON.stringify(e.filas('conciliaciones'))
    expect(e.llamar('conciliacion.seguimiento', { conciliacion_id: cid, estado: 'cerrada_justificada' }).ok).toBe(false) // exige causa
    e.datos('conciliacion.seguimiento', { conciliacion_id: cid, estado: 'cerrada_justificada', causa: 'Comisión bancaria' })
    const filas = e.filas('conciliaciones')
    expect(filas).toHaveLength(2)
    expect(JSON.stringify(filas.slice(0, 1))).toBe(JSON.stringify(JSON.parse(antes).slice(0, 1)))
  })
  it('una verificación sin diferencia queda conciliada', () => {
    const gid = nuevoId('grp')
    const f = nuevoId('fte')
    e.datos('fuente.guardar', { id: f, nombre: 'Efectivo', monto_defecto: 0, recurrencia: 'mensual', mes_inicio: '2026-10' })
    e.datos('grupoFondos.guardar', { id: gid, nombre: 'Caja', fuente_ids: [f] })
    const v = e.datos('conciliacion.verificar', { grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '09:00', saldo_calculado: 10, saldo_real: 10 })
    expect(v.conciliacion.estado).toBe('conciliada')
  })
})

describe('planificación y calidad de datos', () => {
  it('guarda el estado del asistente por mes y etapa sin duplicar filas', () => {
    e.datos('planificacion.guardar', { mes: '2026-11', etapa: 'fuentes', estado: 'en_progreso' })
    e.datos('planificacion.guardar', { mes: '2026-11', etapa: 'fuentes', estado: 'completada' })
    const f = e.filas('planificacion').filter((r) => r.mes === '2026-11' && r.etapa === 'fuentes')
    expect(f).toHaveLength(1)
    expect(f[0].estado).toBe('completada')
  })
  it('marca una alerta como legítima y la recuerda por firma', () => {
    const g = gasto()
    e.datos('movimiento.guardar', g)
    e.datos('revision.guardar', { tipo_alerta: 'duplicado_probable', firma: 'firma-1', movimiento_ids: [g.id], estado: 'legitimo' })
    e.datos('revision.guardar', { tipo_alerta: 'duplicado_probable', firma: 'firma-1', movimiento_ids: [g.id], estado: 'legitimo' })
    expect(e.filas('revisiones_calidad')).toHaveLength(1)
  })
})

describe('subcategorías por ámbito', () => {
  it('una subcategoría desactivada en un ámbito no se acepta allí pero sí en otros', () => {
    const b = e.datos('bootstrap', {})
    const off = b.hojas.ambito_subcategoria.find((r) => r.activo === false)
    expect(off).toBeTruthy()
    const sub = b.hojas.subcategorias.find((x) => x.id === off.subcategoria_id)
    const base = { ambito_id: off.ambito_id, categoria_id: sub.categoria_id, subcategoria_id: sub.id }
    const r = e.llamar('movimiento.guardar', gasto(base))
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION')
    // En un ámbito donde sí está activa (Personal > Alimentación > Almuerzo) funciona
    expect(e.llamar('movimiento.guardar', gasto()).ok).toBe(true)
  })
  it('el atajo solo ofrece lo activo en cada ámbito', () => {
    const c = e.datos('atajo.catalogo', {})
    expect(c.ambitos).toHaveLength(5)
    expect(c.medios.at(-1).nombre).toBe('Otros')
    const pareja = c.ambitos.find((a) => a.nombre === 'Pareja')
    expect(pareja.categorias.map((x) => x.nombre)).toContain('Plan Nube')
  })
})
