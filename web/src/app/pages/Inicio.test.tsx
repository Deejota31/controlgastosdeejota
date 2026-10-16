import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hojasVacias } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { hojasF3, hojasPrueba, mov } from '@/test/fixtures'
import { Inicio } from './Inicio'

const kpi = (titulo: string) => screen.getByRole('heading', { name: titulo, level: 3 }).closest('section')!
const resumen = (t: string) => screen.getByText(t, { selector: 'dt' }).nextElementSibling!.textContent
const cfg = { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }

function montar(h = hojasF3()) {
  useDatos.setState({ vista: h, confirmado: h, pendientes: [], config: cfg, zona: 'America/Lima' } as never)
  return render(<Inicio />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('Inicio · números del conjunto F3', () => {
  it('el resumen reconcilia con el presupuesto: P 1,000 · gastado 450 · disponible 550 · saldo libre 350', () => {
    montar()
    expect(resumen('Presupuesto (P)')).toMatch(/1,000\.00/)
    expect(resumen('Gastado')).toMatch(/450\.00/)
    expect(resumen('Disponible')).toMatch(/550\.00/)
    expect(resumen('Reservado en cajas')).toMatch(/500\.00/)
    expect(resumen('Saldo libre')).toMatch(/350\.00/)
    expect(resumen('% consumido')).toMatch(/45\s?%/)
    expect(screen.getByText(/Exceso en cajas: .*50\.00/)).toBeInTheDocument()
  })

  it('la barra segmentada describe gastado + reservado sin usar + saldo libre = P', () => {
    montar()
    expect(screen.getByRole('img', { name: /Presupuesto .*1,000\.00: gastado .*450\.00, reservado sin usar .*200\.00, saldo libre .*350\.00/ })).toBeInTheDocument()
  })

  it('muestra los 8 KPIs con ⓘ y su variación frente al mes anterior', () => {
    montar()
    const titulos = ['Presupuesto', 'Gastado', 'Disponible', '% consumido', 'Promedio diario', 'Ticket promedio', 'Mayor gasto', 'Movimientos']
    for (const t of titulos) {
      const k = kpi(t)
      expect(within(k).getByRole('button', { name: 'Más información' })).toBeInTheDocument()
      expect(within(k).getByText(/vs mes anterior|Sin mes anterior|Igual que/)).toBeInTheDocument()
    }
    expect(kpi('Gastado')).toHaveTextContent(/450\.00/)
    expect(kpi('Mayor gasto')).toHaveTextContent(/250\.00/)
    expect(kpi('Ticket promedio')).toHaveTextContent(/150\.00/)
    expect(kpi('Movimientos')).toHaveTextContent(/3/)
    expect(kpi('Gastado')).toHaveTextContent(/Sin mes anterior para comparar/)
  })

  it('con gasto en el mes anterior calcula la variación y su tono', () => {
    const h = hojasF3()
    h.movimientos.push(mov({ id: 'p1', fecha: '2026-09-10', monto: 300, monto_base: 300 }))
    montar(h)
    expect(kpi('Gastado')).toHaveTextContent(/\+50 % vs mes anterior/)
    expect(within(kpi('Gastado')).getByText(/vs mes anterior/)).toHaveClass('text-danger')
  })

  it('anular el gasto de 250 deja gastado 200 · disponible 800 · reservas 400 · saldo libre 400', () => {
    const h = hojasF3()
    h.movimientos = h.movimientos.map((m) => (m.id === 'm1' ? { ...m, estado: 'anulado' as const } : m))
    montar(h)
    expect(resumen('Gastado')).toMatch(/200\.00/)
    expect(resumen('Disponible')).toMatch(/800\.00/)
    expect(resumen('Saldo libre')).toMatch(/400\.00/)
    expect(screen.getByRole('img', { name: /reservado sin usar .*400\.00/ })).toBeInTheDocument()
    expect(screen.queryByText(/Exceso en cajas/)).not.toBeInTheDocument()
  })

  it('las mini tarjetas de cajas muestran progreso y estado', () => {
    montar()
    const cajas = screen.getByRole('heading', { name: 'Cajas' }).closest('section')!
    const comida = within(cajas).getByText('Comida').closest('li')!
    expect(comida).toHaveTextContent(/250\.00 \/ .*200\.00/)
    expect(comida).toHaveTextContent('Excedida 125 %')
    const mov_ = within(cajas).getByText('Movilidad').closest('li')!
    expect(mov_).toHaveTextContent('Al día')
  })

  it('el donut por ámbito suma el total y su leyenda filtra por ámbito (queda en la URL)', async () => {
    vi.useRealTimers()
    montar()
    const leyenda = screen.getByRole('list', { name: 'Leyenda de Gasto por ámbito' })
    expect(within(leyenda).getByText('Personal')).toBeInTheDocument()
    await userEvent.click(within(leyenda).getByRole('button', { name: /Hogar/ }))
    expect(window.location.hash).toContain('a=amb-h')
    const chips = screen.getByRole('list', { name: 'Filtros activos' })
    expect(within(chips).getByText('Hogar')).toBeInTheDocument()
    expect(kpi('Gastado')).toHaveTextContent(/100\.00/)
  })

  it('Top 5 se alterna entre categorías y subcategorías', async () => {
    vi.useRealTimers()
    montar()
    const top = screen.getByRole('heading', { name: 'Top 5' }).closest('section')!
    expect(within(top).getByText('Alimentación')).toBeInTheDocument()
    await userEvent.click(within(top).getByRole('radio', { name: 'Subcategorías' }))
    expect(within(top).getByText('Café')).toBeInTheDocument()
    expect(within(top).queryByText('Alimentación')).not.toBeInTheDocument()
  })

  it('la jerarquía nace contraída, se expande por nodo y con «Expandir todo»', async () => {
    vi.useRealTimers()
    montar()
    const lista = screen.getByRole('list', { name: 'Jerarquía de gastos' })
    expect(within(lista).getByText('Personal')).toBeInTheDocument()
    expect(within(lista).queryByText('Café')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expandir todo' }))
    expect(within(lista).getByText('Café')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Contraer todo' }))
    expect(within(lista).queryByText('Café')).not.toBeInTheDocument()
  })

  it('las pestañas de análisis muestran el flujo de medios y las burbujas con tabla equivalente', async () => {
    vi.useRealTimers()
    montar()
    await userEvent.click(screen.getByRole('tab', { name: 'Flujo de medios' }))
    expect(screen.getByRole('group', { name: 'Flujo de medios de pago a ámbitos' })).toBeInTheDocument()
    expect(screen.getByText(/Ver datos de «Flujo de medios»/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Frecuencia vs monto' }))
    expect(screen.getByRole('group', { name: /Frecuencia contra monto/ })).toBeInTheDocument()
  })
})

describe('Inicio · estados vacíos y filtros', () => {
  it('mes sin configurar ofrece «Preparar mi mes» y «Copiar del mes anterior»', async () => {
    vi.useRealTimers()
    const h = hojasPrueba()
    montar(h)
    expect(screen.getByText('Este mes aún no tiene presupuesto')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar del mes anterior' }))
    expect(window.location.hash).toBe('#/presupuesto?accion=copiar')
  })

  it('sin movimientos no inventa datos: explica y ofrece registrar', () => {
    const h = hojasPrueba()
    montar(h)
    expect(screen.getByText('Aún no hay movimientos en este período')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gasto acumulado' })).not.toBeInTheDocument()
  })

  it('los filtros se leen de la URL y «Limpiar filtros» los quita', async () => {
    vi.useRealTimers()
    window.history.replaceState(null, '', '#/?p=mes_anterior&a=amb-h')
    montar()
    const chips = screen.getByRole('list', { name: 'Filtros activos' })
    expect(within(chips).getByText('Mes anterior')).toBeInTheDocument()
    expect(within(chips).getByText('Hogar')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!)
    expect(window.location.hash).toBe('#/')
  })

  it('parámetros inválidos en la URL se ignoran sin romper la pantalla', () => {
    window.history.replaceState(null, '', '#/?p=hack&a=%3Cscript%3E&d=zzz')
    montar()
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).not.toBeInTheDocument()
    expect(resumen('Gastado')).toMatch(/450\.00/)
  })

  it('el período personalizado muestra fechas y las flechas mueven el rango', async () => {
    vi.useRealTimers()
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }))
    expect(window.location.hash).toMatch(/p=personalizado&d=2026-09-01&h=2026-09-30/)
    expect(kpi('Gastado')).toHaveTextContent(/0\.00/)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-15' } })
    expect(window.location.hash).toContain('d=2026-09-15')
  })
})

describe('Inicio con fecha viva', () => {
  it('al cruzar el fin de mes (23:59 → 00:01 en Lima) el dashboard cambia de mes sin recargar', () => {
    vi.setSystemTime(new Date('2026-10-31T23:59:30-05:00'))
    const vacias = hojasVacias()
    vacias.movimientos = [mov({ id: 'a', fecha: '2026-10-30', monto: 100, monto_base: 100 }), mov({ id: 'b', fecha: '2026-10-31', monto: 20, monto_base: 20 }), mov({ id: 'c', fecha: '2026-11-01', monto: 5, monto_base: 5 })]
    useDatos.setState({ zona: 'America/Lima', vista: vacias, confirmado: vacias, config: cfg } as never)
    render(<Inicio />)
    expect(kpi('Movimientos')).toHaveTextContent(/2/)
    act(() => {
      vi.setSystemTime(new Date('2026-11-01T00:01:30-05:00'))
      vi.advanceTimersByTime(90_000)
    })
    expect(kpi('Movimientos')).toHaveTextContent(/1/)
  })
})
