import { useCallback, useEffect, useState } from "react";
import {
  Buildings,
  ClockCountdown,
  Coins,
  PiggyBank,
  Truck,
  UserFocus,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";
import { prettyDate, rupees } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Badge, EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

const TABS = [
  { key: "parties", path: "parties", label: "tab_parties", icon: Buildings },
  { key: "aging", path: "outstanding-aging", label: "tab_aging", icon: ClockCountdown },
  { key: "truck", path: "truck-wise", label: "tab_truck", icon: Truck },
  { key: "drivers", path: "driver-payouts", label: "tab_drivers", icon: UserFocus },
  { key: "pnl", path: "profit-loss", label: "tab_pnl", icon: PiggyBank },
];

export default function Accounts() {
  const { t } = useI18n();
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/accounts/${tab.path}`);
      setData(res.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("acc_title")} subtitle={t("acc_sub")} />

      <Card className="flex gap-1 overflow-x-auto p-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === item.key ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            <item.icon size={16} weight="duotone" />
            {t(item.label)}
          </button>
        ))}
      </Card>

      {loading ? <Spinner label={t("common_loading")} /> : <div className="space-y-4">{renderTab(tab.key, data)}</div>}
    </div>
  );
}

function renderTab(tab, data) {
  if (!data) return null;
  if (tab === "parties") return <PartyLedger data={data} />;
  if (tab === "aging") return <Aging data={data} />;
  if (tab === "truck") return <TruckPL data={data} />;
  if (tab === "drivers") return <DriverPayouts data={data} />;
  return <ProfitLoss data={data} />;
}

function PartyLedger({ data }) {
  const { t } = useI18n();
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("acc_parties")} value={totals.parties} icon={Buildings} tone="slate" />
        <StatCard label={t("acc_freight")} value={rupees(totals.freight, true)} tone="brand" />
        <StatCard label={t("kpi_received")} value={rupees(totals.received, true)} tone="emerald" />
        <StatCard label={t("kpi_pending")} value={rupees(totals.pending, true)} tone="rose" />
        <StatCard label={t("acc_profit")} value={rupees(totals.profit, true)} icon={Coins} tone="sky" />
      </div>

      <Card>
        <CardHeader title={t("acc_who_owes")} subtitle={t("acc_sub")} />
        {rows.length === 0 ? (
          <EmptyState title={t("trips_empty")} hint={t("acc_empty")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_party")}</Th>
                <Th align="right">{t("kpi_trips")}</Th>
                <Th align="right">{t("acc_freight")}</Th>
                <Th align="right">{t("kpi_received")}</Th>
                <Th align="right">{t("kpi_pending")}</Th>
                <Th align="right">{t("ledger_profit")}</Th>
                <Th>{t("acc_last_trip")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.party_name} className="hover:bg-ink-50">
                  <Td className="font-semibold text-ink-800">{row.party_name}</Td>
                  <Td align="right" className="font-mono">{row.trips}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.freight)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-emerald-600">{rupees(row.received)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold text-rose-600">{rupees(row.pending)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.profit)}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(row.last_trip_date)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function Aging({ data }) {
  const { t } = useI18n();
  const { buckets, rows, total_pending: totalPending } = data;
  const colors = ["bg-emerald-500", "bg-amber-500", "bg-orange-500", "bg-rose-600"];
  const max = Math.max(...buckets.map((b) => b.amount), 1);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("acc_total_outstanding")} value={rupees(totalPending)} icon={ClockCountdown} tone="rose" />
        {buckets.map((bucket, index) => (
          <StatCard key={bucket.bucket} label={bucket.bucket} value={rupees(bucket.amount, true)} tone={["emerald", "amber", "brand", "rose"][index]} hint={`${bucket.trips} ${t("kpi_trips").toLowerCase()}`} />
        ))}
      </div>

      <Card>
        <CardHeader title={t("tab_aging")} subtitle={t("insight_outstanding_sub")} />
        <CardBody className="space-y-3">
          {buckets.map((bucket, index) => (
            <div key={bucket.bucket} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-bold text-ink-600">{bucket.bucket}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full rounded-full ${colors[index]}`} style={{ width: `${(bucket.amount / max) * 100}%` }} />
              </div>
              <span className="w-24 text-right font-mono text-xs font-bold text-ink-700">{rupees(bucket.amount)}</span>
            </div>
          ))}
          {buckets.every((bucket) => bucket.trips === 0) ? (
            <p className="text-sm text-ink-500">{t("acc_empty")}</p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("kpi_pending")} subtitle={t("acc_age")} />
        {rows.length === 0 ? (
          <EmptyState title={t("common_no_data")} hint={t("acc_empty")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_party")}</Th>
                <Th>{t("f_to")}</Th>
                <Th>{t("f_date")}</Th>
                <Th align="right">{t("acc_age")}</Th>
                <Th align="right">{t("acc_freight")}</Th>
                <Th align="right">{t("kpi_received")}</Th>
                <Th align="right">{t("kpi_pending")}</Th>
                <Th>{t("f_status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-ink-50">
                  <Td className="font-semibold text-ink-800">{row.party_name}</Td>
                  <Td className="text-xs text-ink-600">{row.route}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(row.date)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">
                    <span className={row.age_days > 60 ? "font-bold text-rose-600" : "text-ink-600"}>{row.age_days}d</span>
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.freight_amount)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-emerald-600">{rupees(row.received_total)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold text-rose-600">{rupees(row.pending)}</Td>
                  <Td>
                    <Badge status={row.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function TruckPL({ data }) {
  const { t } = useI18n();
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t("acc_freight")} value={rupees(totals.freight, true)} tone="brand" />
        <StatCard label={t("kpi_expenses")} value={rupees(totals.expenses, true)} tone="amber" />
        <StatCard label={t("kpi_profit")} value={rupees(totals.profit, true)} tone="emerald" />
      </div>

      <Card>
        <CardHeader title={t("tab_truck")} subtitle={t("acc_sub")} />
        {rows.length === 0 ? (
          <EmptyState title={t("trucks_empty")} hint={t("trucks_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_truck")}</Th>
                <Th>{t("f_model")}</Th>
                <Th align="right">{t("f_capacity")}</Th>
                <Th align="right">{t("kpi_trips")}</Th>
                <Th align="right">{t("acc_freight")}</Th>
                <Th align="right">Expenses</Th>
                <Th align="right">{t("ledger_profit")}</Th>
                <Th align="right">{t("acc_profit_per_trip")}</Th>
                <Th>{t("f_status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-ink-50">
                  <Td className="font-mono font-semibold text-ink-800">{row.registration_no}</Td>
                  <Td className="text-xs text-ink-600">{row.model}</Td>
                  <Td align="right" className="font-mono">{row.capacity_tons}T</Td>
                  <Td align="right" className="font-mono">{row.trips}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.freight)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-amber-600">{rupees(row.expenses)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold text-emerald-700">{rupees(row.profit)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.profit_per_trip)}</Td>
                  <Td>
                    <Badge status={row.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function DriverPayouts({ data }) {
  const { t } = useI18n();
  const { rows, totals } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("nav_drivers")} value={totals.drivers} icon={UserFocus} tone="slate" />
        <StatCard label={t("acc_salary")} value={rupees(totals.salary, true)} tone="brand" />
        <StatCard label={t("acc_advance")} value={rupees(totals.advance, true)} tone="amber" />
        <StatCard label={t("acc_balance_payable")} value={rupees(totals.balance, true)} tone="rose" />
      </div>

      <Card>
        <CardHeader title={t("tab_drivers")} subtitle={t("acc_sub")} />
        {rows.length === 0 ? (
          <EmptyState title={t("drivers_empty")} hint={t("drivers_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_driver")}</Th>
                <Th>{t("f_phone")}</Th>
                <Th>{t("f_license")}</Th>
                <Th align="right">{t("kpi_trips")}</Th>
                <Th align="right">{t("acc_freight")}</Th>
                <Th align="right">{t("f_salary")}</Th>
                <Th align="right">{t("f_advance")}</Th>
                <Th align="right">{t("acc_balance_payable")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-ink-50">
                  <Td className="font-semibold text-ink-800">{row.name}</Td>
                  <Td>
                    <a href={`tel:${row.phone}`} className="font-mono text-xs text-brand-600 hover:underline">
                      {row.phone}
                    </a>
                  </Td>
                  <Td className="font-mono text-xs">{row.license_no}</Td>
                  <Td align="right" className="font-mono">{row.trips}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.freight)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">{rupees(row.salary)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-amber-600">{rupees(row.advance)}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold">{rupees(row.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

function ProfitLoss({ data }) {
  const { t } = useI18n();
  const { income, expenses, summary } = data;
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  const maxExpense = Math.max(...expenses.map((row) => row.amount), 1);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("acc_freight")} value={rupees(summary.freight_billed, true)} tone="brand" hint={`${summary.trips} ${t("kpi_trips").toLowerCase()}`} />
        <StatCard label={t("expenses_total")} value={rupees(summary.total_expenses, true)} tone="amber" hint={`${t("acc_cash_exp")} ${rupees(summary.cash_expenses, true)}`} />
        <StatCard
          label={t("acc_net")}
          value={rupees(summary.net_profit, true)}
          icon={PiggyBank}
          tone={summary.net_profit >= 0 ? "emerald" : "rose"}
          hint={`${summary.margin_percent}% margin`}
        />
        <StatCard label={t("kpi_pending")} value={rupees(summary.pending, true)} tone="rose" hint={`${t("kpi_received")} ${rupees(summary.received, true)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("acc_income_status")} subtitle={t("acc_sub")} />
          <CardBody className="space-y-2">
            {income.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2">
                <Badge status={row.label} />
                <span className="font-mono text-sm font-bold text-ink-800">{rupees(row.amount)}</span>
              </div>
            ))}
            {income.length === 0 ? <p className="text-sm text-ink-500">{t("common_no_data")}</p> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("acc_expense_head")}
            subtitle={`${t("common_total")} ${rupees(expenseTotal)} (${t("acc_driver_adv")} ${rupees(summary.driver_advance)})`}
            action={<ArrowSquareOut size={16} className="text-ink-400" />}
          />
          <CardBody className="space-y-2">
            {expenses.map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs font-semibold text-ink-600">
                  <span>{row.label}</span>
                  <span className="font-mono">{rupees(row.amount)}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(row.amount / maxExpense) * 100}%` }} />
                </div>
              </div>
            ))}
            {expenses.length === 0 ? <p className="text-sm text-ink-500">{t("common_no_data")}</p> : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            [t("acc_freight"), summary.freight_billed, "text-ink-800"],
            [t("kpi_received"), summary.received, "text-emerald-600"],
            [t("kpi_pending"), summary.pending, "text-rose-600"],
            [t("acc_cash_exp"), summary.cash_expenses, "text-amber-600"],
            [t("acc_driver_adv"), summary.driver_advance, "text-amber-600"],
            [t("acc_net"), summary.net_profit, summary.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</p>
              <p className={`font-mono text-lg font-bold ${tone}`}>{rupees(value)}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}