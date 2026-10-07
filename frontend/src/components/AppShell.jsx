import { NavLink, useNavigate } from "react-router-dom";
import {
  ChartLineUp,
  FileText,
  Gauge,
  Truck,
  UserCircle,
  User,
  Wallet,
  Receipt,
  Books,
  TruckIcon,
  SignOut,
  Key,
} from "@phosphor-icons/react";
import { Toaster, toast } from "sonner";
import { cn } from "../lib/utils";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/", key: "nav_dashboard", icon: Gauge, end: true },
  { to: "/trips", key: "nav_trips", icon: FileText },
  { to: "/trucks", key: "nav_trucks", icon: Truck },
  { to: "/drivers", key: "nav_drivers", icon: UserCircle },
  { to: "/expenses", key: "nav_expenses", icon: Receipt },
  { to: "/payments", key: "nav_payments", icon: Wallet },
  { to: "/reports", key: "nav_reports", icon: ChartLineUp },
  { to: "/accounts", key: "nav_accounts", icon: Books },
];

export default function AppShell({ children }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
    toast.success(t("logout"));
  };

  return (
    <div className="min-h-screen bg-ink-50">
      <Toaster position="top-right" richColors />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-800 bg-ink-900 lg:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
            <TruckIcon size={24} weight="duotone" />
          </span>
          <div>
            <p className="text-sm font-extrabold leading-tight text-white">{t("appName")}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">
              {t("tagline")}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive ? "bg-brand-500 text-white" : "text-ink-300 hover:bg-ink-800 hover:text-white",
                )
              }
            >
              <item.icon size={19} weight="duotone" />
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-ink-800 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-ink-800/60 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-extrabold text-white">
              {(user?.name || user?.email || "O").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">{user?.name || "Owner"}</p>
              <p className="truncate text-[10px] text-ink-400">{user?.email}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <NavLink
              to="/account"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs font-bold text-ink-200 transition-colors hover:border-brand-400 hover:text-white"
            >
              <Key size={15} /> {t("change_password")}
            </NavLink>
            <button
              type="button"
              onClick={signOut}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-500"
            >
              <SignOut size={15} weight="bold" /> {t("logout")}
            </button>
          </div>

          <p className="text-[11px] text-ink-500">{t("clear_data_hint")}</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
              <TruckIcon size={20} weight="duotone" />
            </span>
            <div>
              <p className="text-sm font-extrabold leading-tight text-ink-800">{t("appName")}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                {t("tagline")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label={t("logout")}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white"
          >
            <SignOut size={17} weight="bold" />
          </button>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex snap-x gap-1 overflow-x-auto px-2 py-1.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-w-[68px] flex-1 snap-start flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors",
                  isActive ? "bg-brand-50 text-brand-600" : "text-ink-500",
                )
              }
            >
              <item.icon size={20} weight="duotone" />
              {t(item.key)}
            </NavLink>
          ))}
          <NavLink
            to="/account"
            className={({ isActive }) =>
              cn(
                "flex min-w-[68px] flex-1 snap-start flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors",
                isActive ? "bg-brand-50 text-brand-600" : "text-ink-500",
              )
            }
          >
            <User size={20} weight="duotone" />
            {t("change_password")}
          </NavLink>
        </div>
      </nav>
    </div>
  );
}