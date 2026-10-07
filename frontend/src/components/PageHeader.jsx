export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500" />
      {label}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "bg-ink-800 text-white",
    brand: "bg-brand-500 text-white",
    emerald: "bg-emerald-500 text-white",
    sky: "bg-sky-500 text-white",
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-500 text-white",
  };
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide opacity-80">{label}</p>
        {Icon ? <Icon size={20} weight="duotone" className="opacity-70" /> : null}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs opacity-75">{hint}</p> : null}
    </div>
  );
}