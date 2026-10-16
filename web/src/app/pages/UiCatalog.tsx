import { Plus, Trash2, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, IconButton } from '@/components/Button'
import { Checkbox, Radio } from '@/components/Checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { KpiCard, StatRow } from '@/components/KpiCard'
import { Modal } from '@/components/Modal'
import { ProgressBar } from '@/components/ProgressBar'
import { Segmented } from '@/components/Segmented'
import { Skeleton } from '@/components/Skeleton'
import { Switch } from '@/components/Switch'
import { Tabs } from '@/components/Tabs'
import { InfoTip } from '@/components/Tooltip'
import { toast } from '@/store/toasts'
import { useUi, type Tema } from '@/store/ui'

function Historia({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-1">
      <h2 className="mb-3 text-lg font-semibold">{titulo}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  )
}

/** Catálogo interno de componentes (solo desarrollo y modo demo). */
export function UiCatalog() {
  const { tema, setTema } = useUi()
  const [sw, setSw] = useState(true)
  const [chk, setChk] = useState(false)
  const [radio, setRadio] = useState('a')
  const [seg, setSeg] = useState<'mes' | 'anio'>('mes')
  const [tab, setTab] = useState('uno')
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  return (
    <div className="grid grid-cols-1 gap-4">
      <Historia titulo="Tema">
        <Segmented<Tema>
          etiqueta="Tema"
          value={tema}
          onChange={setTema}
          opciones={[
            { valor: 'claro', etiqueta: 'Claro' },
            { valor: 'oscuro', etiqueta: 'Oscuro' },
            { valor: 'sistema', etiqueta: 'Sistema' },
          ]}
        />
      </Historia>
      <Historia titulo="Button / IconButton">
        <Button>Guardar</Button>
        <Button variante="secondary">Cancelar</Button>
        <Button variante="ghost">Ver más</Button>
        <Button variante="danger" icono={<Trash2 className="size-4" aria-hidden />}>
          Eliminar
        </Button>
        <Button loading>Guardando</Button>
        <Button disabled>Deshabilitado</Button>
        <IconButton etiqueta="Agregar">
          <Plus className="size-5" aria-hidden />
        </IconButton>
      </Historia>
      <Historia titulo="Switch / Checkbox / Radio / Segmented">
        <Switch etiqueta="Activa" checked={sw} onChange={setSw} />
        <Checkbox checked={chk} onChange={setChk}>
          Recurrente
        </Checkbox>
        <Radio name="r" value="a" checked={radio === 'a'} onChange={setRadio}>
          Mensual
        </Radio>
        <Radio name="r" value="b" checked={radio === 'b'} onChange={setRadio}>
          Solo un mes
        </Radio>
        <Segmented
          etiqueta="Período"
          value={seg}
          onChange={setSeg}
          opciones={[
            { valor: 'mes', etiqueta: 'Mes' },
            { valor: 'anio', etiqueta: 'Año' },
          ]}
        />
      </Historia>
      <Historia titulo="Tabs">
        <div className="w-full">
          <Tabs
            etiqueta="Ejemplo"
            activa={tab}
            onChange={setTab}
            tabs={[
              { id: 'uno', etiqueta: 'Jerarquía' },
              { id: 'dos', etiqueta: 'Flujo de medios' },
              { id: 'tres', etiqueta: 'Frecuencia vs monto' },
            ]}
          >
            <p className="text-muted">Contenido de la pestaña «{tab}».</p>
          </Tabs>
        </div>
      </Historia>
      <Historia titulo="ProgressBar (estados de caja)">
        <div className="grid w-full gap-3 sm:grid-cols-2">
          {[40, 75, 93, 118].map((p) => (
            <ProgressBar key={p} pct={p} etiqueta={`Consumo ${p} %`} />
          ))}
        </div>
      </Historia>
      <Historia titulo="KpiCard / StatRow / InfoTip">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            titulo="Disponible"
            valor="S/ 1,250.00"
            ayuda="Presupuesto del mes menos todo lo gastado."
            variacion={{ texto: '▲ 4.2 % vs mes anterior', tono: 'ok' }}
          />
          <KpiCard titulo="Gastado" valor="S/ 2,750.00" variacion={{ texto: '▲ 12 % vs mes anterior', tono: 'danger' }} />
          <div className="rounded-card border border-line bg-surface p-4 shadow-1">
            <StatRow etiqueta="Reservado" valor="S/ 800.00" />
            <StatRow etiqueta="Saldo libre" valor="-S/ 120.00" tono="danger" />
            <InfoTip texto="Ayuda que se abre con mouse, toque y teclado." />
          </div>
        </div>
      </Historia>
      <Historia titulo="Skeleton / EmptyState / ErrorState">
        <div className="grid w-full gap-3 md:grid-cols-3">
          <div className="grid gap-2 rounded-card border border-line p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-10" />
            <Skeleton />
          </div>
          <EmptyState
            icono={<Wallet className="size-7" aria-hidden />}
            titulo="Aún no hay gastos"
            mensaje="Registra tu primer gasto del mes."
            accion={{ etiqueta: 'Nuevo gasto', onClick: () => toast.info('Nuevo gasto') }}
          />
          <ErrorState mensaje="No se pudo cargar. Revisa tu conexión." onReintentar={() => toast.info('Reintentando…')} />
        </div>
      </Historia>
      <Historia titulo="Modal / ConfirmDialog / Toaster">
        <Button variante="secondary" onClick={() => setModal(true)}>
          Abrir modal
        </Button>
        <Button variante="secondary" onClick={() => setConfirmar(true)}>
          Abrir confirmación
        </Button>
        <Button variante="ghost" onClick={() => toast.ok('Guardado')}>
          Toast éxito
        </Button>
        <Button
          variante="ghost"
          onClick={() => toast.error('No se pudo guardar el gasto.', [{ etiqueta: 'Reintentar', onClick: () => toast.ok('Guardado') }])}
        >
          Toast error
        </Button>
      </Historia>
      <Modal
        abierto={modal}
        onCerrar={() => setModal(false)}
        titulo="Nuevo gasto"
        pie={
          <>
            <Button variante="secondary" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setModal(false)}>Guardar</Button>
          </>
        }
      >
        <p className="text-muted">En móvil se abre como hoja de pantalla completa con cabecera y pie fijos.</p>
      </Modal>
      <ConfirmDialog
        abierto={confirmar}
        titulo="Anular 3 movimientos"
        impacto={<p>El gastado del mes bajará S/ 120.00. Podrás restaurarlos desde la vista «Anulados».</p>}
        confirmar="Anular"
        peligro
        onConfirmar={() => {
          setConfirmar(false)
          toast.ok('Anulados')
        }}
        onCancelar={() => setConfirmar(false)}
      />
    </div>
  )
}
