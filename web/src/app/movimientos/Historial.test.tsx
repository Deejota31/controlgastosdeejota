import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fijarTransporte } from '@/store/conexion'
import { mov } from '@/test/fixtures'
import { cambiosDe, Historial } from './Historial'

afterEach(() => fijarTransporte(null))

const fila = (accion: string, antes: object | null, despues: object | null) => ({ id: accion, fecha_hora: '2026-10-05T10:30:00Z', accion, antes_json: antes as never, despues_json: despues as never })

describe('cambiosDe', () => {
  it('solo lista los campos que cambiaron, con nombres legibles', () => {
    const c = cambiosDe(fila('movimiento.editar', { monto: 10, descripcion: 'Café', notas: '' }, { monto: 12, descripcion: 'Café', notas: 'x' }))
    expect(c).toEqual([{ campo: 'Monto', antes: '10', despues: '12' }, { campo: 'Notas', antes: '—', despues: 'x' }])
  })
  it('una creación no tiene «antes»', () => expect(cambiosDe(fila('movimiento.crear', null, { monto: 1 }))).toEqual([]))
})

describe('Historial', () => {
  it('lee la auditoría del servidor para ese movimiento', async () => {
    const pedidos: unknown[] = []
    fijarTransporte({ enviar: async (p) => (pedidos.push(p), { ok: true, data: { filas: [fila('movimiento.editar', { estado: 'activo' }, { estado: 'anulado' }), fila('movimiento.crear', null, {})] } }) }, 't')
    render(<Historial movimiento={mov({ id: 'm9' })} onCerrar={() => {}} />)
    expect(await screen.findByText(/Editado/)).toBeInTheDocument()
    expect(screen.getByText('Creado')).toBeInTheDocument()
    expect(screen.getByText(/Estado: activo/)).toBeInTheDocument()
    expect(pedidos[0]).toMatchObject({ action: 'auditoria.consultar', payload: { entidad: 'movimientos', entidad_id: 'm9' } })
  })
  it('un fallo se explica y permite reintentar', async () => {
    fijarTransporte({ enviar: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'Se cayó' } }) }, 't')
    render(<Historial movimiento={mov({ id: 'm9' })} onCerrar={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Se cayó')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
