import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { SpinnerGap, TruckIcon } from "@phosphor-icons/react";
import { useAuth } from "./lib/auth";
import { useI18n } from "./lib/i18n";
import AppShell from "./components/AppShell";
import Account from "./pages/Account";
import Accounts from "./pages/Accounts";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Trips from "./pages/Trips";
import Trucks from "./pages/Trucks";
import Drivers from "./pages/Drivers";
import Expenses from "./pages/Expenses";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";

function ProtectedLayout() {
  const { isAuthenticated, checking } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white">
          <TruckIcon size={28} weight="duotone" />
        </span>
        <p className="flex items-center gap-2 text-sm font-bold text-ink-500">
          <SpinnerGap size={16} className="animate-spin" />
          {t("common_loading")}
        </p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trips" element={<Trips />} />
        <Route path="/trucks" element={<Trucks />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}