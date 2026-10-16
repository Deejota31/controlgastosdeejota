import { useEffect, useMemo, useRef, useState } from 'react'
import { nuevoId } from '@/api/cliente'
import type { Ambito, Categoria, MedioPago, Subcategoria } from '@/api/esquemas'
import { Button } from '@/components/Button'
import { Campo, claseCampo } from '@/components/Campo'
import { Checkbox } from '@/components/Checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { IconColorPicker, type Apariencia } from '@/components/IconColorPicker'
import { Modal } from '@/components/Modal'
import { Switch } from '@/components/Switch'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'
import { nombreRepetido } from './logica'

export type EntidadForm =
  | { tipo: 'ambito'; fila?: Ambito }
  | { tipo: 'categoria'; fila?: Categoria; ambitoId: string }
  | { tipo: 'subcategoria'; fila?: Subcategoria; categoriaId: string; ambitoId: string }
  | { tipo: 'medio'; fila?: MedioPago }

const TIPOS_MEDIO: Array<{ valor: MedioPago['tipo']; etiqueta: string }> = [
  { valor: 'billetera', etiqueta: 'Billetera digital' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'vale', etiqueta: 'Vale' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'otro', etiqueta: 'Otro' },
]

const PREFIJO = { ambito: 'amb', categoria: 'cat', subcategoria: 'sub', medio: 'med' } as const
const COLOR_INICIAL = '#2585E4'

/** Alta y edición de ámbito, categoría, subcategoría y medio de pago. Espera al servidor antes de cerrar. */
export function FormCatalogo({ entidad, onCerrar }: { entidad: EntidadForm | null; onCerrar: () => void }) {
  const vista = useDatos((s) => s.vista)
  const mutar = useDatos((s) => s.mutar)
  const idForm = useRef('')
  const [nombre, setNombre] = useState('')
  const [ap, setAp] = useState<Apariencia>({ icono: 'tag', color: COLOR_INICIAL })
  const [activo, setActivo] = useState(true)
  const [tipo, setTipo] = useState<MedioPago['tipo']>('otro')
  const [ambitos, setAmbitos] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const inicial = useRef('')
  const clave = entidad ? `${entidad.tipo}:${entidad.fila?.id ?? 'nuevo'}` : ''

  useEffect(() => {
    if (!entidad) return
    const f = entidad.fila
    idForm.current = f?.id ?? nuevoId(PREFIJO[entidad.tipo])
    setNombre(f?.nombre ?? '')
    setAp({ icono: f?.icono ?? (entidad.tipo === 'medio' ? 'wallet' : entidad.tipo === 'ambito' ? 'folder' : 'tag'), color: (f && 'color' in f ? f.color : '') || COLOR_INICIAL })
    setActivo(f && 'activo' in f ? f.activo : true)
    setTipo(entidad.tipo === 'medio' && entidad.fila ? entidad.fila.tipo : 'otro')
    if (entidad.tipo === 'categoria') {
      const m: Record<string, boolean> = {}
      for (const a of vista.ambitos) m[a.id] = entidad.fila ? vista.ambito_categoria.some((v) => v.ambito_id === a.id && v.categoria_id === entidad.fila!.id) : a.id === entidad.ambitoId
      setAmbitos(m)
    }
    setError(null)
    setErrorForm(null)
    setEnviando(false)
    inicial.current = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const estado = JSON.stringify([nombre, ap, activo, tipo, ambitos])
  if (entidad && inicial.current === '') inicial.current = estado
  const sucio = !!entidad && inicial.current !== '' && inicial.current !== estado

  const hermanos = useMemo(() => {
    if (!entidad) return []
    if (entidad.tipo === 'ambito') return vista.ambitos
    if (entidad.tipo === 'categoria') return vista.categorias
    if (entidad.tipo === 'subcategoria') return vista.subcategorias.filter((s) => s.categoria_id === entidad.categoriaId)
    return vista.medios_pago
  }, [entidad, vista])

  if (!entidad) return null
  const editando = !!entidad.fila
  const titulo = {
    ambito: editando ? 'Editar ámbito' : 'Nuevo ámbito',
    categoria: editando ? 'Editar categoría' : 'Nueva categoría',
    subcategoria: editando ? 'Editar subcategoría' : 'Nueva subcategoría',
    medio: editando ? 'Editar medio de pago' : 'Nuevo medio de pago',
  }[entidad.tipo]

  const validar = (): string | null => {
    const n = nombre.trim().replace(/\s+/g, ' ')
    if (!n) return 'Escribe un nombre.'
    if (n.length > 40) return 'Máximo 40 caracteres.'
    if (nombreRepetido(hermanos, n, entidad.fila?.id)) return 'Ya existe uno con ese nombre en este nivel.'
    if (entidad.tipo === 'categoria' && !Object.values(ambitos).some(Boolean)) return 'Elige al menos un ámbito.'
    return null
  }

  async function guardar() {
    if (!entidad || enviando) return
    const e = validar()
    setError(e)
    if (e) return
    setEnviando(true)
    setErrorForm(null)
    const base = { id: idForm.current, nombre: nombre.trim().replace(/\s+/g, ' '), ...(entidad.fila ? { version: entidad.fila.version } : {}) }
    let accion: string
    let payload: Record<string, unknown>
    if (entidad.tipo === 'ambito') {
      accion = 'ambito.guardar'
      payload = { ...base, icono: ap.icono, color: ap.color, activo }
    } else if (entidad.tipo === 'categoria') {
      accion = 'categoria.guardar'
      const previos = new Set(vista.ambito_categoria.filter((v) => v.categoria_id === entidad.fila?.id).map((v) => v.ambito_id))
      const elegidos = Object.entries(ambitos).filter(([, v]) => v).map(([id]) => id)
      payload = {
        ...base,
        icono: ap.icono,
        color: ap.color,
        vinculos: elegidos.map((id) => ({ ambito_id: id, activo: vista.ambito_categoria.find((v) => v.ambito_id === id && v.categoria_id === entidad.fila?.id)?.activo ?? true })),
        quitar_ambito_ids: [...previos].filter((id) => !elegidos.includes(id)),
      }
    } else if (entidad.tipo === 'subcategoria') {
      accion = 'subcategoria.guardar'
      payload = { ...base, categoria_id: entidad.categoriaId, icono: ap.icono, activo }
    } else {
      accion = 'medio.guardar'
      payload = { ...base, tipo, icono: ap.icono, color: ap.color, activo }
    }
    const r = await mutar(accion, payload)
    setEnviando(false)
    if (r.ok) {
      toast.ok(editando ? 'Cambios guardados.' : 'Creado.')
      inicial.current = estado // cierra sin pedir confirmar
      onCerrar()
    } else if (r.error.campo === 'nombre') setError(r.error.message)
    else setErrorForm(r.error.message)
  }

  const pedirCerrar = () => (sucio && !enviando ? setDescartar(true) : onCerrar())

  return (
    <>
      <Modal
        abierto
        onCerrar={pedirCerrar}
        titulo={titulo}
        pie={
          <>
            <Button variante="secondary" onClick={pedirCerrar}>
              Cancelar
            </Button>
            <Button loading={enviando} onClick={() => void guardar()}>
              {editando ? 'Guardar cambios' : 'Crear'}
            </Button>
          </>
        }
      >
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            void guardar()
          }}
        >
          <Campo id="cat-nombre" etiqueta="Nombre" requerido error={error}>
            <input id="cat-nombre" autoFocus autoComplete="off" maxLength={40} className={claseCampo} value={nombre} onChange={(e) => (setNombre(e.target.value), setError(null))} aria-invalid={!!error || undefined} aria-describedby={error ? 'cat-nombre-e' : undefined} />
          </Campo>
          {entidad.tipo === 'medio' && (
            <Campo id="cat-tipo" etiqueta="Tipo de medio">
              <select id="cat-tipo" className={claseCampo} value={tipo} onChange={(e) => setTipo(e.target.value as MedioPago['tipo'])}>
                {TIPOS_MEDIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {entidad.tipo === 'categoria' && (
            <fieldset className="grid gap-1">
              <legend className="font-medium">Disponible en</legend>
              {vista.ambitos.map((a) => (
                <Checkbox key={a.id} checked={!!ambitos[a.id]} onChange={(v) => setAmbitos({ ...ambitos, [a.id]: v })}>
                  {a.nombre}
                </Checkbox>
              ))}
              {editando && <p className="text-sm text-muted">Quitar un ámbito falla si ya tiene movimientos con esta categoría: en ese caso desactívala.</p>}
            </fieldset>
          )}
          {entidad.tipo !== 'categoria' && (
            <div className="flex items-center gap-3">
              <Switch etiqueta="Activo" checked={activo} onChange={setActivo} />
              <span>{activo ? 'Activo' : 'Inactivo'}</span>
            </div>
          )}
          <IconColorPicker valor={ap} onChange={setAp} sinColor={entidad.tipo === 'subcategoria'} />
          {errorForm && (
            <p role="alert" className="rounded-ctl border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
              {errorForm}
            </p>
          )}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>
      <ConfirmDialog abierto={descartar} titulo="¿Descartar los cambios?" impacto="Lo que escribiste no se ha guardado y se perderá." confirmar="Descartar" peligro onCancelar={() => setDescartar(false)} onConfirmar={() => (setDescartar(false), onCerrar())} />
    </>
  )
}
