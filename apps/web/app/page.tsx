const metrics = [
  { label: "Open tickets", value: "14", note: "3 unassigned", tone: "blue" },
  { label: "Critical", value: "1", note: "Needs attention", tone: "red" },
  { label: "Waiting customer", value: "4", note: "2 over 48h", tone: "amber" },
  { label: "Clients with alerts", value: "4", note: "7 active alerts", tone: "purple" },
  { label: "Tasks due today", value: "6", note: "2 high priority", tone: "green" },
  { label: "Pipeline", value: "$42.3k", note: "5 active opportunities", tone: "cyan" },
];

const tickets = [
  { id: "TKT-000812", client: "Adams Accounting", subject: "Outlook keeps asking for password", priority: "P2", status: "In Progress", updated: "8m" },
  { id: "TKT-000813", client: "Smith Dental", subject: "Front desk printer offline", priority: "P3", status: "New", updated: "21m" },
  { id: "TKT-000814", client: "Northside Law", subject: "OneDrive sync conflict", priority: "P3", status: "Waiting Customer", updated: "1h" },
  { id: "TKT-000815", client: "Ridgeview Dental", subject: "New employee onboarding", priority: "P4", status: "Assigned", updated: "2h" },
];

const alerts = [
  { severity: "critical", title: "Server disk space below 5%", client: "Adams Accounting", device: "ADAMS-SRV01", age: "12m" },
  { severity: "warning", title: "Backup job failed", client: "Smith Dental", device: "DENTAL-FS01", age: "28m" },
  { severity: "info", title: "Endpoint offline", client: "Northside Law", device: "NLAW-LT07", age: "47m" },
];

export default function DashboardPage() {
  return (
    <div className="pageStack">
      <section className="pageHeading">
        <div>
          <div className="eyebrow">Operations overview</div>
          <h1>Good morning</h1>
          <p>Everything that needs attention across clients, tickets, devices, and follow-ups.</p>
        </div>
        <div className="headingActions">
          <button className="ghost">Today</button>
          <button className="primary">+ New ticket</button>
        </div>
      </section>

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
            <div>
              <strong>Ticket queue</strong>
              <span>Priority work across the help desk</span>
            </div>
            <a href="/tickets">View all →</a>
          </div>
          <div className="tableWrap">
            <table className="dataTable">
              <thead><tr><th>Ticket</th><th>Subject</th><th>Client</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="ticketId">{ticket.id}</td>
                    <td className="tableStrong">{ticket.subject}</td>
                    <td>{ticket.client}</td>
                    <td><span className={`priority priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
                    <td><span className="statusPill">{ticket.status}</span></td>
                    <td className="mutedCell">{ticket.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader">
            <div><strong>Live alerts</strong><span>Datto RMM context</span></div>
            <span className="countBadge">7</span>
          </div>
          <div className="alertList">
            {alerts.map((alert) => (
              <div className="alertRow" key={alert.title}>
                <div className={`alertIcon ${alert.severity}`}>{alert.severity === "critical" ? "!" : alert.severity === "warning" ? "▲" : "i"}</div>
                <div className="alertCopy">
                  <strong>{alert.title}</strong>
                  <span>{alert.client} · {alert.device}</span>
                </div>
                <small>{alert.age}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader"><div><strong>Today</strong><span>Tasks and follow-ups</span></div></div>
          <div className="taskList">
            <div className="taskRow"><span className="taskDot blue"/><div><strong>Call Adams Accounting</strong><span>9:00 AM · Client follow-up</span></div></div>
            <div className="taskRow"><span className="taskDot amber"/><div><strong>Firewall quote follow-up</strong><span>10:30 AM · Opportunity</span></div></div>
            <div className="taskRow"><span className="taskDot green"/><div><strong>Remote session — Smith Dental</strong><span>1:00 PM · Ticket</span></div></div>
          </div>
        </article>

        <article className="dashboardCard">
          <div className="cardHeader"><div><strong>Client health</strong><span>Operational signal</span></div></div>
          <div className="healthScore"><strong>91</strong><span>/ 100</span></div>
          <div className="healthBar"><span style={{ width: "91%" }} /></div>
          <div className="healthLegend"><span><i className="legend good"/>24 healthy</span><span><i className="legend warn"/>3 watch</span><span><i className="legend bad"/>1 at risk</span></div>
        </article>
      </section>
    </div>
  );
}
