"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  officePhone?: string | null;
  mobilePhone?: string | null;
  isDecisionMaker: boolean;
  isTechnicalContact: boolean;
  isBillingContact: boolean;
  isVip: boolean;
  isInactive: boolean;
  client: { id: string; name: string; slug: string };
  location?: { id: string; name: string } | null;
  _count: { tickets: number };
};

type ContactList = { items: Contact[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type ClientList = { items: Array<{ id: string; name: string; slug: string }> };

export default function ContactsPage() {
  const { request } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search) params.set("search", search);
    return params.toString();
  }, [page, search]);
  const contacts = useApiResource<ContactList>(`/contacts?${query}`);
  const clients = useApiResource<ClientList>("/clients?page=1&pageSize=100");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await request("/contacts", {
        method: "POST",
        body: JSON.stringify({
          clientId: String(form.get("clientId")),
          firstName: String(form.get("firstName") ?? "").trim(),
          lastName: String(form.get("lastName") ?? "").trim(),
          title: String(form.get("title") ?? "").trim() || undefined,
          department: String(form.get("department") ?? "").trim() || undefined,
          email: String(form.get("email") ?? "").trim() || undefined,
          officePhone: String(form.get("officePhone") ?? "").trim() || undefined,
          mobilePhone: String(form.get("mobilePhone") ?? "").trim() || undefined,
          isDecisionMaker: form.get("isDecisionMaker") === "on",
          isTechnicalContact: form.get("isTechnicalContact") === "on",
          isBillingContact: form.get("isBillingContact") === "on",
          isVip: form.get("isVip") === "on",
        }),
      });
      setShowCreate(false);
      await contacts.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div><div className="eyebrow">CRM</div><h1>Contacts</h1><p>People associated with clients, tickets, decisions, billing, and technical communication.</p></div>
        <button className="primary" onClick={() => setShowCreate(true)}>+ New contact</button>
      </section>
      <section className="dashboardCard">
        <div className="cardHeader"><div><strong>Contact directory</strong><span>{contacts.data?.pagination.total ?? 0} people</span></div><form className="toolbar" onSubmit={submitSearch}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, email, client…"/><button className="ghost">Search</button></form></div>
        {contacts.error ? <div className="inlineError">{contacts.error}</div> : null}
        {contacts.loading && !contacts.data ? <div className="loadingPanel">Loading contacts…</div> : <div className="tableWrap"><table className="dataTable"><thead><tr><th>Contact</th><th>Client</th><th>Role</th><th>Email</th><th>Phone</th><th>Flags</th><th>Tickets</th></tr></thead><tbody>
          {(contacts.data?.items ?? []).map((contact) => <tr key={contact.id}><td><div className="clientLink"><span className="clientMonogram">{contact.firstName[0]}{contact.lastName[0]}</span><span><strong>{contact.firstName} {contact.lastName}</strong><small>{contact.location?.name || "Primary contact record"}</small></span></div></td><td><Link href={`/clients/${contact.client.slug}`}>{contact.client.name}</Link></td><td>{contact.title || contact.department || "—"}</td><td>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}</td><td>{contact.mobilePhone || contact.officePhone || "—"}</td><td><div className="toolbar">{contact.isVip ? <span className="statusPill">VIP</span> : null}{contact.isDecisionMaker ? <span className="statusPill">Decision</span> : null}{contact.isTechnicalContact ? <span className="statusPill">Technical</span> : null}{contact.isBillingContact ? <span className="statusPill">Billing</span> : null}</div></td><td>{contact._count.tickets}</td></tr>)}
          {!contacts.loading && !(contacts.data?.items.length) ? <tr><td colSpan={7}>No contacts found.</td></tr> : null}
        </tbody></table></div>}
        {contacts.data ? <div className="pagination"><span>Page {page} of {contacts.data.pagination.totalPages}</span><button className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="ghost" disabled={page >= contacts.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div> : null}
      </section>

      {showCreate ? <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setShowCreate(false); }}><form className="modalCard" onSubmit={create}><div className="modalHeader"><h2>New contact</h2><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Close</button></div><div className="modalBody">{error ? <div className="inlineError">{error}</div> : null}<div className="formGrid" style={{ marginTop: error ? 12 : 0 }}><div className="formField full"><label>Client</label><select name="clientId" required defaultValue=""><option value="" disabled>Select client…</option>{clients.data?.items.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></div><div className="formField"><label>First name</label><input name="firstName" required/></div><div className="formField"><label>Last name</label><input name="lastName" required/></div><div className="formField"><label>Title</label><input name="title"/></div><div className="formField"><label>Department</label><input name="department"/></div><div className="formField"><label>Email</label><input name="email" type="email"/></div><div className="formField"><label>Mobile phone</label><input name="mobilePhone"/></div><div className="formField"><label>Office phone</label><input name="officePhone"/></div><div className="formField full"><label>Contact roles</label><div className="toolbar"><label><input name="isVip" type="checkbox"/> VIP</label><label><input name="isDecisionMaker" type="checkbox"/> Decision maker</label><label><input name="isTechnicalContact" type="checkbox"/> Technical</label><label><input name="isBillingContact" type="checkbox"/> Billing</label></div></div></div></div><div className="modalFooter"><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create contact"}</button></div></form></div> : null}
    </div>
  );
}
