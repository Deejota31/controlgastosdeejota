import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hojas, Plantilla } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { useGastosMes } from '@/store/gastosMes'
import { hojasPrueba } from '@/test/fixtures'
import { GastosMesModal } from './GastosMesModal'
import type { DatosGasto } from './logica'

const mutar = vi.fn()
const meta = { creado_en: '', actualizado_en: '', version: 2 }
const base: DatosGasto = { ambito_id: 'amb-h', categoria_id: 'cat-s', subcategoria_id: 'sub-luz', descripcion: 'Recibo de luz', monto: 120, moneda: 'PEN', medio_pago_id: 'med-tar', tipo_gasto: 'fijo', es_recurrente: true, es_compromiso: true, dia_vencimiento: 10 }
const plantilla = (id: string, nombre: string, d: Partial<DatosGasto>, orden: number): Plantilla => ({ id, tipo: 'gasto', nombre, datos_json: { ...base, ...d }, orden, activo: true, ...meta })

function datos(): Hojas {
  const h = hojasPrueba()
  h.plantillas = [
    plantilla('p1', 'Luz', {}, 1),
    plantilla('p2', 'Café diario', { ambito_id: 'amb-p', categoria_id: 'cat-a', subcategoria_id: 'sub-caf', descripcion: 'Café', monto: 6, es_compromiso: false, dia_vencimiento: null, tipo_gasto: 'variable', es_recurrente: false, medio_pago_id: 'med-efe' }, 2),
    plantilla('p3', 'Bus', { ambito_id: 'amb-p', categoria_id: 'cat-t', subcategoria_id: 'sub-bus', descripcion: 'Pasaje', monto: null, es_compromiso: false, dia_vencimiento: null, medio_pago_id: 'med-efe' }, 3),
  ]
  h.compromisos = [{ id: 'cmp1', plantilla_id: 'p1', nombre: 'Luz', monto_previsto: 120, moneda: 'PEN', dia_vencimiento: 10, activo: true, ...meta }]
  return h
}

function montar(h: Hojas = datos()) {
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  useDatos.setState({ vista: h, confirmado: h, pendientes: [], config: { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }, zona: 'America/Lima', mutar } as never)
  useGastosMes.setState({ abierto: true })
  useFormMov.setState({ abierto: false, semilla: undefined })
  return render(<GastosMesModal />)
}

const resumenTexto = () => document.querySelector('summary')!.textContent ?? ''
const fila = (nombre: string) => screen.getByRole('checkbox', { name: new RegExp(nombre) }).closest('li') as HTMLElement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  useGastosMes.setState({ abierto: false })
})

describe('Gastos del mes · lectura y selección', () => {
  it('lista las plantillas con su clasificación y el estado del compromiso', () => {
    montar()
    expect(within(fila('Luz')).getByText('Servicios › Luz')).toBeInTheDocument()
    expect(within(fila('Luz')).getByText(/Compromiso · vence el día 10 · pendiente en 2026-10/)).toBeInTheDocument()
    expect(screen.getByText(/1 pendiente de 1/)).toBeInTheDocument()
  })

  it('la selección sobrevive a la búsqueda y «Visibles», «Todas» y «Limpiar» actúan sobre lo esperado', async () => {
    montar()
    await userEvent.click(within(fila('Luz')).getByRole('checkbox'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar plantillas' }), 'cafe')
    expect(screen.queryByRole('checkbox', { name: /Luz/ })).toBeNull()
    expect(resumenTexto()).toMatch(/^1 gastos?/)
    await userEvent.click(screen.getByRole('button', { name: 'Visibles' }))
    expect(resumenTexto()).toMatch(/^2 gastos?/)
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar plantillas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(resumenTexto()).toMatch(/^3 gastos?/)
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(resumenTexto()).toMatch(/^0 gastos?/)
  })

  it('filtra por ámbito', async () => {
    montar()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por ámbito' }), 'amb-h')
    expect(screen.getByRole('checkbox', { name: /Luz/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Café diario/ })).toBeNull()
  })

  it('una plantilla con clasificación inactiva «requiere revisión» y no se puede elegir', async () => {
    const h = datos()
    h.subcategorias = h.subcategorias.map((s) => (s.id === 'sub-luz' ? { ...s, activo: false } : s))
    montar(h)
    expect(within(fila('Luz')).getByText(/Requiere revisión: La subcategoría «Luz» está inactiva/)).toBeInTheDocument()
    expect(within(fila('Luz')).getByRole('checkbox')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(resumenTexto()).toMatch(/^2 gastos?/)
  })
})

describe('Gastos del mes · registrar', () => {
  it('registra un lote con id fijo, usando la edición temporal sin tocar la plantilla', async () => {
    montar()
    await userEvent.click(within(fila('Luz')).getByRole('checkbox'))
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    const monto = screen.getByRole('textbox', { name: 'Monto de Luz' })
    await userEvent.clear(monto)
    await userEvent.type(monto, '130,50')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Medio de pago de Luz' }), 'med-efe')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Moneda de Café diario' }), 'USD')
    expect(resumenTexto()).toMatch(/^2 gastos/)
    expect(resumenTexto()).toMatch(/130\.50/)
    expect(resumenTexto()).toMatch(/6\.00/)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 2 gastos' }))
    expect(mutar).toHaveBeenCalledTimes(1)
    const [accion, p] = mutar.mock.calls[0] as [string, { lote_id: string; items: Array<Record<string, unknown>> }]
    expect(accion).toBe('movimientos.lote')
    expect(p.lote_id).toMatch(/^lote-/)
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toMatchObject({ fecha: '2026-10-15', monto: 130.5, moneda: 'PEN', medio_pago_id: 'med-efe', compromiso_id: 'cmp1', categoria_id: 'cat-s', descripcion: 'Recibo de luz' })
    expect(p.items[1]).toMatchObject({ monto: 6, moneda: 'USD' })
    expect(p.items[1]!['compromiso_id']).toBeUndefined()
    expect(String(p.items[0]!['id'])).toMatch(/^mov-/)
    expect(useDatos.getState().vista.plantillas[0]!.datos_json).toMatchObject({ monto: 120, medio_pago_id: 'med-tar' })
    await vi.waitFor(() => expect(useGastosMes.getState().abierto).toBe(false))
  })

  it('doble clic: una sola petición', async () => {
    montar()
    mutar.mockReturnValue(new Promise(() => {}))
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.dblClick(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    expect(mutar).toHaveBeenCalledTimes(1)
  })

  it('todo o nada: si una fila no es válida no se envía nada y se señala la fila', async () => {
    montar()
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.click(within(fila('Bus')).getByRole('checkbox')) // sin monto predeterminado
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 2 gastos' }))
    expect(mutar).not.toHaveBeenCalled()
    expect(within(fila('Bus')).getByRole('alert')).toHaveTextContent('Escribe un monto mayor que cero.')
    expect(screen.getByText(/No se registró ninguno/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Monto de Bus' })).toHaveFocus()
    await userEvent.type(screen.getByRole('textbox', { name: 'Monto de Bus' }), '2.5')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 2 gastos' }))
    expect(mutar).toHaveBeenCalledTimes(1)
  })

  it('una moneda sin tipo de cambio bloquea el lote', async () => {
    montar()
    useDatos.setState({ config: { moneda_base: 'PEN', monedas_permitidas: 'EUR' } } as never)
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Moneda de Café diario' }), 'EUR')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    expect(mutar).not.toHaveBeenCalled()
    expect(within(fila('Café diario')).getByRole('alert')).toHaveTextContent('Falta el tipo de cambio EUR.')
  })

  it('si el servidor rechaza el lote, el modal sigue abierto con la selección y el reintento usa el mismo lote', async () => {
    montar()
    mutar.mockResolvedValueOnce({ ok: false, error: { message: 'Hoja ocupada' } })
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    expect(await screen.findByText(/No se registró ningún gasto: Hoja ocupada/)).toBeInTheDocument()
    expect(useGastosMes.getState().abierto).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    expect(mutar).toHaveBeenCalledTimes(2)
    const [a, b] = mutar.mock.calls.map((c) => c[1] as { lote_id: string; items: Array<{ id: string }> })
    expect(a!.lote_id).toBe(b!.lote_id)
    expect(a!.items[0]!.id).toBe(b!.items[0]!.id)
  })

  it('si cambia lo que se envía después de un fallo, es otro lote', async () => {
    montar()
    mutar.mockResolvedValueOnce({ ok: false, error: { message: 'Red caída' } })
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    await screen.findByText(/Red caída/)
    const monto = screen.getByRole('textbox', { name: 'Monto de Café diario' })
    await userEvent.clear(monto)
    await userEvent.type(monto, '7')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar 1 gasto' }))
    const [a, b] = mutar.mock.calls.map((c) => (c[1] as { lote_id: string }).lote_id)
    expect(a).not.toBe(b)
  })

  it('un compromiso ya cubierto en el mes avisa antes de registrarlo otra vez', async () => {
    const h = datos()
    h.movimientos = [
      {
        id: 'm1', fecha: '2026-10-05', monto: 120, moneda: 'PEN', tipo_cambio: 1, monto_base: 120, ambito_id: 'amb-h', categoria_id: 'cat-s', subcategoria_id: 'sub-luz', descripcion: 'Luz',
        medio_pago_id: 'med-tar', tipo_gasto: 'fijo', es_recurrente: true, estado: 'activo', origen: 'web', plantilla_id: '', lote_id: '', comprobante_url: '', notas: '', ...meta,
      },
    ]
    h.compromiso_pagos = [{ id: 'cp1', compromiso_id: 'cmp1', movimiento_id: 'm1', mes: '2026-10', creado_en: '' }]
    montar(h)
    await userEvent.click(within(fila('Luz')).getByRole('checkbox'))
    expect(within(fila('Luz')).getByText(/Ya está cubierto en 2026-10/)).toBeInTheDocument()
  })

  it('cambiar la fecha a otro mes recalcula el estado del compromiso', async () => {
    montar()
    const f = screen.getByLabelText('Fecha de registro')
    fireEvent.change(f, { target: { value: '2026-11-02' } })
    expect(within(fila('Luz')).getByText(/pendiente en 2026-11/)).toBeInTheDocument()
  })
})

describe('Gastos del mes · acciones de plantilla', () => {
  const menu = async (nombre: string) => {
    await userEvent.click(screen.getByRole('button', { name: `Acciones de ${nombre}` }))
    return screen.getByRole('menu', { name: `Acciones de ${nombre}` })
  }

  it('Usar abre el formulario precargado, vinculado al compromiso, y cierra el modal', async () => {
    montar()
    await userEvent.click(within(await menu('Luz')).getByRole('menuitem', { name: /Usar/ }))
    expect(useGastosMes.getState().abierto).toBe(false)
    const f = useFormMov.getState()
    expect(f.abierto).toBe(true)
    expect(f.modo).toBe('nuevo')
    expect(f.semilla).toMatchObject({ ambito: 'amb-h', categoria: 'cat-s', sub: 'sub-luz', monto: '120', medio: 'med-tar', tipo: 'fijo', compromisoId: 'cmp1' })
  })

  it('Eliminar vuelve al modal conservando la búsqueda y la selección', async () => {
    montar()
    await userEvent.click(within(fila('Café diario')).getByRole('checkbox'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar plantillas' }), 'cafe')
    await userEvent.click(within(await menu('Café diario')).getByRole('menuitem', { name: 'Eliminar' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: /Eliminar «Café diario»/ })).getByRole('button', { name: 'Eliminar' }))
    expect(mutar).toHaveBeenCalledWith('plantilla.eliminar', { id: 'p2', confirmar: true })
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: /Eliminar/ })).toBeNull())
    expect(screen.getByRole('searchbox', { name: 'Buscar plantillas' })).toHaveValue('cafe')
    expect(screen.getByRole('dialog', { name: 'Gastos del mes' })).toBeInTheDocument()
  })

  it('Subir / Bajar mandan el orden completo y se desactivan con un filtro', async () => {
    montar()
    await userEvent.click(within(await menu('Café diario')).getByRole('menuitem', { name: 'Subir' }))
    expect(mutar).toHaveBeenCalledWith('plantilla.reordenar', { tipo: 'gasto', ids: ['p2', 'p1', 'p3'] })
    await userEvent.keyboard('{Escape}')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar plantillas' }), 'cafe')
    expect(within(await menu('Café diario')).getByRole('menuitem', { name: 'Subir' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('Clonar abre el formulario con los datos y el nombre «(copia)»', async () => {
    montar()
    await userEvent.click(within(await menu('Café diario')).getByRole('menuitem', { name: 'Clonar' }))
    const dlg = screen.getByRole('dialog', { name: 'Clonar plantilla de gasto' })
    expect(within(dlg).getByLabelText(/Nombre/)).toHaveValue('Café diario (copia)')
    expect(within(dlg).getByLabelText('Descripción')).toHaveValue('Café')
  })

  it('un clon idéntico se rechaza antes de enviar', async () => {
    montar()
    await userEvent.click(within(await menu('Café diario')).getByRole('menuitem', { name: 'Clonar' }))
    const dlg = screen.getByRole('dialog', { name: 'Clonar plantilla de gasto' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText(/Ya existe una plantilla idéntica \(«Café diario»\)/)).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })
})

describe('Gastos del mes · formulario de plantilla', () => {
  it('crea una plantilla de compromiso con día de vencimiento y sin monto', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }))
    const dlg = screen.getByRole('dialog', { name: 'Nueva plantilla de gasto' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Escribe un nombre.')).toBeInTheDocument()
    expect(within(dlg).getByText('Elige el ámbito.')).toBeInTheDocument()
    await userEvent.type(within(dlg).getByLabelText(/Nombre/), 'Internet')
    await userEvent.selectOptions(within(dlg).getByLabelText(/Ámbito/), 'amb-h')
    await userEvent.selectOptions(within(dlg).getByLabelText(/Categoría/), 'cat-s')
    await userEvent.selectOptions(within(dlg).getByLabelText(/Subcategoría/), 'sub-luz')
    await userEvent.selectOptions(within(dlg).getByLabelText(/Medio de pago/), 'med-tar')
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /compromiso/ }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Escribe un día de vencimiento entre 1 y 31.')).toBeInTheDocument()
    await userEvent.type(within(dlg).getByLabelText(/Día de vencimiento/), '15')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    const [accion, p] = mutar.mock.calls[0] as [string, Record<string, any>]
    expect(accion).toBe('plantilla.guardar')
    expect(p).toMatchObject({ tipo: 'gasto', nombre: 'Internet', activo: true })
    expect(p['datos']).toMatchObject({ ambito_id: 'amb-h', categoria_id: 'cat-s', subcategoria_id: 'sub-luz', es_compromiso: true, dia_vencimiento: 15, medio_pago_id: 'med-tar', moneda: 'PEN' })
    expect(p['datos']['monto']).toBeUndefined()
    expect(p['version']).toBeUndefined()
  })

  it('al editar una plantilla en revisión pide volver a elegir lo que ya no está disponible', async () => {
    const h = datos()
    h.medios_pago = h.medios_pago.map((m) => (m.id === 'med-tar' ? { ...m, activo: false } : m))
    montar(h)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Luz' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }))
    const dlg = screen.getByRole('dialog', { name: 'Editar plantilla de gasto' })
    expect(within(dlg).getByText(/requiere revisión/)).toBeInTheDocument()
    expect(within(dlg).getByLabelText(/Medio de pago/)).toHaveValue('')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }))
    expect(within(dlg).getByText('Elige el medio de pago.')).toBeInTheDocument()
    await userEvent.selectOptions(within(dlg).getByLabelText(/Medio de pago/), 'med-efe')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }))
    expect(mutar).toHaveBeenCalledWith('plantilla.guardar', expect.objectContaining({ id: 'p1', version: 2, tipo: 'gasto' }))
  })

  it('sin plantillas invita a crear la primera', async () => {
    montar(hojasPrueba())
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi primera plantilla' }))
    expect(screen.getByRole('dialog', { name: 'Nueva plantilla de gasto' })).toBeInTheDocument()
  })
})

describe('Gastos del mes · cierre', () => {
  it('Cerrar oculta el modal', async () => {
    montar()
    await act(async () => userEvent.click(screen.getAllByRole('button', { name: 'Cerrar' }).at(-1)!))
    expect(useGastosMes.getState().abierto).toBe(false)
  })
})
