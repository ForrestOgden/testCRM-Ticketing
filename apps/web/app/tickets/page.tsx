"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth, userInitials } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type TicketSummary = {
  id: string;
  displayNumber: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  updatedAt: string;
  client: { id: string; name: string; slug: string };
  contact?: { id: string; firstName: string; lastName: string; email?: string | null } | null;
  device?: { id: string; hostname: string; isOnline?: boolean | null; openAlertCount: number } | null;
};

type TicketList = {
  items: TicketSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type TicketEntry = {
  id: string;
  kind: "CUSTOMER_MESSAGE" | "TECHNICIAN_MESSAGE" | "INTERNAL_NOTE" | "SYSTEM_EVENT";
  bodyText: string;
  createdAt: string;
  author?: { displayName: string; email: string } | null;
};

type TicketDetail = TicketSummary & {
  type: string;
  category?: string | null;
  client: TicketSummary["client"] & { lifecycleStatus?: string; clientSince?: string | null };
  contact?: (TicketSummary["contact"] & { department?: string | null; title?: string | null; officePhone?: string | null; mobilePhone?: string | null }) | null;
  device?: (TicketSummary["device"] & {
    operatingSystem?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    lastLoggedInUser?: string | null;
    rmmUrl?: string | null;
    rmmAlerts: Array<{ id: string; message?: string | null; alertType?: string | null; priority?: string | null }>;
  }) | null;
  assignee?: { id: string; displayName: string; email: string } | null;
  queue?: { id: string; name: string } | null;
  entries: TicketEntry[];
};

type ClientList = { items: Array<{ id: string; name: string; slug: string }> };

type Directory = { users: Array<{ id: string; displayName: string }>; queues: Array<{ id: string; name: string }> };

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortPriority(value: string) {
  return value.startsWith("P1") ? "P1" : value.startsWith("P2") ? "P2" : value.startsWith("P3") ? "P3" : "P4";
}

function age(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function entryTreatment(kind: TicketEntry["kind"]) {
  if (kind === "CUSTOMER_MESSAGE") return { message: "customerMessage", avatar: "customerAvatar", bubble: "customerBubble", type: "customerType", label: "Customer" };
  if (kind === "INTERNAL_NOTE") return { message: "noteMessage", avatar: "noteAvatar", bubble: "noteBubble", type: "noteType", label: "Internal note · not visible to customer" };
  if (kind === "SYSTEM_EVENT") return { message: "noteMessage", avatar: "noteAvatar", bubble: "noteBubble", type: "noteType", label: "System" };
  return { message: "techMessage", avatar: "techAvatar", bubble: "techBubble", type: "techType", label: "MSP reply" };
}

export default function TicketsPage() {
  const { request, user } = useAuth();
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeKind, setComposeKind] = useState<"TECHNICIAN_MESSAGE" | "INTERNAL_NOTE">("TECHNICIAN_MESSAGE");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterPriority) params.set("priority", filterPriority);
    if (search) params.set("search", search);
    return params.toString();
  }, [page, filterStatus, filterPriority, search]);

  const tickets = useApiResource<TicketList>(`/tickets?${query}`);
  const detail = useApiResource<TicketDetail>(selectedId ? `/tickets/${selectedId}` : "/tickets/__none__", Boolean(selectedId));
  const clients = useApiResource<ClientList>("/clients?page=1&pageSize=100");
  const directory = useApiResource<Directory>("/directory");

  useEffect(() => {
    if (!selectedId && tickets.data?.items.length) setSelectedId(tickets.data.items[0].id);
  }, [selectedId, tickets.data]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setSelectedId(id);
    if (params.get("new") === "1") setShowCreate(true);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function sendEntry() {
    const body = message.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    setActionError(null);
    try {
      await request(`/tickets/${selectedId}/entries`, { method: "POST", body: JSON.stringify({ kind: composeKind, bodyText: body }) });
      setMessage("");
      await Promise.all([detail.refresh(), tickets.refresh()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  async function updateTicket(patch: Record<string, unknown>) {
    if (!selectedId) return;
    setActionError(null);
    try {
      await request(`/tickets/${selectedId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await Promise.all([detail.refresh(), tickets.refresh()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setActionError(null);
    try {
      const created = await request<TicketSummary>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          clientId: String(form.get("clientId")),
          subject: String(form.get("subject") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          initialMessage: String(form.get("description") ?? "").trim(),
          priority: String(form.get("priority") ?? "P3_NORMAL"),
          type: String(form.get("type") ?? "INCIDENT"),
          queueId: String(form.get("queueId") ?? "") || undefined,
          assigneeId: String(form.get("assigneeId") ?? "") || undefined,
          source: "crm",
        }),
      });
      setShowCreate(false);
      setSelectedId(created.id);
      await tickets.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  const current = detail.data;

  return (
    <div className="pageStack ticketPage">
      <section className="pageHeading compactHeading">
        <div>
          <div className="eyebrow">Help desk</div>
          <h1>Tickets</h1>
          <p>Support conversations with customer, device, and RMM context in one workspace.</p>
        </div>
        <div className="headingActions"><button className="primary" onClick={() => setShowCreate(true)}>+ New ticket</button></div>
      </section>

      <div className="filters toolbar">
        <button className={`chip ${!filterStatus && !filterPriority ? "selected" : ""}`} onClick={() => { setFilterStatus(""); setFilterPriority(""); setPage(1); }}>All <b>{tickets.data?.pagination.total ?? "—"}</b></button>
        <button className={`chip ${filterStatus === "NEW" ? "selected" : ""}`} onClick={() => { setFilterStatus("NEW"); setFilterPriority(""); setPage(1); }}>New</button>
        <button className={`chip criticalChip ${filterPriority === "P1_CRITICAL" ? "selected" : ""}`} onClick={() => { setFilterPriority("P1_CRITICAL"); setFilterStatus(""); setPage(1); }}>Critical</button>
        <button className={`chip waitingChip ${filterStatus === "WAITING_CUSTOMER" ? "selected" : ""}`} onClick={() => { setFilterStatus("WAITING_CUSTOMER"); setFilterPriority(""); setPage(1); }}>Waiting Customer</button>
        <form onSubmit={submitSearch} className="toolbar" style={{ marginLeft: "auto" }}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search tickets…"/><button className="ghost">Search</button></form>
      </div>

      {actionError ? <div className="inlineError">{actionError}</div> : null}

      <div className="ticketGrid">
        <section className="queue panel">
          <div className="panelHeader"><strong>Queue</strong><span>{tickets.data?.pagination.total ?? 0} tickets</span></div>
          {tickets.loading && !tickets.data ? <div className="loadingPanel">Loading tickets…</div> : null}
          {tickets.error ? <div className="inlineError">{tickets.error}</div> : null}
          {(tickets.data?.items ?? []).map((ticket) => {
            const p = shortPriority(ticket.priority);
            return (
              <button type="button" className={ticket.id === selectedId ? "ticket activeTicket ticketSelect" : "ticket ticketSelect"} key={ticket.id} onClick={() => setSelectedId(ticket.id)}>
                <div className="ticketMeta"><span>{ticket.displayNumber}</span><span className={`priority priority-${p.toLowerCase()}`}>{p}</span></div>
                <strong>{ticket.subject}</strong>
                <small>{ticket.client.name}</small>
                <div className="ticketFooter"><span>{human(ticket.status)}</span><span>{age(ticket.updatedAt)}</span></div>
              </button>
            );
          })}
          {!tickets.loading && !(tickets.data?.items.length) ? <div className="emptyPanel">No tickets in this view.</div> : null}
        </section>

        <section className="conversation panel">
          {!selectedId ? <div className="emptyPanel">Select a ticket.</div> : detail.loading && !current ? <div className="loadingPanel">Loading ticket…</div> : detail.error && !current ? <div className="errorPanel">{detail.error}</div> : current ? <>
            <div className="panelHeader">
              <div><strong>{current.displayNumber}</strong><span className="muted"> · {human(current.status)}</span></div>
              <div className="toolbar">
                <select aria-label="Ticket status" value={current.status} onChange={(event) => void updateTicket({ status: event.target.value })}>
                  {['NEW','TRIAGE','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_VENDOR','SCHEDULED','RESOLVED','CLOSED'].map((value) => <option key={value} value={value}>{human(value)}</option>)}
                </select>
              </div>
            </div>
            <div className="ticketTitle"><h2>{current.subject}</h2><p>{current.client.name}{current.contact ? ` · ${current.contact.firstName} ${current.contact.lastName}` : ""}{current.device ? ` · ${current.device.hostname}` : ""}</p></div>

            <div className="conversationStream">
              {current.entries.map((entry) => {
                const treatment = entryTreatment(entry.kind);
                const author = entry.kind === "CUSTOMER_MESSAGE" ? `${current.contact?.firstName ?? "Customer"} ${current.contact?.lastName ?? ""}`.trim() : entry.author?.displayName ?? (entry.kind === "SYSTEM_EVENT" ? "System" : user?.displayName ?? "Technician");
                return (
                  <article className={`message ${treatment.message}`} key={entry.id}>
                    <div className={`avatar ${treatment.avatar}`}>{entry.kind === "INTERNAL_NOTE" ? "N" : entry.kind === "SYSTEM_EVENT" ? "S" : entry.kind === "CUSTOMER_MESSAGE" ? (current.contact?.firstName?.[0] ?? "C") + (current.contact?.lastName?.[0] ?? "") : userInitials({ email: entry.author?.email ?? "", displayName: author })}</div>
                    <div className={`messageBubble ${treatment.bubble}`}>
                      <div className={`messageType ${treatment.type}`}>{treatment.label}</div>
                      <div className="messageHead"><strong>{author}</strong><span>{new Date(entry.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
                      <p>{entry.bodyText}</p>
                    </div>
                  </article>
                );
              })}
              {!current.entries.length ? <div className="emptyPanel">No conversation entries yet.</div> : null}
            </div>

            <div className="composer">
              <div className="composerTabs">
                <button className={`tab ${composeKind === "TECHNICIAN_MESSAGE" ? "activeTab" : ""}`} onClick={() => setComposeKind("TECHNICIAN_MESSAGE")}>Reply to customer</button>
                <button className={`tab noteTab ${composeKind === "INTERNAL_NOTE" ? "activeTab" : ""}`} onClick={() => setComposeKind("INTERNAL_NOTE")}>Internal note</button>
              </div>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={composeKind === "INTERNAL_NOTE" ? "Write an internal note…" : "Write a reply…"}/>
              <div className="composerFooter"><span>{composeKind === "INTERNAL_NOTE" ? "Only your team can see this." : "This reply will be emailed to the ticket contact when Graph is connected."}</span><button className="primary" onClick={() => void sendEntry()} disabled={sending || !message.trim()}>{sending ? "Sending…" : composeKind === "INTERNAL_NOTE" ? "Add note" : "Send reply"}</button></div>
            </div>
          </> : null}
        </section>

        <aside className="context panel">
          <div className="panelHeader"><strong>Client context</strong></div>
          {current ? <>
            <div className="contextSection contextClient"><label>CLIENT</label><Link href={`/clients/${current.client.slug}`}><h3>{current.client.name}</h3></Link><p>{human(current.client.lifecycleStatus ?? "ACTIVE")}</p></div>
            <div className="contextSection"><label>CONTACT</label>{current.contact ? <><strong>{current.contact.firstName} {current.contact.lastName}</strong><p>{current.contact.department || current.contact.title || "Contact"}<br/>{current.contact.email || "No email"}</p></> : <p>No contact linked.</p>}</div>
            <div className="contextSection"><label>DEVICE</label>{current.device ? <><strong>{current.device.hostname}</strong><div className="deviceStatus"><span className="dot"/>{current.device.isOnline ? "Online" : "Offline"}</div><dl><div><dt>OS</dt><dd>{current.device.operatingSystem || "—"}</dd></div><div><dt>Model</dt><dd>{[current.device.manufacturer,current.device.model].filter(Boolean).join(" ") || "—"}</dd></div><div><dt>Last user</dt><dd>{current.device.lastLoggedInUser || "—"}</dd></div></dl>{current.device.rmmUrl ? <a className="linkButton" href={current.device.rmmUrl} target="_blank" rel="noreferrer">Open in Datto RMM ↗</a> : null}</> : <p>No endpoint linked.</p>}</div>
            {current.device?.rmmAlerts?.length ? <div className="alert"><strong>⚠ {current.device.rmmAlerts.length} current RMM alert{current.device.rmmAlerts.length === 1 ? "" : "s"}</strong><span>{current.device.rmmAlerts[0].message || current.device.rmmAlerts[0].alertType || "Device alert"}</span></div> : null}
            <div className="contextSection"><label>OWNERSHIP</label><strong>{current.assignee?.displayName || "Unassigned"}</strong><p>{current.queue?.name || "No queue"} · {human(current.type)}</p></div>
          </> : <p style={{ padding: 16 }}>Select a ticket for context.</p>}
        </aside>
      </div>

      {tickets.data && tickets.data.pagination.totalPages > 1 ? <div className="pagination"><span>Page {page} of {tickets.data.pagination.totalPages}</span><button className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="ghost" disabled={page >= tickets.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div> : null}

      {showCreate ? (
        <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !creating) setShowCreate(false); }}>
          <form className="modalCard" onSubmit={createTicket}>
            <div className="modalHeader"><h2>New ticket</h2><button type="button" className="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Close</button></div>
            <div className="modalBody">
              {actionError ? <div className="inlineError">{actionError}</div> : null}
              <div className="formGrid" style={{ marginTop: actionError ? 12 : 0 }}>
                <div className="formField full"><label>Client</label><select name="clientId" required defaultValue=""><option value="" disabled>Select client…</option>{clients.data?.items.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
                <div className="formField full"><label>Subject</label><input name="subject" required maxLength={300} /></div>
                <div className="formField"><label>Priority</label><select name="priority" defaultValue="P3_NORMAL"><option value="P1_CRITICAL">P1 Critical</option><option value="P2_HIGH">P2 High</option><option value="P3_NORMAL">P3 Normal</option><option value="P4_LOW">P4 Low</option></select></div>
                <div className="formField"><label>Type</label><select name="type" defaultValue="INCIDENT"><option value="INCIDENT">Incident</option><option value="SERVICE_REQUEST">Service request</option><option value="PROBLEM">Problem</option><option value="QUESTION">Question</option></select></div>
                <div className="formField"><label>Queue</label><select name="queueId" defaultValue=""><option value="">Unassigned queue</option>{directory.data?.queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}</select></div>
                <div className="formField"><label>Technician</label><select name="assigneeId" defaultValue=""><option value="">Unassigned</option>{directory.data?.users.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></div>
                <div className="formField full"><label>Description</label><textarea name="description" required rows={6}/></div>
              </div>
            </div>
            <div className="modalFooter"><button type="button" className="ghost" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button><button className="primary" disabled={creating}>{creating ? "Creating…" : "Create ticket"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
