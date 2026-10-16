import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { useToasts } from '@/store/toasts'
import { cn } from '@/lib/cn'

const icono = { ok: CheckCircle2, info: Info, error: XCircle } as const
const tono = {
  ok: 'border-ok/40',
  info: 'border-line',
  error: 'border-danger/50',
} as const
const tonoIcono = { ok: 'text-ok', info: 'text-primary', error: 'text-danger' } as const

/** Apilado bajo la barra superior. Éxito: autocierre 4 s. Error: persistente con acciones. */
export function Toaster() {
  const items = useToasts((s) => s.items)
  const quitar = useToasts((s) => s.quitar)
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--topbar-h)+var(--safe-top)+8px)] z-[70] mx-auto flex w-full max-w-md flex-col gap-2 px-3"
    >
      {items.map((t) => {
        const Icon = icono[t.tipo]
        return (
          <div
            key={t.id}
            role={t.tipo === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-ctl border bg-surface p-3 shadow-2 [animation:pop_160ms_ease-out]',
              tono[t.tipo],
            )}
          >
            <Icon className={cn('mt-0.5 size-5 shrink-0', tonoIcono[t.tipo])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-words">{t.mensaje}</p>
              {t.acciones && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.acciones.map((a) => (
                    <button
                      key={a.etiqueta}
                      type="button"
                      className="min-h-9 rounded-lg bg-surface-2 px-3 text-sm font-medium hover:bg-line"
                      onClick={() => {
                        a.onClick()
                        quitar(t.id)
                      }}
                    >
                      {a.etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
              onClick={() => quitar(t.id)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}
