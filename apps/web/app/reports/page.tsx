"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApiResource } from "../../hooks/useApiResource";

type Group = { status?: string; priority?: string; _count: { _all: number } };
type Report = {
  days: number;
  since: string;
  created: number;
  resolved: number;
  averageFirstResponseMinutes?: number | null;
  byStatus: Group[];
  byPriority: Group[];
  topClients: Array<{ id: string; name: string; slug: string; _count: { tickets: number; devices: number } }>;
};

function human(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const report = useApiResource<Report>(`/reports/support?days=${days}`);
  const resolutionRate = report.data?.created ? Math.round((report.data.resolved / report.data.created) * 1000) / 10 : 0;
  const maxStatus = useMemo(() => Math.max(1, ...(report.data?.byStatus.map((item) => item._count._all) ?? [1])), [report.data]);

  function exportCsv() {
    if (!report.data) return;
    const rows = [
      ["Metric", "Value"],
      ["Window (days)", report.data.days],
      ["Tickets created", report.data.created],
      ["Tickets resolved", report.data.resolved],
      ["Average first response (minutes)", report.data.averageFirstResponseMinutes ?? ""],
      [],
      ["Status", "Count"],
      ...report.data.byStatus.map((item) => [item.status ?? "", item._count._all]),
      [],
      ["Priority", "Count"],
      ...report.data.byPriority.map((item) => [item.priority ?? "", item._count._all]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `support-report-${days}-days.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading"><div><div className="eyebrow">Analytics</div><h1>Reports</h1><p>Operational support volume, response performance, workload mix, and client support load.</p></div><div className="toolbar"><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select><button className="ghost" onClick={exportCsv} disabled={!report.data}>Export CSV</button></div></section>
      {report.error ? <div className="inlineError">{report.error}</div> : null}
      {report.loading && !report.data ? <div className="loadingPanel">Calculating report…</div> : report.data ? <>
        <section className="metricGrid"><article className="metricCard tone-blue"><div className="metricAccent"/><span>Tickets created</span><strong>{report.data.created}</strong><small>{days}-day volume</small></article><article className="metricCard tone-green"><div className="metricAccent"/><span>Resolved</span><strong>{report.data.resolved}</strong><small>{resolutionRate}% of created volume</small></article><article className="metricCard tone-cyan"><div className="metricAccent"/><span>First response</span><strong>{report.data.averageFirstResponseMinutes === null || report.data.averageFirstResponseMinutes === undefined ? "—" : `${report.data.averageFirstResponseMinutes}m`}</strong><small>Average measured response</small></article><article className="metricCard tone-purple"><div className="metricAccent"/><span>Clients tracked</span><strong>{report.data.topClients.length}</strong><small>Highest support volume shown</small></article></section>
        <section className="reportGrid">
          <article className="dashboardCard"><div className="cardHeader"><div><strong>Ticket status mix</strong><span>Created during the selected period</span></div></div><div className="barReport">{report.data.byStatus.map((item) => <div className="barRow" key={item.status}><div className="barLabel"><span>{human(item.status ?? "unknown")}</span><strong>{item._count._all}</strong></div><div className="barTrack"><span style={{ width: `${Math.max(3, (item._count._all / maxStatus) * 100)}%` }}/></div></div>)}</div></article>
          <article className="dashboardCard"><div className="cardHeader"><div><strong>Priority distribution</strong><span>Support severity mix</span></div></div><div className="priorityReport">{report.data.byPriority.map((item) => <div className="priorityReportRow" key={item.priority}><span className={`priority priority-${(item.priority?.slice(0,2) ?? "p3").toLowerCase()}`}>{item.priority?.slice(0,2) ?? "P3"}</span><strong>{item._count._all}</strong><span>{human(item.priority ?? "normal")}</span></div>)}</div></article>
          <article className="dashboardCard reportWide"><div className="cardHeader"><div><strong>Top client support load</strong><span>All-time records used for client concentration context</span></div></div><div className="tableWrap"><table className="dataTable"><thead><tr><th>Client</th><th>Ticket records</th><th>Managed devices</th><th>Tickets per device</th></tr></thead><tbody>{report.data.topClients.map((client) => <tr key={client.id}><td><Link href={`/clients/${client.slug}`}>{client.name}</Link></td><td>{client._count.tickets}</td><td>{client._count.devices}</td><td>{client._count.devices ? (client._count.tickets / client._count.devices).toFixed(1) : "—"}</td></tr>)}</tbody></table></div></article>
        </section>
      </> : null}
    </div>
  );
}
