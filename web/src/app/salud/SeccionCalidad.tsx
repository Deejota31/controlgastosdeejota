import { ClipboardCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { InfoTip } from '@/components/Tooltip'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/cn'
import { useDatos } from '@/store/datos'
import { ETIQUETA_DIMENSION, calcularCalidadDe, nivelCalidad } from './logica'
import { RevisarDatos } from './RevisarDatos'

const TONO = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const
const TRAZO = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' } as const

/** Anillo 0–100 con su valor escrito al centro (no depende del color). */
function Anillo({ puntaje, tono }: { puntaje: number; tono: 'ok' | 'warn' | 'danger' }) {
  const R = 15.9155
  return (
    <div className="relative mx-auto aspect-square w-36">
      <svg viewBox="0 0 42 42" role="img" aria-label={`Calidad de datos: ${puntaje} de 100`} className="size-full -rotate-90">
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx="21" cy="21" r={R} fill="none" stroke={TRAZO[tono]} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${puntaje} ${100 - puntaje}`} />
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <span className="num text-3xl font-semibold leading-none">{puntaje}</span>
        <span className="text-xs text-muted">de 100</span>
      </div>
    </div>
  )
}

export function SeccionCalidad() {
  const vista = useDatos((s) => s.vista)
  const datos = useMemo(() => calcularCalidadDe(vista), [vista])
  const [revisando, setRevisando] = useState(false)
  const { calidad, duplicados } = datos
  const nivel = nivelCalidad(calidad.puntaje)
  const pendientes = calidad.incompletos.length + calidad.clasificacionInactiva.length + duplicados.filter((d) => d.estado === 'pendiente').length

  if (calidad.sinDatos) {
    return <EmptyState icono={<ClipboardCheck className="size-7" aria-hidden />} titulo="Aún no hay datos que revisar" mensaje="Cuando registres movimientos, aquí verás qué tan completos y ordenados están." />
  }
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <Anillo puntaje={calidad.puntaje} tono={nivel.tono} />
          <p className={cn('mt-1 text-center font-medium', TONO[nivel.tono])}>{nivel.texto}</p>
        </div>
        <ul aria-label="Dimensiones de la calidad" className="grid gap-3">
          {calidad.dimensiones.map((d) => {
            const e = ETIQUETA_DIMENSION[d.clave]!
            return (
              <li key={d.clave}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium">
                    {e.titulo}
                    <InfoTip texto={e.ayuda} />
                    <span className="text-sm font-normal text-muted">· peso {Math.round(d.peso * 100)} %</span>
                  </span>
                  <span className="num text-sm">
                    {Math.round(d.valor)} <span className="text-muted">({d.buenos}/{d.total})</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${d.valor}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setRevisando(true)}>Revisar datos</Button>
        <p className="text-muted">{pendientes === 0 ? 'No hay nada pendiente de revisar.' : `${pendientes} ${pendientes === 1 ? 'punto' : 'puntos'} por revisar.`}</p>
      </div>
      {revisando && <RevisarDatos datos={datos} onCerrar={() => setRevisando(false)} />}
    </div>
  )
}
