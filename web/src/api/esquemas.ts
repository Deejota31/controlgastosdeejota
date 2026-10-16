import * as z from 'zod/mini'

/** Esquemas de lo que devuelve el backend (una fila por hoja). Reflejan ESQUEMAS_DEF de Code.gs. */
const num = z.nullable(z.number())
const meta = { creado_en: z.string(), actualizado_en: z.string(), version: z.number() }

export const esMovimiento = z.object({
  id: z.string(), fecha: z.string(), monto: z.number(), moneda: z.string(), tipo_cambio: num, monto_base: num,
  ambito_id: z.string(), categoria_id: z.string(), subcategoria_id: z.string(), descripcion: z.string(), medio_pago_id: z.string(),
  tipo_gasto: z.enum(['fijo', 'variable', 'extraordinario']), es_recurrente: z.boolean(), estado: z.enum(['activo', 'anulado']),
  origen: z.string(), plantilla_id: z.string(), lote_id: z.string(), comprobante_url: z.string(), notas: z.string(), ...meta,
})
export const esAmbito = z.object({ id: z.string(), nombre: z.string(), icono: z.string(), color: z.string(), orden: z.number(), activo: z.boolean(), ...meta })
export const esCategoria = z.object({ id: z.string(), nombre: z.string(), icono: z.string(), color: z.string(), ...meta })
export const esAmbitoCategoria = z.object({ id: z.string(), ambito_id: z.string(), categoria_id: z.string(), orden: z.number(), activo: z.boolean() })
export const esSubcategoria = z.object({ id: z.string(), categoria_id: z.string(), nombre: z.string(), icono: z.string(), orden: z.number(), activo: z.boolean(), ...meta })
export const esAmbitoSubcategoria = z.object({ id: z.string(), ambito_id: z.string(), subcategoria_id: z.string(), activo: z.boolean() })
export const esMedioPago = z.object({
  id: z.string(), nombre: z.string(), tipo: z.enum(['billetera', 'tarjeta', 'vale', 'efectivo', 'transferencia', 'otro']),
  icono: z.string(), color: z.string(), orden: z.number(), activo: z.boolean(), ...meta,
})
export const esFuente = z.object({
  id: z.string(), nombre: z.string(), monto_defecto: z.number(), moneda: z.string(), recurrencia: z.enum(['mensual', 'unica']),
  mes_inicio: z.string(), mes_fin: z.string(), icono: z.string(), color: z.string(), orden: z.number(), activo: z.boolean(), es_principal: z.boolean(), ...meta,
})
export const esFuenteMedio = z.object({ id: z.string(), fuente_id: z.string(), medio_pago_id: z.string(), orden: z.number() })
export const esFuenteMes = z.object({ id: z.string(), fuente_id: z.string(), mes: z.string(), monto: z.number(), estado: z.enum(['aplicada', 'omitida']), actualizado_en: z.string() })
export const esCaja = z.object({
  id: z.string(), nombre: z.string(), alcance: z.enum(['ambito', 'categoria', 'subcategoria', 'medio_pago']), alcance_id: z.string(),
  monto_defecto: z.number(), icono: z.string(), color: z.string(), descripcion: z.string(), orden: z.number(), activo: z.boolean(), ...meta,
})
export const esCajaMes = z.object({ id: z.string(), caja_id: z.string(), mes: z.string(), monto: z.number(), estado: z.enum(['aplicada', 'omitida']), actualizado_en: z.string() })
export const esPlantilla = z.object({
  id: z.string(), tipo: z.enum(['gasto', 'fuente', 'caja']), nombre: z.string(), datos_json: z.nullable(z.record(z.string(), z.unknown())),
  orden: z.number(), activo: z.boolean(), ...meta,
})
export const esCompromiso = z.object({
  id: z.string(), plantilla_id: z.string(), nombre: z.string(), monto_previsto: num, moneda: z.string(), dia_vencimiento: num, activo: z.boolean(), ...meta,
})
export const esCompromisoPago = z.object({ id: z.string(), compromiso_id: z.string(), movimiento_id: z.string(), mes: z.string(), creado_en: z.string() })
export const esRevision = z.object({
  id: z.string(), tipo_alerta: z.string(), firma: z.string(), movimiento_ids: z.nullable(z.array(z.string())),
  estado: z.enum(['legitimo', 'pendiente', 'duplicado']), creado_en: z.string(), actualizado_en: z.string(),
})
export const esGrupoFondos = z.object({
  id: z.string(), nombre: z.string(), fuente_ids_json: z.nullable(z.array(z.string())), activo: z.boolean(), creado_en: z.string(), actualizado_en: z.string(), version: z.number(),
})
export const esConciliacion = z.object({
  id: z.string(), tipo: z.enum(['verificacion', 'seguimiento']), conciliacion_id: z.string(), periodo: z.string(), fecha_corte: z.string(), hora: z.string(),
  grupo_id: z.string(), saldo_calculado: num, saldo_real: num, diferencia: num,
  estado: z.enum(['pendiente', 'en_revision', 'conciliada', 'cerrada_justificada', 'desactualizada']),
  causa: z.string(), observacion: z.string(), reemplaza_a: z.string(), creado_en: z.string(),
})
export const esPlanificacion = z.object({
  id: z.string(), mes: z.string(), etapa: z.enum(['fuentes', 'cajas', 'gastos', 'resumen']),
  estado: z.enum(['pendiente', 'en_progreso', 'completada', 'omitida', 'error']), actualizado_en: z.string(),
})
export const esOrdenMovimiento = z.object({ movimiento_id: z.string(), orden: z.number() })
export const esConfig = z.object({ clave: z.string(), valor: z.string(), actualizado_en: z.string() })

export const ESQUEMAS_HOJA = {
  movimientos: esMovimiento, ambitos: esAmbito, categorias: esCategoria, ambito_categoria: esAmbitoCategoria,
  subcategorias: esSubcategoria, ambito_subcategoria: esAmbitoSubcategoria, medios_pago: esMedioPago, fuentes: esFuente,
  fuente_medios: esFuenteMedio, fuentes_mes: esFuenteMes, cajas: esCaja, cajas_mes: esCajaMes, plantillas: esPlantilla,
  compromisos: esCompromiso, compromiso_pagos: esCompromisoPago, revisiones_calidad: esRevision, grupos_fondos: esGrupoFondos,
  conciliaciones: esConciliacion, planificacion: esPlanificacion, orden_movimientos: esOrdenMovimiento, config: esConfig,
} as const

export type NombreHoja = keyof typeof ESQUEMAS_HOJA
export const NOMBRES_HOJA = Object.keys(ESQUEMAS_HOJA) as NombreHoja[]
/** Clave primaria de cada hoja (orden_movimientos y config no usan `id`). */
export const CLAVE_HOJA: Record<NombreHoja, string> = {
  movimientos: 'id', ambitos: 'id', categorias: 'id', ambito_categoria: 'id', subcategorias: 'id', ambito_subcategoria: 'id',
  medios_pago: 'id', fuentes: 'id', fuente_medios: 'id', fuentes_mes: 'id', cajas: 'id', cajas_mes: 'id', plantillas: 'id',
  compromisos: 'id', compromiso_pagos: 'id', revisiones_calidad: 'id', grupos_fondos: 'id', conciliaciones: 'id',
  planificacion: 'id', orden_movimientos: 'movimiento_id', config: 'clave',
}

export type Movimiento = z.infer<typeof esMovimiento>
export type Ambito = z.infer<typeof esAmbito>
export type Categoria = z.infer<typeof esCategoria>
export type AmbitoCategoria = z.infer<typeof esAmbitoCategoria>
export type Subcategoria = z.infer<typeof esSubcategoria>
export type AmbitoSubcategoria = z.infer<typeof esAmbitoSubcategoria>
export type MedioPago = z.infer<typeof esMedioPago>
export type Fuente = z.infer<typeof esFuente>
export type FuenteMedio = z.infer<typeof esFuenteMedio>
export type FuenteMes = z.infer<typeof esFuenteMes>
export type Caja = z.infer<typeof esCaja>
export type CajaMes = z.infer<typeof esCajaMes>
export type Plantilla = z.infer<typeof esPlantilla>
export type Compromiso = z.infer<typeof esCompromiso>
export type CompromisoPago = z.infer<typeof esCompromisoPago>
export type Revision = z.infer<typeof esRevision>
export type GrupoFondos = z.infer<typeof esGrupoFondos>
export type Conciliacion = z.infer<typeof esConciliacion>
export type Planificacion = z.infer<typeof esPlanificacion>
export type OrdenMovimiento = z.infer<typeof esOrdenMovimiento>
export type ConfigFila = z.infer<typeof esConfig>

export type Hojas = { [K in NombreHoja]: Array<z.infer<(typeof ESQUEMAS_HOJA)[K]>> }

export function hojasVacias(): Hojas {
  return Object.fromEntries(NOMBRES_HOJA.map((n) => [n, []])) as unknown as Hojas
}

/** Valida las hojas recibidas; descarta filas inválidas y las cuenta para poder avisar. */
export function validarHojas(crudo: unknown): { hojas: Partial<Hojas>; descartadas: number } {
  const hojas: Record<string, unknown[]> = {}
  let descartadas = 0
  const src = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  for (const n of NOMBRES_HOJA) {
    const filas = src[n]
    if (!Array.isArray(filas)) continue
    const ok: unknown[] = []
    for (const f of filas) {
      const r = ESQUEMAS_HOJA[n].safeParse(f)
      if (r.success) ok.push(r.data)
      else descartadas++
    }
    hojas[n] = ok
  }
  return { hojas: hojas as Partial<Hojas>, descartadas }
}
