import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendUp,
  CurrencyInr,
  Coins,
  Wallet,
  HourglassMedium,
  FileText,
  PiggyBank,
  Scales,
  Warning,
  ArrowRight,
} from "@phosphor-icons/react";
import { api, errorMessage } from "../lib/api";
import { rupees, prettyDate, statusClass } from "../lib/utils";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/table";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";
import { toast } from "sonner";

export default function Dashboard() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState({ parties: [], trucks: [] });

  useEffect(() => {
    Promise.all([api.get("/accounts/parties"), api.get("/accounts/truck-wise")])
      .then(([partyRes, truckRes]) =>
        setInsights({ parties: partyRes.data.rows || [], trucks: truckRes.data.rows || [] }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => {
        setError(errorMessage(err));
        toast.error(errorMessage(err));
      });
  }, []);

  if (!data && !error) return <Spinner label={t("common_loading")} />;

  if (error && !data) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm font-semibold text-rose-600">{error}</p>
          <p className="mt-1 text-xs text-ink-500">
            <code className="font-mono">uvicorn main:app --reload</code>
          </p>
        </CardBody>
      </Card>
    );
  }

  const { kpi, monthly, expense_by_category: breakdown, trips_by_status: byStatus, recent_trips: recent, loss_trips: lossTrips } = data;
  const maxStatus = Math.max(...byStatus.map((item) => item.count), 1);

  return (
    <div className="space-y-5">
      <PageHeader title={t("dash_title")} subtitle={t("dash_subtitle")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("kpi_trips")} value={kpi.total_trips} icon={FileText} tone="slate" hint={t("kpi_cancelled_note")} />
        <StatCard label={t("kpi_revenue")} value={rupees(kpi.total_revenue, true)} icon={CurrencyInr} tone="brand" hint={t("kpi_freight_note")} />
        <StatCard label={t("kpi_expenses")} value={rupees(kpi.total_expenses, true)} icon={Coins} tone="amber" hint={t("kpi_expense_note")} />
        <StatCard label={t("kpi_received")} value={rupees(kpi.total_received, true)} icon={Wallet} tone="emerald" hint={t("kpi_received_note")} />
        <StatCard label={t("kpi_pending")} value={rupees(kpi.total_pending, true)} icon={HourglassMedium} tone="rose" hint={t("kpi_pending_note")} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total load (tons)"
          value={`${Number(kpi.total_load_tons || 0).toFixed(2)} T`}
          icon={Scales}
          tone="slate"
          hint="All active trips"
        />
        <StatCard
          label="Avg rate / ton"
          value={rupees(kpi.avg_rate_per_ton, true)}
          icon={CurrencyInr}
          tone="brand"
          hint="Freight ÷ total tons"
        />
        <StatCard
          label="Net profit"
          value={rupees(kpi.net_profit, true)}
          icon={TrendUp}
          tone={kpi.net_profit < 0 ? "rose" : "emerald"}
          hint={`${kpi.profit_trip_count || 0} trips in profit`}
        />
        <StatCard
          label="Total loss"
          value={rupees(kpi.total_loss, true)}
          icon={Warning}
          tone="rose"
          hint={`${kpi.loss_trip_count || 0} trips in loss`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-brand-500">
          <CardBody>
            <p className="text-xs font-bold text-ink-400">{t("insight_top_party")}</p>
            <p className="truncate text-sm font-extrabold text-ink-800">
              {insights.parties[0]?.party_name || t("common_no_data")}
            </p>
            <p className="font-mono text-xs text-ink-500">
              {rupees(insights.parties[0]?.freight || 0, true)} • {insights.parties[0]?.trips || 0}{" "}
              {t("kpi_trips").toLowerCase()}
            </p>
          </CardBody>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardBody>
            <p className="text-xs font-bold text-ink-400">{t("insight_best_truck")}</p>
            <p className="truncate font-mono text-sm font-extrabold text-ink-800">
              {insights.trucks[0]?.registration_no || t("common_no_data")}
            </p>
            <p className="font-mono text-xs text-ink-500">
              {t("kpi_profit")} {rupees(insights.trucks[0]?.profit || 0, true)}
            </p>
          </CardBody>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardBody>
            <p className="text-xs font-bold text-ink-400">{t("insight_outstanding")}</p>
            <p className="font-mono text-lg font-extrabold text-rose-600">
              {rupees(kpi.total_pending)}
            </p>
            <p className="text-xs text-ink-500">{t("insight_outstanding_sub")}</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("chart_monthly")}
            subtitle={t("chart_monthly_sub")}
            icon={TrendUp}
          />
          <CardBody className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} stroke="#cbd5e1" tickFormatter={(v) => rupees(v, true)} />
                <Tooltip
                  formatter={(value, name) => [rupees(value), name === "revenue" ? t("kpi_revenue") : t("kpi_expenses")]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenses" stroke="#0f172a" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("kpi_profit")} subtitle={t("chart_monthly")} icon={PiggyBank} />
          <CardBody>
            <p
              className={`font-mono text-3xl font-extrabold tracking-tight ${
                kpi.net_profit >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {rupees(kpi.net_profit)}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {t("ledger_margin")} {kpi.total_revenue ? Math.round((kpi.net_profit / kpi.total_revenue) * 100) : 0}%
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("chart_expense")} subtitle={t("chart_expense_sub")} />
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => rupees(v, true)} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: "#334155" }} width={92} />
                <Tooltip formatter={(value) => [rupees(value), t("kpi_expenses")]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="amount" fill="#f97316" radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("card_status")} subtitle={t("card_status_sub")} />
          <CardBody className="space-y-3">
            {byStatus.length === 0 ? (
              <p className="text-sm text-ink-500">{t("trips_empty")}</p>
            ) : (
              byStatus.map((item) => (
                <div key={item.status} className="flex items-center gap-3">
                  <span
                    className={`w-24 shrink-0 rounded-full px-2 py-1 text-center text-[11px] font-bold ring-1 ring-inset ${statusClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(item.count / maxStatus) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-xs font-bold text-ink-600">{item.count}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {lossTrips.length > 0 ? (
        <Card className="border-rose-200">
          <CardHeader
            icon={Warning}
            title="Loss-making trips"
            subtitle={`${lossTrips.length} trips me kharcha freight se zyada hai`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr>
                  {["Date", "Party", "Route", "Load", "Freight", "Cost", "Loss"].map((head) => (
                    <th
                      key={head}
                      className="border-b border-ink-200 bg-rose-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-500"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lossTrips.map((trip) => (
                  <tr key={trip._id} className="hover:bg-rose-50/40">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">{prettyDate(trip.date)}</td>
                    <td className="px-4 py-3 font-semibold text-ink-800">{trip.party_name}</td>
                    <td className="px-4 py-3 text-ink-600">
                      {trip.from_location} → {trip.to_location}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-700">
                      {Number(trip.load_tons || 0).toFixed(2)} T
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-700">
                      {rupees(trip.freight_amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-amber-600">
                      {rupees(trip.expense_total)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-rose-700">
                      -{rupees(trip.loss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t("card_recent")}
          subtitle={t("card_recent_sub")}
          action={
            <Link
              to="/trips"
              className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
            >
              {t("view_all")} <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                {[t("f_date"), t("f_party"), t("f_to"), t("acc_freight"), t("kpi_pending"), t("f_status")].map((head) => (
                  <th key={head} className="border-b border-ink-200 bg-ink-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((trip) => (
                <tr key={trip._id} className="hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">{prettyDate(trip.date)}</td>
                  <td className="px-4 py-3 font-semibold text-ink-800">{trip.party_name}</td>
                  <td className="px-4 py-3 text-ink-600">
                    {trip.from_location} → {trip.to_location}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-700">{rupees(trip.freight_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-rose-600">{rupees(trip.pending_amount)}</td>
                  <td className="px-4 py-3">
                    <Badge status={trip.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}