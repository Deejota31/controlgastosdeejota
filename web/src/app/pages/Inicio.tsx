import { CalendarPlus, ListChecks, Plus, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { KpiCard } from '@/components/KpiCard'
import { ProgressBar } from '@/components/ProgressBar'
import { Segmented } from '@/components/Segmented'
import { Tabs } from '@/components/Tabs'
import { BarrasDiarias, Burbujas, Donut, LineaAcumulada, Sankey, TablaEquivalente } from '@/components/graficos/Graficos'
import { formatoMoneda, formatoPct } from '@/engine/dinero'
import { etiquetaPeriodo } from '@/engine/periodo'
import { gastoPorDia } from '@/engine/serie'
import { filtrosPorDefecto, hayFiltrosActivos, useFiltros } from '@/lib/filtros'
import { useHoy } from '@/lib/fecha'
import { navegar } from '@/lib/router'
import { useDatos } from '@/store/datos'
import { useFormMov } from '@/store/formMov'
import { useGastosMes } from '@/store/gastosMes'
import { BarraFiltros } from '../filtros/BarraFiltros'
import { Jerarquia } from '../inicio/Jerarquia'
import { calcularInicio, datosDonut, kpisInicio, mesSinConfigurar, rotulosDe, segmentosResumen, topN } from '../inicio/logica'
import { etiquetaEstadoCaja } from '../presupuesto/logica'
import type { EstadoBarra } from '@/components/ProgressBar'

const ESTADO_BARRA: Record<string, EstadoBarra> = { al_dia: 'ok', atencion: 'atencion', critico: 'critico', excedida: 'excedido' }
const COLOR_SEGMENTO = { gastado: 'bg-primary', reservado: 'bg-accent', libre: 'bg-ok' } as const

function saludo(zona: string): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Dashboard: todo sale de `calcularPanel` (el mismo motor que Movimientos y Presupuesto). */
export function Inicio() {
  const vista = useDatos((s) => s.vista)
  const config = useDatos((s) => s.config)
  const zona = useDatos((s) => s.zona)
  const hoy = useHoy(zona)
  const { filtros, cambiar } = useFiltros(hoy)
  const abrirMov = useFormMov((s) => s.abrir)
  const abrirGastosMes = useGastosMes((s) => s.abrir)
  const [dim, setDim] = useState<'categoria' | 'subcategoria'>('categoria')
  const [analisis, setAnalisis] = useState('jerarquia')

  const di = useMemo(() => calcularInicio(vista, config, filtros, hoy), [vista, config, filtros, hoy])
  const { panel, base } = di
  const r = useMemo(() => rotulosDe(vista), [vista])
  const m = (c: number) => formatoMoneda(c, base)
  const kpis = useMemo(() => kpisInicio(di), [di])
  const donut = useMemo(() => datosDonut(panel, r, base), [panel, r, base])
  const top = useMemo(() => topN(panel, dim, r, base), [panel, dim, r, base])
  const pres = panel.presupuesto
  const sinConfigurar = mesSinConfigurar(panel)
  const hayDatos = panel.totales.cantidad > 0

  const dias = useMemo(() => {
    const g = gastoPorDia(panel.movimientos, di.filtro.desde, di.filtro.hasta)
    if (g.puntos.length <= 62) return { barras: g.puntos.map((p) => ({ etiqueta: p.fecha, gasto: p.gasto })), promedio: g.promedio, unidad: 'día' }
    const porMes = new Map<string, number>()
    for (const p of g.puntos) porMes.set(p.fecha.slice(0, 7), (porMes.get(p.fecha.slice(0, 7)) ?? 0) + p.gasto)
    const barras = [...porMes].map(([etiqueta, gasto]) => ({ etiqueta, gasto }))
    return { barras, promedio: barras.length ? Math.round(g.total / barras.length) : 0, unidad: 'mes' }
  }, [panel.movimientos, di.filtro.desde, di.filtro.hasta])

  const flujo = panel.flujo
  const ambitoFiltrado = (id: string) => cambiar({ ...filtros, ambitos: filtros.ambitos.includes(id) ? filtros.ambitos.filter((x) => x !== id) : [...filtros.ambitos, id] })
  const promedios = useMemo(() => {
    const b = panel.burbujas
    return { frecuencia: b.length ? b.reduce((s, x) => s + x.frecuencia, 0) / b.length : 0, monto: panel.totales.cantidad ? panel.totales.total / panel.totales.cantidad : 0 }
  }, [panel])

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{saludo(zona)}</h2>
          <p className="text-muted">{etiquetaPeriodo(di.filtro)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icono={<Plus className="size-4" aria-hidden />} onClick={() => abrirMov('nuevo')}>
            Nuevo gasto
          </Button>
          <Button variante="secondary" icono={<ListChecks className="size-4" aria-hidden />} onClick={abrirGastosMes}>
            Gastos del mes
          </Button>
        </div>
      </div>

      <BarraFiltros hoy={hoy} filtros={filtros} onCambiar={cambiar} idBase="inicio" />

      {sinConfigurar && (
        <EmptyState
          icono={<Wallet className="size-7" aria-hidden />}
          titulo="Este mes aún no tiene presupuesto"
          mensaje="Aplica tus fuentes de ingreso y tus cajas para ver cuánto te queda por gastar."
          accion={{ etiqueta: 'Preparar mi mes', onClick: () => navegar('/presupuesto') }}
          accionSecundaria={{ etiqueta: 'Copiar del mes anterior', onClick: () => navegar('/presupuesto', { accion: 'copiar' }) }}
        />
      )}

      {pres && !sinConfigurar && (
        <section aria-labelledby="resumen" className="rounded-card border border-line bg-surface p-4 shadow-1">
          <h3 id="resumen" className="text-lg font-semibold">
            Resumen del presupuesto
          </h3>
          <div
            role="img"
            aria-label={`Presupuesto ${m(pres.presupuesto)}: gastado ${m(pres.gastado)}, reservado sin usar ${m(pres.reservasSinUsar)}, saldo libre ${m(Math.max(0, pres.saldoLibre))}`}
            className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
          >
            {segmentosResumen(pres).map((s) => (
              <div key={s.clave} className={COLOR_SEGMENTO[s.clave]} style={{ width: `${Math.min(100, s.pct)}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Leyenda del presupuesto">
            {segmentosResumen(pres).map((s) => (
              <li key={s.clave} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2.5 rounded-sm ${COLOR_SEGMENTO[s.clave]}`} />
                {s.etiqueta}
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {[
              ['Presupuesto (P)', m(pres.presupuesto)],
              ['Gastado', m(pres.gastado)],
              ['Disponible', m(pres.disponible)],
              ['Reservado en cajas', m(pres.reservado)],
              ['Libre inicial', m(pres.libreInicial)],
              ['Fuera de cajas', m(pres.gastoFueraDeCajas)],
              ['Saldo libre', m(pres.saldoLibre)],
              ['% consumido', formatoPct(pres.pctConsumido, 0)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="num truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {pres.exceso > 0 && <p className="mt-2 text-sm text-danger">Exceso en cajas: {m(pres.exceso)}</p>}
        </section>
      )}

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.clave} titulo={k.titulo} valor={k.valor} ayuda={k.ayuda} variacion={k.variacion} pie={k.clave === 'gastado' && panel.avisos.sinTipoCambio.length ? `${panel.avisos.sinTipoCambio.length} sin tipo de cambio (excluidos)` : undefined} />
        ))}
      </section>

      {!hayDatos ? (
        <EmptyState
          icono={<CalendarPlus className="size-7" aria-hidden />}
          titulo={hayFiltrosActivos(filtros) ? 'Sin movimientos con estos filtros' : 'Aún no hay movimientos en este período'}
          mensaje={hayFiltrosActivos(filtros) ? 'Prueba con otro período o quita algún filtro.' : 'Cuando registres el primero, aquí verás tus gráficos.'}
          accion={hayFiltrosActivos(filtros) ? { etiqueta: 'Limpiar filtros', onClick: () => cambiar(filtrosPorDefecto(hoy)) } : { etiqueta: 'Nuevo gasto', onClick: () => abrirMov('nuevo') }}
        />
      ) : (
        <>
          <section aria-labelledby="acum" className="rounded-card border border-line bg-surface p-4 shadow-1">
            <h3 id="acum" className="mb-2 text-lg font-semibold">
              Gasto acumulado
            </h3>
            {panel.serie ? (
              <>
                <LineaAcumulada puntos={panel.serie.puntos} presupuesto={panel.serie.presupuesto} formato={m} etiqueta="Gasto acumulado del mes" />
                <p className="mt-1 text-sm text-muted">
                  {panel.serie.proyeccionCierre !== null ? `Al ritmo actual cerrarías el mes en ${m(panel.serie.proyeccionCierre)}.` : `Gastaste ${m(panel.serie.gastado)} en el mes.`}
                </p>
                <TablaEquivalente titulo="Gasto acumulado" columnas={['Día', 'Real', 'Ideal']} filas={panel.serie.puntos.filter((p) => p.real !== null).map((p) => [String(p.dia), m(p.real ?? 0), p.ideal === null ? '—' : m(p.ideal)])} />
              </>
            ) : (
              <p className="text-muted">El gasto acumulado se muestra cuando el período es un mes completo.</p>
            )}
          </section>

          <section aria-labelledby="diario" className="rounded-card border border-line bg-surface p-4 shadow-1">
            <h3 id="diario" className="mb-2 text-lg font-semibold">
              Gasto {dias.unidad === 'día' ? 'diario' : 'mensual'}
            </h3>
            <BarrasDiarias dias={dias.barras} promedio={dias.promedio} formato={m} etiqueta={`Gasto por ${dias.unidad}`} />
            <TablaEquivalente titulo={`Gasto por ${dias.unidad}`} columnas={[dias.unidad === 'día' ? 'Fecha' : 'Mes', 'Gasto']} filas={dias.barras.filter((b) => b.gasto > 0).map((b) => [b.etiqueta, m(b.gasto)])} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section aria-labelledby="donut" className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-1">
              <h3 id="donut" className="mb-2 text-lg font-semibold">
                Gasto por ámbito
              </h3>
              <Donut datos={donut} etiqueta="Gasto por ámbito" centro={{ valor: m(panel.totales.total), texto: 'gastado' }} onElegir={ambitoFiltrado} seleccion={filtros.ambitos} />
              <TablaEquivalente titulo="Gasto por ámbito" columnas={['Ámbito', 'Gasto']} filas={donut.map((d) => [d.etiqueta, d.texto])} />
            </section>
            <section aria-labelledby="top5" className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-1">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 id="top5" className="text-lg font-semibold">
                  Top 5
                </h3>
                <Segmented etiqueta="Agrupar Top 5 por" value={dim} onChange={setDim} opciones={[{ valor: 'categoria', etiqueta: 'Categorías' }, { valor: 'subcategoria', etiqueta: 'Subcategorías' }]} />
              </div>
              <ol className="grid gap-2">
                {top.map((t) => (
                  <li key={t.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{t.etiqueta}</span>
                      <span className="num shrink-0 text-sm">
                        {t.texto} <span className="text-muted">· {formatoPct(t.pct, 0)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${t.pct * 100}%`, background: t.color }} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}

      {pres && pres.cajas.length > 0 && (
        <section aria-labelledby="cajas" className="rounded-card border border-line bg-surface p-4 shadow-1">
          <h3 id="cajas" className="mb-3 text-lg font-semibold">
            Cajas
          </h3>
          <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {pres.cajas.map((c) => (
              <li key={c.caja.id} className="min-w-0 rounded-ctl border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{c.caja.nombre}</span>
                  <span className="num shrink-0 text-sm text-muted">
                    {m(c.gastado)} / {m(c.asignado)}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar pct={(c.pct ?? 0) * 100} etiqueta={`Consumo de ${c.caja.nombre}`} estado={ESTADO_BARRA[c.estado]} />
                </div>
                <p className={`mt-1 text-sm ${c.estado === 'excedida' ? 'text-danger' : 'text-muted'}`}>{etiquetaEstadoCaja(c)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hayDatos && (
        <section aria-labelledby="analisis" className="rounded-card border border-line bg-surface p-4 shadow-1">
          <h3 id="analisis" className="mb-2 text-lg font-semibold">
            Análisis detallado
          </h3>
          <Tabs
            etiqueta="Análisis detallado"
            activa={analisis}
            onChange={setAnalisis}
            tabs={[{ id: 'jerarquia', etiqueta: 'Jerarquía' }, { id: 'flujo', etiqueta: 'Flujo de medios' }, { id: 'frecuencia', etiqueta: 'Frecuencia vs monto' }]}
          >
            <div className="pt-3">
              {analisis === 'jerarquia' && <Jerarquia nodos={panel.jerarquia} r={r} base={base} />}
              {analisis === 'flujo' && (
                <>
                  <Sankey enlaces={flujo.map((e) => ({ origen: e.medio, destino: e.ambito, valor: e.total }))} nombre={(t, id) => r.nombre(t === 'o' ? 'medio' : 'ambito', id)} color={(t, id) => r.color(t === 'o' ? 'medio' : 'ambito', id)} formato={m} />
                  <TablaEquivalente titulo="Flujo de medios" columnas={['Medio → Ámbito', 'Gasto']} filas={flujo.map((e) => [`${r.nombre('medio', e.medio)} → ${r.nombre('ambito', e.ambito)}`, m(e.total)])} />
                </>
              )}
              {analisis === 'frecuencia' && (
                <>
                  <Burbujas datos={panel.burbujas} nombre={(id) => r.nombre('categoria', id)} color={(id) => r.color('categoria', id)} formato={m} promedios={promedios} />
                  <p className="text-sm text-muted">Eje horizontal: cuántos movimientos. Eje vertical: monto promedio. El tamaño es el total. Las líneas marcan el promedio general.</p>
                  <TablaEquivalente titulo="Frecuencia vs monto" columnas={['Categoría', 'Movimientos', 'Promedio']} filas={panel.burbujas.map((b) => [r.nombre('categoria', b.id), String(b.frecuencia), m(b.promedio)])} />
                </>
              )}
            </div>
          </Tabs>
        </section>
      )}
    </div>
  )
}
