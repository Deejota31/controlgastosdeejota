import { cn } from '@/lib/cn'

export interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  etiqueta: string
  disabled?: boolean
}

export function Switch({ checked, onChange, etiqueta, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50',
        'before:absolute before:-inset-2 before:content-[""]', // área táctil ≥ 44 px
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow-1 transition-transform duration-150',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}
