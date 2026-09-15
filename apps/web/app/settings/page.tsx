"use client";

import { useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type Integration = {
  id: string;
  provider: string;
  name: string;
  status: string;
  config?: Record<string, unknown> | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
};

type IntegrationData = {
  items: Integration[];
  jobs: Array<{ queue: string; status: string; _count: number }>;
};

function human(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "connected") return "connected";
  if (normalized === "error") return "error";
  if (normalized === "degraded") return "degraded";
  if (normalized === "connecting") return "connecting";
  return "disconnected";
}

const providers = [
  { key: "DATTO_RMM", name: "Datto RMM", description: "Endpoint inventory, online state, device details, and live alert context." },
  { key: "MICROSOFT_GRAPH", name: "Microsoft Graph", description: "Shared support mailbox ingestion, email threading, and outbound customer replies." },
];

export default function SettingsPage() {
  const { request, user } = useAuth();
  const integrations = useApiResource<IntegrationData>("/integrations");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function sync(provider: string) {
    setBusy(provider);
    setMessage(null);
    try {
      await request(`/integrations/${provider}/sync`, { method: "POST" });
      setMessage(`${human(provider)} job queued.`);
      await integrations.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const outstandingJobs = integrations.data?.jobs.reduce((sum, group) => sum + group._count, 0) ?? 0;

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading"><div><div className="eyebrow">Administration</div><h1>Settings</h1><p>Authentication, integrations, synchronization health, and operational configuration.</p></div><button className="ghost" onClick={() => void integrations.refresh()}>Refresh status</button></section>
      {message ? <div className={message.toLowerCase().includes("queued") ? "inlineSuccess" : "inlineError"}>{message}</div> : null}
      <section className="summaryStrip"><div><span>Signed in as</span><strong style={{ fontSize: 13 }}>{user?.displayName || "—"}</strong></div><div><span>Authentication</span><strong style={{ fontSize: 13 }}>{process.env.NEXT_PUBLIC_AUTH_MODE === "development" ? "Development" : "Microsoft Entra"}</strong></div><div><span>Outstanding jobs</span><strong>{outstandingJobs}</strong></div><div><span>Configured connections</span><strong>{integrations.data?.items.length ?? 0}</strong></div></section>

      <section className="dashboardCard"><div className="cardHeader"><div><strong>Integrations</strong><span>Provider health and manual synchronization</span></div></div>{integrations.error ? <div className="inlineError">{integrations.error}</div> : null}<div className="integrationGrid" style={{ padding: 14 }}>
        {providers.map((provider) => {
          const connection = integrations.data?.items.find((item) => item.provider === provider.key);
          const connectionStatus = connection?.status ?? "DISCONNECTED";
          return <article className="integrationCard" key={provider.key}><div className="integrationHeader"><div><strong>{provider.name}</strong><span style={{ display: "block", color: "#7f91a7", fontSize: 10, marginTop: 4 }}>{provider.description}</span></div><span className={`connectionStatus ${statusClass(connectionStatus)}`}>{human(connectionStatus)}</span></div><div className="detailMeta"><span>Last sync: {connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : "Never"}</span>{connection?.lastError ? <span style={{ color: "#ff8997" }}>{connection.lastError}</span> : null}</div><div className="toolbar"><button className="ghost" onClick={() => void sync(provider.key)} disabled={busy === provider.key}>{busy === provider.key ? "Queuing…" : provider.key === "DATTO_RMM" ? "Sync now" : "Renew subscription"}</button></div></article>;
        })}
      </div></section>

      <section className="dashboardGrid"><article className="dashboardCard"><div className="cardHeader"><div><strong>Security posture</strong><span>Application-level safeguards</span></div></div><dl className="profileList"><div><dt>Production authentication</dt><dd>Microsoft Entra ID</dd></div><div><dt>Authorization</dt><dd>Capability-based RBAC</dd></div><div><dt>Audit trail</dt><dd>Database-backed events</dd></div><div><dt>Rate limiting</dt><dd>Enabled on API</dd></div><div><dt>Browser token storage</dt><dd>Session storage</dd></div></dl></article><article className="dashboardCard"><div className="cardHeader"><div><strong>Secrets and credentials</strong><span>Deployment policy</span></div></div><div style={{ padding: 16, color: "#93a3b7", fontSize: 11, lineHeight: 1.7 }}>Provider secrets are intentionally not editable from the CRM UI. Datto credentials, Graph application credentials, webhook secrets, and database credentials are injected into the deployment environment so they do not become ordinary CRM records or browser-accessible data.</div></article></section>
    </div>
  );
}
