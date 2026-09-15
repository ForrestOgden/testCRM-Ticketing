"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type Opportunity = {
  id: string;
  name: string;
  valueCents?: string | null;
  probability?: number | null;
  pipeline: string;
  stage: string;
  expectedCloseAt?: string | null;
  notes?: string | null;
  client: { id: string; name: string; slug: string };
  owner?: { id: string; displayName: string } | null;
};

type OpportunityList = { items: Opportunity[]; pagination: { total: number } };
type ClientList = { items: Array<{ id: string; name: string }> };
type Directory = { users: Array<{ id: string; displayName: string }> };

const stages = ["LEAD", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(cents?: string | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(cents ?? 0) / 100);
}

export default function PipelinePage() {
  const { request } = useAuth();
  const opportunities = useApiResource<OpportunityList>("/opportunities?page=1&pageSize=100");
  const clients = useApiResource<ClientList>("/clients?page=1&pageSize=100");
  const directory = useApiResource<Directory>("/directory");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(id: string, stage: string) {
    setError(null);
    try {
      await request(`/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      await opportunities.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dollars = Number(form.get("value") ?? 0);
    setSaving(true);
    setError(null);
    try {
      await request("/opportunities", {
        method: "POST",
        body: JSON.stringify({
          clientId: String(form.get("clientId")),
          name: String(form.get("name") ?? "").trim(),
          ownerId: String(form.get("ownerId") ?? "") || undefined,
          valueCents: Number.isFinite(dollars) && dollars >= 0 ? String(Math.round(dollars * 100)) : "0",
          probability: Number(form.get("probability") ?? 25),
          pipeline: "New Business",
          stage: String(form.get("stage") ?? "LEAD"),
          expectedCloseAt: String(form.get("expectedCloseAt") ?? "") || undefined,
          notes: String(form.get("notes") ?? "").trim() || undefined,
        }),
      });
      setShowCreate(false);
      await opportunities.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const active = (opportunities.data?.items ?? []).filter((item) => !["WON", "LOST"].includes(item.stage));
  const value = active.reduce((sum, item) => sum + Number(item.valueCents ?? 0), 0);
  const weighted = active.reduce((sum, item) => sum + Number(item.valueCents ?? 0) * ((item.probability ?? 0) / 100), 0);

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div><div className="eyebrow">Growth</div><h1>Pipeline</h1><p>Opportunities, proposals, renewals, and future work connected directly to client relationships.</p></div>
        <button className="primary" onClick={() => setShowCreate(true)}>+ Opportunity</button>
      </section>
      <section className="summaryStrip"><div><span>Open opportunities</span><strong>{active.length}</strong></div><div><span>Pipeline value</span><strong>{money(String(value))}</strong></div><div><span>Weighted value</span><strong>{money(String(weighted))}</strong></div><div><span>Won</span><strong>{(opportunities.data?.items ?? []).filter((item) => item.stage === "WON").length}</strong></div></section>
      {error ? <div className="inlineError">{error}</div> : null}
      {opportunities.loading && !opportunities.data ? <div className="loadingPanel">Loading pipeline…</div> : <div className="kanbanBoard">
        {stages.filter((stage) => stage !== "LOST").map((stage) => {
          const items = (opportunities.data?.items ?? []).filter((item) => item.stage === stage);
          const stageValue = items.reduce((sum, item) => sum + Number(item.valueCents ?? 0), 0);
          return <section className="kanbanColumn" key={stage}><div className="kanbanHeader"><div><strong>{human(stage)}</strong><span>{items.length} · {money(String(stageValue))}</span></div></div><div className="kanbanCards">{items.map((item) => <article className="opportunityCard" key={item.id}><div className="opportunityTop"><Link href={`/clients/${item.client.slug}`}>{item.client.name}</Link><strong>{money(item.valueCents)}</strong></div><h3>{item.name}</h3><div className="detailMeta"><span>{item.probability ?? 0}% probability</span><span>{item.owner?.displayName || "Unassigned"}</span></div>{item.expectedCloseAt ? <small>Close {new Date(item.expectedCloseAt).toLocaleDateString()}</small> : null}<select value={item.stage} aria-label={`Move ${item.name}`} onChange={(event) => void move(item.id, event.target.value)}>{stages.map((next) => <option value={next} key={next}>{human(next)}</option>)}</select></article>)}{!items.length ? <div className="kanbanEmpty">No opportunities</div> : null}</div></section>;
        })}
      </div>}

      {showCreate ? <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setShowCreate(false); }}><form className="modalCard" onSubmit={create}><div className="modalHeader"><h2>New opportunity</h2><button className="ghost" type="button" onClick={() => setShowCreate(false)}>Close</button></div><div className="modalBody">{error ? <div className="inlineError">{error}</div> : null}<div className="formGrid" style={{ marginTop: error ? 12 : 0 }}><div className="formField full"><label>Client</label><select name="clientId" required defaultValue=""><option value="" disabled>Select client…</option>{clients.data?.items.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><div className="formField full"><label>Opportunity</label><input name="name" required maxLength={250}/></div><div className="formField"><label>Value ($)</label><input name="value" type="number" min="0" step="0.01" defaultValue="0"/></div><div className="formField"><label>Probability (%)</label><input name="probability" type="number" min="0" max="100" defaultValue="25"/></div><div className="formField"><label>Stage</label><select name="stage" defaultValue="LEAD">{stages.map((stage) => <option key={stage} value={stage}>{human(stage)}</option>)}</select></div><div className="formField"><label>Owner</label><select name="ownerId" defaultValue=""><option value="">Unassigned</option>{directory.data?.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></div><div className="formField full"><label>Expected close</label><input name="expectedCloseAt" type="date"/></div><div className="formField full"><label>Notes</label><textarea name="notes" rows={4}/></div></div></div><div className="modalFooter"><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create opportunity"}</button></div></form></div> : null}
    </div>
  );
}
