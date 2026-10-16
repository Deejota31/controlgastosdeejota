import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { layoutSankey, posicionarBurbujas } from './layout'

export interface DatoGrafico {
  id: string
  etiqueta: string
  valor: number
  color: string
  texto: string
}

/** Tabla equivalente de cualquier gráfico: el contenido nunca depende solo del dibujo. */
export function TablaEquivalente({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: string[][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-9 cursor-pointer py-1.5 text-muted hover:text-ink">Ver datos de «{titulo}»</summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[16rem] text-left">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr>
              {columnas.map((c, i) => (
                <th key={c} scope="col" className={cn('py-1 font-medium text-muted', i > 0 && 'text-right')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-line">
                {f.map((c, j) => (
                  <td key={j} className={cn('py-1', j > 0 && 'num text-right')}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** Donut: total al centro y leyenda en botones (cada uno filtra). */
export function Donut({ datos, centro, etiqueta, onElegir, seleccion }: { datos: DatoGrafico[]; centro: { valor: string; texto: string }; etiqueta: string; onElegir?: (id: string) => void; seleccion?: string[] }) {
  const total = datos.reduce((s, d) => s + d.valor, 0)
  const R = 15.9155
  let acum = 0
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
      <div className="relative mx-auto aspect-square w-full max-w-[12rem]">
        <svg viewBox="0 0 42 42" role="img" aria-label={`${etiqueta}: ${datos.map((d) => `${d.etiqueta} ${d.texto}`).join(', ')}`} className="size-full -rotate-90">
          <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
          {total > 0 &&
            datos.map((d) => {
              const len = (d.valor / total) * 100
              const el = <circle key={d.id} cx="21" cy="21" r={R} fill="none" stroke={d.color} strokeWidth="6" strokeDasharray={`${Math.max(0, len - 0.4)} ${100 - Math.max(0, len - 0.4)}`} strokeDashoffset={-acum} opacity={seleccion?.length && !seleccion.includes(d.id) ? 0.3 : 1} />
              acum += len
              return el
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="num text-lg font-semibold leading-tight">{centro.valor}</span>
          <span className="text-xs text-muted">{centro.texto}</span>
        </div>
      </div>
      <ul aria-label={`Leyenda de ${etiqueta}`} className="grid min-w-0 gap-1">
        {datos.map((d) => {
          const on = seleccion?.includes(d.id)
          return (
            <li key={d.id}>
              <button type="button" aria-pressed={on} onClick={() => onElegir?.(d.id)} className={cn('flex min-h-9 w-full min-w-0 items-center gap-2 rounded-ctl px-2 text-left hover:bg-surface-2', on && 'bg-primary-soft')}>
                <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate">{d.etiqueta}</span>
                <span className="num shrink-0 text-sm text-muted">{d.texto}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export interface PuntoLinea {
  dia: number
  real: number | null
  ideal: number | null
  proyeccion: number | null
}

/** Gasto acumulado: real, ritmo ideal, proyección y línea del presupuesto. */
export function LineaAcumulada({ puntos, presupuesto, formato, etiqueta }: { puntos: PuntoLinea[]; presupuesto: number; formato: (c: number) => string; etiqueta: string }) {
  const W = 640
  const H = 220
  const P = { l: 8, r: 8, t: 12, b: 24 }
  const max = Math.max(1, presupuesto, ...puntos.flatMap((p) => [p.real ?? 0, p.ideal ?? 0, p.proyeccion ?? 0]))
  const n = Math.max(1, puntos.length - 1)
  const x = (d: number) => P.l + ((d - 1) / n) * (W - P.l - P.r)
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b)
  const ruta = (f: (p: PuntoLinea) => number | null) => {
    let d = ''
    for (const p of puntos) {
      const v = f(p)
      if (v === null) continue
      d += `${d ? 'L' : 'M'}${x(p.dia).toFixed(1)} ${y(v).toFixed(1)}`
    }
    return d
  }
  const ult = [...puntos].reverse().find((p) => p.real !== null)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiqueta}. Gastado hasta hoy ${formato(ult?.real ?? 0)}${presupuesto > 0 ? ` de ${formato(presupuesto)}` : ''}.`} className="h-auto w-full">
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--line)" />
        {presupuesto > 0 && <line x1={P.l} x2={W - P.r} y1={y(presupuesto)} y2={y(presupuesto)} stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="2 4" />}
        <path d={ruta((p) => p.ideal)} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="6 4" />
        <path d={ruta((p) => p.proyeccion)} fill="none" stroke="var(--warn)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
        <path d={ruta((p) => p.real)} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
        {[1, Math.ceil(puntos.length / 2), puntos.length].map((d) => (
          <text key={d} x={x(d)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {d}
          </text>
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Leyenda">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-5 bg-primary" />Real</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0 w-5 border-t-2 border-dashed border-muted" />Ritmo ideal</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0 w-5 border-t-2 border-dotted border-warn" />Proyección</li>
        {presupuesto > 0 && <li className="flex items-center gap-1.5"><span aria-hidden className="h-0 w-5 border-t-2 border-dotted border-danger" />Presupuesto</li>}
      </ul>
    </div>
  )
}

/** Barras de gasto diario con línea de promedio. */
export function BarrasDiarias({ dias, promedio, formato, etiqueta }: { dias: Array<{ etiqueta: string; gasto: number }>; promedio: number; formato: (c: number) => string; etiqueta: string }) {
  const W = 640
  const H = 180
  const P = { t: 10, b: 22 }
  const max = Math.max(1, promedio, ...dias.map((d) => d.gasto))
  const bw = (W - 8) / Math.max(1, dias.length)
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiqueta}. Promedio diario ${formato(promedio)}.`} className="h-auto w-full">
      <line x1="4" x2={W - 4} y1={H - P.b} y2={H - P.b} stroke="var(--line)" />
      {dias.map((d, i) => (
        <rect key={i} x={4 + i * bw + bw * 0.12} width={Math.max(1, bw * 0.76)} y={y(d.gasto)} height={Math.max(0, H - P.b - y(d.gasto))} rx="2" fill="var(--primary)" opacity={d.gasto > promedio ? 1 : 0.55}>
          <title>{`${d.etiqueta}: ${formato(d.gasto)}`}</title>
        </rect>
      ))}
      {promedio > 0 && (
        <g>
          <line x1="4" x2={W - 4} y1={y(promedio)} y2={y(promedio)} stroke="var(--warn)" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - 6} y={y(promedio) - 4} textAnchor="end" fontSize="11" fill="var(--warn)">
            Promedio {formato(promedio)}
          </text>
        </g>
      )}
    </svg>
  )
}

/** Sankey propio medio → ámbito con resaltado (al pasar o enfocar) y tooltip textual. */
export function Sankey({ enlaces, nombre, color, formato }: { enlaces: Array<{ origen: string; destino: string; valor: number }>; nombre: (tipo: 'o' | 'd', id: string) => string; color: (tipo: 'o' | 'd', id: string) => string; formato: (c: number) => string }) {
  const [activo, setActivo] = useState<string | null>(null)
  const W = 640
  const H = 260
  const ANCHO_NODO = 12
  const L = useMemo(() => layoutSankey(enlaces, H - 8), [enlaces])
  const xo = 150
  const xd = W - 150
  const toca = (e: { origen: string; destino: string }) => !activo || activo === `o:${e.origen}` || activo === `d:${e.destino}`
  const enlaceActivo = L.enlaces.find((e) => activo === `e:${e.origen}|${e.destino}`)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Flujo de medios de pago a ámbitos" className="h-auto w-full">
        {L.enlaces.map((e) => {
          const key = `e:${e.origen}|${e.destino}`
          const x0 = xo + ANCHO_NODO
          const x1 = xd
          const mx = (x0 + x1) / 2
          return (
            <path
              key={key}
              d={`M${x0} ${e.y0 + 4} C${mx} ${e.y0 + 4}, ${mx} ${e.y1 + 4}, ${x1} ${e.y1 + 4}`}
              fill="none"
              stroke={color('o', e.origen)}
              strokeWidth={e.grosor}
              opacity={activo === key ? 0.85 : toca(e) ? 0.4 : 0.08}
              tabIndex={0}
              role="img"
              aria-label={`${nombre('o', e.origen)} a ${nombre('d', e.destino)}: ${formato(e.valor)}`}
              onMouseEnter={() => setActivo(key)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(key)}
              onBlur={() => setActivo(null)}
            />
          )
        })}
        {L.origenes.map((n) => (
          <g key={`o${n.id}`} tabIndex={0} role="img" aria-label={`${nombre('o', n.id)}: ${formato(n.total)}`} onMouseEnter={() => setActivo(`o:${n.id}`)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(`o:${n.id}`)} onBlur={() => setActivo(null)}>
            <rect x={xo} y={n.y + 4} width={ANCHO_NODO} height={Math.max(2, n.alto)} rx="2" fill={color('o', n.id)} />
            <text x={xo - 6} y={n.y + 4 + n.alto / 2} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--ink)">
              {nombre('o', n.id)}
            </text>
          </g>
        ))}
        {L.destinos.map((n) => (
          <g key={`d${n.id}`} tabIndex={0} role="img" aria-label={`${nombre('d', n.id)}: ${formato(n.total)}`} onMouseEnter={() => setActivo(`d:${n.id}`)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(`d:${n.id}`)} onBlur={() => setActivo(null)}>
            <rect x={xd} y={n.y + 4} width={ANCHO_NODO} height={Math.max(2, n.alto)} rx="2" fill={color('d', n.id)} />
            <text x={xd + ANCHO_NODO + 6} y={n.y + 4 + n.alto / 2} dominantBaseline="middle" fontSize="12" fill="var(--ink)">
              {nombre('d', n.id)}
            </text>
          </g>
        ))}
      </svg>
      <p role="status" className="min-h-6 text-sm text-muted">
        {enlaceActivo ? `${nombre('o', enlaceActivo.origen)} → ${nombre('d', enlaceActivo.destino)}: ${formato(enlaceActivo.valor)}` : 'Pasa el cursor o enfoca un flujo para ver el monto.'}
      </p>
    </div>
  )
}

/** Frecuencia (eje x) contra monto promedio (eje y); el área es el total. Las burbujas no se superponen. */
export function Burbujas({ datos, nombre, color, formato, promedios }: { datos: Array<{ id: string; frecuencia: number; promedio: number; total: number }>; nombre: (id: string) => string; color: (id: string) => string; formato: (c: number) => string; promedios: { frecuencia: number; monto: number } }) {
  const W = 640
  const H = 260
  const pos = useMemo(() => posicionarBurbujas(datos.map((d) => ({ id: d.id, x: d.frecuencia, y: d.promedio, total: d.total })), W, H), [datos])
  const xs = datos.map((d) => d.frecuencia)
  const ys = datos.map((d) => d.promedio)
  const esc = (v: number, a: number, b: number, lo: number, hi: number) => (b === a ? (lo + hi) / 2 : lo + ((v - a) / (b - a)) * (hi - lo))
  const lx = esc(promedios.frecuencia, Math.min(...xs), Math.max(...xs), 8, W - 8)
  const ly = esc(promedios.monto, Math.min(...ys), Math.max(...ys), H - 8, 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Frecuencia contra monto promedio por categoría" className="h-auto w-full">
      <rect x="0" y="0" width={W} height={H} fill="none" stroke="var(--line)" />
      <line x1={lx} x2={lx} y1="0" y2={H} stroke="var(--muted)" strokeDasharray="4 4" />
      <line x1="0" x2={W} y1={ly} y2={ly} stroke="var(--muted)" strokeDasharray="4 4" />
      {pos.map((b) => (
        <g key={b.id} tabIndex={0} role="img" aria-label={`${nombre(b.id)}: ${b.x} movimientos, promedio ${formato(b.y)}, total ${formato(b.total)}`}>
          <circle cx={b.cx} cy={b.cy} r={b.r} fill={color(b.id)} fillOpacity="0.75" stroke="var(--surface)" strokeWidth="1.5">
            <title>{`${nombre(b.id)} · ${b.x} mov. · promedio ${formato(b.y)} · total ${formato(b.total)}`}</title>
          </circle>
          {b.r >= 16 && (
            <text x={b.cx} y={b.cy} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#fff" style={{ pointerEvents: 'none' }}>
              {nombre(b.id).slice(0, Math.max(3, Math.floor(b.r / 4)))}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
