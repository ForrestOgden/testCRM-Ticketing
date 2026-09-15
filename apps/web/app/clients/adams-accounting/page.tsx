const timeline = [
  { type: "ticket", title: "Outlook authentication issue opened", meta: "TKT-000812 · Jane Smith · 8 minutes ago", tone: "blue" },
  { type: "alert", title: "Authentication monitor raised on DESKTOP-JSMITH", meta: "Datto RMM · 12 minutes ago", tone: "amber" },
  { type: "note", title: "Quarterly review notes updated", meta: "Forrest · Yesterday", tone: "purple" },
  { type: "ticket", title: "Printer mapping issue resolved", meta: "TKT-000807 · 3 days ago", tone: "green" },
];

export default function Client360Page() {
  return (
    <div className="pageStack">
      <section className="clientHero">
        <div className="clientIdentity">
          <div className="largeMonogram">AA</div>
          <div><div className="eyebrow">Client 360</div><h1>Adams Accounting</h1><p>Active client · Since 2022 · Accounting</p></div>
        </div>
        <div className="headingActions"><button className="ghost">Add activity</button><button className="primary">+ New ticket</button></div>
      </section>

      <section className="clientSignalGrid">
        <div className="signalCard blueSignal"><span>Open tickets</span><strong>3</strong><small>1 high priority</small></div>
        <div className="signalCard greenSignal"><span>Managed devices</span><strong>27</strong><small>26 online</small></div>
        <div className="signalCard amberSignal"><span>Active alerts</span><strong>1</strong><small>Authentication monitor</small></div>
        <div className="signalCard purpleSignal"><span>Contacts</span><strong>18</strong><small>3 key contacts</small></div>
        <div className="signalCard cyanSignal"><span>Opportunities</span><strong>$8,400</strong><small>2 active</small></div>
      </section>

      <section className="client360Grid">
        <div className="clientMainColumn">
          <article className="dashboardCard">
            <div className="cardHeader"><div><strong>Current attention</strong><span>What is happening right now</span></div></div>
            <div className="attentionGrid">
              <div className="attentionItem ticketAttention"><span>TICKET</span><strong>TKT-000812 · Outlook keeps asking for password</strong><small>Jane Smith · DESKTOP-JSMITH · In Progress</small></div>
              <div className="attentionItem alertAttention"><span>RMM ALERT</span><strong>Authentication monitor</strong><small>DESKTOP-JSMITH · Raised 12 minutes ago</small></div>
              <div className="attentionItem taskAttention"><span>FOLLOW-UP</span><strong>Quarterly business review</strong><small>Due Friday · Assigned to Forrest</small></div>
            </div>
          </article>

          <article className="dashboardCard">
            <div className="cardHeader"><div><strong>Relationship timeline</strong><span>Tickets, alerts, notes, meetings, and changes</span></div><a href="#">Filter →</a></div>
            <div className="timeline">
              {timeline.map((item) => <div className="timelineItem" key={item.title}><span className={`timelineMarker ${item.tone}`}/><div><strong>{item.title}</strong><span>{item.meta}</span></div></div>)}
            </div>
          </article>
        </div>

        <aside className="clientSideColumn">
          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Client details</strong><span>Relationship profile</span></div></div>
            <dl className="profileList">
              <div><dt>Account owner</dt><dd>Forrest</dd></div><div><dt>Primary domain</dt><dd>adams.example</dd></div><div><dt>Main phone</dt><dd>(417) 555-0142</dd></div><div><dt>Relationship health</dt><dd><span className="healthPill watch">Watch</span></dd></div>
            </dl>
          </article>

          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Technical profile</strong><span>Operational environment</span></div></div>
            <dl className="profileList"><div><dt>Microsoft 365</dt><dd>Business Premium</dd></div><div><dt>RMM</dt><dd>Datto RMM</dd></div><div><dt>Firewall</dt><dd>UniFi UDM Pro</dd></div><div><dt>Backup</dt><dd>Datto BCDR</dd></div><div><dt>Endpoint security</dt><dd>Managed EDR</dd></div></dl>
          </article>

          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Key contacts</strong><span>Primary people</span></div></div>
            <div className="contactMini"><div className="avatar customerAvatar">JS</div><div><strong>Jane Smith</strong><span>Accounting · Technical contact</span></div></div>
            <div className="contactMini"><div className="avatar techAvatar">RA</div><div><strong>Robert Adams</strong><span>Owner · Decision maker</span></div></div>
          </article>
        </aside>
      </section>
    </div>
  );
}
