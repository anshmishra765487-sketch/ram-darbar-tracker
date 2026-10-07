import { useCallback, useEffect, useState } from "react";
import { PencilSimple, Phone, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { rupees } from "../lib/utils";
import { Button, IconButton } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field, Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

const EMPTY = { name: "", phone: "", license_no: "", salary: "", advance: "" };

export default function Drivers() {
  const { t } = useI18n();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDrivers((await api.get("/drivers")).data);
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
    if (!form.name.trim() || !form.phone.trim() || !form.license_no.trim()) {
      toast.error(t("drivers_req"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        salary: Number(form.salary || 0),
        advance: Number(form.advance || 0),
      };
      if (editing) {
        await api.put(`/drivers/${editing}`, payload);
        toast.success(t("drivers_updated"));
      } else {
        await api.post("/drivers", payload);
        toast.success(t("drivers_added"));
      }
      setOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (driver) => {
    if (!window.confirm(`${driver.name} — ${t("common_delete")}?`)) return;
    try {
      await api.delete(`/drivers/${driver._id}`);
      toast.success(t("drivers_deleted"));
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  const monthlyPayroll = drivers.reduce((sum, d) => sum + Number(d.salary || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("drivers_title")}
        subtitle={`${drivers.length} ${t("nav_drivers")} • ${t("f_salary")} ${rupees(monthlyPayroll)}`}
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY);
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus size={17} weight="bold" /> {t("drivers_new")}
          </Button>
        }
      />

      <Card>
        {drivers.length === 0 ? (
          <EmptyState title={t("drivers_empty")} hint={t("drivers_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_name")}</Th>
                <Th>{t("f_phone")}</Th>
                <Th>{t("f_license")}</Th>
                <Th align="right">{t("f_salary")}</Th>
                <Th align="right">{t("f_advance")}</Th>
                <Th align="right">{t("common_edit")}</Th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver._id} className="hover:bg-ink-50">
                  <Td className="font-semibold text-ink-800">{driver.name}</Td>
                  <Td>
                    <a
                      href={`tel:${driver.phone}`}
                      className="inline-flex items-center gap-1 font-mono text-xs text-brand-600 hover:underline"
                    >
                      <Phone size={13} /> {driver.phone}
                    </a>
                  </Td>
                  <Td className="font-mono text-xs">{driver.license_no}</Td>
                  <Td align="right" className="font-mono">
                    {rupees(driver.salary)}
                  </Td>
                  <Td align="right" className="font-mono text-amber-600">
                    {rupees(driver.advance)}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        label={t("common_edit")}
                        onClick={() => {
                          setForm({
                            name: driver.name,
                            phone: driver.phone,
                            license_no: driver.license_no,
                            salary: driver.salary,
                            advance: driver.advance,
                          });
                          setEditing(driver._id);
                          setOpen(true);
                        }}
                      >
                        <PencilSimple size={16} />
                      </IconButton>
                      <IconButton label={t("common_delete")} onClick={() => remove(driver)}>
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
        title={editing ? t("drivers_edit") : t("drivers_add")}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? t("common_loading") : editing ? t("common_update") : t("drivers_add")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("f_name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ramesh Kumar" />
          </Field>
          <Field label={t("f_phone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" />
          </Field>
          <Field label={t("f_license")}>
            <Input
              value={form.license_no}
              onChange={(e) => setForm({ ...form, license_no: e.target.value })}
              placeholder="MH1420199912"
            />
          </Field>
          <Field label={t("f_salary")}>
            <Input
              type="number"
              min="0"
              value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })}
              placeholder="18000"
            />
          </Field>
          <Field label={t("f_advance")} className="sm:col-span-2">
            <Input
              type="number"
              min="0"
              value={form.advance}
              onChange={(e) => setForm({ ...form, advance: e.target.value })}
              placeholder="0"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}