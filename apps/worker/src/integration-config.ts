import {
  createDatabaseClient,
  decryptSecretMap,
  ExternalProvider,
  IntegrationStatus,
  secretStorageConfigured,
} from "@msp-crm/database";
import { log } from "./log.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function set(name: string, value: unknown) {
  const normalized = text(value);
  if (normalized !== undefined) process.env[name] = normalized;
}

function sync(name: string, value: unknown) {
  const normalized = text(value);
  if (normalized === undefined) delete process.env[name];
  else process.env[name] = normalized;
}

function unset(...names: string[]) {
  for (const name of names) delete process.env[name];
}

export async function hydrateIntegrationEnvironment() {
  const database = createDatabaseClient();
  try {
    const rows = await database.integrationConnection.findMany({
      where: { provider: { in: [ExternalProvider.DATTO_RMM, ExternalProvider.MICROSOFT_GRAPH] } },
      orderBy: { updatedAt: "desc" },
    });

    for (const provider of [ExternalProvider.DATTO_RMM, ExternalProvider.MICROSOFT_GRAPH] as const) {
      const row = rows.find((item) => item.provider === provider);
      if (!row) continue;
      if (row.status === IntegrationStatus.DISCONNECTED) {
        if (provider === ExternalProvider.DATTO_RMM) unset("DATTO_API_URL", "DATTO_API_KEY", "DATTO_API_SECRET", "DATTO_WEBHOOK_SECRET", "DATTO_WEB_URL", "DATTO_AUTO_CREATE_CLIENTS", "DATTO_DEFAULT_QUEUE_ID");
        else unset("GRAPH_TENANT_ID", "ENTRA_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SUPPORT_MAILBOX", "GRAPH_UNMATCHED_CLIENT_ID", "GRAPH_WEBHOOK_URL", "GRAPH_WEBHOOK_CLIENT_STATE", "GRAPH_DEFAULT_QUEUE_ID", "GRAPH_ACK_ENABLED", "GRAPH_ACK_SUBJECT", "GRAPH_ACK_BODY");
        continue;
      }

      const config = object(row.config);
      let secrets: Record<string, string> = {};
      if (row.encryptedSecret) {
        if (!secretStorageConfigured()) throw new Error("APP_ENCRYPTION_KEY is required to load stored integration credentials.");
        secrets = decryptSecretMap(row.encryptedSecret);
      }

      if (provider === ExternalProvider.DATTO_RMM) {
        set("DATTO_API_URL", config.apiUrl);
        set("DATTO_WEB_URL", config.webUrl);
        set("DATTO_AUTO_CREATE_CLIENTS", config.autoCreateClients === true ? "true" : "false");
        sync("DATTO_DEFAULT_QUEUE_ID", config.defaultQueueId);
        set("DATTO_API_KEY", secrets.apiKey);
        set("DATTO_API_SECRET", secrets.apiSecret);
        set("DATTO_WEBHOOK_SECRET", secrets.webhookSecret);
      } else {
        set("GRAPH_TENANT_ID", config.tenantId);
        set("ENTRA_TENANT_ID", config.tenantId);
        set("GRAPH_CLIENT_ID", config.clientId);
        set("GRAPH_SUPPORT_MAILBOX", config.mailbox);
        set("GRAPH_UNMATCHED_CLIENT_ID", config.fallbackClientId);
        set("GRAPH_WEBHOOK_URL", config.webhookUrl);
        sync("GRAPH_DEFAULT_QUEUE_ID", config.defaultQueueId);
        sync("GRAPH_ACK_ENABLED", config.acknowledgementEnabled === true ? "true" : "false");
        sync("GRAPH_ACK_SUBJECT", config.ackSubject);
        sync("GRAPH_ACK_BODY", config.ackBody);
        set("GRAPH_CLIENT_SECRET", secrets.clientSecret);
        set("GRAPH_WEBHOOK_CLIENT_STATE", secrets.webhookClientState);
      }
    }
  } finally {
    await database.$disconnect();
  }
}

export function startIntegrationEnvironmentRefresh(intervalMs = 30_000) {
  const timer = setInterval(() => {
    void hydrateIntegrationEnvironment().catch((error) => {
      log("error", "Failed to refresh integration configuration", { error: error instanceof Error ? error.message : String(error) });
    });
  }, intervalMs);
  timer.unref();
  return timer;
}
