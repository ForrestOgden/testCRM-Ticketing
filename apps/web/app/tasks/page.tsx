"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type Activity = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  client?: { id: string; name: string; slug: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  opportunity?: { id: string; name: string; stage: string } | null;
  ticket?: { id: string; number: string; subject: string } | null;
  owner?: { id: string; displayName: string } | null;
};

type ActivityList = { items: Activity[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type ClientList = { items: Array<{ id: string; name: string }> };
type Directory = { users: Array<{ id: string; displayName: string }> };

const kinds = ["TASK", "CALL", "MEETING", "EMAIL", "NOTE", "REMINDER", "FOLLOW_UP"];
function human(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function ticketNumber(number: string) { return `TKT-${number.padStart(6, "0")}`; }
function dueClass(activity: Activity) {
  if (activity.completedAt) return "completed";
  if (!activity.dueAt) return "";
  const due = new Date(activity.dueAt).getTime();
  if (due < Date.now()) return "overdue";
  if (due < Date.now() + 24 * 60 * 60 * 1000) return "dueSoon";
  return "";
}

export default function TasksPage() {
  const { request } = useAuth();
  const [state, setState] = useState("open");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (state) query.set("state", state);
    if (kind) query.set("kind", kind);
    return query.toString();
  }, [page, state, kind]);
  const activities = useApiResource<ActivityList>(`/activities?${params}`);
  const clients = useApiResource<ClientList>("/clients?page=1&pageSize=100");
  const directory = useApiResource<Directory>("/directory");

  async function complete(activity: Activity) {
    setError(null);
    try {
      await request(`/activities/${activity.id}`, { method: "PATCH", body: JSON.stringify({ completedAt: activity.completedAt ? null : new Date().toISOString() }) });
      await activities.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const due = String(form.get("dueAt") ?? "");
      await request("/activities", {
        method: "POST",
        body: JSON.stringify({
          kind: String(form.get("kind") ?? "TASK"),
          title: String(form.get("title") ?? "").trim(),
          body: String(form.get("body") ?? "").trim() || undefined,
          clientId: String(form.get("clientId") ?? "") || undefined,
          ownerId: String(form.get("ownerId") ?? "") || undefined,
          dueAt: due ? new Date(due).toISOString() : undefined,
        }),
      });
      setShowCreate(false);
      await activities.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const open = (activities.data?.items ?? []).filter((item) => !item.completedAt);
  const overdue = open.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now()).length;
  const today = new Date();
  const dueToday = open.filter((item) => item.dueAt && new Date(item.dueAt).toDateString() === today.toDateString()).length;

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading"><div><div className="eyebrow">Work management</div><h1>Tasks</h1><p>Follow-ups, calls, meetings, reminders, and operational work tied to CRM records.</p></div><button className="primary" onClick={() => setShowCreate(true)}>+ New activity</button></section>
      <section className="summaryStrip"><div><span>In this view</span><strong>{activities.data?.pagination.total ?? 0}</strong></div><div><span>Overdue</span><strong>{overdue}</strong></div><div><span>Due today</span><strong>{dueToday}</strong></div><div><span>Unassigned</span><strong>{open.filter((item) => !item.owner).length}</strong></div></section>
      {error ? <div className="inlineError">{error}</div> : null}
      <section className="dashboardCard"><div className="cardHeader"><div><strong>Activity queue</strong><span>CRM follow-ups and work</span></div><div className="toolbar"><button className={`chip ${state === "open" ? "selected" : ""}`} onClick={() => { setState("open"); setPage(1); }}>Open</button><button className={`chip ${state === "completed" ? "selected" : ""}`} onClick={() => { setState("completed"); setPage(1); }}>Completed</button><button className={`chip ${state === "" ? "selected" : ""}`} onClick={() => { setState(""); setPage(1); }}>All</button><select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><option value="">All types</option>{kinds.map((value) => <option value={value} key={value}>{human(value)}</option>)}</select></div></div>
        {activities.loading && !activities.data ? <div className="loadingPanel">Loading activities…</div> : <div className="taskWorkspace">{(activities.data?.items ?? []).map((activity) => <article className={`activityCard ${dueClass(activity)}`} key={activity.id}><button className={`taskCheck ${activity.completedAt ? "checked" : ""}`} aria-label={activity.completedAt ? "Reopen activity" : "Complete activity"} onClick={() => void complete(activity)}>{activity.completedAt ? "✓" : ""}</button><div className="activityCopy"><div className="activityTop"><span className="activityKind">{human(activity.kind)}</span>{activity.dueAt ? <span className="activityDue">{new Date(activity.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : null}</div><strong>{activity.title}</strong>{activity.body ? <p>{activity.body}</p> : null}<div className="detailMeta">{activity.client ? <Link href={`/clients/${activity.client.slug}`}>{activity.client.name}</Link> : <span>No client</span>}{activity.ticket ? <Link href={`/tickets?id=${activity.ticket.id}`}>{ticketNumber(activity.ticket.number)}</Link> : null}<span>{activity.owner?.displayName || "Unassigned"}</span></div></div></article>)}{!activities.loading && !(activities.data?.items.length) ? <div className="emptyPanel">No activities in this view.</div> : null}</div>}
        {activities.data ? <div className="pagination"><span>Page {page} of {activities.data.pagination.totalPages}</span><button className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="ghost" disabled={page >= activities.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div> : null}
      </section>

      {showCreate ? <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setShowCreate(false); }}><form className="modalCard" onSubmit={create}><div className="modalHeader"><h2>New activity</h2><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Close</button></div><div className="modalBody">{error ? <div className="inlineError">{error}</div> : null}<div className="formGrid" style={{ marginTop: error ? 12 : 0 }}><div className="formField"><label>Type</label><select name="kind" defaultValue="TASK">{kinds.map((value) => <option key={value} value={value}>{human(value)}</option>)}</select></div><div className="formField"><label>Owner</label><select name="ownerId" defaultValue=""><option value="">Me</option>{directory.data?.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></div><div className="formField full"><label>Title</label><input name="title" required maxLength={300}/></div><div className="formField"><label>Client</label><select name="clientId" defaultValue=""><option value="">No client</option>{clients.data?.items.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><div className="formField"><label>Due</label><input name="dueAt" type="datetime-local"/></div><div className="formField full"><label>Details</label><textarea name="body" rows={4}/></div></div></div><div className="modalFooter"><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Creating…" : "Create activity"}</button></div></form></div> : null}
    </div>
  );
}
