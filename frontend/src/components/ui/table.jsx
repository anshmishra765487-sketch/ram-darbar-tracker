import { cn, statusClass } from "../../lib/utils";

export function Badge({ children, status, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        status ? statusClass(status) : "bg-ink-100 text-ink-700 ring-ink-200",
        className,
      )}
    >
      {children ?? status}
    </span>
  );
}

export function Table({ className, children }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-max border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ className, children, align = "left" }) {
  return (
    <th
      className={cn(
        "border-b border-ink-200 bg-ink-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, align = "left" }) {
  return (
    <td
      className={cn(
        "border-b border-ink-100 px-4 py-3 text-ink-700",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-semibold text-ink-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}