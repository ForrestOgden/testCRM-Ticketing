"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";
import { useApiResource } from "../hooks/useApiResource";

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  mobilePhone?: string | null;
  isDecisionMaker: boolean;
  isTechnicalContact: boolean;
  isBillingContact: boolean;
  isVip: boolean;
};

type Device = {
  id: string;
  hostname: string;
  isOnline?: boolean | null;
  openAlertCount: number;
  operatingSystem?: string | null;
  manufacturer?: string | null;
  model?: string | null;
};

type Ticket = {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
  contact?: { firstName: string; lastName: string } | null;
  device?: { hostname: string } | null;
  assignee?: { displayName: string } | null;
};

type Opportunity = {
  id: string;
  name: string;
  valueCents?: string | null;
  probability?: number | null;
  pipeline: string;
  stage: string;
  updatedAt: string;
};

type Activity = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
};

type Client360Data = {
  id: string;
  slug: string;
  name: string;
  dbaName?: string | null;
  lifecycleStatus: string;
  industry?: string | null;
  employeeCount?: number | null;
  clientSince?: string | null;
  website?: string | null;
  primaryDomain?: string | null;
  mainPhone?: string | null;
  generalEmail?: string | null;
  relationshipHealth?: number | null;
  internalNotes?: string | null;
  accountOwner?: { displayName: string; email: string } | null;
  technicalOwner?: { displayName: string; email: string } | null;
  contacts: Contact[];
  devices: Device[];
  tickets: Ticket[];
  opportunities: Opportunity[];
  activities: Activity[];
  technicalProfile: Array<{ id: string; key: string; label: string; value?: string | null; secureUrl?: string | null }>;
  rmmSites: Array<{ id: string; name: string; provider: string; syncStatus?: string | null; lastSyncedAt?: string | null }>;
  _count: { contacts: number; locations: number; devices: number; tickets: number; opportunities: number };
};

const openStatuses = new Set(["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_VENDOR", "SCHEDULED"]);

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayTicket(number: string) {
  return `TKT-${number.padStart(6, "0")}`;
}

function money(cents: string | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(cents ?? 0) / 100);
}

function health(score?: number | null) {
  if (score === null || score === undefined) return { label: "Unknown", className: "" };
  if (score >= 80) return { label: "Healthy", className: "healthy" };
  if (score >= 60) return { label: "Watch", className: "watch" };
  return { label: "At Risk", className: "at-risk" };
}

export function Client360({ slug }: { slug: string }) {
  const { request } = useAuth();
  const resource = useApiResource<Client360Data>(`/clients/${encodeURIComponent(slug)}`);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (resource.loading && !resource.data) return <div className="loadingPanel">Loading Client 360…</div>;
  if (resource.error && !resource.data) return <div className="errorPanel">Unable to load client. {resource.error}</div>;
  const client = resource.data;
  if (!client) return null;

  const openTickets = client.tickets.filter((ticket) => openStatuses.has(ticket.status));
  const activeAlerts = client.devices.reduce((sum, device) => sum + device.openAlertCount, 0);
  const onlineDevices = client.devices.filter((device) => device.isOnline).length;
  const activeOpportunities = client.opportunities.filter((item) => !["WON", "LOST"].includes(item.stage));
  const pipelineValue = activeOpportunities.reduce((sum, item) => sum + Number(item.valueCents ?? 0), 0);
  const keyContacts = client.contacts.filter((contact) => contact.isVip || contact.isDecisionMaker || contact.isTechnicalContact).slice(0, 5);
  const healthState = health(client.relationshipHealth);

  const timeline = [
    ...client.tickets.slice(0, 8).map((ticket) => ({
      id: `ticket-${ticket.id}`,
      date: new Date(ticket.updatedAt),
      title: `${displayTicket(ticket.number)} · ${ticket.subject}`,
      meta: `${human(ticket.status)}${ticket.assignee ? ` · ${ticket.assignee.displayName}` : " · Unassigned"}`,
      tone: openStatuses.has(ticket.status) ? "blue" : "green",
      href: `/tickets?id=${ticket.id}`,
    })),
    ...client.activities.slice(0, 8).map((activity) => ({
      id: `activity-${activity.id}`,
      date: new Date(activity.createdAt),
      title: activity.title,
      meta: `${human(activity.kind)}${activity.dueAt ? ` · Due ${new Date(activity.dueAt).toLocaleDateString()}` : ""}`,
      tone: activity.completedAt ? "green" : "purple",
      href: "/tasks",
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 12);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await request(`/clients/${client.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          lifecycleStatus: String(form.get("lifecycleStatus") ?? client.lifecycleStatus),
          industry: String(form.get("industry") ?? "").trim() || null,
          employeeCount: form.get("employeeCount") ? Number(form.get("employeeCount")) : null,
          website: String(form.get("website") ?? "").trim() || null,
          primaryDomain: String(form.get("primaryDomain") ?? "").trim() || null,
          mainPhone: String(form.get("mainPhone") ?? "").trim() || null,
          generalEmail: String(form.get("generalEmail") ?? "").trim() || null,
          relationshipHealth: form.get("relationshipHealth") ? Number(form.get("relationshipHealth")) : null,
          internalNotes: String(form.get("internalNotes") ?? "").trim() || null,
        }),
      });
      setEditing(false);
      await resource.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="clientHero">
        <div className="clientIdentity">
          <div className="largeMonogram">{client.name.slice(0, 2).toUpperCase()}</div>
          <div><div className="eyebrow">Client 360</div><h1>{client.name}</h1><p>{human(client.lifecycleStatus)}{client.clientSince ? ` · Since ${new Date(client.clientSince).getFullYear()}` : ""}{client.industry ? ` · ${client.industry}` : ""}</p></div>
        </div>
        <div className="headingActions"><button className="ghost" onClick={() => setEditing(true)}>Edit client</button><Link className="primary" href="/tickets?new=1">+ New ticket</Link></div>
      </section>

      {error ? <div className="inlineError">{error}</div> : null}

      <section className="clientSignalGrid">
        <div className="signalCard blueSignal"><span>Open tickets</span><strong>{openTickets.length}</strong><small>{openTickets.filter((ticket) => ticket.priority.startsWith("P1") || ticket.priority.startsWith("P2")).length} high priority</small></div>
        <div className="signalCard greenSignal"><span>Managed devices</span><strong>{client._count.devices}</strong><small>{onlineDevices} online</small></div>
        <div className="signalCard amberSignal"><span>Active alerts</span><strong>{activeAlerts}</strong><small>{activeAlerts ? "Needs review" : "No current alerts"}</small></div>
        <div className="signalCard purpleSignal"><span>Contacts</span><strong>{client._count.contacts}</strong><small>{keyContacts.length} key contacts</small></div>
        <div className="signalCard cyanSignal"><span>Opportunities</span><strong>{money(String(pipelineValue))}</strong><small>{activeOpportunities.length} active</small></div>
      </section>

      <section className="client360Grid">
        <div className="clientMainColumn">
          <article className="dashboardCard">
            <div className="cardHeader"><div><strong>Current attention</strong><span>What is happening right now</span></div></div>
            <div className="attentionGrid">
              {openTickets.slice(0, 3).map((ticket) => <Link className="attentionItem ticketAttention" href={`/tickets?id=${ticket.id}`} key={ticket.id}><span>TICKET</span><strong>{displayTicket(ticket.number)} · {ticket.subject}</strong><small>{human(ticket.status)}{ticket.device ? ` · ${ticket.device.hostname}` : ""}</small></Link>)}
              {client.devices.filter((device) => device.openAlertCount > 0).slice(0, 3).map((device) => <Link className="attentionItem alertAttention" href={`/devices?id=${device.id}`} key={device.id}><span>RMM ALERT</span><strong>{device.hostname}</strong><small>{device.openAlertCount} active alert{device.openAlertCount === 1 ? "" : "s"}</small></Link>)}
              {client.activities.filter((activity) => !activity.completedAt).slice(0, 3).map((activity) => <Link className="attentionItem taskAttention" href="/tasks" key={activity.id}><span>{human(activity.kind)}</span><strong>{activity.title}</strong><small>{activity.dueAt ? `Due ${new Date(activity.dueAt).toLocaleString()}` : "No due date"}</small></Link>)}
              {!openTickets.length && !activeAlerts && !client.activities.some((activity) => !activity.completedAt) ? <div className="emptyPanel">Nothing currently requires attention.</div> : null}
            </div>
          </article>

          <article className="dashboardCard">
            <div className="cardHeader"><div><strong>Relationship timeline</strong><span>Recent tickets and CRM activity</span></div></div>
            <div className="timeline">
              {timeline.map((item) => <Link className="timelineItem" href={item.href} key={item.id}><span className={`timelineMarker ${item.tone}`}/><div><strong>{item.title}</strong><span>{item.meta} · {item.date.toLocaleString()}</span></div></Link>)}
              {!timeline.length ? <div className="emptyPanel">No relationship activity yet.</div> : null}
            </div>
          </article>

          <article className="dashboardCard">
            <div className="cardHeader"><div><strong>Recent tickets</strong><span>Support history</span></div><Link href={`/tickets?clientId=${client.id}`}>Open ticket workspace →</Link></div>
            <div className="tableWrap"><table className="dataTable"><thead><tr><th>Ticket</th><th>Subject</th><th>Status</th><th>Device</th><th>Assigned</th></tr></thead><tbody>{client.tickets.slice(0,10).map((ticket) => <tr key={ticket.id}><td className="ticketId"><Link href={`/tickets?id=${ticket.id}`}>{displayTicket(ticket.number)}</Link></td><td className="tableStrong">{ticket.subject}</td><td><span className="statusPill">{human(ticket.status)}</span></td><td>{ticket.device?.hostname || "—"}</td><td>{ticket.assignee?.displayName || "Unassigned"}</td></tr>)}</tbody></table></div>
          </article>
        </div>

        <aside className="clientSideColumn">
          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Client details</strong><span>Relationship profile</span></div></div>
            <dl className="profileList">
              <div><dt>Account owner</dt><dd>{client.accountOwner?.displayName || "Unassigned"}</dd></div>
              <div><dt>Technical owner</dt><dd>{client.technicalOwner?.displayName || "Unassigned"}</dd></div>
              <div><dt>Primary domain</dt><dd>{client.primaryDomain || "—"}</dd></div>
              <div><dt>Main phone</dt><dd>{client.mainPhone || "—"}</dd></div>
              <div><dt>Employees</dt><dd>{client.employeeCount ?? "—"}</dd></div>
              <div><dt>Relationship health</dt><dd><span className={`healthPill ${healthState.className}`}>{healthState.label}{client.relationshipHealth !== null && client.relationshipHealth !== undefined ? ` · ${client.relationshipHealth}` : ""}</span></dd></div>
            </dl>
          </article>

          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Technical profile</strong><span>Operational environment</span></div></div>
            <dl className="profileList">
              {client.technicalProfile.map((item) => <div key={item.id}><dt>{item.label}</dt><dd>{item.secureUrl ? <a href={item.secureUrl} target="_blank" rel="noreferrer">Open ↗</a> : item.value || "—"}</dd></div>)}
              {client.rmmSites.map((site) => <div key={site.id}><dt>RMM site</dt><dd>{site.name} · {site.syncStatus || "linked"}</dd></div>)}
              {!client.technicalProfile.length && !client.rmmSites.length ? <div><dt>Profile</dt><dd>Not documented yet</dd></div> : null}
            </dl>
          </article>

          <article className="dashboardCard infoCard">
            <div className="cardHeader"><div><strong>Key contacts</strong><span>Primary people</span></div><Link href={`/contacts?clientId=${client.id}`}>All →</Link></div>
            {keyContacts.map((contact) => <div className="contactMini" key={contact.id}><div className="avatar customerAvatar">{contact.firstName[0]}{contact.lastName[0]}</div><div><strong>{contact.firstName} {contact.lastName}</strong><span>{contact.title || contact.department || (contact.isDecisionMaker ? "Decision maker" : contact.isTechnicalContact ? "Technical contact" : "Contact")}</span></div></div>)}
            {!keyContacts.length ? <div className="emptyPanel">No key contacts yet.</div> : null}
          </article>
        </aside>
      </section>

      {editing ? (
        <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setEditing(false); }}>
          <form className="modalCard" onSubmit={save}>
            <div className="modalHeader"><h2>Edit {client.name}</h2><button type="button" className="ghost" onClick={() => setEditing(false)} disabled={saving}>Close</button></div>
            <div className="modalBody">
              {error ? <div className="inlineError">{error}</div> : null}
              <div className="formGrid" style={{ marginTop: error ? 12 : 0 }}>
                <div className="formField full"><label>Name</label><input name="name" defaultValue={client.name} required /></div>
                <div className="formField"><label>Status</label><select name="lifecycleStatus" defaultValue={client.lifecycleStatus}>{["LEAD","PROSPECT","QUALIFIED","PROPOSAL","ONBOARDING","ACTIVE","AT_RISK","INACTIVE","FORMER"].map((item) => <option key={item} value={item}>{human(item)}</option>)}</select></div>
                <div className="formField"><label>Health score</label><input name="relationshipHealth" type="number" min="0" max="100" defaultValue={client.relationshipHealth ?? ""}/></div>
                <div className="formField"><label>Industry</label><input name="industry" defaultValue={client.industry ?? ""}/></div>
                <div className="formField"><label>Employees</label><input name="employeeCount" type="number" min="0" defaultValue={client.employeeCount ?? ""}/></div>
                <div className="formField"><label>Domain</label><input name="primaryDomain" defaultValue={client.primaryDomain ?? ""}/></div>
                <div className="formField"><label>Phone</label><input name="mainPhone" defaultValue={client.mainPhone ?? ""}/></div>
                <div className="formField"><label>General email</label><input name="generalEmail" type="email" defaultValue={client.generalEmail ?? ""}/></div>
                <div className="formField"><label>Website</label><input name="website" type="url" placeholder="https://" defaultValue={client.website ?? ""}/></div>
                <div className="formField full"><label>Internal notes</label><textarea name="internalNotes" rows={5} defaultValue={client.internalNotes ?? ""}/></div>
              </div>
            </div>
            <div className="modalFooter"><button type="button" className="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
