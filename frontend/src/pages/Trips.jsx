import { useCallback, useEffect, useMemo, useState } from "react";
import { Books, FilePdf, MagnifyingGlass, MapPin, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, downloadBilty, errorMessage } from "../lib/api";
import {
  EXPENSE_CATEGORIES,
  TRIP_STATUSES,
  prettyDate,
  rupees,
  statusClass,
  todayISO,
} from "../lib/utils";
import { Button, IconButton } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge, EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner } from "../components/PageHeader";
import TripLedger from "../components/TripLedger";
import TripTrackPanel from "../components/TripTrackPanel";
import { useI18n } from "../lib/i18n";

const ALL = "__all__";

const EMPTY = {
  party_name: "",
  from_location: "",
  to_location: "",
  truck_id: "",
  driver_id: "",
  advance: "",
  purchase_amount: "",
  sale_amount: "",
  extra_expense: "",
  driver_pay: "",
  date: todayISO(),
  status: "Pending",
  notes: "",
};

export default function Trips() {
  const { t } = useI18n();
  const [trips, setTrips] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [expenseRows, setExpenseRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ALL);
  const [ledgerId, setLedgerId] = useState(null);
  const [trackTrip, setTrackTrip] = useState(null);

  const load = useCallback(async () => {
    try {
      const [tripRes, truckRes, driverRes] = await Promise.all([
        api.get("/trips"),
        api.get("/trucks"),
        api.get("/drivers"),
      ]);
      setTrips(tripRes.data);
      setTrucks(truckRes.data);
      setDrivers(driverRes.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const truckMap = useMemo(() => Object.fromEntries(trucks.map((t) => [t._id, t])), [trucks]);
  const driverMap = useMemo(() => Object.fromEntries(drivers.map((d) => [d._id, d])), [drivers]);

  const totals = useMemo(
    () => ({
      pending: trips.reduce((sum, t) => sum + Math.max(Number(t.pending_amount || 0), 0), 0),
      profit: trips.reduce((sum, t) => sum + Number(t.profit || 0), 0),
      loss: trips.reduce(
        (sum, t) => sum + (t.is_loss ? Math.abs(Number(t.profit || 0)) : 0),
        0,
      ),
    }),
    [trips],
  );

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return trips.filter((trip) => {
      const byStatus = filter === ALL || trip.status === filter;
      const byText =
        !text ||
        trip.party_name.toLowerCase().includes(text) ||
        trip.from_location.toLowerCase().includes(text) ||
        trip.to_location.toLowerCase().includes(text) ||
        (trip.goods || "").toLowerCase().includes(text);
      return byStatus && byText;
    });
  }, [trips, search, filter]);

  const openCreate = () => {
    setForm({ ...EMPTY, date: todayISO() });
    setExpenseRows([]);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (trip) => {
    setForm({
      party_name: trip.party_name,
      from_location: trip.from_location,
      to_location: trip.to_location,
      truck_id: trip.truck_id || "",
      driver_id: trip.driver_id || "",
      advance: trip.advance || 0,
      purchase_amount: trip.purchase_amount || "",
      sale_amount: trip.sale_amount || "",
      extra_expense: trip.extra_expense || "",
      driver_pay: trip.driver_pay || "",
      date: String(trip.date).slice(0, 10),
      status: trip.status,
      notes: trip.notes || "",
    });
    setExpenseRows([]);
    setEditing(trip._id);
    setOpen(true);
  };

  const addExpenseRow = () =>
    setExpenseRows((rows) => [...rows, { category: EXPENSE_CATEGORIES[0], amount: "", note: "" }]);

  const updateExpenseRow = (index, patch) =>
    setExpenseRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeExpenseRow = (index) =>
    setExpenseRows((rows) => rows.filter((_, i) => i !== index));

  const save = async () => {
    if (!form.party_name.trim() || !form.from_location.trim() || !form.to_location.trim()) {
      toast.error(t("trips_req"));
      return;
    }
    if (!Number(form.sale_amount) && !Number(form.driver_pay)) {
      toast.error(t("trips_freight_req"));
      return;
    }
    const payload = {
      ...form,
      truck_id: form.truck_id || null,
      driver_id: form.driver_id || null,
      advance: Number(form.advance || 0),
      purchase_amount: Number(form.purchase_amount || 0),
      sale_amount: Number(form.sale_amount || 0),
      extra_expense: Number(form.extra_expense || 0),
      driver_pay: Number(form.driver_pay || 0),
    };
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/trips/${editing}`, payload);
        await saveExpenses(editing);
        toast.success(t("trips_updated"));
      } else {
        const created = await api.post("/trips", payload);
        const newTripId = created.data._id;
        await saveExpenses(newTripId);
        toast.success(t("trips_created"));
      }
      setOpen(false);
      setExpenseRows([]);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveExpenses = async (tripId) => {
    const rows = expenseRows.filter((row) => Number(row.amount) > 0);
    for (const row of rows) {
      await api.post("/expenses", {
        trip_id: tripId,
        category: row.category,
        amount: Number(row.amount),
        note: row.note,
        date: form.date,
      });
    }
  };

  const changeStatus = async (trip, status) => {
    try {
      await api.put(`/trips/${trip._id}`, { status });
      toast.success(`${t("f_status")}: ${status}`);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const remove = async (trip) => {
    if (!window.confirm(`${t("trips_confirm_delete")} ${trip.party_name}?`)) return;
    try {
      await api.delete(`/trips/${trip._id}`);
      toast.success(t("trips_deleted"));
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const bilty = async (trip) => {
    try {
      await downloadBilty(trip._id, trip.party_name);
      toast.success(t("trips_bilty_done"));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("trips_title")}
        subtitle={`${trips.length} ${t("kpi_trips").toLowerCase()} • ${t("kpi_pending")} ${rupees(totals.pending)} • ${t("ledger_profit")} ${rupees(totals.profit)}${totals.loss > 0 ? ` • Loss ${rupees(totals.loss)}` : ""}`}
        actions={
          <Button onClick={openCreate}>
            <Plus size={17} weight="bold" /> {t("trips_new")}
          </Button>
        }
      />

      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            placeholder={t("trips_search")}
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {[ALL, ...TRIP_STATUSES].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                filter === status ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
              }`}
            >
              {status === ALL ? t("common_all") : status}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title={t("trips_empty")} hint={t("trips_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_date")}</Th>
                <Th>{t("f_party")} / {t("f_to")}</Th>
                <Th>{t("f_truck")} / {t("f_driver")}</Th>
                <Th align="right">{t("kpi_expenses")}</Th>
                <Th align="right">{t("kpi_received")}</Th>
                <Th align="right">{t("kpi_pending")}</Th>
                <Th align="right">{t("ledger_profit")}</Th>
                <Th>{t("f_status")}</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip) => (
                <tr key={trip._id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(trip.date)}</Td>
                  <Td>
                    <p className="font-semibold text-ink-800">{trip.party_name}</p>
                    <p className="text-xs text-ink-500">
                      {trip.from_location} → {trip.to_location}
                    </p>
                    {Number(trip.sale_total || trip.purchase_total) > 0 ? (
                      <p className="text-[11px] text-indigo-500">
                        Maal: {rupees(trip.purchase_total)} → {rupees(trip.sale_total)}
                      </p>
                    ) : null}
                    {trip.goods ? <p className="text-[11px] text-ink-400">{trip.goods}</p> : null}
                  </Td>
                  <Td className="text-xs">
                    <p className="font-mono text-ink-700">{truckMap[trip.truck_id]?.registration_no || "-"}</p>
                    <p className="text-ink-500">{driverMap[trip.driver_id]?.name || "-"}</p>
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-amber-600">
                    {rupees(trip.expense_total)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-emerald-600">
                    {rupees(trip.received_total)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-rose-600">
                    {rupees(Math.max(trip.pending_amount, 0))}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold">
                    {trip.is_loss ? (
                      <>
                        <span className="text-rose-700">-{rupees(Math.abs(trip.profit))}</span>
                        <p className="text-[10px] font-bold uppercase text-rose-500">Loss</p>
                      </>
                    ) : (
                      <span className="text-emerald-700">{rupees(trip.profit)}</span>
                    )}
                  </Td>
                  <Td>
                    <select
                      value={trip.status}
                      onChange={(event) => changeStatus(trip, event.target.value)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset outline-none ${statusClass(trip.status)}`}
                    >
                      {TRIP_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton label={t("ledger_view")} onClick={() => setLedgerId(trip._id)}>
                        <Books size={16} className="text-indigo-600" />
                      </IconButton>
                      <IconButton label="Track & Collect" onClick={() => setTrackTrip(trip)}>
                        <MapPin size={16} className="text-brand-600" />
                      </IconButton>
                      <IconButton label={t("trips_bilty")} onClick={() => bilty(trip)}>
                        <FilePdf size={16} className="text-brand-600" />
                      </IconButton>
                      <IconButton label={t("common_edit")} onClick={() => openEdit(trip)}>
                        <PencilSimple size={16} />
                      </IconButton>
                      <IconButton label={t("common_delete")} onClick={() => remove(trip)}>
                        <Trash size={16} className="text-rose-600" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? t("trips_edit") : t("trips_new")}
        subtitle={t("trips_form_sub")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common_loading") : editing ? t("common_update") : t("trips_create")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("f_party")}>
            <Input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} placeholder="Sharma Traders" />
          </Field>
          <Field label={t("f_from")}>
            <Input value={form.from_location} onChange={(e) => setForm({ ...form, from_location: e.target.value })} placeholder="Delhi" />
          </Field>
          <Field label={t("f_to")}>
            <Input value={form.to_location} onChange={(e) => setForm({ ...form, to_location: e.target.value })} placeholder="Jaipur" />
          </Field>
          <Field label={t("f_truck")}>
            <Select value={form.truck_id} onChange={(e) => setForm({ ...form, truck_id: e.target.value })}>
              <option value="">— Chunein —</option>
              {trucks.map((truck) => (
                <option key={truck._id} value={truck._id}>
                  {truck.registration_no} ({truck.capacity_tons}T)
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_driver")}>
            <Select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
              <option value="">— Chunein —</option>
              {drivers.map((driver) => (
                <option key={driver._id} value={driver._id}>
                  {driver.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver ka payment (Rs)" hint="Is trip ke hisab se driver ko kitna">
            <Input
              type="number"
              min="0"
              value={form.driver_pay}
              onChange={(e) => setForm({ ...form, driver_pay: e.target.value })}
              placeholder="Driver payment"
            />
          </Field>
          <Field label={t("f_advance")}>
            <Input
              type="number"
              min="0"
              value={form.advance}
              onChange={(e) => setForm({ ...form, advance: e.target.value })}
              placeholder="10000"
            />
          </Field>
          <Field label="Maal kharida (Rs)">
            <Input
              type="number"
              min="0"
              value={form.purchase_amount}
              onChange={(e) => setForm({ ...form, purchase_amount: e.target.value })}
              placeholder="Kitne ka maal liya"
            />
          </Field>
          <Field label="Maal becha (Rs)">
            <Input
              type="number"
              min="0"
              value={form.sale_amount}
              onChange={(e) => setForm({ ...form, sale_amount: e.target.value })}
              placeholder="Kitne ka sell kiya"
            />
          </Field>
          <Field label="Extra kharcha (Rs)">
            <Input
              type="number"
              min="0"
              value={form.extra_expense}
              onChange={(e) => setForm({ ...form, extra_expense: e.target.value })}
              placeholder="Extra kharcha"
            />
          </Field>
          <Field label={t("f_date")}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("f_status")}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {TRIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_notes")} className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("f_notes")}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-ink-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink-800">Trip Expenses</p>
              <p className="text-xs text-ink-400">Is trip ke kharche (optional)</p>
            </div>
            <Button type="button" variant="outline" onClick={addExpenseRow}>
              <Plus size={15} weight="bold" /> Add
            </Button>
          </div>

          {expenseRows.length === 0 ? (
            <p className="text-xs text-ink-400">Abhi koi expense nahi. "Add" dabao.</p>
          ) : (
            <div className="space-y-2">
              {expenseRows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
                  <Select
                    value={row.category}
                    onChange={(e) => updateExpenseRow(index, { category: e.target.value })}
                  >
                    {EXPENSE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) => updateExpenseRow(index, { amount: e.target.value })}
                  />
                  <Input
                    placeholder="Note (optional)"
                    value={row.note}
                    onChange={(e) => updateExpenseRow(index, { note: e.target.value })}
                    className="col-span-2 sm:col-span-1"
                  />
                  <IconButton type="button" label="Remove" onClick={() => removeExpenseRow(index)}>
                    <Trash size={16} className="text-rose-600" />
                  </IconButton>
                </div>
              ))}
              <p className="text-right text-xs font-semibold text-ink-600">
                Total: {rupees(expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}
              </p>
            </div>
          )}
        </div>
      </Modal>

      <TripLedger tripId={ledgerId} open={Boolean(ledgerId)} onClose={() => setLedgerId(null)} />

      <TripTrackPanel
        trip={trackTrip}
        open={Boolean(trackTrip)}
        onClose={() => setTrackTrip(null)}
      />
    </div>
  );
}