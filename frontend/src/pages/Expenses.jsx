import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilSimple, Plus, Receipt, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { EXPENSE_CATEGORIES, prettyDate, rupees, todayISO } from "../lib/utils";
import { Button, IconButton } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge, EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

const ALL = "__all__";

const EMPTY = {
  category: "Fuel",
  amount: "",
  date: todayISO(),
  trip_id: "",
  truck_id: "",
  note: "",
};

export default function Expenses() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState(ALL);

  const load = useCallback(async () => {
    try {
      const [expenseRes, tripRes, truckRes] = await Promise.all([
        api.get("/expenses"),
        api.get("/trips"),
        api.get("/trucks"),
      ]);
      setExpenses(expenseRes.data);
      setTrips(tripRes.data);
      setTrucks(truckRes.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tripMap = useMemo(() => Object.fromEntries(trips.map((t) => [t._id, t])), [trips]);
  const truckMap = useMemo(() => Object.fromEntries(trucks.map((t) => [t._id, t])), [trucks]);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const filtered = filter === ALL ? expenses : expenses.filter((expense) => expense.category === filter);

  const byCategory = useMemo(() => {
    const map = {};
    expenses.forEach((expense) => {
      map[expense.category] = (map[expense.category] || 0) + Number(expense.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const save = async () => {
    if (!Number(form.amount)) {
      toast.error(t("expenses_amount_req"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        trip_id: form.trip_id || null,
        truck_id: form.truck_id || null,
      };
      if (editing) {
        await api.put(`/expenses/${editing}`, payload);
        toast.success(t("expenses_updated"));
      } else {
        await api.post("/expenses", payload);
        toast.success(t("expenses_added"));
      }
      setOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (expense) => {
    if (!window.confirm(`${expense.category} ${rupees(expense.amount)} — ${t("common_delete")}?`)) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      toast.success(t("expenses_deleted"));
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("expenses_title")}
        subtitle={t("expenses_sub")}
        actions={
          <Button
            onClick={() => {
              setForm({ ...EMPTY, date: todayISO() });
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={17} weight="bold" /> {t("expenses_new")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("expenses_total")} value={rupees(total)} icon={Receipt} tone="amber" />
        {byCategory.slice(0, 3).map(([category, amount]) => (
          <StatCard key={category} label={category} value={rupees(amount, true)} tone="slate" />
        ))}
      </div>

      <Card className="flex flex-wrap gap-1 p-3">
        {[ALL, ...EXPENSE_CATEGORIES].map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setFilter(category)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              filter === category ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {category === ALL ? t("common_all") : category}
          </button>
        ))}
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title={t("expenses_empty")} hint={t("expenses_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_date")}</Th>
                <Th>{t("f_category")}</Th>
                <Th align="right">{t("f_amount")}</Th>
                <Th>{t("expenses_trip")}</Th>
                <Th>{t("expenses_truck")}</Th>
                <Th>{t("f_notes")}</Th>
                <Th align="right">{t("common_edit")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr key={expense._id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(expense.date)}</Td>
                  <Td>
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-200">{expense.category}</Badge>
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold">
                    {rupees(expense.amount)}
                  </Td>
                  <Td className="text-xs text-ink-600">{tripMap[expense.trip_id]?.party_name || "-"}</Td>
                  <Td className="font-mono text-xs">{truckMap[expense.truck_id]?.registration_no || "-"}</Td>
                  <Td className="max-w-40 truncate text-xs text-ink-500">{expense.note || "-"}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label={t("common_edit")}
                        onClick={() => {
                          setForm({
                            category: expense.category,
                            amount: expense.amount,
                            date: String(expense.date).slice(0, 10),
                            trip_id: expense.trip_id || "",
                            truck_id: expense.truck_id || "",
                            note: expense.note || "",
                          });
                          setEditing(expense._id);
                          setOpen(true);
                        }}
                      >
                        <PencilSimple size={16} />
                      </IconButton>
                      <IconButton label={t("common_delete")} onClick={() => remove(expense)}>
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
        title={editing ? t("expenses_edit") : t("expenses_add")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common_loading") : editing ? t("common_update") : t("expenses_add")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("f_category")}>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_amount")}>
            <Input
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="8500"
            />
          </Field>
          <Field label={t("f_date")}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("f_link_trip")}>
            <Select value={form.trip_id} onChange={(e) => setForm({ ...form, trip_id: e.target.value })}>
              <option value="">{t("trips_empty")}</option>
              {trips.map((trip) => (
                <option key={trip._id} value={trip._id}>
                  {trip.party_name} ({trip.from_location} → {trip.to_location})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_link_truck")}>
            <Select value={form.truck_id} onChange={(e) => setForm({ ...form, truck_id: e.target.value })}>
              <option value="">{t("trucks_empty")}</option>
              {trucks.map((truck) => (
                <option key={truck._id} value={truck._id}>
                  {truck.registration_no}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_notes")} className="sm:col-span-2">
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Diesel refill" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}