export function Isotipo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} role="img" aria-label="Deejota">
      <rect width="128" height="128" rx="28" fill="#1E3A8A" />
      <g fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 46h60a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V46z" />
        <path d="M30 46l50-14a6 6 0 0 1 8 6v8" />
      </g>
      <circle cx="84" cy="72" r="6" fill="#14B8A6" />
    </svg>
  )
}

export function Logo({ mini }: { mini?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Isotipo />
      {!mini && <span className="text-xl font-semibold tracking-tight">Deejota</span>}
    </div>
  )
}
