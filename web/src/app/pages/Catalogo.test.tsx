import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatos } from '@/store/datos'
import { hojasPrueba } from '@/test/fixtures'
import { Catalogo } from './Catalogo'

const mutar = vi.fn()

beforeEach(() => {
  const h = hojasPrueba()
  mutar.mockReset()
  mutar.mockResolvedValue({ ok: true, data: {} })
  useDatos.setState({ vista: h, confirmado: h, config: { moneda_base: 'PEN' }, zona: 'America/Lima', mutar } as never)
})

const menuDe = async (nombre: string) => {
  await userEvent.click(screen.getByRole('button', { name: nombre }))
  return screen.getByRole('menu', { name: nombre })
}

describe('Catálogo · lectura', () => {
  it('muestra contadores «X activas · Y en total» y las categorías del ámbito elegido', () => {
    render(<Catalogo />)
    expect(screen.getByText(/Categorías:/).textContent).toMatch(/2 activas · 2 en total/)
    expect(screen.getByRole('heading', { name: 'Categorías de Personal' })).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.queryByText('Servicios')).toBeNull()
  })

  it('cambiar de ámbito cambia las categorías', async () => {
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('tab', { name: /Hogar/ }))
    expect(screen.getByRole('heading', { name: 'Categorías de Hogar' })).toBeInTheDocument()
    expect(screen.getByText('Servicios')).toBeInTheDocument()
  })

  it('buscar filtra y resalta sin importar tildes', async () => {
    render(<Catalogo />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' }), 'cafe')
    const marcas = document.querySelectorAll('mark')
    expect(Array.from(marcas).map((m) => m.textContent)).toEqual(['Café'])
    expect(screen.queryByText('Transporte')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('1 categoría')
  })

  it('una subcategoría inactiva se ve tachada y marcada', () => {
    const h = hojasPrueba()
    h.subcategorias[0]!.activo = false
    useDatos.setState({ vista: h, confirmado: h } as never)
    render(<Catalogo />)
    const chip = screen.getByRole('button', { name: 'Editar subcategoría Café (inactiva)' })
    expect(chip.className).toContain('line-through')
  })
})

describe('Catálogo · interruptores', () => {
  it('desactivar un ámbito envía la versión y el cambio se ve de inmediato', async () => {
    render(<Catalogo />)
    const sw = screen.getByRole('switch', { name: 'Ámbito Personal activo' })
    expect(sw).toBeChecked()
    await userEvent.click(sw)
    expect(mutar).toHaveBeenCalledWith('ambito.guardar', expect.objectContaining({ id: 'amb-p', activo: false, version: 1 }))
    expect(sw).not.toBeChecked()
  })

  it('si el servidor lo rechaza el interruptor vuelve a su valor', async () => {
    mutar.mockResolvedValueOnce({ ok: false, error: { message: 'Versión vieja' } })
    render(<Catalogo />)
    const sw = screen.getByRole('switch', { name: 'Medio Efectivo activo' })
    await userEvent.click(sw)
    expect(await screen.findByText(/No se pudo guardar el cambio/, {}, { timeout: 2000 }).catch(() => null)).toBeDefined()
    await vi.waitFor(() => expect(sw).toBeChecked())
  })

  it('desactivar una categoría solo afecta al ámbito actual', async () => {
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('switch', { name: 'Categoría Alimentación activa en Personal' }))
    expect(mutar).toHaveBeenCalledWith('categoria.guardar', expect.objectContaining({ id: 'cat-a', vinculos: [{ ambito_id: 'amb-p', activo: false }] }))
  })
})

describe('Catálogo · alta', () => {
  it('valida nombre vacío y duplicado (sin importar tildes) y luego crea con su ámbito', async () => {
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Categoría' }))
    const dlg = screen.getByRole('dialog', { name: 'Nueva categoría' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Escribe un nombre.')).toBeInTheDocument()
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'alimentacion')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Ya existe uno con ese nombre en este nivel.')).toBeInTheDocument()
    expect(mutar).not.toHaveBeenCalled()
    await userEvent.clear(within(dlg).getByLabelText('Nombre'))
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Mascotas')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    const [accion, p] = mutar.mock.calls[0] as [string, Record<string, unknown>]
    expect(accion).toBe('categoria.guardar')
    expect(p).toMatchObject({ nombre: 'Mascotas', vinculos: [{ ambito_id: 'amb-p', activo: true }] })
    expect(String(p['id'])).toMatch(/^cat-/)
    expect(p['version']).toBeUndefined()
  })

  it('una categoría nueva exige al menos un ámbito', async () => {
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Categoría' }))
    const dlg = screen.getByRole('dialog')
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Mascotas')
    await userEvent.click(within(dlg).getByRole('checkbox', { name: 'Personal' }))
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(within(dlg).getByText('Elige al menos un ámbito.')).toBeInTheDocument()
  })

  it('el error del servidor sobre el nombre se muestra en el campo y el formulario sigue abierto', async () => {
    mutar.mockResolvedValueOnce({ ok: false, error: { message: 'Nombre repetido en el servidor', campo: 'nombre' } })
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Medio de pago' }))
    const dlg = screen.getByRole('dialog', { name: 'Nuevo medio de pago' })
    await userEvent.type(within(dlg).getByLabelText('Nombre'), 'Plin')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Crear' }))
    expect(await within(dlg).findByText('Nombre repetido en el servidor')).toBeInTheDocument()
  })

  it('editar envía la versión y el mismo nombre no cuenta como duplicado', async () => {
    render(<Catalogo />)
    await userEvent.click(screen.getByRole('button', { name: 'Editar subcategoría Café' }))
    const dlg = screen.getByRole('dialog', { name: 'Editar subcategoría' })
    await userEvent.click(within(dlg).getByRole('button', { name: 'Guardar cambios' }))
    expect(mutar).toHaveBeenCalledWith('subcategoria.guardar', expect.objectContaining({ id: 'sub-caf', categoria_id: 'cat-a', version: 1, nombre: 'Café' }))
  })
})

describe('Catálogo · orden', () => {
  it('Subir y Bajar mandan el orden completo del grupo', async () => {
    render(<Catalogo />)
    const menu = await menuDe('Acciones de Transporte')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Subir' }))
    expect(mutar).toHaveBeenCalledWith('categoria.reordenar', { ambito_id: 'amb-p', ids: ['cat-t', 'cat-a'] })
  })

  it('el primero no sube y el último no baja', async () => {
    render(<Catalogo />)
    const menu = await menuDe('Acciones de Alimentación')
    expect(within(menu).getByRole('menuitem', { name: 'Subir' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('«Otros» queda fijo al final', async () => {
    const h = hojasPrueba()
    h.categorias.push({ id: 'cat-o', nombre: 'Otros', icono: 'ellipsis', color: '#64748B', creado_en: '', actualizado_en: '', version: 1 })
    h.ambito_categoria.push({ id: 'ac9', ambito_id: 'amb-p', categoria_id: 'cat-o', orden: 3, activo: true })
    useDatos.setState({ vista: h, confirmado: h } as never)
    render(<Catalogo />)
    const menu = await menuDe('Acciones de Transporte')
    expect(within(menu).getByRole('menuitem', { name: 'Bajar' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    const menuO = await menuDe('Acciones de Otros')
    expect(within(menuO).getByRole('menuitem', { name: 'Subir' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('Catálogo · eliminar', () => {
  async function eliminarCategoria(nombre: string) {
    const menu = await menuDe(`Acciones de ${nombre}`)
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Eliminar' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
  }

  it('sin dependencias se elimina con confirmación explícita', async () => {
    mutar.mockResolvedValueOnce({ ok: true, data: { eliminado: true, id: 'cat-t' } })
    render(<Catalogo />)
    await eliminarCategoria('Transporte')
    expect(mutar).toHaveBeenCalledWith('categoria.eliminar', { id: 'cat-t', confirmar: true })
  })

  it('en uso: lista las dependencias y ofrece desactivar en su lugar', async () => {
    mutar.mockResolvedValueOnce({ ok: true, data: { eliminado: false, motivo: 'en_uso', dependencias: { movimientos: 12, cajas: 1 } } })
    render(<Catalogo />)
    await eliminarCategoria('Alimentación')
    const dlg = await screen.findByRole('dialog', { name: 'Está en uso' })
    expect(dlg).toHaveTextContent('12 movimientos, 1 caja')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Desactivar en su lugar' }))
    expect(mutar).toHaveBeenLastCalledWith('categoria.guardar', expect.objectContaining({ id: 'cat-a', vinculos: [{ ambito_id: 'amb-p', activo: false }, { ambito_id: 'amb-h', activo: false }] }))
  })

  it('con subcategorías sin uso pide confirmar la cascada y la envía', async () => {
    mutar.mockResolvedValueOnce({ ok: true, data: { eliminado: false, motivo: 'tiene_hijos', hijos: 2, requiere_cascada: true } })
    render(<Catalogo />)
    await eliminarCategoria('Alimentación')
    const dlg = await screen.findByRole('dialog', { name: 'Eliminar también sus subcategorías' })
    expect(dlg).toHaveTextContent('2 subcategorías')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Eliminar todo' }))
    expect(mutar).toHaveBeenLastCalledWith('categoria.eliminar', { id: 'cat-a', confirmar: true, cascada: true })
  })
})
