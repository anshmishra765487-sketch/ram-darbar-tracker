import { useCallback, useEffect, useMemo, useState } from "react";
import { PencilSimple, Plus, Trash, Wallet } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { PAYMENT_MODES, prettyDate, rupees, todayISO } from "../lib/utils";
import { Button, IconButton } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input, Select, Textarea } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

const ALL = "__all__";

const EMPTY = { trip_id: "", amount: "", date: todayISO(), mode: "Cash", reference: "", note: "" };

export default function Payments() {
  const { t } = useI18n();
  const [payments, setPayments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modeFilter, setModeFilter] = useState(ALL);

  const load = useCallback(async () => {
    try {
      const [paymentRes, tripRes] = await Promise.all([api.get("/payments"), api.get("/trips")]);
      setPayments(paymentRes.data);
      setTrips(tripRes.data);
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

  const total = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const filtered = modeFilter === ALL ? payments : payments.filter((payment) => payment.mode === modeFilter);

  const save = async () => {
    if (!form.trip_id) {
      toast.error(t("payments_trip_req"));
      return;
    }
    if (!Number(form.amount)) {
      toast.error(t("payments_amount_req"));
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editing) {
        await api.put(`/payments/${editing}`, payload);
        toast.success(t("payments_updated"));
      } else {
        await api.post("/payments", payload);
        toast.success(t("payments_added"));
      }
      setOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (payment) => {
    if (!window.confirm(`${rupees(payment.amount)} — ${t("common_delete")}?`)) return;
    try {
      await api.delete(`/payments/${payment._id}`);
      toast.success(t("payments_deleted"));
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("payments_title")}
        subtitle={t("payments_sub")}
        actions={
          <Button
            onClick={() => {
              setForm({ ...EMPTY, date: todayISO() });
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={17} weight="bold" /> {t("payments_new")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("payments_total")} value={rupees(total)} icon={Wallet} tone="emerald" />
        {PAYMENT_MODES.map((mode) => (
          <StatCard
            key={mode}
            label={mode}
            value={rupees(
              payments.filter((p) => p.mode === mode).reduce((sum, p) => sum + Number(p.amount || 0), 0),
              true,
            )}
            tone="slate"
          />
        ))}
      </div>

      <Card className="flex flex-wrap gap-1 p-3">
        {[ALL, ...PAYMENT_MODES].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setModeFilter(mode)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              modeFilter === mode ? "bg-ink-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"
            }`}
          >
            {mode === ALL ? t("common_all") : mode}
          </button>
        ))}
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title={t("payments_empty")} hint={t("payments_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_date")}</Th>
                <Th>{t("payments_party_trip")}</Th>
                <Th align="right">{t("f_amount")}</Th>
                <Th>{t("f_mode")}</Th>
                <Th>{t("f_reference")}</Th>
                <Th align="right">{t("payments_trip_pending")}</Th>
                <Th align="right">{t("common_edit")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((payment) => {
                const trip = tripMap[payment.trip_id];
                return (
                  <tr key={payment._id} className="hover:bg-ink-50">
                    <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(payment.date)}</Td>
                    <Td>
                      <p className="font-semibold text-ink-800">{trip?.party_name || payment.party_name || "-"}</p>
                      <p className="text-xs text-ink-500">
                        {trip ? `${trip.from_location} → ${trip.to_location}` : "-"}
                      </p>
                    </Td>
                    <Td align="right" className="whitespace-nowrap font-mono font-semibold text-emerald-600">
                      {rupees(payment.amount)}
                    </Td>
                    <Td>
                      <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                        {payment.mode}
                      </span>
                    </Td>
                    <Td className="font-mono text-xs text-ink-600">{payment.reference || "-"}</Td>
                    <Td align="right" className="whitespace-nowrap font-mono text-rose-600">
                      {trip ? rupees(Math.max(trip.pending_amount, 0)) : "-"}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={t("common_edit")}
                          onClick={() => {
                            setForm({
                              trip_id: payment.trip_id,
                              amount: payment.amount,
                              date: String(payment.date).slice(0, 10),
                              mode: payment.mode,
                              reference: payment.reference || "",
                              note: payment.note || "",
                            });
                            setEditing(payment._id);
                            setOpen(true);
                          }}
                        >
                          <PencilSimple size={16} />
                        </IconButton>
                        <IconButton label={t("common_delete")} onClick={() => remove(payment)}>
                          <Trash size={16} className="text-rose-600" />
                        </IconButton>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        title={editing ? t("payments_edit") : t("payments_add")}
        subtitle={t("payments_sub")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common_loading") : editing ? t("common_update") : t("payments_add")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("expenses_trip")} className="sm:col-span-2">
            <Select
              value={form.trip_id}
              disabled={Boolean(editing)}
              onChange={(e) => {
                const trip = trips.find((t) => t._id === e.target.value);
                setForm({
                  ...form,
                  trip_id: e.target.value,
                  amount: trip ? String(Math.max(trip.pending_amount, 0)) : form.amount,
                });
              }}
            >
              <option value="">{t("trips_empty")}</option>
              {trips
                .filter((trip) => trip.status !== "Cancelled")
                .map((trip) => (
                  <option key={trip._id} value={trip._id}>
                    {trip.party_name} — {rupees(Math.max(trip.pending_amount, 0))} {t("kpi_pending").toLowerCase()}
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
              placeholder="12000"
            />
          </Field>
          <Field label={t("f_date")}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label={t("f_mode")}>
            <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {PAYMENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("f_reference")}>
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="NEFT-88231"
            />
          </Field>
          <Field label={t("f_notes")} className="sm:col-span-2">
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}