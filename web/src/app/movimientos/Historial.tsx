import { useEffect, useState } from 'react'
import { crearCliente } from '@/api/cliente'
import type { Movimiento } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { Skeleton } from '@/components/Skeleton'
import { configCliente } from '@/store/conexion'

interface FilaAuditoria {
  id: string
  fecha_hora: string
  accion: string
  antes_json: Record<string, unknown> | null
  despues_json: Record<string, unknown> | null
}

const ETIQUETA: Record<string, string> = {
  'movimiento.crear': 'Creado',
  'movimiento.editar': 'Editado',
  'movimiento.anular': 'Anulado',
  'movimiento.restaurar': 'Restaurado',
  'movimientos.accionLote': 'Cambio en lote',
  'movimientos.lote': 'Importado en lote',
}

const CAMPOS: Record<string, string> = {
  fecha: 'Fecha', monto: 'Monto', moneda: 'Moneda', descripcion: 'Descripción', ambito_id: 'Ámbito', categoria_id: 'Categoría',
  subcategoria_id: 'Subcategoría', medio_pago_id: 'Medio de pago', tipo_gasto: 'Tipo', es_recurrente: 'Recurrente', estado: 'Estado',
  comprobante_url: 'Comprobante', notas: 'Notas',
}

export function cambiosDe(f: FilaAuditoria): Array<{ campo: string; antes: string; despues: string }> {
  const a = f.antes_json
  const d = f.despues_json
  if (!a || !d) return []
  const txt = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : String(v))
  return Object.keys(CAMPOS)
    .filter((k) => txt(a[k]) !== txt(d[k]))
    .map((k) => ({ campo: CAMPOS[k]!, antes: txt(a[k]), despues: txt(d[k]) }))
}

/** Historial de un movimiento: quién/qué cambió y cuándo, leído de la auditoría del servidor. */
export function Historial({ movimiento, onCerrar }: { movimiento: Movimiento | null; onCerrar: () => void }) {
  const [filas, setFilas] = useState<FilaAuditoria[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const id = movimiento?.id
  useEffect(() => {
    if (!id) return
    let vivo = true
    setFilas(null)
    setError(null)
    crearCliente(configCliente)
      .llamar<{ filas: FilaAuditoria[] }>('auditoria.consultar', { entidad: 'movimientos', entidad_id: id, limite: 50 })
      .then((r) => vivo && setFilas(r.data.filas))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el historial.'))
    return () => {
      vivo = false
    }
  }, [id, intento])
  return (
    <Modal abierto={!!movimiento} onCerrar={onCerrar} titulo="Historial del movimiento" pie={<Button variante="secondary" onClick={onCerrar}>Cerrar</Button>}>
      {error && (
        <div role="alert" className="grid gap-2">
          <p>{error}</p>
          <Button variante="secondary" onClick={() => setIntento((n) => n + 1)}>Reintentar</Button>
        </div>
      )}
      {!error && filas === null && <Skeleton className="h-24 w-full" />}
      {filas && filas.length === 0 && <p className="text-muted">Este movimiento aún no tiene cambios registrados.</p>}
      {filas && filas.length > 0 && (
        <ol className="grid gap-3">
          {filas.map((f) => (
            <li key={f.id} className="rounded-ctl border border-line p-3">
              <p className="font-medium">
                {ETIQUETA[f.accion] ?? f.accion} <span className="num font-normal text-muted">· {f.fecha_hora.replace('T', ' ').slice(0, 16)}</span>
              </p>
              <ul className="mt-1 grid gap-0.5 text-sm text-muted">
                {cambiosDe(f).map((c) => (
                  <li key={c.campo}>
                    {c.campo}: {c.antes} → <span className="text-ink">{c.despues}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
