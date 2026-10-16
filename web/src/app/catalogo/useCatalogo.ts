import { useCallback, useEffect, useState } from 'react'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'

/**
 * Interruptores del catálogo: muestran el valor pedido al instante y vuelven al real si el servidor lo rechaza.
 * El valor deseado se olvida en cuanto la vista confirmada coincide con él.
 */
export function useInterruptores(reales: Record<string, boolean>) {
  const [deseado, setDeseado] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setDeseado((d) => {
      const restantes = Object.entries(d).filter(([k, v]) => reales[k] !== v)
      return restantes.length === Object.keys(d).length ? d : Object.fromEntries(restantes)
    })
  }, [reales])
  const valor = useCallback((k: string) => (k in deseado ? deseado[k]! : (reales[k] ?? false)), [deseado, reales])
  const cambiar = useCallback(async (k: string, nuevo: boolean, accion: string, payload: Record<string, unknown>) => {
    setDeseado((d) => ({ ...d, [k]: nuevo }))
    const r = await useDatos.getState().mutar(accion, payload)
    if (!r.ok) {
      setDeseado((d) => {
        const { [k]: _quitado, ...resto } = d
        return resto
      })
      toast.error(`No se pudo guardar el cambio: ${r.error.message}`)
    }
  }, [])
  return { valor, cambiar }
}
