import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  decryptSecretMap,
  encryptSecretMap,
  ExternalProvider,
  IntegrationStatus,
  JobStatus,
  secretStorageConfigured,
} from "@msp-crm/database";
import { DatabaseService } from "../../common/database.module";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { toJsonValue } from "../../common/json";
import type { UpdateIntegrationDto } from "./integrations.dto";

type JsonObject = Record<string, unknown>;

const configKeys: Record<ExternalProvider, readonly string[]> = {
  [ExternalProvider.DATTO_RMM]: [
    "apiUrl", "webUrl", "autoCreateClients", "alertTicketingEnabled",
    "mapDattoPriority", "alertTicketPriority", "autoResolveAlertTickets",
  ],
  [ExternalProvider.MICROSOFT_GRAPH]: ["tenantId", "clientId", "mailbox", "fallbackClientId", "webhookUrl"],
  [ExternalProvider.AUTOTASK]: [],
};

const secretKeys: Record<ExternalProvider, readonly string[]> = {
  [ExternalProvider.DATTO_RMM]: ["apiKey", "apiSecret", "webhookSecret"],
  [ExternalProvider.MICROSOFT_GRAPH]: ["clientSecret", "webhookClientState"],
  [ExternalProvider.AUTOTASK]: [],
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function providerFromParam(value: string) {
  const normalized = value.trim().toUpperCase().replaceAll("-", "_");
  if (!Object.values(ExternalProvider).includes(normalized as ExternalProvider)) {
    throw new BadRequestException("Unsupported integration provider.");
  }
  return normalized as ExternalProvider;
}

function cleanConfig(provider: ExternalProvider, input: unknown) {
  const source = object(input);
  const allowed = new Set(configKeys[provider]);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
}

function cleanSecrets(provider: ExternalProvider, input: unknown) {
  const source = object(input);
  const allowed = new Set(secretKeys[provider]);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, value]) => allowed.has(key) && typeof value === "string" && value.trim())
      .map(([key, value]) => [key, String(value).trim()])
  );
}

function defaultName(provider: ExternalProvider) {
  if (provider === ExternalProvider.DATTO_RMM) return "Datto RMM";
  if (provider === ExternalProvider.MICROSOFT_GRAPH) return "Microsoft Graph";
  return "Autotask";
}

function publicApiUrl() {
  const explicit = process.env.PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env.APP_DOMAIN?.trim();
  if (domain && domain !== "crm.example.com") return `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`;
  return null;
}

function template(eventType: "alert.raised" | "alert.resolved") {
  return JSON.stringify({
    eventType,
    alertUid: "[alert_uid]",
    alertType: "[alert_type]",
    alertCategory: "[alert_category]",
    alertPriority: "[alert_priority]",
    alertMessage: "[alert_message_en]",
    trigger: "[alert]",
    deviceUid: "[device_uid]",
    deviceId: "[device_id]",
    hostname: "[device_hostname]",
    deviceOs: "[device_os]",
    deviceDescription: "[device_description]",
    externalIp: "[device_ip]",
    lastUser: "[last_user]",
    siteUid: "[site_uid]",
    siteId: "[site_id]",
    siteName: "[site_name]",
    platform: "[platform]",
  }, null, 2);
}

async function tokenRequest(url: string, body: URLSearchParams, authorization?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Authentication failed (${response.status}).`);
  let parsed: { access_token?: string };
  try { parsed = JSON.parse(text) as { access_token?: string }; }
  catch { throw new Error("Authentication response was not valid JSON."); }
  if (!parsed.access_token) throw new Error("Authentication response did not contain an access token.");
  return parsed.access_token;
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const rows = await this.database.prisma.integrationConnection.findMany({ orderBy: [{ provider: "asc" }, { name: "asc" }] });
    const jobs = await this.database.prisma.backgroundJob.groupBy({
      by: ["queue", "status"],
      where: { status: { in: [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.FAILED, JobStatus.DEAD] } },
      _count: true,
    });
    const api = publicApiUrl();
    return {
      items: rows.map((row) => {
        const { encryptedSecret, ...safe } = row;
        let keys: string[] = [];
        if (encryptedSecret && secretStorageConfigured()) {
          try { keys = Object.keys(decryptSecretMap(encryptedSecret)); } catch { keys = []; }
        }
        return { ...safe, secretState: { stored: Boolean(encryptedSecret), keys } };
      }),
      jobs,
      server: {
        encryptionConfigured: secretStorageConfigured(),
        publicApiUrl: api,
        dattoWebhookUrl: api ? `${api}/webhooks/datto` : null,
        graphWebhookUrl: api ? `${api}/webhooks/microsoft/graph` : null,
        supportTicketUrl: api ? `${api}/support/endpoint/tickets` : null,
      },
      templates: {
        dattoHeaderName: "x-webhook-secret",
        dattoRaised: template("alert.raised"),
        dattoResolved: template("alert.resolved"),
      },
    };
  }

  async upsert(providerParam: string, dto: UpdateIntegrationDto, actor: AuthenticatedUser) {
    const provider = providerFromParam(providerParam);
    if (provider === ExternalProvider.AUTOTASK) throw new BadRequestException("Autotask is a migration source only; configure Datto RMM and Microsoft Graph for the replacement CRM.");
    const name = dto.name?.trim() || defaultName(provider);
    const previous = await this.database.prisma.integrationConnection.findUnique({ where: { provider_name: { provider, name } } });
    const mergedConfig = { ...object(previous?.config), ...cleanConfig(provider, dto.config) };
    const requestedSecrets = cleanSecrets(provider, dto.secrets);
    const clearKeys = (dto.clearSecretKeys ?? []).filter((key) => secretKeys[provider].includes(key));
    const secretMutationRequested = Object.keys(requestedSecrets).length > 0 || clearKeys.length > 0 || (!previous && provider === ExternalProvider.MICROSOFT_GRAPH);
    let encryptedSecret = previous?.encryptedSecret ?? null;

    if (secretMutationRequested) {
      if (!secretStorageConfigured()) throw new BadRequestException("APP_ENCRYPTION_KEY must be configured before integration secrets can be saved.");
      const secrets = previous?.encryptedSecret ? decryptSecretMap(previous.encryptedSecret) : {};
      for (const key of clearKeys) delete secrets[key];
      Object.assign(secrets, requestedSecrets);
      if (provider === ExternalProvider.MICROSOFT_GRAPH && dto.enabled !== false && !secrets.webhookClientState) {
        secrets.webhookClientState = randomBytes(32).toString("base64url");
      }
      encryptedSecret = Object.keys(secrets).length ? encryptSecretMap(secrets) : null;
    }

    const status = dto.enabled === false ? IntegrationStatus.DISCONNECTED : previous?.status === IntegrationStatus.CONNECTED ? IntegrationStatus.CONNECTED : IntegrationStatus.CONNECTING;
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.integrationConnection.upsert({
        where: { provider_name: { provider, name } },
        create: { provider, name, status, config: mergedConfig as never, encryptedSecret },
        update: { status, config: mergedConfig as never, encryptedSecret },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: previous ? "integration.updated" : "integration.created",
          objectType: "IntegrationConnection",
          objectId: updated.id,
          oldValue: previous ? toJsonValue({ ...previous, encryptedSecret: previous.encryptedSecret ? "[encrypted]" : null }) as never : undefined,
          newValue: toJsonValue({ ...updated, encryptedSecret: updated.encryptedSecret ? "[encrypted]" : null }) as never,
        },
      });
      const { encryptedSecret: _secret, ...safe } = updated;
      return { ...safe, secretState: { stored: Boolean(encryptedSecret), keys: encryptedSecret && secretStorageConfigured() ? Object.keys(decryptSecretMap(encryptedSecret)) : [] } };
    });
  }

  async trigger(providerParam: string, actor: AuthenticatedUser) {
    const provider = providerFromParam(providerParam);
    let jobName: string;
    if (provider === ExternalProvider.DATTO_RMM) jobName = "datto.sync";
    else if (provider === ExternalProvider.MICROSOFT_GRAPH) jobName = "graph.subscription";
    else throw new BadRequestException("Manual sync is not implemented for this provider.");

    const connection = await this.database.prisma.integrationConnection.findFirst({ where: { provider, status: { not: IntegrationStatus.DISCONNECTED } } });
    if (!connection) throw new BadRequestException("Configure and enable this integration before starting it.");
    const existing = await this.database.prisma.backgroundJob.findFirst({ where: { name: jobName, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } } });
    if (existing) return existing;
    return this.database.prisma.$transaction(async (tx) => {
      const created = await tx.backgroundJob.create({ data: { queue: "integrations", name: jobName, payload: {}, runAfter: new Date() } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "integration.sync_requested", objectType: "BackgroundJob", objectId: created.id, newValue: { provider, jobName } } });
      return created;
    });
  }

  async test(providerParam: string, actor: AuthenticatedUser) {
    const provider = providerFromParam(providerParam);
    const runtime = await this.runtime(provider);
    if (!runtime.connection) throw new NotFoundException("Integration connection not found.");
    try {
      let detail: JsonObject;
      if (provider === ExternalProvider.DATTO_RMM) detail = await this.testDatto(runtime.config, runtime.secrets);
      else if (provider === ExternalProvider.MICROSOFT_GRAPH) detail = await this.testGraph(runtime.config, runtime.secrets);
      else throw new BadRequestException("Connection testing is not implemented for this provider.");
      await this.database.prisma.$transaction(async (tx) => {
        await tx.integrationConnection.update({ where: { id: runtime.connection!.id }, data: { status: IntegrationStatus.CONNECTED, lastError: null } });
        await tx.auditEvent.create({ data: { actorId: actor.id, action: "integration.connection_test_succeeded", objectType: "IntegrationConnection", objectId: runtime.connection!.id, newValue: { provider } } });
      });
      return { ok: true, provider, detail };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.database.prisma.integrationConnection.update({ where: { id: runtime.connection.id }, data: { status: IntegrationStatus.ERROR, lastError: message.slice(0, 1000) } });
      throw new BadRequestException(message);
    }
  }

  async get(providerParam: string, name: string) {
    const provider = providerFromParam(providerParam);
    const row = await this.database.prisma.integrationConnection.findUnique({ where: { provider_name: { provider, name } } });
    if (!row) throw new NotFoundException("Integration connection not found.");
    const { encryptedSecret, ...safe } = row;
    return { ...safe, secretState: { stored: Boolean(encryptedSecret), keys: encryptedSecret && secretStorageConfigured() ? Object.keys(decryptSecretMap(encryptedSecret)) : [] } };
  }

  async runtime(providerInput: ExternalProvider | string) {
    const provider = typeof providerInput === "string" ? providerFromParam(providerInput) : providerInput;
    const connection = await this.database.prisma.integrationConnection.findFirst({ where: { provider }, orderBy: { updatedAt: "desc" } });
    if (!connection) return { connection: null, config: {}, secrets: {} as Record<string, string> };
    let secrets: Record<string, string> = {};
    if (connection.encryptedSecret) {
      if (!secretStorageConfigured()) throw new Error("APP_ENCRYPTION_KEY is required to read stored integration credentials.");
      secrets = decryptSecretMap(connection.encryptedSecret);
    }
    return { connection, config: object(connection.config), secrets };
  }

  private async testDatto(config: JsonObject, secrets: Record<string, string>) {
    const apiUrl = String(config.apiUrl ?? process.env.DATTO_API_URL ?? "").trim().replace(/\/$/, "");
    const apiKey = secrets.apiKey ?? process.env.DATTO_API_KEY?.trim();
    const apiSecret = secrets.apiSecret ?? process.env.DATTO_API_SECRET?.trim();
    if (!apiUrl || !apiKey || !apiSecret) throw new Error("Datto API URL, API Key, and API Secret are required.");
    const basic = Buffer.from("public-client:public").toString("base64");
    const token = await tokenRequest(`${apiUrl}/auth/oauth/token`, new URLSearchParams({ grant_type: "password", username: apiKey, password: apiSecret }), `Basic ${basic}`);
    const response = await fetch(`${apiUrl}/api/v2/account`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Datto account request failed (${response.status}).`);
    const data = object(await response.json());
    return { accountName: data.name ?? data.accountName ?? "Authenticated", apiUrl };
  }

  private async testGraph(config: JsonObject, secrets: Record<string, string>) {
    const tenantId = String(config.tenantId ?? process.env.GRAPH_TENANT_ID ?? process.env.ENTRA_TENANT_ID ?? "").trim();
    const clientId = String(config.clientId ?? process.env.GRAPH_CLIENT_ID ?? "").trim();
    const mailbox = String(config.mailbox ?? process.env.GRAPH_SUPPORT_MAILBOX ?? "").trim();
    const clientSecret = secrets.clientSecret ?? process.env.GRAPH_CLIENT_SECRET?.trim();
    if (!tenantId || !clientId || !clientSecret || !mailbox) throw new Error("Microsoft tenant ID, app client ID, client secret, and support mailbox are required.");
    const token = await tokenRequest(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }));
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=id,displayName,totalItemCount,unreadItemCount`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Microsoft Graph mailbox request failed (${response.status}). Verify application Mail.Read permission and admin consent.`);
    const data = object(await response.json());
    return { mailbox, folder: data.displayName ?? "Inbox", totalItemCount: data.totalItemCount ?? null, unreadItemCount: data.unreadItemCount ?? null };
  }
}
