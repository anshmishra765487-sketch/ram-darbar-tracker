import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  Books,
  CheckCircle,
  DeviceMobile,
  Eye,
  EyeSlash,
  FileText,
  Key,
  LockKey,
  PaperPlaneTilt,
  ShieldCheck,
  SpinnerGap,
  TruckIcon,
  UserPlus,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Field, Input } from "../components/ui/input";

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isPhone = (value) => PHONE_RE.test(value);
const isEmail = (value) => EMAIL_RE.test(value);

export default function Login() {
  const { t } = useI18n();
  const { login, signup, loginWithOtp, resetPassword, isAuthenticated } = useAuth();
  const location = useLocation();
  const passRef = useRef(null);
  const codeRef = useRef(null);

  const [tab, setTab] = useState("sms");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  const backTo = location.state?.from || "/";
  const [sessionExpired] = useState(() => sessionStorage.getItem("rdt_expired") === "1");

  const passwordMode = tab === "password";

  useEffect(() => {
    sessionStorage.removeItem("rdt_expired");
  }, []);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.getModifierState?.("CapsLock")) setCapsLock(true);
      if (event.key === "CapsLock") setCapsLock(event.getModifierState?.("CapsLock") || false);
    };
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (isAuthenticated) return <Navigate to={backTo} replace />;

  const resetOtpState = () => {
    setOtpSent(false);
    setSentTo("");
    setCode("");
    setCooldown(0);
  };

  const switchMode = (nextTab) => {
    setTab(nextTab);
    setIsSignup(false);
    setError("");
    resetOtpState();
  };

  const validPhone = () => {
    const value = identifier.trim();
    if (!value) {
      setError(t("login_mobile_required"));
      return null;
    }
    if (!PHONE_RE.test(value)) {
      setError(t("login_bad_phone"));
      return null;
    }
    return value;
  };

  const sendOtp = async () => {
    if (busy || sending || cooldown) return;
    const phone = validPhone();
    if (!phone) return;

    setSending(true);
    setError("");
    try {
      const res = await api.post("/auth/otp/request", { identifier: phone });
      setOtpSent(true);
      setCode("");
      setSentTo(res.data?.sent_to || "");
      setCooldown(res.data?.resend_after || 45);
      toast.success(t("login_otp_sent"));
      setTimeout(() => codeRef.current?.focus(), 60);
    } catch (err) {
      if (err?.response?.status === 429) {
        setCooldown(Number(err?.response?.headers?.["retry-after"]) || 45);
      }
      setError(errorMessage(err, t("login_error")));
    } finally {
      setSending(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    if (busy) return;
    const phone = validPhone();
    if (!phone) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 4) {
      setError(t("login_otp_enter"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (resetMode) {
        if (newPassword.length < 6) {
          setError(t("login_password_short"));
          return;
        }
        await resetPassword(phone, digits, newPassword);
        toast.success(t("login_password_reset_done"));
        setResetMode(false);
        setNewPassword("");
        setCode("");
        switchMode("password");
        return;
      }
      const user = await loginWithOtp(phone, digits);
      toast.success(`${t("login_signed_in")} - ${user?.name || "User"}`);
    } catch (err) {
      setError(errorMessage(err, t("login_bad_credentials")));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (busy) return;
    const phone = validPhone();
    if (!phone) return;
    if (!password) {
      setError(t("login_empty"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const user = await login(phone, password);
      toast.success(`${t("login_signed_in")} - ${user?.name || "User"}`);
    } catch (err) {
      setError(errorMessage(err, t("login_bad_credentials")));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (event) => {
    event.preventDefault();
    if (busy) return;
    const phone = validPhone();
    if (!phone) return;
    if (name.trim().length < 2) {
      setError(t("login_signup_name_required"));
      return;
    }
    if (password.length < 6) {
      setError(t("login_password_short"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const user = await signup({ name, phone, password });
      toast.success(`${t("login_account_created")} - ${user?.name || name}. ${t("login_now_login")}`);
      // Account ban gaya. Ab login screen par number + password se login karein.
      setIsSignup(false);
      setPassword("");
      setName("");
      resetOtpState();
      setTab("password");
      setTimeout(() => passRef.current?.focus(), 60);
    } catch (err) {
      setError(errorMessage(err, t("login_error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-100 lg:grid lg:grid-cols-[1.05fr_1fr]">
      <div className="relative overflow-hidden bg-ink-900 px-6 py-8 text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white">
              <TruckIcon size={22} weight="duotone" />
            </span>
            <div>
              <p className="text-base font-extrabold leading-tight">{t("appName")}</p>
              <p className="text-[11px] text-ink-400">{t("tagline")}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-10 hidden lg:block">
          <h2 className="text-3xl font-extrabold leading-tight">{t("login_pitch")}</h2>
          <ul className="mt-6 space-y-3 text-sm text-ink-300">
            <li className="flex items-start gap-2.5">
              <FileText size={18} weight="duotone" className="mt-0.5 shrink-0 text-brand-400" />
              {t("login_pitch_trips")}
            </li>
            <li className="flex items-start gap-2.5">
              <Books size={18} weight="duotone" className="mt-0.5 shrink-0 text-brand-400" />
              {t("login_pitch_accounts")}
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck size={18} weight="duotone" className="mt-0.5 shrink-0 text-brand-400" />
              {t("login_pitch_secure")}
            </li>
          </ul>
        </div>

        <p className="relative mt-8 hidden text-xs text-ink-500 lg:block">
          {t("appName")} · {t("app_version")}
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 lg:py-0">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-xl sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {isSignup ? <UserPlus size={24} weight="duotone" /> : <LockKey size={24} weight="duotone" />}
            </span>
            <h1 className="mt-4 text-2xl font-extrabold text-ink-900">
              {isSignup ? t("login_signup_title") : t("login_title")}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {isSignup ? t("login_signup_subtitle") : t("login_subtitle")}
            </p>

            {!isSignup ? (
              <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
                <button
                  type="button"
                  onClick={() => switchMode("sms")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                    !passwordMode ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"
                  }`}
                >
                  <DeviceMobile size={16} weight="duotone" />
                  <span className="truncate">{t("login_tab_sms")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("password")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                    passwordMode ? "bg-white text-brand-600 shadow-sm" : "text-ink-500"
                  }`}
                >
                  <Key size={16} weight="duotone" />
                  <span className="truncate">{t("login_tab_password")}</span>
                </button>
              </div>
            ) : null}

            {sessionExpired ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                {t("login_session_expired")}
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
              >
                <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
                {error}
              </p>
            ) : null}

            {isSignup ? (
              <form className="mt-5 space-y-4" onSubmit={submitSignup}>
                <Field label={t("login_name")} htmlFor="signup-name">
                  <Input
                    id="signup-name"
                    value={name}
                    autoComplete="name"
                    autoFocus
                    spellCheck={false}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="Your full name"
                  />
                </Field>

                <Field label={t("login_mobile")} htmlFor="signup-phone">
                  <div className="flex items-center gap-2">
                    <span className="flex h-[38px] items-center rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm font-bold text-ink-600">
                      +91
                    </span>
                    <Input
                      id="signup-phone"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value.replace(/\D/g, "").slice(0, 10));
                        if (error) setError("");
                      }}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      className="tracking-wide"
                    />
                  </div>
                </Field>

                <Field label={t("login_password")} htmlFor="signup-pass">
                  <div className="relative">
                    <Input
                      id="signup-pass"
                      ref={passRef}
                      type={show ? "text" : "password"}
                      value={password}
                      autoComplete="new-password"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="••••••••"
                      className={`pr-11 ${capsLock ? "border-amber-400" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((value) => !value)}
                      aria-label={show ? t("login_hide") : t("login_show")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    >
                      {show ? <EyeSlash size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-400">{t("login_password_hint")}</p>
                </Field>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <>
                      <SpinnerGap size={17} className="animate-spin" />
                      {t("common_loading")}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={17} weight="bold" />
                      {t("login_signup_submit")}
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSignup(false);
                    setError("");
                    setPassword("");
                  }}
                  className="w-full text-center text-[11px] font-semibold text-ink-500 underline"
                >
                  {t("login_back_to_login")}
                </button>
              </form>
            ) : passwordMode ? (
              <form className="mt-5 space-y-4" onSubmit={submitPassword}>
                <Field label={t("login_mobile")} htmlFor="login-password-phone">
                  <div className="flex items-center gap-2">
                    <span className="flex h-[38px] items-center rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm font-bold text-ink-600">
                      +91
                    </span>
                    <Input
                      id="login-password-phone"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value.replace(/\D/g, "").slice(0, 10));
                        if (error) setError("");
                      }}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      autoFocus
                      placeholder="98765 43210"
                      className="tracking-wide"
                    />
                  </div>
                </Field>

                <Field label={t("login_password")} htmlFor="login-pass">
                  <div className="relative">
                    <Input
                      id="login-pass"
                      ref={passRef}
                      type={show ? "text" : "password"}
                      value={password}
                      autoComplete="current-password"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="••••••••"
                      className={`pr-11 ${capsLock ? "border-amber-400" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((value) => !value)}
                      aria-label={show ? t("login_hide") : t("login_show")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                    >
                      {show ? <EyeSlash size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {capsLock ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                      <WarningCircle size={13} weight="fill" />
                      {t("login_caps_lock")}
                    </p>
                  ) : null}
                </Field>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <>
                      <SpinnerGap size={17} className="animate-spin" />
                      {t("login_working")}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={17} weight="bold" />
                      {t("login_submit")}
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setResetMode(true);
                    switchMode("sms");
                    resetOtpState();
                    setError("");
                  }}
                  className="w-full text-center text-[11px] font-semibold text-ink-500 underline"
                >
                  {t("login_forgot_password")}
                </button>
              </form>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submitOtp}>
                <Field label={t("login_mobile")} htmlFor="login-phone">
                  <div className="flex items-center gap-2">
                    <span className="flex h-[38px] items-center rounded-lg border border-ink-200 bg-ink-50 px-3 text-sm font-bold text-ink-600">
                      +91
                    </span>
                    <Input
                      id="login-phone"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value.replace(/\D/g, "").slice(0, 10));
                        if (error) setError("");
                      }}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      autoFocus
                      placeholder="98765 43210"
                      className="tracking-wide"
                    />
                  </div>
                </Field>

                <Field label={t("login_otp_label")} htmlFor="login-code">
                  <Input
                    id="login-code"
                    ref={codeRef}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (error) setError("");
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    disabled={!otpSent}
                    className="px-6 text-center font-mono text-lg tracking-[0.5em] disabled:bg-ink-50 disabled:text-ink-300"
                  />
                </Field>

                {sentTo ? (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    {t("login_otp_sent_to")} {sentTo}
                  </p>
                ) : null}

                {resetMode ? (
                  <Field label={t("login_new_password")} htmlFor="login-newpass">
                    <Input
                      id="login-newpass"
                      type="password"
                      value={newPassword}
                      autoComplete="new-password"
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </Field>
                ) : null}

                <Button
                  type="button"
                  variant={otpSent ? "outline" : "default"}
                  className="w-full"
                  onClick={sendOtp}
                  disabled={sending || Boolean(cooldown)}
                >
                  {sending ? (
                    <>
                      <SpinnerGap size={17} className="animate-spin" />
                      {t("common_loading")}
                    </>
                  ) : cooldown ? (
                    t("login_otp_resend_in", { n: cooldown })
                  ) : (
                    <>
                      <PaperPlaneTilt size={17} weight="bold" />
                      {otpSent ? t("login_otp_resend") : t("login_otp_send")}
                    </>
                  )}
                </Button>

                <Button type="submit" className="w-full" disabled={busy || !otpSent}>
                  {busy ? (
                    <>
                      <SpinnerGap size={17} className="animate-spin" />
                      {t("login_working")}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={17} weight="bold" />
                      {resetMode ? t("login_password_reset") : t("login_otp_verify")}
                    </>
                  )}
                </Button>

                {resetMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(false);
                      setNewPassword("");
                      setError("");
                    }}
                    className="w-full text-center text-[11px] font-semibold text-ink-500 underline"
                  >
                    {t("login_cancel_reset")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(true);
                      setError("");
                    }}
                    className="w-full text-center text-[11px] font-semibold text-ink-500 underline"
                  >
                    {t("login_forgot_password")}
                  </button>
                )}
              </form>
            )}

            {!isSignup ? (
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setError("");
                  setPassword("");
                  resetOtpState();
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-3 py-2.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50"
              >
                <UserPlus size={16} weight="bold" />
                {t("login_create_account")}
              </button>
            ) : null}
          </div>

          <p className="mt-4 text-center text-[11px] text-ink-400">
            {t("tagline")} · <span className="font-semibold">{t("app_version")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}