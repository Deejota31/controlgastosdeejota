import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hojas } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { hojasF3, mov } from '@/test/fixtures'
import { Salud } from './Salud'

const mutar = vi.fn()
const meta = { creado_en: '', actualizado_en: '', version: 2 }
const cfg = { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }

function datos(): Hojas {
  const h = hojasF3()
  h.compromisos = [
    { id: 'c-alq', plantilla_id: '', nombre: 'Alquiler', monto_previsto: 400, moneda: 'PEN', dia_vencimiento: 10, activo: true, ...meta },
    { id: 'c-luz', plantilla_id: '', nombre: 'Luz', monto_previsto: 100, moneda: 'PEN', dia_vencimiento: 18, activo: true, ...meta },
    { id: 'c-net', plantilla_id: '', nombre: 'Internet', monto_previsto: 100, moneda: 'PEN', dia_vencimiento: 25, activo: true, ...meta },
  ]
  h.compromiso_pagos = [{ id: 'p1', compromiso_id: 'c-net', movimiento_id: 'm2', mes: '2026-10', creado_en: '' }]
  return h
}

function montar(seccion: string, h: Hojas = datos()) {
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  window.history.replaceState(null, '', `#/salud?seccion=${seccion}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  useDatos.setState({ vista: h, confirmado: h, pendientes: [], config: cfg, zona: 'America/Lima', mutar } as never)
  useFormMov.setState({ abierto: false, semilla: undefined })
  return render(<Salud />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('Salud financiera · estructura', () => {
  it('muestra cinco tarjetas-pestaña con su resumen y Conciliación es la quinta', () => {
    montar('calidad')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining('Calidad de datos'), expect.stringContaining('Mi presupuesto'), expect.stringContaining('Evolución'), expect.stringContaining('Compromisos'), expect.stringContaining('Conciliación de saldos'),
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Mi presupuesto/ })).toHaveTextContent(/50\.00 libres/)
    expect(screen.getByRole('tab', { name: /Compromisos/ })).toHaveTextContent('3 activos')
  })
  it('cambiar de tarjeta lo deja en la URL y el teclado recorre las pestañas', async () => {
    montar('calidad')
    await userEvent.click(screen.getByRole('tab', { name: /Evolución/ }))
    expect(window.location.hash).toContain('seccion=evolucion')
    screen.getByRole('tab', { name: /Evolución/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Compromisos/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Salud · calidad de datos', () => {
  it('anillo con puntaje, cuatro dimensiones con peso y revisión de duplicados', async () => {
    const h = datos()
    h.movimientos = [...h.movimientos, mov({ id: 'd1', fecha: '2026-10-07', monto: 12, monto_base: 12, descripcion: 'Menú' }), mov({ id: 'd2', fecha: '2026-10-07', monto: 12, monto_base: 12, descripcion: 'Menú' })]
    montar('calidad', h)
    expect(screen.getByRole('img', { name: /Calidad de datos: \d+ de 100/ })).toBeInTheDocument()
    const dims = within(screen.getByRole('list', { name: 'Dimensiones de la calidad' })).getAllByRole('listitem')
    expect(dims).toHaveLength(4)
    expect(dims[0]).toHaveTextContent('peso 30 %')
    expect(dims[3]).toHaveTextContent('peso 20 %')
    await userEvent.click(screen.getByRole('button', { name: 'Revisar datos' }))
    await userEvent.click(screen.getByRole('tab', { name: /Duplicados \(1\)/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Legítimo' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('revision.guardar', expect.objectContaining({ tipo_alerta: 'duplicado', estado: 'legitimo', movimiento_ids: ['d1', 'd2'] })))
  })

  it('confirmar un duplicado ofrece anular uno y lo hace después de guardar la revisión', async () => {
    const h = datos()
    h.movimientos = [...h.movimientos, mov({ id: 'd1', fecha: '2026-10-07', monto: 12, monto_base: 12, descripcion: 'Menú' }), mov({ id: 'd2', fecha: '2026-10-07', monto: 12, monto_base: 12, descripcion: 'Menú' })]
    montar('calidad', h)
    await userEvent.click(screen.getByRole('button', { name: 'Revisar datos' }))
    await userEvent.click(screen.getByRole('tab', { name: /Duplicados/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Duplicado confirmado' }))
    const dlg = screen.getByRole('dialog', { name: 'Duplicado confirmado' })
    await userEvent.click(within(dlg).getAllByRole('radio')[0]!)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Anular el elegido' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('movimiento.anular', expect.objectContaining({ id: 'd1' })))
    expect(mutar.mock.calls.map((c) => c[0])).toEqual(['revision.guardar', 'movimiento.anular'])
    expect(mutar.mock.calls[0]![1]).toMatchObject({ estado: 'duplicado' })
  })

  it('clasificación inactiva: muestra el motivo y una sugerencia sin cambiar nada por su cuenta', async () => {
    const h = datos()
    h.subcategorias = h.subcategorias.map((s) => (s.id === 'sub-caf' ? { ...s, activo: false } : s))
    montar('calidad', h)
    await userEvent.click(screen.getByRole('button', { name: 'Revisar datos' }))
    await userEvent.click(screen.getByRole('tab', { name: /Clasificación/ }))
    expect(screen.getAllByText(/Subcategoría inactiva/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sugerencia:/)[0]).toHaveTextContent('Alimentación › Almuerzo')
    expect(mutar).not.toHaveBeenCalled()
  })
})

describe('Salud · mi presupuesto y evolución', () => {
  it('disponible tras compromisos y solo la caja excedida en riesgo', () => {
    montar('presupuesto')
    expect(screen.getByText('Disponible tras compromisos').closest('section')).toHaveTextContent(/S\/ 50\.00.*550\.00 − compromisos pendientes S\/ 500\.00/)
    const riesgo = screen.getByRole('heading', { name: 'Cajas en riesgo' }).closest('section')!
    expect(within(riesgo).getByText('Comida')).toBeInTheDocument()
    expect(within(riesgo).queryByText('Movilidad')).not.toBeInTheDocument()
    expect(riesgo).toHaveTextContent('Excedida 125 %')
  })
  it('evolución lista subidas con «Nuevo» y calcula el ahorro potencial sobre el gasto variable', () => {
    montar('evolucion')
    expect(screen.getByRole('heading', { name: /Más subieron/ })).toBeInTheDocument()
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThan(0)
    expect(screen.getByText(/Ahorro potencial al 10 %/).closest('section')).toHaveTextContent(/45\.00/)
  })
})

describe('Salud · compromisos', () => {
  it('muestra totales y ordena vencido primero; el cubierto queda contraído', () => {
    montar('compromisos')
    expect(screen.getByText('Previsto').closest('section')).toHaveTextContent(/600\.00/)
    expect(screen.getByText('Pagado').closest('section')).toHaveTextContent(/100\.00/)
    expect(screen.getByText('Pendiente').closest('section')).toHaveTextContent(/500\.00/)
    const lista = screen.getByRole('list', { name: 'Compromisos por pagar' })
    const nombres = within(lista).getAllByRole('listitem').filter((li) => li.querySelector('p.font-medium')).map((li) => li.querySelector('p.font-medium')!.textContent)
    expect(nombres).toEqual(['Alquiler', 'Luz'])
    expect(within(lista).getAllByText(/Vencido|Próximo|Pendiente/).length).toBeGreaterThan(0)
    expect(screen.getByText('Venció hace 5 días')).toBeInTheDocument()
    expect(screen.getByText('Pagados (1)').closest('details')).not.toHaveAttribute('open')
  })
  it('«Registrar pago» abre el formulario precargado y vinculado al compromiso', async () => {
    montar('compromisos')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago de Alquiler' }))
    const s = useFormMov.getState()
    expect(s.abierto).toBe(true)
    expect(s.semilla).toMatchObject({ compromisoId: 'c-alq', descripcion: 'Alquiler', monto: '400', moneda: 'PEN' })
  })
  it('asociar ofrece solo movimientos libres y envía el vínculo del mes', async () => {
    montar('compromisos')
    await userEvent.click(screen.getByRole('button', { name: 'Asociar movimiento a Luz' }))
    const dlg = screen.getByRole('dialog', { name: 'Asociar movimiento' })
    expect(within(dlg).getAllByRole('radio')).toHaveLength(2) // m1 y m3: m2 ya paga Internet
    await userEvent.click(within(dlg).getAllByRole('radio')[0]!)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Asociar' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('compromiso.vincular', expect.objectContaining({ compromiso_id: 'c-luz', mes: '2026-10' })))
  })
  it('quitar un pago pide confirmación y envía desvincular', async () => {
    montar('compromisos')
    await userEvent.click(screen.getByText('Pagados (1)'))
    await userEvent.click(screen.getByText(/Pagos vinculados/))
    await userEvent.click(screen.getByRole('button', { name: /Quitar pago/ }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Quitar pago' })).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('compromiso.desvincular', { compromiso_id: 'c-net', movimiento_id: 'm2' }))
  })
})

describe('Salud · conciliación de saldos', () => {
  const conGrupo = () => {
    const h = datos()
    h.grupos_fondos = [{ id: 'g1', nombre: 'Cuentas', fuente_ids_json: ['f1'], activo: true, ...meta }]
    return h
  }
  it('crear un grupo envía todas sus fuentes con un id fijo', async () => {
    montar('conciliacion')
    await userEvent.click(screen.getAllByRole('button', { name: /Nuevo grupo|Crear mi primer grupo/ })[0]!)
    await userEvent.type(screen.getByLabelText(/Nombre del grupo/), 'Mi dinero')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sueldo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar grupo' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('grupoFondos.guardar', expect.objectContaining({ nombre: 'Mi dinero', fuente_ids: ['f1'], activo: true, id: expect.stringMatching(/^gru-/) })))
  })
  it('una fuente que ya está en otro grupo activo no se puede elegir', async () => {
    montar('conciliacion', conGrupo())
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo' }))
    expect(screen.getByRole('checkbox', { name: 'Sueldo' })).toBeDisabled()
    expect(screen.getByText(/Ya está en «Cuentas»/)).toBeInTheDocument()
  })
  it('verificar compara el calculado con el saldo real, muestra diferencia con signo y %, y no crea movimientos', async () => {
    montar('conciliacion', conGrupo())
    await userEvent.click(screen.getByRole('button', { name: 'Verificar saldo' }))
    const dlg = screen.getByRole('dialog', { name: 'Verificar saldo' })
    expect(within(dlg).getByText('Disponible calculado').nextElementSibling).toHaveTextContent(/550\.00/)
    await userEvent.type(within(dlg).getByRole('textbox', { name: 'Saldo real' }), '500')
    expect(within(dlg).getByRole('status')).toHaveTextContent(/Diferencia: −.*50\.00 \(−9\.1 % del calculado\)/)
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar verificación' }))
    await waitFor(() => expect(mutar).toHaveBeenCalled())
    const [accion, payload] = mutar.mock.calls[0]!
    expect(accion).toBe('conciliacion.verificar')
    expect(payload).toMatchObject({ grupo_id: 'g1', periodo: '2026-10', fecha_corte: '2026-10-15', saldo_calculado: 550, saldo_real: 500, hora: expect.stringMatching(/^\d\d:\d\d$/) })
    expect(mutar.mock.calls.every((c) => !String(c[0]).startsWith('movimiento'))).toBe(true)
  })
  it('la fecha de corte puede cambiarse y recalcula el saldo', async () => {
    montar('conciliacion', conGrupo())
    await userEvent.click(screen.getByRole('button', { name: 'Verificar saldo' }))
    const dlg = screen.getByRole('dialog', { name: 'Verificar saldo' })
    fireEvent.change(within(dlg).getByLabelText('Fecha de corte'), { target: { value: '2026-10-04' } })
    expect(within(dlg).getByText('Disponible calculado').nextElementSibling).toHaveTextContent(/1,000\.00/)
  })
  const filaVerif = {
    id: 'v1', tipo: 'verificacion' as const, conciliacion_id: 'k1', periodo: '2026-10', fecha_corte: '2026-10-15', hora: '10:00', grupo_id: 'g1', saldo_calculado: 550, saldo_real: 500, diferencia: -50,
    estado: 'pendiente' as const, causa: '', observacion: '', reemplaza_a: '', creado_en: '2026-10-15T15:00:00Z',
  }
  it('revisar diferencia: cerrar con diferencia justificada exige causa y agrega un seguimiento', async () => {
    const h = conGrupo()
    h.conciliaciones = [filaVerif]
    montar('conciliacion', h)
    expect(screen.getByText('Pendiente', { selector: 'span' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Revisar diferencia' }))
    const dlg = screen.getByRole('dialog', { name: 'Revisar diferencia' })
    expect(within(dlg).getByText(/Nunca se crean movimientos solo para cuadrar/)).toBeInTheDocument()
    await userEvent.selectOptions(within(dlg).getByLabelText('Estado'), 'cerrada_justificada')
    expect(within(dlg).getByRole('button', { name: 'Guardar seguimiento' })).toBeDisabled()
    await userEvent.type(within(dlg).getByLabelText('Causa de la diferencia'), 'Comisión del banco')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar seguimiento' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('conciliacion.seguimiento', expect.objectContaining({ conciliacion_id: 'k1', estado: 'cerrada_justificada', causa: 'Comisión del banco', id: expect.stringMatching(/^seg-/) })))
  })
  it('«Registrar un gasto olvidado» abre el formulario con la fecha de corte', async () => {
    const h = conGrupo()
    h.conciliaciones = [filaVerif]
    montar('conciliacion', h)
    await userEvent.click(screen.getByRole('button', { name: 'Revisar diferencia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar un gasto olvidado' }))
    expect(useFormMov.getState().semilla).toMatchObject({ fecha: '2026-10-15' })
  })
  it('volver a verificar agrega una fila que reemplaza a la anterior, que pasa al historial', async () => {
    const h = conGrupo()
    h.conciliaciones = [filaVerif]
    montar('conciliacion', h)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    const dlg = screen.getByRole('dialog', { name: 'Volver a verificar' })
    await userEvent.type(within(dlg).getByRole('textbox', { name: 'Saldo real' }), '550')
    expect(within(dlg).getByRole('status')).toHaveTextContent('Cuadra')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar verificación' }))
    await waitFor(() => expect(mutar).toHaveBeenCalledWith('conciliacion.verificar', expect.objectContaining({ reemplaza_a: 'v1', saldo_real: 550 })))
  })
  it('una verificación reemplazada sale de la lista vigente y queda en el historial', () => {
    const h = conGrupo()
    h.conciliaciones = [filaVerif, { ...filaVerif, id: 'v2', conciliacion_id: 'k2', saldo_real: 550, diferencia: 0, estado: 'conciliada', reemplaza_a: 'v1', creado_en: '2026-10-15T16:00:00Z' }]
    montar('conciliacion', h)
    expect(screen.getAllByText('Conciliada', { selector: 'span' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Revisar diferencia' })).not.toBeInTheDocument()
    expect(screen.getByText(/Historial de verificaciones corregidas \(1\)/)).toBeInTheDocument()
  })
  it('si cambian los datos después de verificar, la verificación se ve desactualizada', () => {
    const h = conGrupo()
    h.conciliaciones = [{ ...filaVerif, estado: 'conciliada', saldo_real: 550, diferencia: 0 }]
    h.movimientos = [...h.movimientos, mov({ id: 'olvidado', fecha: '2026-10-10', monto: 30, monto_base: 30 })]
    montar('conciliacion', h)
    expect(screen.getByText('Desactualizada', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Los datos cambiaron desde esta verificación/)).toHaveTextContent(/520\.00/)
  })
})
