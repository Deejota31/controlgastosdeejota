import { prng } from './prng'

type Enviar = (action: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; data?: Record<string, unknown>; error?: { message: string } }>

interface Fila {
  id: string
  nombre?: string
  categoria_id?: string
  ambito_id?: string
  activo?: boolean
}

const DESCRIPCIONES: Record<string, string[]> = {
  Alimentación: ['menú del día', 'almuerzo con compañeros', 'desayuno en cafetería', 'cena en casa', 'pedido por delivery', 'snack de la tarde'],
  Transporte: ['taxi al trabajo', 'pasaje de bus', 'moto taxi', 'recarga de tarjeta'],
  Auto: ['gasolina', 'lavado del auto', 'estacionamiento'],
  Suscripciones: ['plan mensual', 'renovación anual'],
  Compras: ['accesorio para el celular', 'regalo', 'compra en tienda'],
  Salud: ['consulta médica', 'medicamentos', 'exámenes de laboratorio'],
  Salidas: ['cine', 'paseo', 'restaurante', 'actividad recreativa'],
  Hogar: ['supermercado', 'artículos de limpieza', 'reparación menor'],
  Servicios: ['recarga de celular', 'pago de servicio'],
  'Cuidado Personal': ['corte de pelo', 'productos de higiene'],
  Educación: ['curso en línea', 'libro'],
}
const RANGO: Record<string, [number, number]> = {
  Alimentación: [8, 45], Transporte: [4, 28], Auto: [25, 160], Suscripciones: [15, 55], Compras: [30, 220], Salud: [30, 180],
  Salidas: [25, 140], Hogar: [30, 190], Servicios: [10, 60], 'Cuidado Personal': [15, 80], Educación: [40, 250],
}

const mesDe = (f: string) => f.slice(0, 7)
const sumarMes = (mes: string, n: number) => {
  const m = Number(mes.slice(5, 7)) - 1 + n
  return `${Number(mes.slice(0, 4)) + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, '0')}`
}
const sumarDias = (f: string, n: number) => new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10) + n)).toISOString().slice(0, 10)

/**
 * Siembra datos deterministas para el modo demostración usando la API real del backend
 * (así se ejercitan las mismas validaciones que en producción).
 */
export async function sembrarDemo(enviar: Enviar, hoy: string, cantidad: number): Promise<void> {
  const ok = async (a: string, p: Record<string, unknown>) => {
    const r = await enviar(a, p)
    if (!r.ok) throw new Error(`Demo: ${a} falló: ${r.error?.message}`)
    return r.data ?? {}
  }
  const b = (await ok('bootstrap', {})) as { hojas: Record<string, Fila[] & Array<Record<string, unknown>>> }
  const h = b.hojas
  const rand = prng(20261016)
  const mes = mesDe(hoy)
  const meses = [sumarMes(mes, -2), sumarMes(mes, -1), mes]
  const id = (p: string, n: number) => `${p}-demo-${String(n).padStart(6, '0')}`
  const ambito = (n: string) => h['ambitos']!.find((a) => a.nombre === n)!
  const cat = (n: string) => h['categorias']!.find((c) => c.nombre === n)
  const medio = (n: string) => h['medios_pago']!.find((m) => m.nombre === n)!

  /* Fuentes y sus meses */
  const fuentes = [
    { id: id('fte', 1), nombre: 'Sueldo', monto_defecto: 4500, recurrencia: 'mensual', es_principal: true, medios: [] as string[] },
    { id: id('fte', 2), nombre: 'Vale de alimentos', monto_defecto: 600, recurrencia: 'mensual', es_principal: false, medios: [medio('Sodexo').id] },
  ]
  for (const f of fuentes) {
    await ok('fuente.guardar', { ...f, moneda: 'PEN', mes_inicio: meses[0], aplicar_mes: meses[0] })
    for (const m of meses.slice(1)) await ok('fuenteMes.aplicar', { fuente_id: f.id, mes: m })
  }

  /* Cajas */
  const cajas = [
    { id: id('caja', 1), nombre: 'Comida', alcance: 'categoria', alcance_id: cat('Alimentación')!.id, monto_defecto: 900 },
    { id: id('caja', 2), nombre: 'Transporte', alcance: 'categoria', alcance_id: cat('Transporte')!.id, monto_defecto: 350 },
    { id: id('caja', 3), nombre: 'Pareja', alcance: 'ambito', alcance_id: ambito('Pareja').id, monto_defecto: 400 },
  ]
  for (const c of cajas) {
    await ok('caja.guardar', { ...c, aplicar_mes: meses[0] })
    for (const m of meses.slice(1)) await ok('cajaMes.aplicar', { caja_id: c.id, mes: m })
  }

  /* Plantillas de gasto con compromisos */
  const alim = cat('Alimentación')!
  const personal = ambito('Personal')
  const sub = (catId: string, nombre: string) => h['subcategorias']!.find((s) => s.categoria_id === catId && s.nombre === nombre)
  const servicios = cat('Servicios')
  const hogar = ambito('Familia')
  const subLuz = servicios ? sub(servicios.id, 'Luz') : undefined
  const subInternet = servicios ? sub(servicios.id, 'Internet') : undefined
  if (servicios && subLuz && subInternet) {
    const comps = [
      { id: id('pl', 1), nombre: 'Luz del hogar', sub: subLuz, monto: 120, dia: 20 },
      { id: id('pl', 2), nombre: 'Internet', sub: subInternet, monto: 95, dia: 8 },
    ]
    for (const c of comps) {
      await ok('plantilla.guardar', {
        id: c.id, tipo: 'gasto', nombre: c.nombre,
        datos: { ambito_id: hogar.id, categoria_id: servicios.id, subcategoria_id: c.sub.id, descripcion: c.nombre, monto: c.monto, moneda: 'PEN', medio_pago_id: medio('Transferencia').id, tipo_gasto: 'fijo', es_recurrente: true, es_compromiso: true, dia_vencimiento: c.dia },
      })
    }
  }
  await ok('plantilla.guardar', {
    id: id('pl', 3), tipo: 'gasto', nombre: 'Menú del día',
    datos: { ambito_id: personal.id, categoria_id: alim.id, subcategoria_id: sub(alim.id, 'Almuerzo')!.id, descripcion: 'menú del día', monto: 18, moneda: 'PEN', medio_pago_id: medio('Yape').id, tipo_gasto: 'variable', es_recurrente: false, es_compromiso: false },
  })

  /* Movimientos deterministas repartidos en ~75 días, con más peso en lo reciente */
  const ambCats = new Map<string, Fila[]>()
  for (const ac of h['ambito_categoria']! as unknown as Array<{ ambito_id: string; categoria_id: string; activo: boolean }>) {
    if (!ac.activo) continue
    const lista = ambCats.get(ac.ambito_id) ?? []
    const c = h['categorias']!.find((x) => x.id === ac.categoria_id)
    if (c && c.nombre !== 'Otros') lista.push(c)
    ambCats.set(ac.ambito_id, lista)
  }
  const ambitos = h['ambitos']!
  const pesos = [5, 1, 2, 2, 1]
  const medios = h['medios_pago']!.filter((m) => m.nombre !== 'Otros')
  const items: Array<Record<string, unknown>> = []
  for (let i = 0; i < cantidad; i++) {
    let r = rand() * pesos.reduce((a, x) => a + x, 0)
    let ai = 0
    while (r > (pesos[ai] ?? 1) && ai < ambitos.length - 1) r -= pesos[ai++] ?? 1
    const a = ambitos[ai]!
    const cats = ambCats.get(a.id) ?? []
    const c = cats[Math.floor(rand() * cats.length)]
    if (!c) continue
    const subs = h['subcategorias']!.filter((s) => s.categoria_id === c.id && s.activo !== false)
    const noOff = subs.filter((s) => !(h['ambito_subcategoria']! as unknown as Array<{ ambito_id: string; subcategoria_id: string; activo: boolean }>).some((r2) => r2.ambito_id === a.id && r2.subcategoria_id === s.id && !r2.activo))
    const s = noOff[Math.floor(rand() * noOff.length)]
    if (!s) continue
    const [lo, hi] = RANGO[c.nombre ?? ''] ?? [10, 90]
    const monto = Math.round((lo + (hi - lo) * rand() ** 1.6) * 100) / 100
    const dias = Math.floor(75 * (1 - rand() ** 0.7))
    const fecha = sumarDias(hoy, -Math.min(dias, 74))
    const textos = DESCRIPCIONES[c.nombre ?? ''] ?? [s.nombre ?? 'gasto']
    items.push({
      id: id('mov', i + 1), fecha, monto, moneda: 'PEN', ambito_id: a.id, categoria_id: c.id, subcategoria_id: s.id,
      descripcion: textos[Math.floor(rand() * textos.length)], medio_pago_id: medios[Math.floor(rand() * medios.length)]!.id,
      tipo_gasto: rand() < 0.15 ? 'fijo' : rand() < 0.1 ? 'extraordinario' : 'variable', es_recurrente: rand() < 0.12,
    })
  }
  for (let i = 0; i < items.length; i += 200) {
    await ok('movimientos.lote', { lote_id: id('lote', i / 200 + 1), items: items.slice(i, i + 200) })
  }
}
