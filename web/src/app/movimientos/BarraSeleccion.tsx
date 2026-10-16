import { useMemo, useState } from 'react'
import type { Hojas, Movimiento } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { ChipSelect } from '@/components/ChipSelect'
import { Combobox } from '@/components/Combobox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { formatoMoneda } from '@/engine/dinero'
import { categoriasDeAmbito, subcategoriasEfectivas } from '@/lib/catalogo'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { impactoLote } from './consulta'

type Accion = 'anular' | 'restaurar' | 'categoria' | 'medio'

const TITULO: Record<Accion, string> = {
  anular: 'Anular movimientos',
  restaurar: 'Restaurar movimientos',
  categoria: 'Cambiar categoría',
  medio: 'Cambiar medio de pago',
}

/** Barra de acciones sobre la selección persistente. Cada acción muestra su impacto antes de enviarse y es todo o nada. */
export function BarraSeleccion({
  seleccion,
  filtrados,
  onLimpiar,
  onSeleccionarFiltrados,
  vista,
}: {
  seleccion: Movimiento[]
  filtrados: number
  onLimpiar: () => void
  onSeleccionarFiltrados: () => void
  vista: Hojas
}) {
  const mutar = useDatos((s) => s.mutar)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [medio, setMedio] = useState('')
  const [ambito, setAmbito] = useState('')
  const [categoria, setCategoria] = useState('')
  const [sub, setSub] = useState('')
  const [enviando, setEnviando] = useState(false)

  const impacto = useMemo(() => (accion ? impactoLote(seleccion, accion) : null), [accion, seleccion])
  const cats = useMemo(() => (ambito ? categoriasDeAmbito(vista, ambito) : []), [vista, ambito])
  const subs = useMemo(() => (categoria && ambito ? subcategoriasEfectivas(vista, categoria, ambito) : []), [vista, categoria, ambito])
  const ambitos = vista.ambitos.filter((a) => a.activo)

  if (seleccion.length === 0) return null

  const abrir = (a: Accion) => {
    setAccion(a)
    setMedio('')
    setAmbito(ambitos[0]?.id ?? '')
    setCategoria('')
    setSub('')
  }
  const faltaDato = (accion === 'medio' && !medio) || (accion === 'categoria' && (!categoria || (subs.length > 0 && !sub)))

  async function confirmar() {
    if (!accion || enviando) return
    setEnviando(true)
    const payload: Record<string, unknown> = { accion, ids: seleccion.map((m) => m.id) }
    if (accion === 'medio') payload['medio_pago_id'] = medio
    if (accion === 'categoria') Object.assign(payload, { ambito_id: ambito, categoria_id: categoria, subcategoria_id: sub })
    const p = mutar('movimientos.accionLote', payload)
    const n = seleccion.length
    setAccion(null)
    setEnviando(false)
    onLimpiar()
    const r = await p
    if (r.ok) toast.ok(`${n} ${n === 1 ? 'movimiento actualizado' : 'movimientos actualizados'}.`)
    else toast.error(`No se aplicó ningún cambio: ${r.error.message}`)
  }

  return (
    <>
      <div role="region" aria-label="Acciones sobre la selección" className="sticky top-[calc(var(--topbar-h)+var(--safe-top)+4px)] z-10 flex flex-wrap items-center gap-2 rounded-card border border-primary/40 bg-primary-soft p-3 shadow-1">
        <p className="mr-auto font-medium" aria-live="polite">
          {seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}
        </p>
        {seleccion.length < filtrados && (
          <Button variante="ghost" className="min-h-9" onClick={onSeleccionarFiltrados}>
            Seleccionar los {filtrados} filtrados
          </Button>
        )}
        <Button variante="secondary" className="min-h-9" onClick={() => abrir('anular')}>Anular</Button>
        <Button variante="secondary" className="min-h-9" onClick={() => abrir('restaurar')}>Restaurar</Button>
        <Button variante="secondary" className="min-h-9" onClick={() => abrir('categoria')}>Categoría…</Button>
        <Button variante="secondary" className="min-h-9" onClick={() => abrir('medio')}>Medio de pago…</Button>
        <Button variante="ghost" className="min-h-9" onClick={onLimpiar}>Limpiar selección</Button>
      </div>
      <ConfirmDialog
        abierto={accion !== null}
        titulo={accion ? TITULO[accion] : ''}
        confirmar={accion === 'anular' ? 'Anular' : accion === 'restaurar' ? 'Restaurar' : 'Aplicar'}
        peligro={accion === 'anular'}
        loading={enviando}
        onCancelar={() => setAccion(null)}
        confirmarDeshabilitado={!impacto || impacto.bloquea || faltaDato || impacto.aplican === 0}
        onConfirmar={() => void confirmar()}
        impacto={
          impacto && (
            <div className="grid gap-3">
              <p>
                Se aplicará a <b>{impacto.aplican}</b> de {seleccion.length} {seleccion.length === 1 ? 'movimiento' : 'movimientos'} (suman {formatoMoneda(impacto.total)}).
                {impacto.omitidos > 0 && !impacto.bloquea && ` ${impacto.omitidos} ya estaban en ese estado y no cambian.`}
              </p>
              <p className="text-sm text-muted">Es todo o nada: si algo falla, no se cambia ninguno.</p>
              {impacto.bloquea && (
                <p role="alert" className="rounded-ctl bg-danger-soft px-3 py-2 text-sm">
                  Hay movimientos anulados en la selección. Restáuralos primero o quítalos de la selección.
                </p>
              )}
              {accion === 'medio' && !impacto.bloquea && (
                <Combobox etiqueta="Nuevo medio de pago" opciones={vista.medios_pago.filter((m) => m.activo).map((m) => ({ valor: m.id, etiqueta: m.nombre }))} valor={medio} onChange={setMedio} />
              )}
              {accion === 'categoria' && !impacto.bloquea && (
                <div className="grid gap-3">
                  <ChipSelect etiqueta="Ámbito" opciones={ambitos.map((a) => ({ valor: a.id, etiqueta: a.nombre }))} valor={ambito} onChange={(v) => { setAmbito(v); setCategoria(''); setSub('') }} />
                  <ChipSelect etiqueta="Categoría" opciones={cats.map((c) => ({ valor: c.id, etiqueta: c.nombre }))} valor={categoria} onChange={(v) => { setCategoria(v); setSub('') }} />
                  {subs.length > 0 && <ChipSelect etiqueta="Subcategoría" opciones={subs.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} valor={sub} onChange={setSub} />}
                </div>
              )}
            </div>
          )
        }
      />
    </>
  )
}
