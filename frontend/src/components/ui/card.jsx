import { cn } from "../../lib/utils";

export function Card({ className, children }) {
  return (
    <div className={cn("rounded-2xl border border-ink-200 bg-white shadow-sm", className)}>{children}</div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4", className)}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon size={20} weight="duotone" />
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-bold tracking-tight text-ink-800">{title}</h3>
          {subtitle ? <p className="text-xs text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}