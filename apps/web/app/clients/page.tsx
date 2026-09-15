"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type ClientRow = {
  id: string;
  slug: string;
  name: string;
  dbaName?: string | null;
  lifecycleStatus: string;
  industry?: string | null;
  primaryDomain?: string | null;
  relationshipHealth?: number | null;
  _count: { contacts: number; devices: number; tickets: number };
};

type ClientList = {
  items: ClientRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type DashboardSummary = {
  metrics: { activeClients: number; openTickets: number; totalDevices: number; clientsWithAlerts: number };
};

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function health(score?: number | null) {
  if (score === null || score === undefined) return { text: "Unknown", className: "" };
  if (score >= 80) return { text: "Healthy", className: "healthy" };
  if (score >= 60) return { text: "Watch", className: "watch" };
  return { text: "At Risk", className: "at-risk" };
}

export default function ClientsPage() {
  const { request } = useAuth();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const params = useMemo(() => {
    const search = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (query) search.set("search", query);
    if (status) search.set("status", status);
    return search.toString();
  }, [page, query, status]);
  const clients = useApiResource<ClientList>(`/clients?${params}`);
  const dashboard = useApiResource<DashboardSummary>("/dashboard");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setFormError(null);
    try {
      await request("/clients", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          lifecycleStatus: String(form.get("lifecycleStatus") ?? "PROSPECT"),
          primaryDomain: String(form.get("primaryDomain") ?? "").trim() || undefined,
          industry: String(form.get("industry") ?? "").trim() || undefined,
          mainPhone: String(form.get("mainPhone") ?? "").trim() || undefined,
          generalEmail: String(form.get("generalEmail") ?? "").trim() || undefined,
          relationshipHealth: 80,
        }),
      });
      setShowCreate(false);
      await clients.refresh();
      await dashboard.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div>
          <div className="eyebrow">CRM</div>
          <h1>Clients</h1>
          <p>The relationship, technical environment, support history, and opportunities for every managed customer.</p>
        </div>
        <div className="headingActions"><button className="primary" onClick={() => setShowCreate(true)}>+ New client</button></div>
      </section>

      <section className="summaryStrip">
        <div><span>Active clients</span><strong>{dashboard.data?.metrics.activeClients ?? "—"}</strong></div>
        <div><span>Open tickets</span><strong>{dashboard.data?.metrics.openTickets ?? "—"}</strong></div>
        <div><span>Devices</span><strong>{dashboard.data?.metrics.totalDevices ?? "—"}</strong></div>
        <div><span>Clients with alerts</span><strong>{dashboard.data?.metrics.clientsWithAlerts ?? "—"}</strong></div>
      </section>

      <section className="dashboardCard clientTableCard">
        <div className="tableToolbar">
          <form className="toolbar" onSubmit={submitSearch}>
            <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search clients…" aria-label="Search clients" />
            <button className="ghost" type="submit">Search</button>
            {query ? <button className="linkButton" type="button" onClick={() => { setQueryInput(""); setQuery(""); setPage(1); }}>Clear</button> : null}
          </form>
          <div className="tableActions">
            {[{ label: "All clients", value: "" }, { label: "Active", value: "ACTIVE" }, { label: "Onboarding", value: "ONBOARDING" }, { label: "At risk", value: "AT_RISK" }].map((item) => (
              <button key={item.label} className={`chip ${status === item.value ? "selected" : ""}`} onClick={() => { setStatus(item.value); setPage(1); }}>{item.label}</button>
            ))}
          </div>
        </div>
        {clients.error ? <div className="inlineError">{clients.error}</div> : null}
        {clients.loading && !clients.data ? <div className="loadingPanel">Loading clients…</div> : (
          <div className="tableWrap">
            <table className="dataTable clientTable">
              <thead><tr><th>Client</th><th>Status</th><th>Industry</th><th>Contacts</th><th>Devices</th><th>Support records</th><th>Health</th></tr></thead>
              <tbody>
                {(clients.data?.items ?? []).map((client) => {
                  const healthState = health(client.relationshipHealth);
                  return (
                    <tr key={client.id}>
                      <td><Link className="clientLink" href={`/clients/${client.slug}`}><span className="clientMonogram">{client.name.slice(0,2).toUpperCase()}</span><span><strong>{client.name}</strong><small>{client.primaryDomain || client.dbaName || "Managed client"}</small></span></Link></td>
                      <td><span className={`statusPill ${client.lifecycleStatus === "ONBOARDING" ? "onboarding" : "activeStatus"}`}>{human(client.lifecycleStatus)}</span></td>
                      <td>{client.industry || "—"}</td>
                      <td>{client._count.contacts}</td>
                      <td>{client._count.devices}</td>
                      <td>{client._count.tickets}</td>
                      <td><span className={`healthPill ${healthState.className}`}>{healthState.text}{client.relationshipHealth !== null && client.relationshipHealth !== undefined ? ` · ${client.relationshipHealth}` : ""}</span></td>
                    </tr>
                  );
                })}
                {!clients.loading && !(clients.data?.items.length) ? <tr><td colSpan={7}>No clients match this view.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
        {clients.data ? (
          <div className="pagination">
            <span>{clients.data.pagination.total} clients · Page {clients.data.pagination.page} of {clients.data.pagination.totalPages}</span>
            <button className="ghost" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button className="ghost" disabled={page >= clients.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        ) : null}
      </section>

      {showCreate ? (
        <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setShowCreate(false); }}>
          <form className="modalCard" onSubmit={createClient}>
            <div className="modalHeader"><h2>New client</h2><button className="ghost" type="button" onClick={() => setShowCreate(false)} disabled={saving}>Close</button></div>
            <div className="modalBody">
              {formError ? <div className="inlineError">{formError}</div> : null}
              <div className="formGrid" style={{ marginTop: formError ? 12 : 0 }}>
                <div className="formField full"><label>Client name</label><input name="name" required maxLength={200} autoFocus /></div>
                <div className="formField"><label>Status</label><select name="lifecycleStatus" defaultValue="PROSPECT"><option value="PROSPECT">Prospect</option><option value="ONBOARDING">Onboarding</option><option value="ACTIVE">Active</option></select></div>
                <div className="formField"><label>Industry</label><input name="industry" maxLength={120} /></div>
                <div className="formField"><label>Primary domain</label><input name="primaryDomain" placeholder="example.com" maxLength={255} /></div>
                <div className="formField"><label>Main phone</label><input name="mainPhone" maxLength={50} /></div>
                <div className="formField full"><label>General email</label><input name="generalEmail" type="email" /></div>
              </div>
            </div>
            <div className="modalFooter"><button className="ghost" type="button" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create client"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
