export function cn(...values) {
  return values.filter(Boolean).join(" ");
}

export function rupees(value, short = false) {
  const amount = Number(value || 0);
  if (short && Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  }
  if (short && Math.abs(amount) >= 1000) {
    return `₹${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  }
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function prettyDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const TRIP_STATUSES = ["Pending", "In-Transit", "Delivered", "Paid", "Cancelled"];
export const TRUCK_STATUSES = ["Available", "On-Trip", "Maintenance"];
export const EXPENSE_CATEGORIES = ["Fuel", "Toll", "Maintenance", "Driver Advance", "Other"];
export const PAYMENT_MODES = ["Cash", "Bank", "UPI", "Cheque"];

export const STATUS_STYLE = {
  Pending: "bg-amber-100 text-amber-800 ring-amber-200",
  "In-Transit": "bg-sky-100 text-sky-800 ring-sky-200",
  Delivered: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Paid: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  Cancelled: "bg-rose-100 text-rose-800 ring-rose-200",
  Available: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "On-Trip": "bg-sky-100 text-sky-800 ring-sky-200",
  Maintenance: "bg-amber-100 text-amber-800 ring-amber-200",
};

export function statusClass(status) {
  return STATUS_STYLE[status] || "bg-ink-200 text-ink-700 ring-ink-300";
}