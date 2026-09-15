import { Body, Controller, Headers, HttpCode, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import {
  ExternalProvider,
  JobStatus,
  TicketEntryKind,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@msp-crm/database";
import { Public } from "../../auth/public.decorator";
import { DatabaseService } from "../../common/database.module";
import { IntegrationsService } from "./integrations.service";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function secureEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|1|yes|on)$/i.test(value);
  return fallback;
}

function priority(value: unknown, fallback: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/(critical|urgent|emergency)/.test(raw)) return TicketPriority.P1_CRITICAL;
  if (/(high|major)/.test(raw)) return TicketPriority.P2_HIGH;
  if (/(moderate|medium|normal)/.test(raw)) return TicketPriority.P3_NORMAL;
  if (/(low|minor)/.test(raw)) return TicketPriority.P4_LOW;
  const configured = String(fallback ?? TicketPriority.P2_HIGH);
  return Object.values(TicketPriority).includes(configured as TicketPriority) ? configured as TicketPriority : TicketPriority.P2_HIGH;
}

@Controller("webhooks")
export class WebhooksController {
  constructor(
    private readonly database: DatabaseService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Public()
  @Post("microsoft/graph")
  @HttpCode(202)
  async graph(
    @Query("validationToken") validationToken: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (validationToken) {
      response.status(200).type("text/plain");
      return validationToken;
    }

    const runtime = await this.integrations.runtime(ExternalProvider.MICROSOFT_GRAPH);
    const expectedClientState = runtime.secrets.webhookClientState ?? process.env.GRAPH_WEBHOOK_CLIENT_STATE?.trim();
    if (!expectedClientState) throw new UnauthorizedException("Graph webhook client state is not configured.");
    const payload = object(body);
    const notifications = Array.isArray(payload.value) ? payload.value : [];

    for (const item of notifications) {
      const notification = object(item);
      if (!secureEqual(stringValue(notification.clientState), expectedClientState)) throw new UnauthorizedException("Invalid Graph webhook client state.");
      const resourceData = object(notification.resourceData);
      const messageId = stringValue(resourceData.id) ?? stringValue(notification.resource)?.split("/messages/").at(-1);
      if (!messageId) continue;
      const subscriptionId = stringValue(notification.subscriptionId) ?? "unknown";
      const remoteEventId = `graph:${subscriptionId}:${messageId}`;
      const receipt = await this.database.prisma.webhookReceipt.upsert({
        where: { provider_remoteEventId: { provider: ExternalProvider.MICROSOFT_GRAPH, remoteEventId } },
        create: {
          provider: ExternalProvider.MICROSOFT_GRAPH,
          remoteEventId,
          eventType: stringValue(notification.changeType) ?? "created",
          payloadHash: digest(notification),
        },
        update: {},
      });
      if (receipt.processedAt) continue;
      const name = `graph.process-message:${messageId}`;
      const existing = await this.database.prisma.backgroundJob.findFirst({ where: { name, status: { in: [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED] } } });
      if (!existing) {
        await this.database.prisma.backgroundJob.create({ data: { queue: "mail", name, payload: { messageId, receiptId: receipt.id }, runAfter: new Date() } });
      }
      await this.database.prisma.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: new Date(), error: null } });
    }
    return { accepted: true };
  }

  @Public()
  @Post("datto")
  @HttpCode(202)
  async datto(@Headers("x-webhook-secret") supplied: string | undefined, @Body() body: unknown) {
    const runtime = await this.integrations.runtime(ExternalProvider.DATTO_RMM);
    const expected = runtime.secrets.webhookSecret ?? process.env.DATTO_WEBHOOK_SECRET?.trim();
    if (!secureEqual(supplied, expected)) throw new UnauthorizedException("Invalid Datto webhook secret.");

    const payload = object(body);
    const alertUid = stringValue(payload.alertUid) ?? stringValue(payload.alert_uid) ?? stringValue(payload.uid) ?? digest(payload).slice(0, 32);
    const eventType = stringValue(payload.eventType) ?? stringValue(payload.type) ?? "alert.raised";
    const remoteEventId = `datto:${eventType}:${alertUid}:${digest(payload).slice(0, 16)}`;
    const receipt = await this.database.prisma.webhookReceipt.upsert({
      where: { provider_remoteEventId: { provider: ExternalProvider.DATTO_RMM, remoteEventId } },
      create: { provider: ExternalProvider.DATTO_RMM, remoteEventId, eventType, payloadHash: digest(payload) },
      update: {},
    });
    if (receipt.processedAt) return { accepted: true, duplicate: true };

    try {
      const deviceUid = stringValue(payload.deviceUid) ?? stringValue(payload.device_uid);
      const mapping = deviceUid ? await this.database.prisma.externalRecordMapping.findUnique({
        where: { provider_entityType_remoteUid: { provider: ExternalProvider.DATTO_RMM, entityType: "Device", remoteUid: deviceUid } },
        select: { deviceId: true },
      }) : null;

      if (!mapping?.deviceId) {
        await this.queueDattoSync(receipt.id);
        await this.database.prisma.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: new Date(), error: "Device mapping not found; full Datto sync queued." } });
        return { accepted: true, reconciledBySync: true };
      }

      const resolved = /resolved|closed|cleared/i.test(eventType);
      const now = new Date();
      const sourcePriority = stringValue(payload.alertPriority) ?? stringValue(payload.alert_priority);
      const existingAlert = await this.database.prisma.rmmAlert.findUnique({
        where: { provider_remoteUid: { provider: ExternalProvider.DATTO_RMM, remoteUid: alertUid } },
        select: { id: true, ticketId: true },
      });
      const alert = await this.database.prisma.rmmAlert.upsert({
        where: { provider_remoteUid: { provider: ExternalProvider.DATTO_RMM, remoteUid: alertUid } },
        create: {
          deviceId: mapping.deviceId,
          provider: ExternalProvider.DATTO_RMM,
          remoteUid: alertUid,
          alertType: stringValue(payload.alertType) ?? stringValue(payload.alert_type),
          category: stringValue(payload.alertCategory) ?? stringValue(payload.alert_category) ?? stringValue(payload.category),
          message: stringValue(payload.alertMessage) ?? stringValue(payload.alert_message) ?? stringValue(payload.message),
          priority: sourcePriority,
          raisedAt: resolved ? undefined : now,
          resolvedAt: resolved ? now : null,
          isOpen: !resolved,
          rawPayload: payload as never,
        },
        update: {
          deviceId: mapping.deviceId,
          alertType: stringValue(payload.alertType) ?? stringValue(payload.alert_type),
          category: stringValue(payload.alertCategory) ?? stringValue(payload.alert_category) ?? stringValue(payload.category),
          message: stringValue(payload.alertMessage) ?? stringValue(payload.alert_message) ?? stringValue(payload.message),
          priority: sourcePriority,
          resolvedAt: resolved ? now : null,
          isOpen: !resolved,
          rawPayload: payload as never,
        },
      });

      let ticketId = existingAlert?.ticketId ?? alert.ticketId ?? null;
      const config = runtime.config;
      if (!resolved && bool(config.alertTicketingEnabled, true) && !ticketId) {
        ticketId = await this.createAlertTicket(mapping.deviceId, alertUid, payload, sourcePriority, config);
        await this.database.prisma.rmmAlert.update({ where: { id: alert.id }, data: { ticketId } });
      }

      if (resolved && ticketId && bool(config.autoResolveAlertTickets, true)) {
        const ticket = await this.database.prisma.ticket.findUnique({ where: { id: ticketId }, select: { status: true } });
        if (ticket && ![TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(ticket.status)) {
          await this.database.prisma.$transaction(async (tx) => {
            await tx.ticket.update({ where: { id: ticketId! }, data: { status: TicketStatus.RESOLVED, resolvedAt: now, closedAt: null } });
            await tx.ticketEntry.create({ data: { ticketId: ticketId!, kind: TicketEntryKind.SYSTEM_EVENT, bodyText: `Datto RMM alert ${alertUid} was resolved.` } });
            await tx.outboxEvent.create({ data: { eventType: "TicketStatusChanged", aggregateType: "Ticket", aggregateId: ticketId!, payload: { ticketId, fromStatus: ticket.status, toStatus: TicketStatus.RESOLVED, source: "datto-webhook" } } });
          });
        }
      }

      const openAlertCount = await this.database.prisma.rmmAlert.count({ where: { deviceId: mapping.deviceId, isOpen: true } });
      await this.database.prisma.device.update({ where: { id: mapping.deviceId }, data: { openAlertCount } });
      await this.database.prisma.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: now, error: null } });
      await this.queueDattoSync(receipt.id);
      return { accepted: true, alertId: alert.id, ticketId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.database.prisma.webhookReceipt.update({ where: { id: receipt.id }, data: { error: message.slice(0, 1000) } });
      throw error;
    }
  }

  private async createAlertTicket(deviceId: string, alertUid: string, payload: Record<string, unknown>, sourcePriority: string | undefined, config: Record<string, unknown>) {
    const device = await this.database.prisma.device.findUnique({ where: { id: deviceId }, include: { client: { select: { id: true, name: true } } } });
    if (!device) throw new Error("Datto alert device no longer exists in CRM.");
    const alertType = stringValue(payload.alertType) ?? stringValue(payload.alert_type) ?? "RMM alert";
    const message = stringValue(payload.alertMessage) ?? stringValue(payload.alert_message) ?? stringValue(payload.message) ?? stringValue(payload.trigger) ?? "Datto RMM raised an alert.";
    const category = stringValue(payload.alertCategory) ?? stringValue(payload.alert_category) ?? stringValue(payload.category);
    const siteName = stringValue(payload.siteName) ?? stringValue(payload.site_name);
    const dattoPriority = bool(config.mapDattoPriority, true) ? sourcePriority : undefined;
    const ticketPriority = priority(dattoPriority, config.alertTicketPriority);
    const description = [
      message,
      "",
      `Datto alert: ${alertUid}`,
      `Device: ${device.hostname}`,
      siteName ? `Site: ${siteName}` : null,
      category ? `Category: ${category}` : null,
      sourcePriority ? `Datto priority: ${sourcePriority}` : null,
    ].filter(Boolean).join("\n");

    return this.database.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          clientId: device.clientId,
          deviceId: device.id,
          subject: `[Datto] ${device.hostname} · ${alertType}`.slice(0, 300),
          description,
          source: "datto-webhook",
          status: TicketStatus.NEW,
          priority: ticketPriority,
          type: TicketType.ALERT,
          category: category?.slice(0, 120),
        },
      });
      await tx.ticketEntry.create({ data: { ticketId: ticket.id, kind: TicketEntryKind.SYSTEM_EVENT, bodyText: `Created automatically from Datto RMM alert ${alertUid}.` } });
      await tx.outboxEvent.create({ data: { eventType: "TicketCreated", aggregateType: "Ticket", aggregateId: ticket.id, payload: { ticketId: ticket.id, clientId: ticket.clientId, deviceId: ticket.deviceId, source: "datto-webhook", alertUid } } });
      return ticket.id;
    });
  }

  private async queueDattoSync(receiptId: string) {
    const existing = await this.database.prisma.backgroundJob.findFirst({ where: { name: "datto.sync", status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } } });
    if (!existing) await this.database.prisma.backgroundJob.create({ data: { queue: "integrations", name: "datto.sync", payload: { receiptId }, runAfter: new Date() } });
  }
}
