const clients = [
  { name: "Adams Accounting", status: "Active", owner: "Forrest", contacts: 18, devices: 27, open: 3, alerts: 1, health: "Watch" },
  { name: "Smith Dental", status: "Active", owner: "Forrest", contacts: 9, devices: 14, open: 2, alerts: 1, health: "Healthy" },
  { name: "Northside Law", status: "Active", owner: "Forrest", contacts: 22, devices: 31, open: 4, alerts: 2, health: "Watch" },
  { name: "Ridgeview Dental", status: "Onboarding", owner: "Forrest", contacts: 7, devices: 12, open: 1, alerts: 0, health: "Healthy" },
  { name: "Maple Grove Schools", status: "Active", owner: "Forrest", contacts: 35, devices: 84, open: 4, alerts: 3, health: "At Risk" },
];

export default function ClientsPage() {
  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div>
          <div className="eyebrow">CRM</div>
          <h1>Clients</h1>
          <p>The relationship, technical environment, support history, and opportunities for every managed customer.</p>
        </div>
        <div className="headingActions"><button className="ghost">Import</button><button className="primary">+ New client</button></div>
      </section>

      <section className="summaryStrip">
        <div><span>Active clients</span><strong>32</strong></div>
        <div><span>Open tickets</span><strong>14</strong></div>
        <div><span>Devices</span><strong>428</strong></div>
        <div><span>Clients with alerts</span><strong>4</strong></div>
      </section>

      <section className="dashboardCard clientTableCard">
        <div className="tableToolbar">
          <div className="inlineSearch">⌕ <span>Search clients...</span></div>
          <div className="tableActions"><button className="chip selected">All clients</button><button className="chip">Active</button><button className="chip">At risk</button></div>
        </div>
        <div className="tableWrap">
          <table className="dataTable clientTable">
            <thead><tr><th>Client</th><th>Status</th><th>Owner</th><th>Contacts</th><th>Devices</th><th>Open tickets</th><th>Alerts</th><th>Health</th></tr></thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.name}>
                  <td><a className="clientLink" href={client.name === "Adams Accounting" ? "/clients/adams-accounting" : "#"}><span className="clientMonogram">{client.name.slice(0,2).toUpperCase()}</span><span><strong>{client.name}</strong><small>Managed client</small></span></a></td>
                  <td><span className={`statusPill ${client.status === "Onboarding" ? "onboarding" : "activeStatus"}`}>{client.status}</span></td>
                  <td>{client.owner}</td><td>{client.contacts}</td><td>{client.devices}</td><td>{client.open}</td><td>{client.alerts || "—"}</td>
                  <td><span className={`healthPill ${client.health.toLowerCase().replace(" ", "-")}`}>{client.health}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
