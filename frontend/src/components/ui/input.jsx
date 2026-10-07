import { forwardRef } from "react";
import { cn } from "../../lib/utils";

const base =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(base, className)} {...props} />;
});

export function Textarea({ className, ...props }) {
  return <textarea className={cn(base, "min-h-20", className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(base, "appearance-none bg-white pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, className, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-xs font-semibold text-ink-600", className)}>
      {children}
    </label>
  );
}

export function Field({ label, children, className, htmlFor, hint }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="mb-0">
          {label}
        </Label>
        {hint ? <span className="text-[10px] font-semibold text-ink-400">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}