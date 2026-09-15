"use client";

import Link from "next/link";
import { useApiResource } from "../hooks/useApiResource";

type DashboardTicket = {
  id: string;
  displayNumber: string;
  subject: string;
  priority: string;
  status: string;
  updatedAt: string;
  client: { name: string; slug: string };
};

type DashboardAlert = {
  id: string;
  message?: string | null;
  alertType?: string | null;
  priority?: string | null;
  raisedAt?: string | null;
  device: { id: string; hostname: string; client: { id: string; name: string; slug: string } };
};

type DashboardTask = {
  id: string;
  title: string;
  kind: string;
  dueAt?: string | null;
  client?: { name: string; slug: string } | null;
  ticket?: { subject: string; displayNumber: string } | null;
};

type DashboardData = {
  metrics: {
    openTickets: number;
    unassigned: number;
    critical: number;
    waitingCustomer: number;
    resolvedToday: number;
    activeClients: number;
    totalDevices: number;
    onlineDevices: number;
    endpointHealthPercent: number;
    clientsWithAlerts: number;
    tasksDueToday: number;
    pipelineValueCents: string;
    openOpportunities: number;
    averageClientHealth: number;
  };
  clientHealth: { healthy: number; watch: number; atRisk: number };
  recentTickets: DashboardTicket[];
  liveAlerts: DashboardAlert[];
  todayTasks: DashboardTask[];
};

function money(cents: string) {
  const amount = Number(cents || 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function age(date?: string | null) {
  if (!date) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function status(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priority(value: string) {
  return value.startsWith("P1") ? "P1" : value.startsWith("P2") ? "P2" : value.startsWith("P3") ? "P3" : "P4";
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = useApiResource<DashboardData>("/dashboard");

  if (loading && !data) return <div className="loadingPanel">Loading live operations…</div>;
  if (error && !data) return <div className="errorPanel">Unable to load dashboard. {error}<br/><button className="ghost" onClick={() => void refresh()}>Retry</button></div>;
  if (!data) return null;

  const metrics = [
    { label: "Open tickets", value: String(data.metrics.openTickets), note: `${data.metrics.unassigned} unassigned`, tone: "blue" },
    { label: "Critical", value: String(data.metrics.critical), note: "Needs attention", tone: "red" },
    { label: "Waiting customer", value: String(data.metrics.waitingCustomer), note: "Awaiting response", tone: "amber" },
    { label: "Clients with alerts", value: String(data.metrics.clientsWithAlerts), note: `${data.liveAlerts.length} recent alerts`, tone: "purple" },
    { label: "Tasks due today", value: String(data.metrics.tasksDueToday), note: `${data.metrics.resolvedToday} tickets resolved`, tone: "green" },
    { label: "Pipeline", value: money(data.metrics.pipelineValueCents), note: `${data.metrics.openOpportunities} active opportunities`, tone: "cyan" },
  ];

  return (
    <div className="pageStack">
      <section className="pageHeading">
        <div>
          <div className="eyebrow">Operations overview</div>
          <h1>Dashboard</h1>
          <p>Live operational context across clients, tickets, endpoints, alerts, and follow-ups.</p>
        </div>
        <div className="headingActions">
          <button className="ghost" onClick={() => void refresh()}>Refresh</button>
          <Link className="primary" href="/tickets?new=1">+ New ticket</Link>
        </div>
      </section>

      {error ? <div className="inlineError">Showing the last loaded data. Refresh failed: {error}</div> : null}

      <section className="metricGrid">
        {metrics.map((metric) => (
          <article className={`metricCard tone-${metric.tone}`} key={metric.label}>
            <div className="metricAccent" />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="dashboardGrid">
        <article className="dashboardCard dashboardWide">
          <div className="cardHeader">
            <div><strong>Ticket queue</strong><span>Current priority work across the help desk</span></div>
            <Link href="/tickets">View all →</Link>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead><tr><th>Ticket</th><th>Subject</th><th>Client</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {data.recentTickets.map((ticket) => {
                  const shortPriority = priority(ticket.priority);
                  return (
                    <tr key={ticket.id}>
                      <td className="ticketId"><Link href={`/tickets?id=${ticket.id}`}>{ticket.displayNumber}</Link></td>
                      <td className="tableStrong">{ticket.subject}</td>
                      <td><Link href={`/clients/${ticket.client.slug}`}>{ticket.client.name}</Link></td>
                      <td><span className={`priority priority-${shortPriority.toLowerCase()}`}>{shortPriority}</span></td>
                      <td><span className="statusPill">{status(ticket.status)}</span></td>
                      <td className="mutedCell">{age(ticket.updatedAt)}</td>
                    </tr>
                  );
                })}
                {!data.recentTickets.length ? <tr><td colSpan={6}>No open tickets.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader">
            <div><strong>Live alerts</strong><span>Datto RMM context</span></div>
            <span className="countBadge">{data.liveAlerts.length}</span>
          </div>
          <div className="alertList">
            {data.liveAlerts.map((alert) => {
              const severe = /critical|high/i.test(alert.priority ?? "") ? "critical" : /warning|medium/i.test(alert.priority ?? "") ? "warning" : "info";
              return (
                <Link className="alertRow" href={`/devices?id=${alert.device.id}`} key={alert.id}>
                  <div className={`alertIcon ${severe}`}>{severe === "critical" ? "!" : severe === "warning" ? "▲" : "i"}</div>
                  <div className="alertCopy">
                    <strong>{alert.message || alert.alertType || "RMM alert"}</strong>
                    <span>{alert.device.client.name} · {alert.device.hostname}</span>
                  </div>
                  <small>{age(alert.raisedAt)}</small>
                </Link>
              );
            })}
            {!data.liveAlerts.length ? <div className="emptyPanel">No active RMM alerts.</div> : null}
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader"><div><strong>Today</strong><span>Tasks and follow-ups</span></div><Link href="/tasks">View all →</Link></div>
          <div className="taskList">
            {data.todayTasks.map((task, index) => (
              <div className="taskRow" key={task.id}>
                <span className={`taskDot ${index % 3 === 0 ? "blue" : index % 3 === 1 ? "amber" : "green"}`}/>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.dueAt ? new Date(task.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Today"}{task.client ? ` · ${task.client.name}` : task.ticket ? ` · ${task.ticket.displayNumber}` : ""}</span>
                </div>
              </div>
            ))}
            {!data.todayTasks.length ? <div className="emptyPanel">No tasks due today.</div> : null}
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader"><div><strong>Client health</strong><span>Relationship and operational signal</span></div></div>
          <div className="healthScore"><strong>{data.metrics.averageClientHealth}</strong><span>/ 100</span></div>
          <div className="healthBar"><span style={{ width: `${Math.max(0, Math.min(100, data.metrics.averageClientHealth))}%` }} /></div>
          <div className="healthLegend">
            <span><i className="legend good"/>{data.clientHealth.healthy} healthy</span>
            <span><i className="legend warn"/>{data.clientHealth.watch} watch</span>
            <span><i className="legend bad"/>{data.clientHealth.atRisk} at risk</span>
          </div>
          <div className="detailMeta" style={{ padding: "0 16px 16px" }}>
            <span>{data.metrics.onlineDevices}/{data.metrics.totalDevices} endpoints online</span>
            <span>{data.metrics.endpointHealthPercent}% endpoint health</span>
          </div>
        </article>
      </section>
    </div>
  );
}
