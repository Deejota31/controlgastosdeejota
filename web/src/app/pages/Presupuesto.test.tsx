import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hojas } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { hojasPrueba, mov } from '@/test/fixtures'
import { Presupuesto } from './Presupuesto'

const mutar = vi.fn()
const meta = { creado_en: '', actualizado_en: '', version: 3 }

function f3(): Hojas {
  const h = hojasPrueba()
  h.fuentes = [{ id: 'f1', nombre: 'Sueldo', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-09', mes_fin: '', icono: 'wallet', color: '#16a34a', orden: 1, activo: true, es_principal: true, ...meta }]
  h.fuente_medios = [{ id: 'x1', fuente_id: 'f1', medio_pago_id: 'med-efe', orden: 1 }]
  h.fuentes_mes = [
    { id: 'fm1', fuente_id: 'f1', mes: '2026-10', monto: 1000, estado: 'aplicada', actualizado_en: '' },
    { id: 'fm0', fuente_id: 'f1', mes: '2026-09', monto: 900, estado: 'aplicada', actualizado_en: '' },
  ]
  h.cajas = [
    { id: 'c1', nombre: 'Comida', alcance: 'categoria', alcance_id: 'cat-a', monto_defecto: 200, icono: 'utensils', color: '#f59e0b', descripcion: '', orden: 1, activo: true, ...meta },
    { id: 'c2', nombre: 'Movilidad', alcance: 'categoria', alcance_id: 'cat-t', monto_defecto: 300, icono: 'bus', color: '#6366f1', descripcion: '', orden: 2, activo: true, ...meta },
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

function montar(h: Hojas = f3()) {
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  useDatos.setState({ vista: h, confirmado: h, pendientes: [], config: { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }, zona: 'America/Lima', mutar } as never)
  return render(<Presupuesto />)
}

const kpi = (titulo: string) => screen.getByText(titulo).closest('div')!.parentElement!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('Presupuesto · resumen del mes (F3)', () => {
  it('muestra presupuesto 1,000, reservado 500, gastado 450 y disponible 550', () => {
    montar()
    expect(kpi('Presupuesto del mes')).toHaveTextContent(/1,000\.00/)
    expect(kpi('Reservado en cajas')).toHaveTextContent(/500\.00/)
    expect(kpi('Gastado')).toHaveTextContent(/450\.00/)
    expect(kpi('Disponible')).toHaveTextContent(/550\.00/)
    expect(kpi('Disponible')).toHaveTextContent(/Exceso en cajas: .*50\.00/)
  })

  it('cambiar de mes no arrastra nada del anterior', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(kpi('Presupuesto del mes')).toHaveTextContent(/900\.00/)
    expect(kpi('Gastado')).toHaveTextContent(/0\.00/)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(kpi('Presupuesto del mes')).toHaveTextContent(/0\.00/)
  })

  it('sin fuentes ni cajas invita a crear la primera fuente', async () => {
    montar(hojasPrueba())
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi primera fuente' }))
    expect(screen.getByRole('dialog', { name: 'Nueva fuente' })).toBeInTheDocument()
  })
})

describe('Presupuesto · fuentes', () => {
  it('mide el consumo y deja ver los medios ligados', () => {
    montar()
    const tarjeta = screen.getByRole('heading', { name: /Sueldo/ }).closest('li')!
    expect(within(tarjeta).getByText('Aplicada')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/Solo cubre: Efectivo/)).toBeInTheDocument()
    expect(within(tarjeta).getByRole('progressbar', { name: 'Consumo de Sueldo' })).toBeInTheDocument()
  })

  it('desactivar enseña antes y después y envía todo el registro con su versión', async () => {
    montar()
    await userEvent.click(screen.getByRole('switch', { name: 'Fuente Sueldo activa' }))
    const dlg = screen.getByRole('dialog', { name: 'Desactivar la fuente «Sueldo»' })
    expect(within(dlg).getByRole('row', { name: /Presupuesto/ })).toHaveTextContent(/1,000\.00.*0\.00/)
    expect(within(dlg).getByRole('row', { name: /Disponible/ })).toHaveTextContent(/550\.00.*-.*450\.00/)
    expect(mutar).not.toHaveBeenCalled()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar' }))
    expect(mutar).toHaveBeenCalledWith('fuente.guardar', expect.objectContaining({ id: 'f1', activo: false, es_principal: false, version: 3, medios: ['med-efe'], recurrencia: 'mensual', mes_inicio: '2026-09' }))
  })

  it('cancelar el impacto no escribe nada', async () => {
    montar()
    await userEvent.click(screen.getByRole('switch', { name: 'Fuente Sueldo activa' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(mutar).not.toHaveBeenCalled()
    expect(screen.getByRole('switch', { name: 'Fuente Sueldo activa' })).toBeChecked()
  })

  it('«desde este mes» cambia el monto por defecto; «solo este mes» no', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar monto' }))
    let dlg = screen.getByRole('dialog', { name: /Ajustar «Sueldo» en 2026-10/ })
    await userEvent.clear(within(dlg).getByRole('textbox', { name: /Monto de 2026-10/ }))
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Monto de 2026-10/ }), '1200')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar ajuste' }))
    expect(mutar).toHaveBeenLastCalledWith('fuenteMes.aplicar', { fuente_id: 'f1', mes: '2026-10', monto: 1200 })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar monto' }))
    dlg = screen.getByRole('dialog')
    await userEvent.click(within(dlg).getByRole('radio', { name: 'Desde este mes' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar ajuste' }))
    expect(mutar).toHaveBeenLastCalledWith('fuenteMes.aplicar', { fuente_id: 'f1', mes: '2026-10', monto: 1000, desde_este_mes: true })
  })

  it('quitar el ajuste y marcar «No aplica este mes» usan sus acciones', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Ajustar monto' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar del mes' }))
    expect(mutar).toHaveBeenLastCalledWith('fuenteMes.quitar', { fuente_id: 'f1', mes: '2026-10' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await userEvent.click(screen.getAllByRole('button', { name: 'No aplica este mes' })[0]!)
    expect(mutar).toHaveBeenLastCalledWith('fuenteMes.omitir', { fuente_id: 'f1', mes: '2026-10' })
  })

  it('crear valida nombre repetido y monto, y aplica al mes visible con un id fijo', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva fuente' }))
    const dlg = screen.getByRole('dialog', { name: 'Nueva fuente' })
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'sueldo')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Ya existe una fuente con ese nombre.')).toBeInTheDocument()
    expect(within(dlg).getByText('Escribe el monto.')).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
    await userEvent.clear(within(dlg).getByLabelText('Nombre'))
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Freelance')
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Monto/ }), '350.50')
    mutar.mockReturnValue(new Promise(() => {})) // el servidor aún no responde
    await userEvent.dblClick(within(dlg).getByRole('button', { name: 'Crear' }))
    const llamadas = mutar.mock.calls.filter((c) => c[0] === 'fuente.guardar')
    expect(llamadas).toHaveLength(1) // doble clic: una sola escritura
    const p = llamadas[0]![1] as Record<string, unknown>
    expect(p).toMatchObject({ nombre: 'Freelance', monto_defecto: 350.5, recurrencia: 'mensual', mes_inicio: '2026-10', aplicar_mes: '2026-10', monto_mes: 350.5, activo: true, es_principal: false })
    expect(p['version']).toBeUndefined()
    expect(String(p['id'])).toMatch(/^fue-/)
  })

  it('una fuente principal no puede quedar inactiva', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva fuente' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Beca')
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Monto/ }), '10')
    await userEvent.click(within(dlg).getByRole('switch', { name: 'Fuente principal' }))
    await userEvent.click(within(dlg).getByRole('switch', { name: 'Fuente activa' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('La fuente principal debe estar activa.')).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })

  it('eliminar una fuente usada ofrece desactivarla en su lugar', async () => {
    montar()
    mutar.mockResolvedValueOnce({ ok: true, data: { eliminado: false, motivo: 'en_uso', dependencias: { meses_con_gastos: 2 } } })
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Sueldo' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    expect(mutar).toHaveBeenCalledWith('fuente.eliminar', { id: 'f1', confirmar: true })
    const dlg = await screen.findByRole('dialog', { name: 'Está en uso' })
    expect(dlg).toHaveTextContent('2 meses con gastos')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar en su lugar' }))
    expect(mutar).toHaveBeenLastCalledWith('fuente.guardar', expect.objectContaining({ id: 'f1', activo: false }))
  })
})

describe('Presupuesto · cajas', () => {
  const abrirCajas = async () => userEvent.click(screen.getByRole('tab', { name: /Cajas/ }))

  it('muestra asignado, gastado, disponible en negativo y estado «Excedida 125 %»', async () => {
    montar()
    await abrirCajas()
    const t = screen.getByRole('heading', { name: /Comida/ }).closest('li')!
    expect(within(t).getByText('Excedida 125 %')).toBeInTheDocument()
    expect(within(t).getByText('Disponible').nextElementSibling).toHaveClass('text-danger')
    expect(within(t).getByText('Disponible').nextElementSibling).toHaveTextContent(/-.*50\.00/)
    const m = screen.getByRole('heading', { name: /Movilidad/ }).closest('li')!
    expect(within(m).getByText('Al día')).toBeInTheDocument()
  })

  it('busca sin tildes y ordena por uso', async () => {
    montar()
    await abrirCajas()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar cajas' }), 'movilidad')
    expect(screen.queryByRole('heading', { name: /Comida/ })).toBeNull()
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar cajas' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar por' }), 'uso')
    const nombres = within(screen.getByRole('list', { name: 'Cajas' })).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(nombres[0]).toMatch(/Comida/)
  })

  it('el alcance duplicado se rechaza y el solape se avisa sin bloquear', async () => {
    montar()
    await abrirCajas()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva caja' }))
    const dlg = screen.getByRole('dialog', { name: 'Nueva caja' })
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Almuerzos')
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Monto/ }), '80')
    await userEvent.click(within(dlg).getByRole('radio', { name: 'Subcategoría' }))
    await userEvent.click(within(dlg).getByRole('combobox', { name: 'Subcategoría' }))
    await userEvent.click(screen.getByRole('option', { name: 'Alimentación › Café' }))
    expect(within(dlg).getByRole('status')).toHaveTextContent(/Comparte gastos con «Comida»/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(mutar).toHaveBeenCalledWith('caja.guardar', expect.objectContaining({ nombre: 'Almuerzos', alcance: 'subcategoria', alcance_id: 'sub-caf', monto_defecto: 80, aplicar_mes: '2026-10', monto_mes: 80 }))
  })

  it('crear con el mismo alcance que otra caja activa muestra el error en el campo', async () => {
    montar()
    await abrirCajas()
    await userEvent.click(screen.getByRole('button', { name: 'Nueva caja' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Otra comida')
    await userEvent.type(within(dlg).getByRole('textbox', { name: /Monto/ }), '10')
    await userEvent.click(within(dlg).getByRole('combobox', { name: 'Categoría' }))
    await userEvent.click(screen.getByRole('option', { name: 'Alimentación' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText(/Ya hay una caja activa con este alcance \(«Comida»\)/)).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
  })

  it('desactivar una caja enseña el cambio de reservado y disponible', async () => {
    montar()
    await abrirCajas()
    await userEvent.click(screen.getByRole('switch', { name: 'Caja Comida activa' }))
    const dlg = screen.getByRole('dialog', { name: 'Desactivar la caja «Comida»' })
    expect(within(dlg).getByRole('row', { name: /Reservado en cajas/ })).toHaveTextContent(/500\.00.*300\.00/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar' }))
    expect(mutar).toHaveBeenCalledWith('caja.guardar', expect.objectContaining({ id: 'c1', activo: false, version: 3 }))
  })

  it('Subir y Bajar mandan el orden completo; con un filtro activo no se puede reordenar', async () => {
    montar()
    await abrirCajas()
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Movilidad' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Subir' }))
    expect(mutar).toHaveBeenCalledWith('caja.reordenar', { ids: ['c2', 'c1'] })
    await userEvent.keyboard('{Escape}')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar por' }), 'nombre')
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Movilidad' }))
    expect(screen.getByRole('menuitem', { name: 'Subir' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('«No aplica este mes» llama a cajaMes.omitir', async () => {
    montar()
    await abrirCajas()
    const t = screen.getByRole('heading', { name: /Movilidad/ }).closest('li')!
    await userEvent.click(within(t).getByRole('button', { name: 'No aplica este mes' }))
    expect(mutar).toHaveBeenCalledWith('cajaMes.omitir', { caja_id: 'c2', mes: '2026-10' })
  })
})

describe('Presupuesto · copiar y plantillas', () => {
  it('copiar del mes anterior lista lo que se creará, respeta lo existente y envía montos y exclusiones', async () => {
    const h = f3()
    h.fuentes_mes = h.fuentes_mes.filter((x) => x.mes !== '2026-10')
    h.cajas_mes = h.cajas_mes.filter((x) => x.mes !== '2026-10')
    montar(h)
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Copiar del mes anterior' }))
    const dlg = screen.getByRole('dialog', { name: /Copiar del mes anterior a 2026-10/ })
    expect(within(dlg).getAllByRole('listitem')).toHaveLength(2)
    const monto = within(dlg).getByRole('textbox', { name: 'Monto de Sueldo' })
    await userEvent.clear(monto)
    await userEvent.type(monto, '950')
    await userEvent.click(within(dlg).getByRole('checkbox', { name: /Comida/ }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Copiar 1 elemento' }))
    expect(mutar).toHaveBeenCalledWith('mes.copiarDeAnterior', { mes: '2026-10', excluir: [{ tipo: 'caja', id: 'c1' }], montos: { 'fuente:f1': 950 } })
  })

  it('si todo ya existe no ofrece copiar', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar del mes anterior' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByRole('button', { name: 'Nada que copiar' })).toBeDisabled()
    expect(dlg).toHaveTextContent('Ya existe en 2026-10')
  })

  it('crea una plantilla desde una caja y la aplica con vista previa', async () => {
    montar()
    await userEvent.click(screen.getByRole('tab', { name: /Cajas/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Movilidad' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Guardar como plantilla' }))
    const dlg = screen.getByRole('dialog', { name: 'Nueva plantilla' })
    expect(within(dlg).getByLabelText('Nombre')).toHaveValue('Movilidad · mensual')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(mutar).toHaveBeenCalledWith('plantilla.guardar', expect.objectContaining({ tipo: 'caja', nombre: 'Movilidad · mensual', datos: { caja_id: 'c2', monto: 300 }, activo: true }))
  })

  it('aplicar plantillas muestra Crear / Actualizar / Sin cambios y envía lo elegido', async () => {
    const h = f3()
    h.plantillas = [
      { id: 'p1', tipo: 'caja', nombre: 'Comida base', datos_json: { caja_id: 'c1', monto: 220 }, orden: 1, activo: true, ...meta },
      { id: 'p2', tipo: 'caja', nombre: 'Movilidad base', datos_json: { caja_id: 'c2', monto: 300 }, orden: 2, activo: true, ...meta },
    ]
    montar(h)
    await userEvent.click(screen.getByRole('tab', { name: /Plantillas/ }))
    await userEvent.click(within(screen.getByRole('region', { name: 'Plantillas de cajas' })).getByRole('button', { name: 'Aplicar a 2026-10' }))
    const dlg = screen.getByRole('dialog', { name: /Aplicar plantillas de cajas a 2026-10/ })
    const filas = within(dlg).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Actualizar')
    expect(filas[1]).toHaveTextContent('Sin cambios')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Aplicar' }))
    expect(mutar).toHaveBeenCalledWith('plantilla.aplicarMes', { tipo: 'caja', mes: '2026-10', plantilla_ids: ['p1', 'p2'], omitir_ids: [], montos: {} })
  })
})
