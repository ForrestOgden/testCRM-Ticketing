"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "../../components/AuthProvider";
import { useApiResource } from "../../hooks/useApiResource";

type Integration = {
  id: string;
  provider: string;
  name: string;
  status: string;
  config?: Record<string, unknown> | null;
  secretState: { stored: boolean; keys: string[] };
  lastSyncAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
};

type IntegrationData = {
  items: Integration[];
  jobs: Array<{ queue: string; status: string; _count: number }>;
  server: {
    encryptionConfigured: boolean;
    publicApiUrl?: string | null;
    dattoWebhookUrl?: string | null;
    graphWebhookUrl?: string | null;
    supportTicketUrl?: string | null;
  };
  templates: { dattoHeaderName: string; dattoRaised: string; dattoResolved: string };
};

type ClientData = { items: Array<{ id: string; name: string }> };

function human(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "connected") return "connected";
  if (normalized === "error") return "error";
  if (normalized === "degraded") return "degraded";
  if (normalized === "connecting") return "connecting";
  return "disconnected";
}
function config(connection: Integration | undefined) { return connection?.config ?? {}; }
function checked(value: unknown, fallback = false) { return typeof value === "boolean" ? value : fallback; }
function stored(connection: Integration | undefined, key: string) { return connection?.secretState.keys.includes(key) ?? false; }

function secret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export default function SettingsPage() {
  const { request, user } = useAuth();
  const integrations = useApiResource<IntegrationData>("/integrations");
  const clients = useApiResource<ClientData>("/clients?pageSize=100");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dattoWebhookSecret, setDattoWebhookSecret] = useState("");

  const datto = integrations.data?.items.find((item) => item.provider === "DATTO_RMM");
  const graph = integrations.data?.items.find((item) => item.provider === "MICROSOFT_GRAPH");
  const dattoConfig = config(datto);
  const graphConfig = config(graph);
  const outstandingJobs = integrations.data?.jobs.reduce((sum, group) => sum + group._count, 0) ?? 0;

  async function action(key: string, work: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try { await work(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  }

  async function saveDatto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("datto-save", async () => {
      const secrets: Record<string, string> = {};
      const apiKey = String(form.get("apiKey") ?? "").trim();
      const apiSecret = String(form.get("apiSecret") ?? "").trim();
      const webhookSecret = String(form.get("webhookSecret") ?? "").trim();
      if (apiKey) secrets.apiKey = apiKey;
      if (apiSecret) secrets.apiSecret = apiSecret;
      if (webhookSecret) secrets.webhookSecret = webhookSecret;
      await request("/integrations/DATTO_RMM", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          config: {
            apiUrl: String(form.get("apiUrl") ?? "").trim(),
            webUrl: String(form.get("webUrl") ?? "").trim(),
            autoCreateClients: form.get("autoCreateClients") === "on",
            alertTicketingEnabled: form.get("alertTicketingEnabled") === "on",
            mapDattoPriority: form.get("mapDattoPriority") === "on",
            alertTicketPriority: String(form.get("alertTicketPriority") ?? "P2_HIGH"),
            autoResolveAlertTickets: form.get("autoResolveAlertTickets") === "on",
          },
          secrets,
        }),
      });
      setDattoWebhookSecret("");
      setMessage("Datto RMM configuration saved securely.");
      await integrations.refresh();
    });
  }

  async function saveGraph(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("graph-save", async () => {
      const clientSecret = String(form.get("clientSecret") ?? "").trim();
      await request("/integrations/MICROSOFT_GRAPH", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: true,
          config: {
            tenantId: String(form.get("tenantId") ?? "").trim(),
            clientId: String(form.get("clientId") ?? "").trim(),
            mailbox: String(form.get("mailbox") ?? "").trim().toLowerCase(),
            fallbackClientId: String(form.get("fallbackClientId") ?? "").trim(),
            webhookUrl: integrations.data?.server.graphWebhookUrl ?? "",
          },
          secrets: clientSecret ? { clientSecret } : {},
        }),
      });
      setMessage("Microsoft Graph support-mail configuration saved securely.");
      await integrations.refresh();
    });
  }

  async function test(provider: string) {
    await action(`${provider}-test`, async () => {
      const result = await request<{ detail?: Record<string, unknown> }>(`/integrations/${provider}/test`, { method: "POST" });
      setMessage(`${human(provider)} connection test succeeded${result.detail?.mailbox ? ` for ${result.detail.mailbox}` : ""}.`);
      await integrations.refresh();
    });
  }

  async function sync(provider: string) {
    await action(`${provider}-sync`, async () => {
      await request(`/integrations/${provider}/sync`, { method: "POST" });
      setMessage(provider === "DATTO_RMM" ? "Datto synchronization queued." : "Microsoft Graph subscription renewal queued.");
      await integrations.refresh();
    });
  }

  async function copy(value: string | null | undefined) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading">
        <div><div className="eyebrow">Administration</div><h1>Settings & Integrations</h1><p>Connect Datto RMM, route support email, and control how external events become CRM tickets.</p></div>
        <button className="ghost" onClick={() => void integrations.refresh()}>Refresh status</button>
      </section>

      {message ? <div className={/succeeded|saved|queued|copied/i.test(message) ? "inlineSuccess" : "inlineError"}>{message}</div> : null}
      {integrations.error ? <div className="inlineError">{integrations.error}</div> : null}
      {integrations.data && !integrations.data.server.encryptionConfigured ? <div className="inlineError"><strong>Secret storage is not enabled.</strong> Configure a 32-byte <code>APP_ENCRYPTION_KEY</code> on the application server before saving API keys or client secrets.</div> : null}
      {integrations.data && !integrations.data.server.publicApiUrl ? <div className="inlineError"><strong>Public API URL is not configured.</strong> Set <code>PUBLIC_API_URL</code> so Datto and Microsoft Graph receive the correct webhook destination.</div> : null}

      <section className="summaryStrip">
        <div><span>Signed in as</span><strong style={{ fontSize: 13 }}>{user?.displayName || "—"}</strong></div>
        <div><span>Datto RMM</span><strong style={{ fontSize: 13 }}>{human(datto?.status ?? "DISCONNECTED")}</strong></div>
        <div><span>Support email</span><strong style={{ fontSize: 13 }}>{String(graphConfig.mailbox ?? "Not configured")}</strong></div>
        <div><span>Integration jobs</span><strong>{outstandingJobs}</strong></div>
      </section>

      <section className="dashboardCard">
        <div className="cardHeader"><div><strong>Ticket intake architecture</strong><span>Three supported paths, one ticket queue</span></div></div>
        <div className="attentionGrid" style={{ padding: 14 }}>
          <div className="attentionItem alertAttention"><span>DATTO ALERTS</span><strong>Global Webhook → CRM ticket</strong><small>Monitoring alerts are linked to the Datto device and can auto-resolve when Datto resolves the alert.</small></div>
          <div className="attentionItem ticketAttention"><span>SUPPORT EMAIL</span><strong>Microsoft 365 mailbox → CRM ticket</strong><small>New mail creates or threads a ticket; technician replies are sent back from the configured support mailbox.</small></div>
          <div className="attentionItem taskAttention"><span>END-USER REQUESTS</span><strong>MSP CRM Support Launcher → CRM ticket</strong><small>Use our endpoint launcher for manual requests. Datto's native Agent Tickets form is tied to supported PSA integrations such as Autotask/ConnectWise.</small></div>
        </div>
      </section>

      <form className="dashboardCard" key={`datto-${datto?.updatedAt ?? "new"}`} onSubmit={saveDatto}>
        <div className="cardHeader">
          <div><strong>Datto RMM</strong><span>API inventory sync + real-time Global Webhook alert ticketing</span></div>
          <span className={`connectionStatus ${statusClass(datto?.status ?? "DISCONNECTED")}`}>{human(datto?.status ?? "DISCONNECTED")}</span>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 18 }}>
          {datto?.lastError ? <div className="inlineError">{datto.lastError}</div> : null}
          <div className="formGrid">
            <div className="formField full"><label>Datto API URL</label><input name="apiUrl" required placeholder="https://merlot-api.centrastage.net" defaultValue={String(dattoConfig.apiUrl ?? "")} /><small>Use the API URL shown on the Datto RMM user after API keys are generated.</small></div>
            <div className="formField"><label>API Key {stored(datto, "apiKey") ? "· stored" : ""}</label><input name="apiKey" type="password" autoComplete="off" placeholder={stored(datto, "apiKey") ? "Leave blank to keep stored key" : "Required"} /></div>
            <div className="formField"><label>API Secret {stored(datto, "apiSecret") ? "· stored" : ""}</label><input name="apiSecret" type="password" autoComplete="off" placeholder={stored(datto, "apiSecret") ? "Leave blank to keep stored secret" : "Required"} /></div>
            <div className="formField full"><label>Datto web console URL (optional)</label><input name="webUrl" placeholder="https://merlot.rmm.datto.com" defaultValue={String(dattoConfig.webUrl ?? "")} /></div>
          </div>

          <div className="formGrid">
            <label className="formField full" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input name="autoCreateClients" type="checkbox" defaultChecked={checked(dattoConfig.autoCreateClients)} style={{ width: 16 }} /><span>Auto-create CRM clients for unmatched Datto sites</span></label>
            <label className="formField full" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input name="alertTicketingEnabled" type="checkbox" defaultChecked={checked(dattoConfig.alertTicketingEnabled, true)} style={{ width: 16 }} /><span>Create CRM tickets from Datto Global Webhook alerts</span></label>
            <label className="formField full" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input name="mapDattoPriority" type="checkbox" defaultChecked={checked(dattoConfig.mapDattoPriority, true)} style={{ width: 16 }} /><span>Map Datto alert priority to CRM priority automatically</span></label>
            <div className="formField"><label>Fallback CRM alert priority</label><select name="alertTicketPriority" defaultValue={String(dattoConfig.alertTicketPriority ?? "P2_HIGH")}><option value="P1_CRITICAL">P1 Critical</option><option value="P2_HIGH">P2 High</option><option value="P3_NORMAL">P3 Normal</option><option value="P4_LOW">P4 Low</option></select></div>
            <label className="formField" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}><input name="autoResolveAlertTickets" type="checkbox" defaultChecked={checked(dattoConfig.autoResolveAlertTickets, true)} style={{ width: 16 }} /><span>Auto-resolve linked ticket when alert resolves</span></label>
          </div>

          <div className="dashboardCard" style={{ boxShadow: "none" }}>
            <div className="cardHeader"><div><strong>Global Webhook setup</strong><span>Datto RMM → Setup → Integrations → Global Webhooks</span></div></div>
            <div style={{ padding: 14, display: "grid", gap: 12 }}>
              <div className="formField"><label>Destination URL</label><div style={{ display: "flex", gap: 8 }}><input readOnly value={integrations.data?.server.dattoWebhookUrl ?? "Configure PUBLIC_API_URL first"} /><button type="button" className="ghost" onClick={() => void copy(integrations.data?.server.dattoWebhookUrl)}>Copy</button></div></div>
              <div className="formField"><label>Custom header name</label><div style={{ display: "flex", gap: 8 }}><input readOnly value={integrations.data?.templates.dattoHeaderName ?? "x-webhook-secret"} /><button type="button" className="ghost" onClick={() => void copy(integrations.data?.templates.dattoHeaderName)}>Copy</button></div></div>
              <div className="formField"><label>Webhook secret {stored(datto, "webhookSecret") ? "· stored" : ""}</label><div style={{ display: "flex", gap: 8 }}><input name="webhookSecret" type="password" autoComplete="off" value={dattoWebhookSecret} onChange={(event) => setDattoWebhookSecret(event.target.value)} placeholder={stored(datto, "webhookSecret") ? "Stored — generate to rotate" : "Generate a strong secret"} /><button type="button" className="ghost" onClick={() => setDattoWebhookSecret(secret())}>Generate</button><button type="button" className="ghost" onClick={() => void copy(dattoWebhookSecret)} disabled={!dattoWebhookSecret}>Copy</button></div></div>
              <div className="formField"><label>Alert Raised JSON payload</label><textarea readOnly rows={10} value={integrations.data?.templates.dattoRaised ?? ""} /><button type="button" className="ghost" onClick={() => void copy(integrations.data?.templates.dattoRaised)}>Copy payload</button></div>
              <div className="formField"><label>Alert Resolved JSON payload</label><textarea readOnly rows={10} value={integrations.data?.templates.dattoResolved ?? ""} /><button type="button" className="ghost" onClick={() => void copy(integrations.data?.templates.dattoResolved)}>Copy payload</button></div>
              <small className="muted">In Datto choose <strong>application/json</strong>, add the custom header above, enable the resolved webhook, paste the two payloads, then use Datto's Test Alert webhook buttons.</small>
            </div>
          </div>

          <div className="toolbar"><button className="primary" disabled={busy === "datto-save" || !integrations.data?.server.encryptionConfigured}>{busy === "datto-save" ? "Saving…" : "Save Datto settings"}</button><button type="button" className="ghost" onClick={() => void test("DATTO_RMM")} disabled={busy === "DATTO_RMM-test"}>{busy === "DATTO_RMM-test" ? "Testing…" : "Test connection"}</button><button type="button" className="ghost" onClick={() => void sync("DATTO_RMM")} disabled={busy === "DATTO_RMM-sync"}>{busy === "DATTO_RMM-sync" ? "Queuing…" : "Sync now"}</button></div>
        </div>
      </form>

      <form className="dashboardCard" key={`graph-${graph?.updatedAt ?? "new"}`} onSubmit={saveGraph}>
        <div className="cardHeader"><div><strong>Microsoft 365 Support Mailbox</strong><span>Microsoft Graph inbound email + technician replies</span></div><span className={`connectionStatus ${statusClass(graph?.status ?? "DISCONNECTED")}`}>{human(graph?.status ?? "DISCONNECTED")}</span></div>
        <div style={{ padding: 16, display: "grid", gap: 18 }}>
          {graph?.lastError ? <div className="inlineError">{graph.lastError}</div> : null}
          <div className="formGrid">
            <div className="formField"><label>Microsoft Entra tenant ID</label><input name="tenantId" required defaultValue={String(graphConfig.tenantId ?? "")} /></div>
            <div className="formField"><label>App registration client ID</label><input name="clientId" required defaultValue={String(graphConfig.clientId ?? "")} /></div>
            <div className="formField"><label>Client secret {stored(graph, "clientSecret") ? "· stored" : ""}</label><input name="clientSecret" type="password" autoComplete="off" placeholder={stored(graph, "clientSecret") ? "Leave blank to keep stored secret" : "Required"} /></div>
            <div className="formField"><label>Support mailbox</label><input name="mailbox" type="email" required placeholder="support@yourcompany.com" defaultValue={String(graphConfig.mailbox ?? "")} /></div>
            <div className="formField full"><label>Unmatched sender fallback client (optional)</label><select name="fallbackClientId" defaultValue={String(graphConfig.fallbackClientId ?? "")}><option value="">Reject unmatched senders until mapped</option>{clients.data?.items.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><small>Known contacts are matched by email. Unknown senders can optionally route into one catch-all client.</small></div>
            <div className="formField full"><label>Graph notification URL</label><div style={{ display: "flex", gap: 8 }}><input readOnly value={integrations.data?.server.graphWebhookUrl ?? "Configure PUBLIC_API_URL first"} /><button type="button" className="ghost" onClick={() => void copy(integrations.data?.server.graphWebhookUrl)}>Copy</button></div></div>
          </div>

          <div className="attentionGrid">
            <div className="attentionItem ticketAttention"><span>APP PERMISSION</span><strong>Mail.Read</strong><small>Required for app-only access and change notifications on the support/shared mailbox.</small></div>
            <div className="attentionItem ticketAttention"><span>APP PERMISSION</span><strong>Mail.Send</strong><small>Required so technician replies can be sent from the configured support mailbox. Grant admin consent.</small></div>
            <div className="attentionItem taskAttention"><span>AUTOMATIC</span><strong>Webhook subscription renewal</strong><small>The worker creates and renews the Inbox subscription; the clientState verifier is generated and encrypted by the server.</small></div>
          </div>

          <div className="toolbar"><button className="primary" disabled={busy === "graph-save" || !integrations.data?.server.encryptionConfigured}>{busy === "graph-save" ? "Saving…" : "Save mail settings"}</button><button type="button" className="ghost" onClick={() => void test("MICROSOFT_GRAPH")} disabled={busy === "MICROSOFT_GRAPH-test"}>{busy === "MICROSOFT_GRAPH-test" ? "Testing…" : "Test mailbox"}</button><button type="button" className="ghost" onClick={() => void sync("MICROSOFT_GRAPH")} disabled={busy === "MICROSOFT_GRAPH-sync"}>{busy === "MICROSOFT_GRAPH-sync" ? "Queuing…" : "Renew subscription"}</button></div>
        </div>
      </form>

      <section className="dashboardGrid">
        <article className="dashboardCard"><div className="cardHeader"><div><strong>Datto native ticketing</strong><span>Important compatibility boundary</span></div></div><div style={{ padding: 16, color: "#93a3b7", fontSize: 11, lineHeight: 1.7 }}>Datto's Agent/Agent Browser support-request form is PSA-integrated functionality. This CRM does not impersonate Autotask. Deploy the MSP CRM Support Launcher to endpoints for manual requests; Datto monitoring alerts still arrive directly through Global Webhooks.</div></article>
        <article className="dashboardCard"><div className="cardHeader"><div><strong>Support Launcher intake</strong><span>Device-bound ticket creation</span></div></div><dl className="profileList"><div><dt>Ticket endpoint</dt><dd>{integrations.data?.server.supportTicketUrl ?? "Not configured"}</dd></div><div><dt>Device identity</dt><dd>Scoped enrollment token</dd></div><div><dt>Ticket linkage</dt><dd>Client + endpoint automatically</dd></div><div><dt>Credential storage</dt><dd>Token hash only</dd></div></dl></article>
      </section>

      <section className="dashboardCard"><div className="cardHeader"><div><strong>Credential security</strong><span>Secrets are never returned to the browser after saving</span></div></div><div style={{ padding: 16, color: "#93a3b7", fontSize: 11, lineHeight: 1.7 }}>Datto API credentials, webhook secrets, and Microsoft Graph client secrets are encrypted at rest with AES-256-GCM using the server's <code>APP_ENCRYPTION_KEY</code>. The database stores ciphertext; the UI receives only whether each secret exists. Environment variables remain available as a bootstrap/fallback path.</div></section>
    </div>
  );
}
