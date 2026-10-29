import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ChartLineUp,
  Clock,
  Database,
  DownloadSimple,
  FileText,
  Key,
  Plus,
  Receipt,
  ShieldCheck,
  Trash,
  Truck,
  UploadSimple,
  UserCircle,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage, downloadOwnerReport } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Button, IconButton } from "../components/ui/button";
import { Field, Input, Select } from "../components/ui/input";
import { Table, Th, Td, Badge, EmptyState } from "../components/ui/table";
import { Modal } from "../components/ui/modal";

const TABS = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "staff", label: "Staff activity", icon: Clock },
  { id: "report", label: "PDF report", icon: FileText },
  { id: "backup", label: "Backup & data", icon: Database },
];

const ROLE_TONE = {
  owner: "bg-brand-50 text-brand-700 ring-brand-200",
  admin: "bg-sky-50 text-sky-700 ring-sky-200",
  staff: "bg-ink-100 text-ink-600 ring-ink-200",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  return `${todayISO().slice(0, 7)}-01`;
}

function shortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function shortStamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function Admin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", password: "", role: "staff" });
  const [newPassword, setNewPassword] = useState("");
  const fileRef = useRef(null);

  const [from, setFrom] = useState(monthStartISO);
  const [to, setTo] = useState(todayISO);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    try {
      const [statsRes, usersRes] = await Promise.all([api.get("/admin/stats"), api.get("/admin/users")]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  const loadReport = useCallback(async () => {
    if (!isOwner) return;
    setReportLoading(true);
    try {
      const res = await api.get(`/admin/report?from=${from}&to=${to}`);
      setReport(res.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  }, [isOwner, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "staff" || tab === "report") loadReport();
  }, [tab, loadReport]);

  const counts = stats?.counts || {};

  const statCards = useMemo(
    () => [
      { label: "Users", value: counts.users ?? 0, hint: "accounts on this device", icon: Users, tone: "slate" },
      { label: "Trucks", value: counts.trucks ?? 0, hint: "registered vehicles", icon: Truck, tone: "brand" },
      { label: "Drivers", value: counts.drivers ?? 0, hint: "driver records", icon: UserCircle, tone: "sky" },
      { label: "Trips", value: counts.trips ?? 0, hint: "consignments", icon: FileText, tone: "emerald" },
      { label: "Expenses", value: counts.expenses ?? 0, hint: "kharcha entries", icon: Receipt, tone: "amber" },
      { label: "Payments", value: counts.payments ?? 0, hint: "party receipts", icon: Wallet, tone: "rose" },
    ],
    [counts],
  );

  const addUser = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/users", form);
      toast.success("User added");
      setForm({ name: "", phone: "", password: "", role: "staff" });
      setAddOpen(false);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id, role) => {
    try {
      await api.put(`/admin/users/${id}`, { role });
      toast.success("Role updated");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (!passwordUser) return;
    setBusy(true);
    try {
      await api.put(`/admin/users/${passwordUser.id}`, { password: newPassword });
      toast.success("Password updated");
      setPasswordUser(null);
      setNewPassword("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (row) => {
    if (!window.confirm(`Delete ${row.name || row.phone}? This removes the account only, not business data.`)) return;
    try {
      await api.delete(`/admin/users/${row.id}`);
      toast.success("User deleted");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const exportBackup = async () => {
    try {
      const res = await api.get("/admin/export");
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ram-darbar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("This file is not a valid JSON backup");
      return;
    }
    const db = parsed?.db || parsed;
    if (!db || typeof db !== "object") {
      toast.error("No data found in this backup file");
      return;
    }
    if (!window.confirm("Restore this backup? Current data on this device will be replaced.")) return;
    try {
      await api.post("/admin/import", { db });
      toast.success("Backup restored");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const clearData = async () => {
    if (!window.confirm("Delete every truck, driver, trip, expense and payment? User accounts stay.")) return;
    if (!window.confirm("This cannot be undone. Are you sure?")) return;
    try {
      await api.post("/admin/reset");
      toast.success("Business data cleared");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const downloadPdf = async () => {
    let data = report;
    if (!data) {
      try {
        const res = await api.get(`/admin/report?from=${from}&to=${to}`);
        data = res.data;
        setReport(data);
      } catch (error) {
        toast.error(errorMessage(error));
        return;
      }
    }
    downloadOwnerReport(data);
    toast.success("PDF report downloaded");
  };

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <PageHeader title="Admin panel" subtitle="Owner only" />
        <Card>
          <CardBody className="space-y-2 text-sm text-ink-600">
            <p className="font-semibold text-ink-800">Access denied</p>
            <p>Only the owner account can open the admin panel. Log in with the owner number and password.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (loading) return <Spinner label="Loading admin panel..." />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin panel"
        subtitle="Users, staff activity, reports and backup"
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <ArrowClockwise size={15} /> Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === item.id ? "bg-brand-500 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
            }`}
          >
            <item.icon size={16} weight="duotone" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Storage" subtitle="Where this device keeps the data" icon={Database} />
              <CardBody className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Mode</span>
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Offline (this device)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Activity entries saved</span>
                  <span className="font-semibold text-ink-800">{stats?.activity_total ?? 0}</span>
                </div>
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  Data lives in the browser storage of this device. Use the Backup tab to move it to another phone or
                  computer.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Signed in as" subtitle="Current owner session" icon={ShieldCheck} />
              <CardBody className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Name</span>
                  <span className="font-semibold text-ink-800">{stats?.current_user?.name || "Owner"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Mobile</span>
                  <span className="font-mono font-semibold text-ink-800">
                    {stats?.current_user?.phone ? `+${stats.current_user.phone}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Email</span>
                  <span className="truncate font-semibold text-ink-800">{stats?.current_user?.email || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Roles</span>
                  <span className="font-semibold text-ink-800">
                    {Object.entries(stats?.roles || {})
                      .map(([role, total]) => `${role} ${total}`)
                      .join(" · ") || "-"}
                  </span>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "users" ? (
        <Card>
          <CardHeader
            title="Users"
            subtitle="Accounts that can open this app on this device"
            icon={Users}
            action={
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus size={15} weight="bold" /> Add user
              </Button>
            }
          />
          {users.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Mobile</Th>
                  <Th>Role</Th>
                  <Th>Created</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <span className="font-semibold text-ink-800">{row.name || "-"}</span>
                      {row.is_me ? <span className="ml-2 text-[10px] font-bold text-brand-600">(you)</span> : null}
                    </Td>
                    <Td className="font-mono text-xs">{row.phone ? `+${row.phone}` : "-"}</Td>
                    <Td>
                      {row.role === "owner" || row.is_me ? (
                        <Badge className={ROLE_TONE[row.role]}>{row.role}</Badge>
                      ) : (
                        <Select
                          value={row.role}
                          className="h-8 py-1 text-xs"
                          onChange={(event) => changeRole(row.id, event.target.value)}
                        >
                          <option value="staff">staff</option>
                          <option value="admin">admin</option>
                        </Select>
                      )}
                    </Td>
                    <Td className="text-xs text-ink-500">{shortDate(row.created_at)}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <IconButton label="Set password" onClick={() => setPasswordUser(row)}>
                          <Key size={15} />
                        </IconButton>
                        <IconButton
                          label="Delete user"
                          className="hover:text-rose-600"
                          disabled={row.is_me || row.role === "owner"}
                          onClick={() => removeUser(row)}
                        >
                          <Trash size={15} />
                        </IconButton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No users yet" hint="Add the first staff account." />
          )}
        </Card>
      ) : null}

      {tab === "staff" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Date range" subtitle="Kitne din ka hisaab dekhna hai" icon={Clock} />
            <CardBody className="flex flex-col gap-3 text-sm sm:flex-row sm:items-end">
              <Field label="From" className="sm:w-44">
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </Field>
              <Field label="To" className="sm:w-44">
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </Field>
              <Button variant="outline" onClick={loadReport} disabled={reportLoading}>
                <ArrowClockwise size={15} /> {reportLoading ? "Loading..." : "Load"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Kaun kitna kaam kiya" subtitle="Trips, kharcha aur payment kis user ne banaya" icon={Users} />
            {report ? (
              <Table>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Role</Th>
                    <Th align="right">Logins</Th>
                    <Th align="right">Trips</Th>
                    <Th align="right">Freight</Th>
                    <Th align="right">Expenses</Th>
                    <Th align="right">Received</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.staff.map((row) => (
                    <tr key={row.id}>
                      <Td>
                        <span className="font-semibold text-ink-800">{row.name}</span>
                        <span className="ml-2 font-mono text-[11px] text-ink-400">{row.phone ? `+${row.phone}` : ""}</span>
                        {row.last_login ? (
                          <span className="ml-2 text-[10px] text-ink-400">last {shortStamp(row.last_login)}</span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge className={ROLE_TONE[row.role] || ROLE_TONE.staff}>{row.role}</Badge>
                      </Td>
                      <Td align="right" className="font-semibold">{row.logins}</Td>
                      <Td align="right" className="font-semibold">{row.trips}</Td>
                      <Td align="right">{money(row.freight)}</Td>
                      <Td align="right">{money(row.expenses_amount)}</Td>
                      <Td align="right">{money(row.payments_amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : reportLoading ? (
              <Spinner label="Loading activity..." />
            ) : (
              <EmptyState title="No activity data" hint="Load a date range to see staff work." />
            )}
          </Card>

          {report ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Login history" subtitle={`${report.logins.length} logins is range me`} icon={Key} />
                <CardBody className="max-h-80 space-y-2 overflow-y-auto text-sm">
                  {report.logins.length ? (
                    report.logins.map((login, index) => (
                      <div key={`${login.at}-${index}`} className="flex items-start justify-between gap-3 border-b border-ink-100 pb-2 last:border-0">
                        <div>
                          <p className="font-semibold text-ink-800">{login.name}</p>
                          <p className="text-xs text-ink-500">
                            {login.phone ? `+${login.phone} · ` : ""}
                            {login.role} · {login.action}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs text-ink-400">{shortStamp(login.at)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-ink-500">No logins in this period.</p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Recent actions" subtitle="Kisne kya add / edit / delete kiya" icon={FileText} />
                <CardBody className="max-h-80 space-y-2 overflow-y-auto text-sm">
                  {report.actions.length ? (
                    report.actions.map((action, index) => (
                      <div key={`${action.at}-${index}`} className="border-b border-ink-100 pb-2 last:border-0">
                        <p className="text-ink-800">{action.summary}</p>
                        <p className="text-xs text-ink-400">
                          {action.name} ({action.role}) · {shortStamp(action.at)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-ink-500">No actions in this period.</p>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "report" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Owner PDF report" subtitle="Poori report ek PDF file me download karo" icon={FileText} />
            <CardBody className="space-y-4 text-sm text-ink-600">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="From" className="sm:w-44">
                  <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                </Field>
                <Field label="To" className="sm:w-44">
                  <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </Field>
                <Button onClick={downloadPdf} disabled={reportLoading}>
                  <DownloadSimple size={16} /> {reportLoading ? "Preparing..." : "Download PDF"}
                </Button>
              </div>

              <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
                <p className="mb-1 font-bold text-ink-800">PDF me kya milega:</p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>Business summary — trips, freight, received, pending, expenses</li>
                  <li>Staff activity — kisne kitne trip liye, kitna kharcha aur payment kiya</li>
                  <li>Login history — kisne kab login kiya, password ya OTP</li>
                  <li>Recent actions — kisne kya add / edit / delete kiya</li>
                  <li>Trips, expenses aur payments ki poori list (kisne banaya)</li>
                </ul>
              </div>

              {report ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Trips", value: report.totals.trips },
                    { label: "Freight", value: money(report.totals.freight) },
                    { label: "Expenses", value: money(report.totals.expenses) },
                    { label: "Pending", value: money(report.totals.pending) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-ink-200 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{item.label}</p>
                      <p className="text-lg font-extrabold text-ink-800">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Reports page" subtitle="Trip-wise hisaab aur bilty" icon={ChartLineUp} />
            <CardBody className="text-sm text-ink-600">
              <p>
                Roz ke hisaab ke liye <span className="font-semibold text-ink-800">Reports</span> page use karo. Owner
                PDF me staff ki poori activity aur har record ke saath “Added by” bhi aata hai.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "backup" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Backup" subtitle="Download a JSON copy of all data" icon={DownloadSimple} />
            <CardBody className="space-y-3 text-sm text-ink-600">
              <p>Includes users, trucks, drivers, trips, expenses, payments, trip locations and the activity log.</p>
              <Button onClick={exportBackup}>
                <DownloadSimple size={16} /> Download backup
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Restore" subtitle="Load a backup file into this device" icon={UploadSimple} />
            <CardBody className="space-y-3 text-sm text-ink-600">
              <p>Current data will be replaced by the backup. This cannot be undone.</p>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <UploadSimple size={16} /> Choose backup file
              </Button>
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Danger zone" subtitle="Irreversible actions" icon={Trash} />
            <CardBody className="flex flex-col gap-3 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-ink-800">Clear all business data</p>
                <p className="text-xs text-ink-500">
                  Deletes every truck, driver, trip, expense and payment. User accounts stay.
                </p>
              </div>
              <Button variant="danger" onClick={clearData}>
                <Trash size={16} /> Clear data
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Modal
        open={addOpen}
        title="Add user"
        subtitle="New account can log in with this mobile number and password"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button type="submit" form="admin-add-user" disabled={busy}>
              {busy ? t("common_loading") : t("common_save")}
            </Button>
          </>
        }
      >
        <form id="admin-add-user" className="space-y-3" onSubmit={addUser}>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Driver or office staff name"
              autoComplete="off"
            />
          </Field>
          <Field label="Mobile number">
            <Input
              value={form.phone}
              inputMode="numeric"
              onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="98765 43210"
            />
          </Field>
          <Field label="Password" hint="min 6 characters">
            <Input
              type="text"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordUser)}
        title="Set password"
        subtitle={passwordUser ? `${passwordUser.name || passwordUser.phone}` : undefined}
        size="sm"
        onClose={() => {
          setPasswordUser(null);
          setNewPassword("");
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPasswordUser(null);
                setNewPassword("");
              }}
            >
              {t("common_cancel")}
            </Button>
            <Button type="submit" form="admin-set-password" disabled={busy}>
              {busy ? t("common_loading") : t("common_save")}
            </Button>
          </>
        }
      >
        <form id="admin-set-password" className="space-y-3" onSubmit={savePassword}>
          <Field label="New password" hint="min 6 characters">
            <Input
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
