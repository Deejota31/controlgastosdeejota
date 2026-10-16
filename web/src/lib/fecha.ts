import { useEffect, useState } from 'react'

/** Devuelve la fecha de negocio (YYYY-MM-DD) del instante dado en la zona horaria indicada. */
export function fechaEnZona(tz: string, ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora)
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Milisegundos hasta la próxima medianoche en la zona indicada (mínimo 1 s). */
export function msHastaMedianoche(tz: string, ahora: Date = new Date()): number {
  const hms = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(ahora)
  const [h = 0, m = 0, s = 0] = hms.split(':').map(Number)
  const transcurrido = ((h * 60 + m) * 60 + s) * 1000 + ahora.getMilliseconds()
  return Math.max(1000, 86_400_000 - transcurrido + 250)
}

/**
 * Fecha viva: recalcula "hoy" al pasar la medianoche (en la zona configurada)
 * y al volver a la pestaña (visibilitychange / focus). Nunca queda congelada.
 */
export function useHoy(tz: string = 'America/Lima'): string {
  const [hoy, setHoy] = useState(() => fechaEnZona(tz))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refrescar = () => setHoy(fechaEnZona(tz))
    const programar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        refrescar()
        programar()
      }, msHastaMedianoche(tz))
    }
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        refrescar()
        programar()
      }
    }
    refrescar()
    programar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [tz])

  return hoy
}
