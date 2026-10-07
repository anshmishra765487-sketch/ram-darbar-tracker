import { useEffect, useMemo, useState } from "react";
import { ChartLineUp, DownloadSimple, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { api, downloadBilty, errorMessage } from "../lib/api";
import { prettyDate, rupees } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Badge, EmptyState, Table, Td, Th } from "../components/ui/table";
import { PageHeader, Spinner, StatCard } from "../components/PageHeader";
import { useI18n } from "../lib/i18n";

export default function Reports() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/reports/trips")
      .then((res) => setData(res.data))
      .catch((error) => toast.error(errorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  const csv = useMemo(() => {
    if (!rows.length) return "";
    const header = ["Date", "Party", "Route", "Truck", "Driver", "Status", "Load (tons)", "Rate/Ton", "Cost/Ton", "Freight", "Expenses", "Received", "Pending", "Profit/Loss"];
    const lines = rows.map((row) =>
      [row.date, row.party_name, row.route, row.truck_no, row.driver_name, row.status, row.load_tons, row.rate_per_ton, row.cost_per_ton, row.freight_amount, row.expense_total, row.received_total, row.pending_amount, row.profit].join(","),
    );
    return [header.join(","), ...lines].join("\n");
  }, [rows]);

  const exportCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ram-darbar-report.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("reports_exported"));
  };

  if (loading) return <Spinner label={t("common_loading")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("reports_title")}
        subtitle={t("reports_sub")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <DownloadSimple size={17} /> {t("reports_export")}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(t("clear_data_hint"))) return;
                try {
                  await api.post("/admin/reset");
                  toast.success(t("clear_data"));
                  window.location.reload();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Trash size={17} /> {t("clear_data")}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total load (tons)" value={`${Number(totals.total_load_tons || 0).toFixed(2)} T`} tone="slate" />
        <StatCard label="Avg rate / ton" value={rupees(totals.avg_rate_per_ton, true)} tone="brand" />
        <StatCard
          label={t("kpi_profit")}
          value={rupees(totals.profit, true)}
          tone={Number(totals.profit) >= 0 ? "sky" : "rose"}
          hint={`${totals.trips || 0} trips`}
        />
        <StatCard
          label="Total loss"
          value={rupees(totals.total_loss, true)}
          tone="rose"
          hint={`${totals.loss_trips || 0} loss trips`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("kpi_trips")} value={totals.trips || 0} tone="slate" hint={`${totals.cancelled || 0} ${t("kpi_cancelled_note").toLowerCase()}`} />
        <StatCard label={t("acc_freight")} value={rupees(totals.freight, true)} tone="brand" />
        <StatCard label={t("kpi_expenses")} value={rupees(totals.expenses, true)} tone="amber" />
        <StatCard label={t("kpi_received")} value={rupees(totals.received, true)} tone="emerald" />
        <StatCard label={t("kpi_pending")} value={rupees(totals.pending, true)} tone="amber" />
      </div>

      <Card>
        <CardHeader
          title={t("reports_table")}
          subtitle={t("reports_table_sub")}
          icon={ChartLineUp}
        />
        {rows.length === 0 ? (
          <EmptyState title={t("reports_empty")} hint={t("reports_empty_hint")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("f_date")}</Th>
                <Th>{t("f_party")}</Th>
                <Th>{t("f_to")}</Th>
                <Th>{t("f_truck")} / {t("f_driver")}</Th>
                <Th align="right">Load</Th>
                <Th align="right">{t("acc_freight")}</Th>
                <Th align="right">{t("kpi_expenses")}</Th>
                <Th align="right">{t("kpi_received")}</Th>
                <Th align="right">{t("kpi_pending")}</Th>
                <Th align="right">{t("ledger_profit")}</Th>
                <Th align="right">{t("trips_bilty")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="hover:bg-ink-50">
                  <Td className="whitespace-nowrap text-xs text-ink-500">{prettyDate(row.date)}</Td>
                  <Td>
                    <p className="font-semibold text-ink-800">{row.party_name}</p>
                    <Badge status={row.status} className="mt-0.5" />
                  </Td>
                  <Td className="text-xs text-ink-600">{row.route}</Td>
                  <Td className="text-xs">
                    <p className="font-mono text-ink-700">{row.truck_no}</p>
                    <p className="text-ink-500">{row.driver_name}</p>
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono">
                    {row.load_tons > 0 ? (
                      <>
                        <span className="font-semibold text-ink-800">{Number(row.load_tons).toFixed(2)}T</span>
                        {row.rate_per_ton > 0 ? (
                          <p className="text-[10px] text-ink-400">{rupees(row.rate_per_ton)}/T</p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono">
                    {rupees(row.freight_amount)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-amber-600">
                    {rupees(row.expense_total)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-emerald-600">
                    {rupees(row.received_total)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono text-rose-600">
                    {rupees(Math.max(row.pending_amount, 0))}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-mono font-semibold">
                    {row.is_loss ? (
                      <>
                        <span className="text-rose-700">-{rupees(Math.abs(row.profit))}</span>
                        <p className="text-[10px] font-bold uppercase text-rose-500">Loss</p>
                      </>
                    ) : (
                      <span className="text-emerald-700">{rupees(row.profit)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={async () => {
                        try {
                          await downloadBilty(row._id, row.party_name);
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      PDF
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink-900 text-white">
                <Th className="bg-ink-900 text-white" colSpan={4}>
                  {t("common_total")}
                </Th>
                <Td align="right" className="whitespace-nowrap bg-ink-900 font-mono font-bold text-white">
                  {rupees(totals.freight)}
                </Td>
                <Td align="right" className="whitespace-nowrap bg-ink-900 font-mono font-bold text-white">
                  {rupees(totals.expenses)}
                </Td>
                <Td align="right" className="whitespace-nowrap bg-ink-900 font-mono font-bold text-white">
                  {rupees(totals.received)}
                </Td>
                <Td align="right" className="whitespace-nowrap bg-ink-900 font-mono font-bold text-white">
                  {rupees(Math.max(totals.pending || 0, 0))}
                </Td>
                <Td align="right" className="whitespace-nowrap bg-ink-900 font-mono font-bold text-white">
                  {rupees(totals.profit)}
                </Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>

      <Card>
        <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("acc_freight")}</p>
            <p className="font-mono text-xl font-bold text-ink-800">{rupees(totals.freight || 0)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("kpi_pending")}</p>
            <p className="font-mono text-xl font-bold text-rose-600">{rupees(Math.max(totals.pending || 0, 0))}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("kpi_profit")}</p>
            <p className="font-mono text-xl font-bold text-emerald-600">{rupees(totals.profit || 0)}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}