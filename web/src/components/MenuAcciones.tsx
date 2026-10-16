import { MoreVertical } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Flotante } from './Flotante'

export interface AccionMenu {
  id: string
  etiqueta: string
  icono?: ReactNode
  peligro?: boolean
  deshabilitada?: boolean
  onSelect: () => void
}

/** Menú ⋮ de una fila. Orden canónico: ver/editar → clonar → anular/restaurar → otras. Se voltea si no cabe. */
export function MenuAcciones({ etiqueta, acciones }: { etiqueta: string; acciones: AccionMenu[] }) {
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }
  const lanzar = (a: AccionMenu) => {
    if (a.deshabilitada) return
    setAbierto(false)
    a.onSelect()
  }
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        onClick={() => {
          setActivo(0)
          setAbierto((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !abierto) {
            e.preventDefault()
            setActivo(0)
            setAbierto(true)
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-ctl hover:bg-surface-2"
      >
        <MoreVertical className="size-5" aria-hidden />
      </button>
      <Flotante ancla={boton} abierto={abierto} onCerrar={() => setAbierto(false)} id={id} role="menu" etiqueta={etiqueta} ancho={208} className="py-1">
        <MenuItems acciones={acciones} activo={activo} setActivo={setActivo} lanzar={lanzar} cerrar={cerrar} />
      </Flotante>
    </>
  )
}

function MenuItems({ acciones, activo, setActivo, lanzar, cerrar }: { acciones: AccionMenu[]; activo: number; setActivo: (i: number) => void; lanzar: (a: AccionMenu) => void; cerrar: () => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const primera = useRef(true)
  if (primera.current) {
    primera.current = false
    queueMicrotask(() => refs.current[activo]?.focus())
  }
  const mover = (i: number) => {
    const n = (i + acciones.length) % acciones.length
    setActivo(n)
    refs.current[n]?.focus()
  }
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          mover(activo + 1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          mover(activo - 1)
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          cerrar()
        } else if (e.key === 'Home') mover(0)
        else if (e.key === 'End') mover(acciones.length - 1)
      }}
    >
      {acciones.map((a, i) => (
        <button
          key={a.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="menuitem"
          tabIndex={i === activo ? 0 : -1}
          aria-disabled={a.deshabilitada || undefined}
          onClick={() => lanzar(a)}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-surface-2 focus:bg-surface-2',
            a.peligro && 'text-danger',
            a.deshabilitada && 'cursor-not-allowed opacity-50',
          )}
        >
          {a.icono}
          {a.etiqueta}
        </button>
      ))}
    </div>
  )
}
