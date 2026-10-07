import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Coins, Receipt, Wallet } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { prettyDate, rupees } from "../lib/utils";
import { useI18n } from "../lib/i18n";
import { Modal } from "./ui/modal";

function Line({ label, value, tone = "text-ink-800", bold = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className={bold ? "font-bold text-ink-700" : "text-ink-500"}>{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : "font-semibold"} ${tone}`}>{value}</span>
    </div>
  );
}

function Total({ label, value, tone = "text-ink-900" }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-ink-200 pt-2">
      <span className="text-xs font-extrabold uppercase tracking-wide text-ink-500">{label}</span>
      <span className={`font-mono text-base font-extrabold ${tone}`}>{value}</span>
    </div>
  );
}

export default function TripLedger({ tripId, open, onClose }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !tripId) return;
    setLoading(true);
    api
      .get(`/accounts/trip/${tripId}`)
      .then((res) => setData(res.data))
      .catch((error) => toast.error(errorMessage(error)))
      .finally(() => setLoading(false));
  }, [open, tripId]);

  const freight = Number(data?.freight_amount || 0);
  const cashExpenses = Number(data?.cash_expenses || 0);
  const expenseTotal = Number(data?.expense_total || 0);
  const advance = Number(data?.advance || 0);
  const received = Number(data?.received_total || 0);
  const pending = Number(data?.pending_amount || 0);
  const profit = Number(data?.profit || 0);
  const margin = freight ? (profit / freight) * 100 : 0;
  const payments = data?.payments || [];
  const expenses = data?.expenses || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t("ledger_title")}
      subtitle={
        data
          ? `${data.party_name} • ${data.from_location} → ${data.to_location} • ${prettyDate(data.date)}`
          : t("common_loading")
      }
    >
      {loading || !data ? (
        <p className="py-8 text-center text-sm text-ink-500">{t("common_loading")}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 text-xs text-ink-600 sm:grid-cols-4">
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-ink-400">{t("f_truck")}</p>
              <p className="font-mono font-bold">{data.truck_no || "-"}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-ink-400">{t("f_driver")}</p>
              <p className="font-bold">{data.driver_name || "-"}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-ink-400">{t("f_status")}</p>
              <p className="font-bold">{data.status}</p>
            </div>
            <div className="rounded-lg bg-ink-50 px-3 py-2">
              <p className="text-ink-400">{t("f_goods")}</p>
              <p className="font-bold">{data.goods || "-"}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-200 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-rose-600">
                <ArrowUp size={14} weight="bold" /> {t("ledger_charges")}
              </p>
              <Line label={t("ledger_freight")} value={rupees(freight)} tone="text-emerald-700" />
              <Line label={t("ledger_cash_expenses")} value={rupees(cashExpenses)} tone="text-amber-700" />
              <Line
                label={t("acc_driver_adv")}
                value={rupees(expenseTotal - cashExpenses)}
                tone="text-amber-700"
              />
              <Total label={t("ledger_expenses")} value={rupees(expenseTotal)} tone="text-rose-700" />
              {expenses.length === 0 ? (
                <p className="mt-2 text-[11px] text-ink-400">{t("ledger_no_expense")}</p>
              ) : (
                <ul className="mt-2 space-y-1 border-t border-dashed border-ink-200 pt-2">
                  {expenses.map((expense) => (
                    <li key={expense._id} className="flex justify-between gap-2 text-[11px] text-ink-500">
                      <span>
                        {expense.category} • {prettyDate(expense.date)}
                      </span>
                      <span className="font-mono">{rupees(expense.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-ink-200 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-600">
                <ArrowDown size={14} weight="bold" /> {t("ledger_receipts")}
              </p>
              <Line label={t("ledger_advance")} value={rupees(advance)} tone="text-emerald-700" />
              <Line label={t("ledger_payments")} value={rupees(received - advance)} tone="text-emerald-700" />
              <Total label={t("payments_total")} value={rupees(received)} tone="text-emerald-700" />
              {payments.length === 0 ? (
                <p className="mt-2 text-[11px] text-ink-400">{t("ledger_no_payment")}</p>
              ) : (
                <ul className="mt-2 space-y-1 border-t border-dashed border-ink-200 pt-2">
                  {payments.map((payment) => (
                    <li key={payment._id} className="flex justify-between gap-2 text-[11px] text-ink-500">
                      <span>
                        {prettyDate(payment.date)} • {payment.mode}
                      </span>
                      <span className="font-mono">{rupees(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-2 rounded-xl bg-ink-900 p-3 text-white sm:grid-cols-4">
            <div>
              <p className="flex items-center gap-1 text-[11px] text-ink-400">
                <Coins size={13} /> {t("ledger_balance")}
              </p>
              <p className="font-mono text-lg font-extrabold text-amber-400">{rupees(Math.max(pending, 0))}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] text-ink-400">
                <Receipt size={13} /> {t("acc_expense_total_of")}
              </p>
              <p className="font-mono text-lg font-extrabold text-rose-400">{rupees(expenseTotal)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[11px] text-ink-400">
                <Wallet size={13} /> {t("ledger_margin")}
              </p>
              <p
                className={`font-mono text-lg font-extrabold ${
                  margin >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {margin.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}