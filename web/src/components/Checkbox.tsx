import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface CheckboxProps {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
}

export function Checkbox({ checked, onChange, children, disabled }: CheckboxProps) {
  return (
    <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2', disabled && 'opacity-50')}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'flex size-5 items-center justify-center rounded-md border transition-colors duration-150',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          checked ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </label>
  )
}

export interface RadioProps {
  name: string
  value: string
  checked: boolean
  onChange: (v: string) => void
  children: ReactNode
}

export function Radio({ name, value, checked, onChange, children }: RadioProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span
        aria-hidden
        className={cn(
          'flex size-5 items-center justify-center rounded-full border transition-colors duration-150',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          checked ? 'border-primary' : 'border-line bg-surface',
        )}
      >
        {checked && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span>{children}</span>
    </label>
  )
}
