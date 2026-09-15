"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type DeviceRow = {
  id: string;
  hostname: string;
  deviceClass?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  operatingSystem?: string | null;
  lastLoggedInUser?: string | null;
  internalIp?: string | null;
  isOnline?: boolean | null;
  openAlertCount: number;
  lastSeenAt?: string | null;
  lastSyncedAt?: string | null;
  syncStatus?: string | null;
  rmmUrl?: string | null;
  client: { id: string; name: string; slug: string };
  location?: { id: string; name: string } | null;
  rmmSite?: { id: string; name: string; provider: string } | null;
  _count: { tickets: number; rmmAlerts: number };
};

type DeviceList = { items: DeviceRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
type DeviceDetail = DeviceRow & {
  externalIp?: string | null;
  macAddress?: string | null;
  osVersion?: string | null;
  patchStatus?: string | null;
  warrantyEndsAt?: string | null;
  rmmAlerts: Array<{ id: string; isOpen: boolean; message?: string | null; alertType?: string | null; category?: string | null; priority?: string | null; raisedAt?: string | null; resolvedAt?: string | null }>;
  tickets: Array<{ id: string; number: string; subject: string; status: string; priority: string; assignee?: { displayName: string } | null }>;
  supportEndpoint?: { appVersion?: string | null; lastSeenAt?: string | null; revokedAt?: string | null } | null;
};

function human(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function ticketNumber(number: string) { return `TKT-${number.padStart(6, "0")}`; }
function when(value?: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export default function DevicesPage() {
  const { request } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const params = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (search) query.set("search", search);
    if (online) query.set("online", online);
    return query.toString();
  }, [page, search, online]);
  const devices = useApiResource<DeviceList>(`/devices?${params}`);
  const detail = useApiResource<DeviceDetail>(selectedId ? `/devices/${selectedId}` : "/devices/__none__", Boolean(selectedId));

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelectedId(id);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function sync() {
    setSyncing(true);
    setActionMessage(null);
    try {
      await request("/integrations/DATTO_RMM/sync", { method: "POST" });
      setActionMessage("Datto synchronization has been queued.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div><div className="eyebrow">Technical context</div><h1>Devices</h1><p>Managed endpoints synchronized from RMM providers and linked directly to clients, alerts, and tickets.</p></div>
        <button className="ghost" onClick={() => void sync()} disabled={syncing}>{syncing ? "Queuing…" : "Sync Datto RMM"}</button>
      </section>
      {actionMessage ? <div className={actionMessage.toLowerCase().includes("queued") ? "inlineSuccess" : "inlineError"}>{actionMessage}</div> : null}
      <section className="dashboardCard">
        <div className="cardHeader"><div><strong>Device inventory</strong><span>{devices.data?.pagination.total ?? 0} active endpoints</span></div><div className="toolbar"><form className="toolbar" onSubmit={submitSearch}><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Hostname, user, serial, IP…"/><button className="ghost">Search</button></form><select value={online} onChange={(event) => { setOnline(event.target.value); setPage(1); }}><option value="">All states</option><option value="true">Online</option><option value="false">Offline</option></select></div></div>
        {devices.error ? <div className="inlineError">{devices.error}</div> : null}
        {devices.loading && !devices.data ? <div className="loadingPanel">Loading endpoints…</div> : <div className="tableWrap"><table className="dataTable"><thead><tr><th>Device</th><th>Client</th><th>Status</th><th>OS</th><th>Last user</th><th>IP</th><th>Alerts</th><th>Tickets</th><th>Sync</th></tr></thead><tbody>
          {(devices.data?.items ?? []).map((device) => <tr className="clickRow" tabIndex={0} key={device.id} onClick={() => setSelectedId(device.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(device.id); }}><td><strong>{device.hostname}</strong><br/><span className="mutedCell">{[device.manufacturer, device.model].filter(Boolean).join(" ") || device.deviceClass || "Endpoint"}</span></td><td><Link href={`/clients/${device.client.slug}`} onClick={(event) => event.stopPropagation()}>{device.client.name}</Link></td><td><span className={`connectionStatus ${device.isOnline ? "connected" : "disconnected"}`}>{device.isOnline ? "● Online" : "○ Offline"}</span></td><td>{device.operatingSystem || "—"}</td><td>{device.lastLoggedInUser || "—"}</td><td>{device.internalIp || "—"}</td><td>{device.openAlertCount ? <span className="countBadge">{device.openAlertCount}</span> : "—"}</td><td>{device._count.tickets}</td><td>{device.syncStatus || (device.rmmSite ? "linked" : "local")}</td></tr>)}
          {!devices.loading && !(devices.data?.items.length) ? <tr><td colSpan={9}>No devices match this view.</td></tr> : null}
        </tbody></table></div>}
        {devices.data ? <div className="pagination"><span>Page {page} of {devices.data.pagination.totalPages}</span><button className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="ghost" disabled={page >= devices.data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div> : null}
      </section>

      {selectedId ? <div className="modalBackdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}><div className="modalCard"><div className="modalHeader"><h2>{detail.data?.hostname ?? "Device"}</h2><button className="ghost" onClick={() => setSelectedId(null)}>Close</button></div><div className="modalBody">{detail.loading && !detail.data ? <div className="loadingPanel">Loading endpoint…</div> : detail.error ? <div className="errorPanel">{detail.error}</div> : detail.data ? <div className="pageStack">
        <div className="detailMeta"><span>{detail.data.client.name}</span><span>{detail.data.isOnline ? "Online" : "Offline"}</span><span>Last seen {when(detail.data.lastSeenAt)}</span></div>
        <dl className="profileList"><div><dt>Operating system</dt><dd>{[detail.data.operatingSystem, detail.data.osVersion].filter(Boolean).join(" ") || "—"}</dd></div><div><dt>Hardware</dt><dd>{[detail.data.manufacturer, detail.data.model].filter(Boolean).join(" ") || "—"}</dd></div><div><dt>Serial</dt><dd>{detail.data.serialNumber || "—"}</dd></div><div><dt>Last user</dt><dd>{detail.data.lastLoggedInUser || "—"}</dd></div><div><dt>Internal IP</dt><dd>{detail.data.internalIp || "—"}</dd></div><div><dt>External IP</dt><dd>{detail.data.externalIp || "—"}</dd></div><div><dt>RMM site</dt><dd>{detail.data.rmmSite?.name || "—"}</dd></div><div><dt>Last sync</dt><dd>{when(detail.data.lastSyncedAt)}</dd></div></dl>
        <div><div className="eyebrow">Current alerts</div>{detail.data.rmmAlerts.filter((alert) => alert.isOpen).map((alert) => <div className="alert" key={alert.id}><strong>{alert.message || alert.alertType || "RMM alert"}</strong><span>{alert.priority || alert.category || "Alert"} · {when(alert.raisedAt)}</span></div>)}{!detail.data.rmmAlerts.some((alert) => alert.isOpen) ? <p className="muted">No active RMM alerts.</p> : null}</div>
        <div><div className="eyebrow">Recent tickets</div><div className="tableWrap"><table className="dataTable"><tbody>{detail.data.tickets.slice(0,8).map((ticket) => <tr key={ticket.id}><td><Link href={`/tickets?id=${ticket.id}`}>{ticketNumber(ticket.number)}</Link></td><td>{ticket.subject}</td><td>{human(ticket.status)}</td></tr>)}</tbody></table></div></div>
        <div className="toolbar">{detail.data.rmmUrl ? <a className="primary" href={detail.data.rmmUrl} target="_blank" rel="noreferrer">Open in Datto RMM ↗</a> : null}<Link className="ghost" href={`/clients/${detail.data.client.slug}`}>Open Client 360</Link></div>
      </div> : null}</div></div></div> : null}
    </div>
  );
}
