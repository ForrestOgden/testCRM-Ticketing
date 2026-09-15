const tickets = [
  { id: "TKT-000812", client: "Adams Accounting", subject: "Outlook keeps asking for password", priority: "P2", status: "In Progress" },
  { id: "TKT-000813", client: "Smith Dental", subject: "Front desk printer offline", priority: "P3", status: "New" },
  { id: "TKT-000814", client: "Northside Law", subject: "OneDrive sync conflict", priority: "P3", status: "Waiting Customer" },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">MSP<span>CRM</span></div>
        <nav>
          {['Dashboard','Clients','Contacts','Tickets','Devices','Pipeline','Tasks','Reports'].map((item) => (
            <button className={item === 'Tickets' ? 'nav active' : 'nav'} key={item}>{item}</button>
          ))}
        </nav>
        <div className="sidebarBottom">Settings</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Help Desk</div>
            <h1>Tickets</h1>
          </div>
          <div className="actions"><button className="ghost">⌘K Search</button><button className="primary">+ New ticket</button></div>
        </header>

        <div className="filters">
          <button className="chip selected">My Open <b>7</b></button>
          <button className="chip">Unassigned <b>3</b></button>
          <button className="chip">Critical <b>1</b></button>
          <button className="chip">Waiting Customer <b>4</b></button>
        </div>

        <div className="ticketGrid">
          <section className="queue panel">
            <div className="panelHeader"><strong>Open queue</strong><span>14 tickets</span></div>
            {tickets.map((ticket, i) => (
              <article className={i === 0 ? 'ticket activeTicket' : 'ticket'} key={ticket.id}>
                <div className="ticketMeta"><span>{ticket.id}</span><span>{ticket.priority}</span></div>
                <strong>{ticket.subject}</strong>
                <small>{ticket.client}</small>
                <div className="ticketFooter"><span>{ticket.status}</span><span>{i === 0 ? '8m' : i === 1 ? '21m' : '1h'}</span></div>
              </article>
            ))}
          </section>

          <section className="conversation panel">
            <div className="panelHeader"><div><strong>TKT-000812</strong><span className="muted"> · In Progress</span></div><button className="ghost small">•••</button></div>
            <div className="ticketTitle"><h2>Outlook keeps asking for my password</h2><p>Adams Accounting · Jane Smith · DESKTOP-JSMITH</p></div>
            <div className="message customer"><div className="avatar">JS</div><div><div className="messageHead"><strong>Jane Smith</strong><span>9:18 AM</span></div><p>Outlook keeps prompting me to sign in. I enter my password and it comes back a few minutes later.</p></div></div>
            <div className="message tech"><div className="avatar">FO</div><div><div className="messageHead"><strong>Technician</strong><span>9:26 AM</span></div><p>I’m checking the device and Microsoft 365 sign-in state now. I’ll update you shortly.</p></div></div>
            <div className="composer"><div className="composerTabs"><button className="tab activeTab">Reply</button><button className="tab">Internal note</button></div><textarea placeholder="Write a reply…"/><div className="composerFooter"><span>Attach · Template</span><button className="primary">Send reply</button></div></div>
          </section>

          <aside className="context panel">
            <div className="panelHeader"><strong>Client context</strong></div>
            <div className="contextSection"><label>CLIENT</label><h3>Adams Accounting</h3><p>Active client · Since 2022</p></div>
            <div className="contextSection"><label>CONTACT</label><strong>Jane Smith</strong><p>Accounting Department<br/>jane@adams.example</p></div>
            <div className="contextSection"><label>DEVICE</label><strong>DESKTOP-JSMITH</strong><div className="deviceStatus"><span className="dot"/>Online</div><dl><div><dt>OS</dt><dd>Windows 11 Pro</dd></div><div><dt>Model</dt><dd>Dell OptiPlex 7090</dd></div><div><dt>Last user</dt><dd>ADAMS\\jsmith</dd></div></dl></div>
            <div className="alert"><strong>⚠ 1 current Datto alert</strong><span>Authentication monitor · 12m ago</span></div>
            <div className="contextSection"><label>RELATED HISTORY</label><div className="history"><strong>TKT-000619</strong><span>Outlook authentication issue</span><small>Resolved 41 days ago</small></div></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
