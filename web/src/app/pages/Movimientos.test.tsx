import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as exportar from '@/lib/exportar'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { hojasPrueba, mov } from '@/test/fixtures'
import { Movimientos } from './Movimientos'

const mutar = vi.fn()

function ancho(si: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: si, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }))
}

function datos(n = 60) {
  const h = hojasPrueba()
  h.movimientos = Array.from({ length: n }, (_, i) =>
    mov({
      id: `m${String(i + 1).padStart(3, '0')}`,
      fecha: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      descripcion: `G-${String(i + 1).padStart(3, '0')}`,
      monto: i + 1,
      monto_base: i + 1,
      estado: i % 10 === 9 ? 'anulado' : 'activo',
      creado_en: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`,
    }),
  )
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  useDatos.setState({ vista: h, confirmado: h, config: { moneda_base: 'PEN' }, zona: 'America/Lima', mutar } as never)
  window.location.hash = '#/movimientos'
}

async function verTodo() {
  await userEvent.click(screen.getByRole('radio', { name: 'Todo' }))
}

beforeEach(() => {
  ancho(true)
  datos()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Movimientos · lista', () => {
  it('muestra la tabla paginada con totales en moneda base', async () => {
    render(<Movimientos />)
    await verTodo()
    expect(screen.getByRole('table', { name: 'Movimientos' })).toBeInTheDocument()
    // 60 movimientos, 6 anulados (i%10==9) → 54 activos
    expect(screen.getByText('1–25 de 54')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(26) // cabecera + 25
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('26–50 de 54')).toBeInTheDocument()
  })

  it('el total coincide con la suma de los activos (anulados no suman)', async () => {
    render(<Movimientos />)
    await verTodo()
    const total = Array.from({ length: 60 }, (_, i) => i + 1).filter((n) => (n - 1) % 10 !== 9).reduce((a, b) => a + b, 0)
    const kpi = screen.getByText('Total del período').closest('div')!
    expect(kpi.textContent).toContain(total.toLocaleString('es-PE', { minimumFractionDigits: 2 }))
  })

  it('ordenar por una columna alterna el sentido y lo anuncia', async () => {
    render(<Movimientos />)
    await verTodo()
    const th = screen.getByRole('columnheader', { name: /Monto/ })
    await userEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(within(th).getByRole('button'))
    expect(th).toHaveAttribute('aria-sort', 'ascending')
    const filas = screen.getAllByRole('row').slice(1)
    expect(within(filas[0]!).getByText('G-001')).toBeInTheDocument()
  })

  it('buscar y filtrar por estado', async () => {
    render(<Movimientos />)
    await verTodo()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar movimientos' }), 'G-007')
    expect(screen.getByText('1–1 de 1')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.click(screen.getByRole('radio', { name: 'Anulados' }))
    expect(screen.getByText('1–6 de 6')).toBeInTheDocument()
  })

  it('sin coincidencias ofrece limpiar filtros', async () => {
    render(<Movimientos />)
    await verTodo()
    await userEvent.type(screen.getByRole('searchbox'), 'zzzz')
    expect(screen.getByText('Ningún movimiento coincide')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' }).at(-1)!)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Este mes' })).toBeChecked()
  })

  it('en pantallas estrechas usa tarjetas en vez de tabla', () => {
    ancho(false)
    render(<Movimientos />)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('sin ningún movimiento invita a crear el primero', async () => {
    datos(0)
    render(<Movimientos />)
    expect(screen.getByText('Aún no hay movimientos')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Nuevo movimiento' }).at(-1)!)
    expect(useFormMov.getState()).toMatchObject({ abierto: true, modo: 'nuevo' })
  })
})

describe('Movimientos · acciones de fila', () => {
  async function menuDe(texto: string) {
    const fila = screen.getByText(texto).closest('tr')!
    await userEvent.click(within(fila).getByRole('button', { name: /^Acciones de/ }))
    return screen.getByRole('menu')
  }

  it('anular pide confirmar y envía la versión', async () => {
    render(<Movimientos />)
    await verTodo()
    const menu = await menuDe('G-059')
    expect(within(menu).getAllByRole('menuitem').map((x) => x.textContent)).toEqual(['Editar', 'Clonar', 'Anular', 'Ver historial'])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Anular' }))
    expect(screen.getByText(/dejará de sumar en tus totales/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Anular' }))
    expect(mutar).toHaveBeenCalledWith('movimiento.anular', { id: 'm059', version: 1 })
  })

  it('un movimiento anulado no se edita pero sí se restaura o clona', async () => {
    render(<Movimientos />)
    await userEvent.click(screen.getByRole('radio', { name: 'Todo' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Anulados' }))
    const menu = await menuDe('G-060')
    expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Restaurar' }))
    expect(mutar).toHaveBeenCalledWith('movimiento.restaurar', { id: 'm060', version: 1 })
  })

  it('Editar y Clonar abren el formulario único', async () => {
    render(<Movimientos />)
    await verTodo()
    const menu = await menuDe('G-058')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Clonar' }))
    expect(useFormMov.getState()).toMatchObject({ abierto: true, modo: 'clonar' })
    expect(useFormMov.getState().movimiento?.id).toBe('m058')
  })
})

describe('Movimientos · selección persistente y lote', () => {
  it('la selección sobrevive a cambiar de página y de filtro', async () => {
    render(<Movimientos />)
    await verTodo()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar G-059' }))
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar G-021' }))
    expect(screen.getByText('2 seleccionados')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'), 'G-05')
    expect(screen.getByText('2 seleccionados')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    expect(screen.getByRole('checkbox', { name: 'Seleccionar G-059' })).toBeChecked()
  })

  it('anular en lote muestra el impacto y envía todos los ids en una sola petición', async () => {
    render(<Movimientos />)
    await verTodo()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar G-059' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar G-058' }))
    await userEvent.click(screen.getByRole('button', { name: 'Anular' }))
    const dlg = screen.getByRole('dialog', { name: 'Anular movimientos' })
    expect(within(dlg).getByText(/Se aplicará a/).textContent).toContain('2 de 2')
    expect(within(dlg).getByText(/S\/\s*117\.00/)).toBeInTheDocument()
    await userEvent.click(within(dlg).getByRole('button', { name: 'Anular' }))
    expect(mutar).toHaveBeenCalledTimes(1)
    expect(mutar).toHaveBeenCalledWith('movimientos.accionLote', { accion: 'anular', ids: ['m059', 'm058'] })
    expect(screen.queryByText(/seleccionados?$/)).toBeNull() // la selección se limpia
  })

  it('cambiar medio con anulados en la selección queda bloqueado', async () => {
    render(<Movimientos />)
    await userEvent.click(screen.getByRole('radio', { name: 'Todo' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar G-060' })) // anulado
    await userEvent.click(screen.getByRole('button', { name: 'Medio de pago…' }))
    const dlg = screen.getByRole('dialog')
    expect(within(dlg).getByRole('alert')).toHaveTextContent('anulados')
    expect(within(dlg).getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  })

  it('«Seleccionar los N filtrados» selecciona todas las páginas', async () => {
    render(<Movimientos />)
    await verTodo()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar los de esta página' }))
    expect(screen.getByText('25 seleccionados')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar los 54 filtrados' }))
    expect(screen.getByText('54 seleccionados')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }))
    expect(screen.queryByText(/54 seleccionados/)).toBeNull()
  })
})

describe('Movimientos · exportación', () => {
  it('exporta lo filtrado (todas las páginas) a CSV', async () => {
    const d = vi.spyOn(exportar, 'descargar').mockImplementation(() => undefined)
    render(<Movimientos />)
    await verTodo()
    await userEvent.click(screen.getByRole('button', { name: 'CSV' }))
    expect(d).toHaveBeenCalledTimes(1)
    const [nombre, contenido] = d.mock.calls[0] as unknown as [string, string]
    expect(nombre).toMatch(/^movimientos-historial\.csv$/)
    expect(contenido.split('\r\n')).toHaveLength(1 + 54)
  })
})

describe('Movimientos · orden manual', () => {
  it('mover con los botones guarda el orden de todo lo filtrado', async () => {
    datos(5)
    render(<Movimientos />)
    await verTodo()
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'manual')
    await userEvent.click(screen.getByRole('button', { name: /^Subir G-004/ }))
    expect(mutar).toHaveBeenCalledTimes(1)
    const [accion, p] = mutar.mock.calls[0] as [string, { items: Array<{ movimiento_id: string; orden: number }> }]
    expect(accion).toBe('movimientos.reordenar')
    expect(p.items).toHaveLength(5)
    expect(p.items.map((i) => i.orden)).toEqual([0, 1, 2, 3, 4])
  })
})

void act
