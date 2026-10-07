import { useState } from "react";
import { DeviceMobile, Key, ShieldCheck, TruckIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Field, Input } from "../components/ui/input";
import { PageHeader } from "../components/PageHeader";

export default function Account() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phone, setPhone] = useState(user?.phone?.replace(/^91/, "") || "");

  const submit = async (event) => {
    event.preventDefault();
    if (!oldPassword || !newPassword) {
      toast.error(t("login_empty"));
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { old_password: oldPassword, new_password: newPassword });
      toast.success(t("password_changed"));
      setOldPassword("");
      setNewPassword("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async (event) => {
    event.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      toast.error(t("login_bad_phone"));
      return;
    }
    setPhoneBusy(true);
    try {
      await api.put("/auth/phone", { phone: phone.trim() });
      await refreshUser();
      toast.success(t("phone_saved"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPhoneBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("account_title")} subtitle={user?.email} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("login_mobile")} subtitle={t("account_phone_hint")} icon={DeviceMobile} />
          <CardBody>
            <form className="space-y-3" onSubmit={savePhone}>
              <Field label={t("login_mobile")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-[38px] items-center rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm font-bold text-ink-600">
                    +91
                  </span>
                  <Input
                    value={phone}
                    inputMode="numeric"
                    autoComplete="tel-national"
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    className="tracking-wide"
                  />
                </div>
              </Field>
              <Button type="submit" variant="outline" disabled={phoneBusy}>
                {phoneBusy ? t("common_loading") : t("common_save")}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("change_password")} icon={Key} />
          <CardBody>
            <form className="space-y-3" onSubmit={submit}>
              <Field label={t("old_password")}>
                <Input
                  type="password"
                  value={oldPassword}
                  autoComplete="current-password"
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </Field>
              <Field label={t("new_password")}>
                <Input
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? t("common_loading") : t("common_save")}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("appName")} subtitle={t("tagline")} icon={TruckIcon} />
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">{t("login_name")}</span>
              <span className="font-semibold text-ink-800">{user?.name || "Owner"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">{t("login_mobile")}</span>
              <span className="font-mono font-semibold text-ink-800">
                {user?.phone ? `+${user.phone}` : t("common_not_set")}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
              <ShieldCheck size={15} className="text-emerald-600" />
              {t("login_pitch_secure")}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}