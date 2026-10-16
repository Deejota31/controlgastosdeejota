import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KpiCard } from '@/components/KpiCard'
import { Segmented } from '@/components/Segmented'
import { formatoMoneda, formatoPct } from '@/engine/dinero'
import { ahorroPotencial, calcularEvolucion, type Dimension, type FilaEvolucion } from '@/engine/evolucion'
import { prepararMovimientos } from '@/engine/movimientos'
import { filtrosAMotor, type FiltrosGlobales } from '@/lib/filtros'
import { useDatos } from '@/store/datos'
import { primeraFechaDe, rotulosDe } from '../inicio/logica'

function Lista({ titulo, filas, nombre, m, icono, vacio }: { titulo: string; filas: FilaEvolucion[]; nombre: (id: string) => string; m: (c: number) => string; icono: React.ReactNode; vacio: string }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">{icono}{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-muted">{vacio}</p>
      ) : (
        <ol className="grid grid-cols-1 gap-1">
          {filas.map((f) => (
            <li key={f.id} className="flex min-w-0 items-baseline justify-between gap-2 rounded-ctl px-2 py-1.5 hover:bg-surface-2">
              <span className="min-w-0 truncate">{nombre(f.id)}{f.nuevo && <span className="ml-2 rounded-full bg-info-soft px-2 text-sm text-info">Nuevo</span>}</span>
              <span className="num max-w-[60%] text-right text-sm">
                {f.delta > 0 ? '+' : '−'}{m(Math.abs(f.delta))} <span className="text-muted">· {f.pct === null ? 'sin base' : `${f.pct > 0 ? '+' : '−'}${formatoPct(Math.abs(f.pct), 0)}`}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function SeccionEvolucion({ filtros, hoy }: { filtros: FiltrosGlobales; hoy: string }) {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const [dim, setDim] = useState<Dimension>('categoria')
  const [atras, setAtras] = useState<'1' | '2'>('1')
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const m = (c: number) => formatoMoneda(c, base)
  const r = useMemo(() => rotulosDe(vista), [vista])
  const filtro = useMemo(() => filtrosAMotor(filtros, hoy, primeraFechaDe(vista)), [filtros, hoy, vista])
  const movs = useMemo(() => prepararMovimientos(vista.movimientos), [vista.movimientos])
  const ev = useMemo(() => calcularEvolucion(movs, filtro, dim, Number(atras) as 1 | 2), [movs, filtro, dim, atras])
  const pctAhorro = Number(config['ahorro_simulado_pct'] ?? '10') || 0
  const ahorro = useMemo(() => ahorroPotencial(movs, filtro, pctAhorro), [movs, filtro, pctAhorro])
  const nombre = (id: string) => r.nombre(dim, id)
  const variacion = ev.totalPrevio > 0 ? (ev.totalActual - ev.totalPrevio) / ev.totalPrevio : null
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented etiqueta="Agrupar por" value={dim} onChange={setDim} opciones={[{ valor: 'ambito', etiqueta: 'Ámbito' }, { valor: 'categoria', etiqueta: 'Categoría' }, { valor: 'subcategoria', etiqueta: 'Subcategoría' }]} />
        <Segmented etiqueta="Comparar con" value={atras} onChange={setAtras} opciones={[{ valor: '1', etiqueta: 'Hace 1 mes' }, { valor: '2', etiqueta: 'Hace 2 meses' }]} />
      </div>
      <p className="text-sm text-muted">
        Compara {ev.tramoPrevio.desde} → {ev.tramoPrevio.hasta} con el período elegido: {m(ev.totalPrevio)} antes, {m(ev.totalActual)} ahora
        {variacion !== null && ` (${variacion > 0 ? '+' : '−'}${formatoPct(Math.abs(variacion), 0)})`}.
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Lista titulo="Más subieron" filas={ev.subidas} nombre={nombre} m={m} icono={<TrendingUp className="size-5 text-danger" aria-hidden />} vacio="Nada subió frente al período anterior." />
        <Lista titulo="Más bajaron" filas={ev.bajadas} nombre={nombre} m={m} icono={<TrendingDown className="size-5 text-ok" aria-hidden />} vacio="Nada bajó frente al período anterior." />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <KpiCard titulo="Gasto variable del período" valor={m(ahorro.baseVariable)} ayuda="Suma de los gastos de tipo variable: los que sí puedes recortar." />
        <KpiCard titulo={`Ahorro potencial al ${pctAhorro} %`} valor={m(ahorro.ahorro)} ayuda="Lo que ahorrarías si recortas ese porcentaje del gasto variable. El porcentaje se cambia en Configuración." />
      </div>
    </div>
  )
}
