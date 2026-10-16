import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

export interface EmptyStateProps {
  icono: ReactNode
  titulo: string
  mensaje: string
  accion?: { etiqueta: string; onClick: () => void }
  accionSecundaria?: { etiqueta: string; onClick: () => void }
}

export function EmptyState({ icono, titulo, mensaje, accion, accionSecundaria }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">{icono}</div>
      <h3 className="text-xl font-semibold">{titulo}</h3>
      <p className="max-w-md text-muted">{mensaje}</p>
      {(accion || accionSecundaria) && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {accion && <Button onClick={accion.onClick}>{accion.etiqueta}</Button>}
          {accionSecundaria && (
            <Button variante="secondary" onClick={accionSecundaria.onClick}>
              {accionSecundaria.etiqueta}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function ErrorState({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-danger/40 bg-danger-soft px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="max-w-md font-medium">{mensaje}</p>
      <Button variante="secondary" onClick={onReintentar}>
        Reintentar
      </Button>
    </div>
  )
}
