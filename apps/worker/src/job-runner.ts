import {
  createDatabaseClient,
  ExternalProvider,
  JobStatus,
  TicketEntryKind,
  TicketPriority,
  type DatabaseClient,
} from "@msp-crm/database";
import { workerConfig } from "./config.js";
import { domainFromAddress, extractTicketNumber, headerValue, htmlToText, normalizeAddress, stripQuotedText } from "./email-threading.js";
import { errorMessage, log } from "./log.js";
import { DattoRmmClient, dattoValue } from "./providers/datto.js";
import { GraphClient, type GraphMessage } from "./providers/graph.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim() || undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|online|yes|1)$/i.test(value);
  return undefined;
}

function dateValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "client";
}

function hasEnv(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

async function scheduleJob(database: DatabaseClient, name: string, payload: JsonObject, runAfter = new Date(), queue = "default") {
  const existing = await database.backgroundJob.findFirst({
    where: { name, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
    select: { id: true },
  });
  if (existing) return existing;
  return database.backgroundJob.create({ data: { queue, name, payload: payload as never, runAfter } });
}

async function syncDatto(database: DatabaseClient) {
  const datto = new DattoRmmClient();
  const now = new Date();
  const autoCreate = process.env.DATTO_AUTO_CREATE_CLIENTS === "true";
  const sites = await datto.listSites();
  let linkedSites = 0;

  for (const source of sites) {
    const remoteUid = stringValue(dattoValue(source, "uid", "siteUid"));
    const name = stringValue(dattoValue(source, "name", "siteName"));
    if (!remoteUid || !name) continue;

    let client = await database.client.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, archivedAt: null },
      select: { id: true },
    });
    if (!client && autoCreate) {
      const slugBase = slugify(name);
      let slug = slugBase;
      let counter = 1;
      while (await database.client.findUnique({ where: { slug }, select: { id: true } })) slug = `${slugBase}-${++counter}`;
      client = await database.client.create({
        data: { slug, name, lifecycleStatus: "ACTIVE", clientSince: now, relationshipHealth: 80 },
        select: { id: true },
      });
      log("info", "Created CRM client from unmatched Datto site", { remoteUid, name, clientId: client.id });
    }
    if (!client) {
      log("warn", "Datto site has no matching CRM client", { remoteUid, name });
      continue;
    }

    await database.rmmSite.upsert({
      where: { provider_remoteUid: { provider: ExternalProvider.DATTO_RMM, remoteUid } },
      create: { clientId: client.id, provider: ExternalProvider.DATTO_RMM, remoteUid, name, lastSyncedAt: now, syncStatus: "ok" },
      update: { clientId: client.id, name, lastSyncedAt: now, syncStatus: "ok", syncError: null },
    });
    linkedSites++;
  }

  const devices = await datto.listDevices();
  let syncedDevices = 0;
  for (const source of devices) {
    const remoteUid = stringValue(dattoValue(source, "uid", "deviceUid"));
    const siteUid = stringValue(dattoValue(source, "siteUid", "siteId"));
    const hostname = stringValue(dattoValue(source, "hostname", "name", "description"));
    if (!remoteUid || !siteUid || !hostname) continue;
    const rmmSite = await database.rmmSite.findUnique({
      where: { provider_remoteUid: { provider: ExternalProvider.DATTO_RMM, remoteUid: siteUid } },
      select: { id: true, clientId: true },
    });
    if (!rmmSite) continue;

    const mapping = await database.externalRecordMapping.findUnique({
      where: { provider_entityType_remoteUid: { provider: ExternalProvider.DATTO_RMM, entityType: "Device", remoteUid } },
      select: { deviceId: true },
    });
    const data = {
      clientId: rmmSite.clientId,
      rmmSiteId: rmmSite.id,
      hostname,
      description: stringValue(dattoValue(source, "description")),
      deviceClass: stringValue(dattoValue(source, "deviceClass", "type")),
      manufacturer: stringValue(dattoValue(source, "manufacturer")),
      model: stringValue(dattoValue(source, "model")),
      serialNumber: stringValue(dattoValue(source, "serialNumber")),
      operatingSystem: stringValue(dattoValue(source, "operatingSystem", "os")),
      osVersion: stringValue(dattoValue(source, "osVersion")),
      lastLoggedInUser: stringValue(dattoValue(source, "lastLoggedInUser", "lastUser")),
      internalIp: stringValue(dattoValue(source, "intIpAddress", "internalIp", "ipAddress")),
      externalIp: stringValue(dattoValue(source, "extIpAddress", "externalIp")),
      macAddress: stringValue(dattoValue(source, "macAddress")),
      lastSeenAt: dateValue(dattoValue(source, "lastSeen", "lastSeenAt")),
      isOnline: booleanValue(dattoValue(source, "online", "isOnline")),
      rmmUrl: process.env.DATTO_WEB_URL ? `${process.env.DATTO_WEB_URL.replace(/\/$/, "")}/device/${remoteUid}` : undefined,
      lastSyncedAt: now,
      syncStatus: "ok",
      syncError: null,
    };

    let deviceId = mapping?.deviceId ?? undefined;
    if (deviceId) {
      const updated = await database.device.update({ where: { id: deviceId }, data, select: { id: true } });
      deviceId = updated.id;
    } else {
      const created = await database.device.create({ data, select: { id: true } });
      deviceId = created.id;
      await database.externalRecordMapping.create({
        data: { provider: ExternalProvider.DATTO_RMM, entityType: "Device", entityId: deviceId, deviceId, remoteUid, lastSyncedAt: now },
      });
    }
    await database.externalRecordMapping.update({
      where: { provider_entityType_remoteUid: { provider: ExternalProvider.DATTO_RMM, entityType: "Device", remoteUid } },
      data: { entityId: deviceId, deviceId, lastSyncedAt: now, syncError: null },
    });
    syncedDevices++;
  }

  const alerts = await datto.listOpenAlerts();
  const counts = new Map<string, number>();
  let syncedAlerts = 0;
  for (const source of alerts) {
    const remoteUid = stringValue(dattoValue(source, "alertUid", "uid"));
    const deviceUid = stringValue(dattoValue(source, "deviceUid"));
    if (!remoteUid || !deviceUid) continue;
    const mapping = await database.externalRecordMapping.findUnique({
      where: { provider_entityType_remoteUid: { provider: ExternalProvider.DATTO_RMM, entityType: "Device", remoteUid: deviceUid } },
      select: { deviceId: true },
    });
    if (!mapping?.deviceId) continue;
    counts.set(mapping.deviceId, (counts.get(mapping.deviceId) ?? 0) + 1);
    await database.rmmAlert.upsert({
      where: { provider_remoteUid: { provider: ExternalProvider.DATTO_RMM, remoteUid } },
      create: {
        deviceId: mapping.deviceId,
        provider: ExternalProvider.DATTO_RMM,
        remoteUid,
        alertType: stringValue(dattoValue(source, "alertType", "type")),
        category: stringValue(dattoValue(source, "category")),
        message: stringValue(dattoValue(source, "message", "alertMessage")),
        priority: stringValue(dattoValue(source, "priority", "severity")),
        raisedAt: dateValue(dattoValue(source, "timestamp", "raisedAt")),
        isOpen: true,
        rawPayload: source as never,
      },
      update: {
        deviceId: mapping.deviceId,
        alertType: stringValue(dattoValue(source, "alertType", "type")),
        category: stringValue(dattoValue(source, "category")),
        message: stringValue(dattoValue(source, "message", "alertMessage")),
        priority: stringValue(dattoValue(source, "priority", "severity")),
        raisedAt: dateValue(dattoValue(source, "timestamp", "raisedAt")),
        resolvedAt: null,
        isOpen: true,
        rawPayload: source as never,
      },
    });
    syncedAlerts++;
  }

  await database.device.updateMany({ where: { rmmSite: { provider: ExternalProvider.DATTO_RMM } }, data: { openAlertCount: 0 } });
  for (const [deviceId, openAlertCount] of counts) {
    await database.device.update({ where: { id: deviceId }, data: { openAlertCount } });
  }

  await database.rmmAlert.updateMany({
    where: { provider: ExternalProvider.DATTO_RMM, isOpen: true, updatedAt: { lt: new Date(now.getTime() - 60_000) } },
    data: { isOpen: false, resolvedAt: now },
  });

  await database.integrationConnection.updateMany({
    where: { provider: ExternalProvider.DATTO_RMM },
    data: { status: "CONNECTED", lastSyncAt: now, lastError: null },
  });
  log("info", "Datto RMM synchronization completed", { sites: linkedSites, devices: syncedDevices, alerts: syncedAlerts });
}

async function findTicketForMessage(database: DatabaseClient, message: GraphMessage) {
  const inReplyTo = headerValue(message.internetMessageHeaders, "In-Reply-To");
  if (inReplyTo) {
    const prior = await database.emailMessage.findUnique({ where: { internetMessageId: inReplyTo }, select: { emailThread: { select: { ticketId: true } } } });
    if (prior) return prior.emailThread.ticketId;
  }

  const number = extractTicketNumber(message.subject);
  if (number !== undefined) {
    const ticket = await database.ticket.findUnique({ where: { number }, select: { id: true } });
    if (ticket) return ticket.id;
  }

  if (message.conversationId) {
    const thread = await database.emailThread.findFirst({ where: { provider: ExternalProvider.MICROSOFT_GRAPH, providerConversationId: message.conversationId }, select: { ticketId: true } });
    if (thread) return thread.ticketId;
  }
  return undefined;
}

function bodyText(message: GraphMessage) {
  const content = message.body?.content ?? message.bodyPreview ?? "";
  const text = message.body?.contentType?.toLowerCase() === "html" ? htmlToText(content) : content;
  return stripQuotedText(text).slice(0, 100_000);
}

async function processGraphMessage(database: DatabaseClient, messageId: string) {
  const graph = new GraphClient();
  const message = await graph.getMessage(messageId);
  const duplicate = await database.emailMessage.findUnique({ where: { providerMessageId: message.id }, select: { id: true } });
  if (duplicate) return;

  const sender = normalizeAddress(message.from?.emailAddress?.address);
  if (!sender) throw new Error("Inbound Graph message is missing a sender address.");
  if (sender === normalizeAddress(graph.mailbox)) return;

  let ticketId = await findTicketForMessage(database, message);
  let contact = await database.contact.findFirst({
    where: { email: { equals: sender, mode: "insensitive" }, isInactive: false },
    select: { id: true, clientId: true },
  });

  if (!contact) {
    const domain = domainFromAddress(sender);
    const client = domain ? await database.client.findFirst({
      where: { primaryDomain: { equals: domain, mode: "insensitive" }, archivedAt: null }, select: { id: true },
    }) : null;
    if (client) contact = { id: "", clientId: client.id };
  }

  if (!ticketId) {
    const fallbackClientId = process.env.GRAPH_UNMATCHED_CLIENT_ID?.trim();
    const clientId = contact?.clientId ?? fallbackClientId;
    if (!clientId) throw new Error(`Cannot match inbound email from ${sender} to a CRM client.`);
    const created = await database.ticket.create({
      data: {
        clientId,
        contactId: contact?.id || undefined,
        subject: (message.subject || "Email support request").replace(/^\s*(re|fw|fwd):\s*/i, "").slice(0, 240),
        description: bodyText(message) || "Inbound email support request",
        source: "email",
        status: "NEW",
        priority: TicketPriority.P3_NORMAL,
      },
      select: { id: true },
    });
    ticketId = created.id;
  }

  const ticket = await database.ticket.findUnique({ where: { id: ticketId }, select: { id: true, contactId: true } });
  if (!ticket) throw new Error("Matched ticket no longer exists.");
  if (!ticket.contactId && contact?.id) await database.ticket.update({ where: { id: ticketId }, data: { contactId: contact.id } });

  let thread = message.conversationId ? await database.emailThread.findFirst({
    where: { ticketId, provider: ExternalProvider.MICROSOFT_GRAPH, providerConversationId: message.conversationId },
  }) : null;
  thread ??= await database.emailThread.findFirst({ where: { ticketId, provider: ExternalProvider.MICROSOFT_GRAPH } });
  if (!thread) thread = await database.emailThread.create({ data: { ticketId, provider: ExternalProvider.MICROSOFT_GRAPH, providerConversationId: message.conversationId } });

  const text = bodyText(message) || "(No message body)";
  await database.$transaction(async (tx) => {
    const entry = await tx.ticketEntry.create({ data: { ticketId, kind: TicketEntryKind.CUSTOMER_MESSAGE, bodyText: text, bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? message.body.content : undefined } });
    await tx.emailMessage.create({
      data: {
        emailThreadId: thread.id,
        ticketEntryId: entry.id,
        providerMessageId: message.id,
        internetMessageId: message.internetMessageId,
        inReplyTo: headerValue(message.internetMessageHeaders, "In-Reply-To"),
        referenceHeader: headerValue(message.internetMessageHeaders, "References"),
        fromAddress: sender,
        toAddresses: (message.toRecipients ?? []).map((recipient) => recipient.emailAddress?.address).filter(Boolean) as never,
        ccAddresses: (message.ccRecipients ?? []).map((recipient) => recipient.emailAddress?.address).filter(Boolean) as never,
        subject: message.subject ?? "",
        bodyText: text,
        bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? message.body.content : undefined,
        isInbound: true,
        receivedAt: dateValue(message.receivedDateTime),
        processingDisposition: "threaded",
      },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date(), status: "IN_PROGRESS" } });
    await tx.outboxEvent.create({ data: { eventType: "InboundEmailAdded", aggregateType: "Ticket", aggregateId: ticketId, payload: { ticketId, entryId: entry.id, messageId: message.id } } });
  });
}

async function sendTicketReply(database: DatabaseClient, payload: JsonObject) {
  const ticketId = stringValue(payload.ticketId);
  const entryId = stringValue(payload.entryId);
  if (!ticketId || !entryId) throw new Error("Ticket reply job requires ticketId and entryId.");
  const entry = await database.ticketEntry.findUnique({
    where: { id: entryId },
    include: { ticket: { include: { contact: true, client: true, emailThreads: { where: { provider: ExternalProvider.MICROSOFT_GRAPH }, take: 1 } } } },
  });
  if (!entry || entry.ticketId !== ticketId) throw new Error("Ticket reply entry was not found.");
  if (entry.kind !== TicketEntryKind.TECHNICIAN_MESSAGE) return;
  const address = normalizeAddress(entry.ticket.contact?.email);
  if (!address) throw new Error("Ticket has no contact email address for outbound reply.");

  const graph = new GraphClient();
  const display = `TKT-${entry.ticket.number.toString().padStart(6, "0")}`;
  const subject = `[${display}] ${entry.ticket.subject}`;
  await graph.sendMail({ to: [address], subject, text: entry.bodyText, html: entry.bodyHtml ?? undefined });

  let thread = entry.ticket.emailThreads[0];
  if (!thread) thread = await database.emailThread.create({ data: { ticketId, provider: ExternalProvider.MICROSOFT_GRAPH } });
  await database.emailMessage.upsert({
    where: { providerMessageId: `outbound:${entryId}` },
    create: {
      emailThreadId: thread.id,
      ticketEntryId: entryId,
      providerMessageId: `outbound:${entryId}`,
      fromAddress: graph.mailbox,
      toAddresses: [address] as never,
      subject,
      bodyText: entry.bodyText,
      bodyHtml: entry.bodyHtml,
      isInbound: false,
      sentAt: new Date(),
      processingDisposition: "sent",
    },
    update: { sentAt: new Date(), processingDisposition: "sent" },
  });
}

async function ensureGraphSubscription(database: DatabaseClient) {
  const notificationUrl = process.env.GRAPH_WEBHOOK_URL?.trim();
  const clientState = process.env.GRAPH_WEBHOOK_CLIENT_STATE?.trim();
  if (!notificationUrl || !clientState) throw new Error("GRAPH_WEBHOOK_URL and GRAPH_WEBHOOK_CLIENT_STATE are required.");
  const graph = new GraphClient();
  const setting = await database.systemSetting.findUnique({ where: { key: "graph.messageSubscription" } });
  const current = object(setting?.value);
  const expiration = dateValue(current.expirationDateTime);
  const subscriptionId = stringValue(current.id);

  let subscription: { id: string; expirationDateTime: string };
  if (subscriptionId && expiration && expiration.getTime() > Date.now() + 6 * 60 * 60 * 1000) return;
  if (subscriptionId) {
    try {
      subscription = await graph.renewSubscription(subscriptionId);
    } catch {
      subscription = await graph.createMessageSubscription(notificationUrl, clientState);
    }
  } else {
    subscription = await graph.createMessageSubscription(notificationUrl, clientState);
  }
  await database.systemSetting.upsert({
    where: { key: "graph.messageSubscription" },
    create: { key: "graph.messageSubscription", value: subscription as never },
    update: { value: subscription as never },
  });
  log("info", "Microsoft Graph mailbox subscription is active", { expirationDateTime: subscription.expirationDateTime });
}

async function evaluateAutomation(database: DatabaseClient, payload: JsonObject) {
  const ticketId = stringValue(payload.ticketId);
  const eventType = stringValue(payload.eventType) ?? "TicketCreated";
  if (!ticketId) return;
  const ticket = await database.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const rules = await database.automationRule.findMany({ where: { isEnabled: true, trigger: eventType }, orderBy: { priority: "asc" } });
  for (const rule of rules) {
    const conditions = object(rule.conditions);
    if (conditions.priority && conditions.priority !== ticket.priority) continue;
    if (conditions.type && conditions.type !== ticket.type) continue;
    if (conditions.source && conditions.source !== ticket.source) continue;
    if (conditions.clientId && conditions.clientId !== ticket.clientId) continue;
    const actions = object(rule.actions);
    const update: JsonObject = {};
    if (typeof actions.priority === "string") update.priority = actions.priority;
    if (typeof actions.status === "string") update.status = actions.status;
    if (typeof actions.assigneeId === "string") update.assigneeId = actions.assigneeId;
    if (typeof actions.queueId === "string") update.queueId = actions.queueId;
    if (Object.keys(update).length) await database.ticket.update({ where: { id: ticketId }, data: update as never });
  }
}

async function processOutbox(database: DatabaseClient) {
  const events = await database.outboxEvent.findMany({ where: { processedAt: null }, orderBy: { occurredAt: "asc" }, take: workerConfig.batchSize });
  for (const event of events) {
    try {
      const payload = object(event.payload);
      if (event.eventType === "TicketReplyAdded") {
        await scheduleJob(database, `graph.send-ticket-reply:${stringValue(payload.entryId) ?? event.id}`, payload, new Date(), "mail");
      }
      if (["TicketCreated", "TicketUpdated", "TicketStatusChanged", "InboundEmailAdded"].includes(event.eventType)) {
        await scheduleJob(database, `automation:${event.id}`, { ...payload, eventType: event.eventType }, new Date(), "automation");
      }
      await database.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
    } catch (error) {
      await database.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, lastError: errorMessage(error).slice(0, 4000) } });
      log("error", "Outbox event processing failed", { eventId: event.id, eventType: event.eventType, error: errorMessage(error) });
    }
  }
}

async function claimNextJob(database: DatabaseClient) {
  const candidate = await database.backgroundJob.findFirst({
    where: { status: { in: [JobStatus.PENDING, JobStatus.FAILED] }, runAfter: { lte: new Date() }, lockedAt: null },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return undefined;
  const claimed = await database.backgroundJob.updateMany({
    where: { id: candidate.id, lockedAt: null, status: { in: [JobStatus.PENDING, JobStatus.FAILED] } },
    data: { status: JobStatus.RUNNING, lockedAt: new Date(), lockedBy: workerConfig.instanceId, attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return undefined;
  return database.backgroundJob.findUnique({ where: { id: candidate.id } });
}

async function processJob(database: DatabaseClient, job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const payload = object(job.payload);
  try {
    switch (job.name.split(":")[0]) {
      case "datto.sync":
        await syncDatto(database);
        await scheduleJob(database, "datto.sync", {}, new Date(Date.now() + workerConfig.dattoSyncMinutes * 60_000), "integrations");
        break;
      case "graph.process-message": {
        const messageId = stringValue(payload.messageId);
        if (!messageId) throw new Error("graph.process-message requires messageId.");
        await processGraphMessage(database, messageId);
        break;
      }
      case "graph.send-ticket-reply":
        await sendTicketReply(database, payload);
        break;
      case "graph.subscription":
        await ensureGraphSubscription(database);
        await scheduleJob(database, "graph.subscription", {}, new Date(Date.now() + 12 * 60 * 60 * 1000), "integrations");
        break;
      case "automation":
        await evaluateAutomation(database, payload);
        break;
      default:
        throw new Error(`Unknown background job: ${job.name}`);
    }
    await database.backgroundJob.update({ where: { id: job.id }, data: { status: JobStatus.SUCCEEDED, lockedAt: null, lockedBy: null, lastError: null } });
    log("info", "Background job completed", { jobId: job.id, name: job.name, attempts: job.attempts + 1 });
  } catch (error) {
    const attempts = job.attempts + 1;
    const dead = attempts >= job.maxAttempts;
    const delayMs = Math.min(60 * 60 * 1000, Math.max(15_000, 2 ** Math.min(attempts, 10) * 1000));
    await database.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: dead ? JobStatus.DEAD : JobStatus.FAILED,
        lockedAt: null,
        lockedBy: null,
        lastError: errorMessage(error).slice(0, 4000),
        runAfter: new Date(Date.now() + delayMs),
      },
    });
    log("error", "Background job failed", { jobId: job.id, name: job.name, attempts, dead, error: errorMessage(error) });
  }
}

async function recoverStaleLocks(database: DatabaseClient) {
  const cutoff = new Date(Date.now() - workerConfig.staleLockMinutes * 60_000);
  const result = await database.backgroundJob.updateMany({
    where: { status: JobStatus.RUNNING, lockedAt: { lt: cutoff } },
    data: { status: JobStatus.FAILED, lockedAt: null, lockedBy: null, lastError: "Recovered stale worker lock." },
  });
  if (result.count) log("warn", "Recovered stale background jobs", { count: result.count });
}

async function ensureRecurringJobs(database: DatabaseClient) {
  if (hasEnv("DATTO_API_URL", "DATTO_API_KEY", "DATTO_API_SECRET")) await scheduleJob(database, "datto.sync", {}, new Date(), "integrations");
  if (hasEnv("ENTRA_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SUPPORT_MAILBOX", "GRAPH_WEBHOOK_URL", "GRAPH_WEBHOOK_CLIENT_STATE")) {
    await scheduleJob(database, "graph.subscription", {}, new Date(), "integrations");
  }
}

export async function runWorker() {
  const database = createDatabaseClient();
  await database.$connect();
  await recoverStaleLocks(database);
  await ensureRecurringJobs(database);
  log("info", "MSP CRM worker started", { instanceId: workerConfig.instanceId, pollIntervalMs: workerConfig.pollIntervalMs });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "Worker shutdown requested", { signal });
    await database.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));

  while (!stopping) {
    try {
      await processOutbox(database);
      for (let index = 0; index < workerConfig.batchSize; index++) {
        const job = await claimNextJob(database);
        if (!job) break;
        await processJob(database, job);
      }
    } catch (error) {
      log("error", "Worker loop error", { error: errorMessage(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, workerConfig.pollIntervalMs));
  }
}
