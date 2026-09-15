const tickets = [
  { id: "TKT-000812", client: "Adams Accounting", subject: "Outlook keeps asking for password", priority: "P2", status: "In Progress" },
  { id: "TKT-000813", client: "Smith Dental", subject: "Front desk printer offline", priority: "P3", status: "New" },
  { id: "TKT-000814", client: "Northside Law", subject: "OneDrive sync conflict", priority: "P3", status: "Waiting Customer" },
];

export default function TicketsPage() {
  return (
    <div className="pageStack ticketPage">
      <section className="pageHeading compactHeading">
        <div>
          <div className="eyebrow">Help desk</div>
          <h1>Tickets</h1>
          <p>Support conversations with customer, device, and RMM context in one workspace.</p>
        </div>
        <div className="headingActions"><button className="ghost">Saved views</button><button className="primary">+ New ticket</button></div>
      </section>

      <div className="filters">
        <button className="chip selected">My Open <b>7</b></button>
        <button className="chip">Unassigned <b>3</b></button>
        <button className="chip criticalChip">Critical <b>1</b></button>
        <button className="chip waitingChip">Waiting Customer <b>4</b></button>
      </div>

      <div className="ticketGrid">
        <section className="queue panel">
          <div className="panelHeader"><strong>Open queue</strong><span>14 tickets</span></div>
          {tickets.map((ticket, i) => (
            <article className={i === 0 ? "ticket activeTicket" : "ticket"} key={ticket.id}>
              <div className="ticketMeta"><span>{ticket.id}</span><span className={`priority priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></div>
              <strong>{ticket.subject}</strong>
              <small>{ticket.client}</small>
              <div className="ticketFooter"><span>{ticket.status}</span><span>{i === 0 ? "8m" : i === 1 ? "21m" : "1h"}</span></div>
            </article>
          ))}
        </section>

        <section className="conversation panel">
          <div className="panelHeader"><div><strong>TKT-000812</strong><span className="muted"> · In Progress</span></div><button className="ghost small">•••</button></div>
          <div className="ticketTitle"><h2>Outlook keeps asking for my password</h2><p>Adams Accounting · Jane Smith · DESKTOP-JSMITH</p></div>

          <div className="conversationStream">
            <article className="message customerMessage">
              <div className="avatar customerAvatar">JS</div>
              <div className="messageBubble customerBubble">
                <div className="messageType customerType">Customer</div>
                <div className="messageHead"><strong>Jane Smith</strong><span>9:18 AM</span></div>
                <p>Outlook keeps prompting me to sign in. I enter my password and it comes back a few minutes later.</p>
              </div>
            </article>

            <article className="message techMessage">
              <div className="avatar techAvatar">FO</div>
              <div className="messageBubble techBubble">
                <div className="messageType techType">MSP reply</div>
                <div className="messageHead"><strong>Forrest</strong><span>9:26 AM</span></div>
                <p>I’m checking the device and Microsoft 365 sign-in state now. I’ll update you shortly.</p>
              </div>
            </article>

            <article className="message noteMessage">
              <div className="avatar noteAvatar">N</div>
              <div className="messageBubble noteBubble">
                <div className="messageType noteType">Internal note · not visible to customer</div>
                <div className="messageHead"><strong>Forrest</strong><span>9:29 AM</span></div>
                <p>Possible stale WAM / OneAuth state. Check Entra sign-in logs before clearing local identity cache.</p>
              </div>
            </article>
          </div>

          <div className="composer">
            <div className="composerTabs"><button className="tab activeTab">Reply to customer</button><button className="tab noteTab">Internal note</button></div>
            <textarea placeholder="Write a reply…"/>
            <div className="composerFooter"><span>Attach · Template</span><button className="primary">Send reply</button></div>
          </div>
        </section>

        <aside className="context panel">
          <div className="panelHeader"><strong>Client context</strong></div>
          <div className="contextSection contextClient"><label>CLIENT</label><h3>Adams Accounting</h3><p>Active client · Since 2022</p></div>
          <div className="contextSection"><label>CONTACT</label><strong>Jane Smith</strong><p>Accounting Department<br/>jane@adams.example</p></div>
          <div className="contextSection"><label>DEVICE</label><strong>DESKTOP-JSMITH</strong><div className="deviceStatus"><span className="dot"/>Online</div><dl><div><dt>OS</dt><dd>Windows 11 Pro</dd></div><div><dt>Model</dt><dd>Dell OptiPlex 7090</dd></div><div><dt>Last user</dt><dd>ADAMS\\jsmith</dd></div></dl></div>
          <div className="alert"><strong>⚠ 1 current Datto alert</strong><span>Authentication monitor · 12m ago</span></div>
          <div className="contextSection"><label>RELATED HISTORY</label><div className="history"><strong>TKT-000619</strong><span>Outlook authentication issue</span><small>Resolved 41 days ago</small></div></div>
        </aside>
      </div>
    </div>
  );
}
