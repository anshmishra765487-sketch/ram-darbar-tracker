import { useCallback, useEffect, useState } from "react";
import { PencilSimple, Plus, Trash, Truck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { TRUCK_STATUSES } from "../lib/utils";
import { Button, IconButton } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input, Select } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { Badge, EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

const EMPTY = { registration_no: "", model: "", capacity_tons: "", status: "Available" };

export default function Trucks() {
  const { t } = useI18n();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTrucks((await api.get("/trucks")).data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.registration_no.trim() || !form.model.trim() || !Number(form.capacity_tons)) {
      toast.error(t("trucks_req"));
      return;
    }
    setBusy(true);
    try {
      const payload = { ...form, capacity_tons: Number(form.capacity_tons) };
      if (editing) {
        await api.put(`/trucks/${editing}`, payload);
        toast.success(t("trucks_updated"));
      } else {
        await api.post("/trucks", payload);
        toast.success(t("trucks_added"));
      }
      setOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (truck) => {
    if (!window.confirm(`${truck.registration_no} — ${t("common_delete")}?`)) return;
    try {
      await api.delete(`/trucks/${truck._id}`);
      toast.success(t("trucks_deleted"));
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("trucks_title")}
        subtitle={`${trucks.length} ${t("trucks_fleet")}`}
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY);
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={17} weight="bold" /> {t("trucks_new")}
          </Button>
        }
      />

      <Card>
        {trucks.length === 0 ? (
          <EmptyState title={t("trucks_empty")} hint={t("trucks_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_reg")}</Th>
                <Th>{t("f_model")}</Th>
                <Th align="right">{t("f_capacity")}</Th>
                <Th>{t("f_status")}</Th>
                <Th align="right">{t("common_edit")}</Th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => (
                <tr key={truck._id} className="hover:bg-ink-50">
                  <Td className="font-mono font-semibold text-ink-800">{truck.registration_no}</Td>
                  <Td>{truck.model}</Td>
                  <Td align="right" className="font-mono">
                    {truck.capacity_tons}
                  </Td>
                  <Td>
                    <Badge status={truck.status} />
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label={t("common_edit")}
                        onClick={() => {
                          setForm({
                            registration_no: truck.registration_no,
                            model: truck.model,
                            capacity_tons: truck.capacity_tons,
                            status: truck.status,
                          });
                          setEditing(truck._id);
                          setOpen(true);
                        }}
                      >
                        <PencilSimple size={16} />
                      </IconButton>
                      <IconButton label={t("common_delete")} onClick={() => remove(truck)}>
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
        title={editing ? t("trucks_edit") : t("trucks_add")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common_loading") : editing ? t("common_update") : t("trucks_add")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("f_reg")}>
            <Input
              value={form.registration_no}
              onChange={(e) => setForm({ ...form, registration_no: e.target.value })}
              placeholder="MH 12 AB 1234"
            />
          </Field>
          <Field label={t("f_model")}>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="Tata 407 Gold SFC"
            />
          </Field>
          <Field label={t("f_capacity")}>
            <Input
              type="number"
              step="0.5"
              min="0.5"
              value={form.capacity_tons}
              onChange={(e) => setForm({ ...form, capacity_tons: e.target.value })}
              placeholder="9.5"
            />
          </Field>
          <Field label={t("f_status")}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {TRUCK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
          <Truck size={14} /> {t("trucks_dup_hint")}
        </p>
      </Modal>
    </div>
  );
}