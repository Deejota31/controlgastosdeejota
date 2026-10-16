import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  abierto: boolean
  titulo: string
  /** Resumen del impacto: qué cambia exactamente si se confirma. */
  impacto: ReactNode
  confirmar: string
  peligro?: boolean
  loading?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export function ConfirmDialog({ abierto, titulo, impacto, confirmar, peligro, loading, onConfirmar, onCancelar }: ConfirmDialogProps) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCancelar}
      titulo={titulo}
      pie={
        <>
          <Button variante="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variante={peligro ? 'danger' : 'primary'} loading={loading} onClick={onConfirmar}>
            {confirmar}
          </Button>
        </>
      }
    >
      <div className="text-ink">{impacto}</div>
    </Modal>
  )
}
