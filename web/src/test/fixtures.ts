import { hojasVacias, type Hojas, type Movimiento } from '@/api/esquemas'

const meta = { creado_en: '2026-01-01T00:00:00Z', actualizado_en: '2026-01-01T00:00:00Z', version: 1 }

/** Catálogo mínimo y coherente para pruebas de interfaz. */
export function hojasPrueba(): Hojas {
  const h = hojasVacias()
  h.ambitos = [
    { id: 'amb-p', nombre: 'Personal', icono: 'user', color: '#1e3a8a', orden: 1, activo: true, ...meta },
    { id: 'amb-h', nombre: 'Hogar', icono: 'home', color: '#14b8a6', orden: 2, activo: true, ...meta },
  ]
  h.categorias = [
    { id: 'cat-a', nombre: 'Alimentación', icono: 'utensils', color: '#f59e0b', ...meta },
    { id: 'cat-t', nombre: 'Transporte', icono: 'bus', color: '#6366f1', ...meta },
    { id: 'cat-s', nombre: 'Servicios', icono: 'zap', color: '#0ea5e9', ...meta },
  ]
  h.ambito_categoria = [
    { id: 'ac1', ambito_id: 'amb-p', categoria_id: 'cat-a', orden: 1, activo: true },
    { id: 'ac2', ambito_id: 'amb-p', categoria_id: 'cat-t', orden: 2, activo: true },
    { id: 'ac3', ambito_id: 'amb-h', categoria_id: 'cat-s', orden: 1, activo: true },
    { id: 'ac4', ambito_id: 'amb-h', categoria_id: 'cat-a', orden: 2, activo: true },
  ]
  h.subcategorias = [
    { id: 'sub-caf', categoria_id: 'cat-a', nombre: 'Café', icono: 'coffee', orden: 1, activo: true, ...meta },
    { id: 'sub-alm', categoria_id: 'cat-a', nombre: 'Almuerzo', icono: 'utensils', orden: 2, activo: true, ...meta },
    { id: 'sub-bus', categoria_id: 'cat-t', nombre: 'Bus', icono: 'bus', orden: 1, activo: true, ...meta },
    { id: 'sub-luz', categoria_id: 'cat-s', nombre: 'Luz', icono: 'zap', orden: 1, activo: true, ...meta },
  ]
  h.medios_pago = [
    { id: 'med-efe', nombre: 'Efectivo', tipo: 'efectivo', icono: 'banknote', color: '#16a34a', orden: 1, activo: true, ...meta },
    { id: 'med-tar', nombre: 'Tarjeta', tipo: 'tarjeta', icono: 'credit-card', color: '#7c3aed', orden: 2, activo: true, ...meta },
  ]
  return h
}

export function mov(parcial: Partial<Movimiento> & { id: string }): Movimiento {
  return {
    fecha: '2026-10-05', monto: 10, moneda: 'PEN', tipo_cambio: 1, monto_base: 10, ambito_id: 'amb-p', categoria_id: 'cat-a', subcategoria_id: 'sub-caf',
    descripcion: 'Café', medio_pago_id: 'med-efe', tipo_gasto: 'variable', es_recurrente: false, estado: 'activo', origen: 'web', plantilla_id: '',
    lote_id: '', comprobante_url: '', notas: '', ...meta, ...parcial,
  }
}

/** Conjunto numérico F3 del contrato: P=1000, cajas 200/300, gastos 250/100/100 → gastado 450, disponible 550, exceso 50, saldo libre 350, reservas sin usar 200 (octubre 2026). */
const metaF3 = { creado_en: '', actualizado_en: '', version: 3 }
export function hojasF3(): Hojas {
  const h = hojasPrueba()
  h.fuentes = [{ id: 'f1', nombre: 'Sueldo', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-09', mes_fin: '', icono: 'wallet', color: '#16a34a', orden: 1, activo: true, es_principal: true, ...metaF3 }]
  h.fuente_medios = [{ id: 'x1', fuente_id: 'f1', medio_pago_id: 'med-efe', orden: 1 }]
  h.fuentes_mes = [
    { id: 'fm1', fuente_id: 'f1', mes: '2026-10', monto: 1000, estado: 'aplicada', actualizado_en: '' },
    { id: 'fm0', fuente_id: 'f1', mes: '2026-09', monto: 900, estado: 'aplicada', actualizado_en: '' },
  ]
  h.cajas = [
    { id: 'c1', nombre: 'Comida', alcance: 'categoria', alcance_id: 'cat-a', monto_defecto: 200, icono: 'utensils', color: '#f59e0b', descripcion: '', orden: 1, activo: true, ...metaF3 },
    { id: 'c2', nombre: 'Movilidad', alcance: 'categoria', alcance_id: 'cat-t', monto_defecto: 300, icono: 'bus', color: '#6366f1', descripcion: '', orden: 2, activo: true, ...metaF3 },
  ]
  h.cajas_mes = [
    { id: 'cm1', caja_id: 'c1', mes: '2026-10', monto: 200, estado: 'aplicada', actualizado_en: '' },
    { id: 'cm2', caja_id: 'c2', mes: '2026-10', monto: 300, estado: 'aplicada', actualizado_en: '' },
    { id: 'cm0', caja_id: 'c1', mes: '2026-09', monto: 180, estado: 'aplicada', actualizado_en: '' },
  ]
  h.movimientos = [
    mov({ id: 'm1', monto: 250, monto_base: 250, categoria_id: 'cat-a', subcategoria_id: 'sub-caf' }),
    mov({ id: 'm2', monto: 100, monto_base: 100, categoria_id: 'cat-t', subcategoria_id: 'sub-bus' }),
    mov({ id: 'm3', monto: 100, monto_base: 100, categoria_id: 'cat-s', subcategoria_id: 'sub-luz', ambito_id: 'amb-h' }),
  ]
  return h
}

