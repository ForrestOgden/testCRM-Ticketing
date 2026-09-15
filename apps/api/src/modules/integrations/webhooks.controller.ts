import { Body, Controller, Headers, HttpCode, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Response } from "express";
import { ExternalProvider, JobStatus } from "@msp-crm/database";
import { Public } from "../../auth/public.decorator";
import { DatabaseService } from "../../common/database.module";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly database: DatabaseService) {}

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

    const expectedClientState = process.env.GRAPH_WEBHOOK_CLIENT_STATE?.trim();
    if (!expectedClientState) throw new UnauthorizedException("Graph webhook client state is not configured.");
    const payload = object(body);
    const notifications = Array.isArray(payload.value) ? payload.value : [];

    for (const item of notifications) {
      const notification = object(item);
      if (stringValue(notification.clientState) !== expectedClientState) throw new UnauthorizedException("Invalid Graph webhook client state.");
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
    const expected = process.env.DATTO_WEBHOOK_SECRET?.trim();
    if (!expected || supplied !== expected) throw new UnauthorizedException("Invalid Datto webhook secret.");
    const payload = object(body);
    const remoteUid = stringValue(payload.alertUid) ?? stringValue(payload.uid) ?? digest(payload).slice(0, 32);
    const eventType = stringValue(payload.eventType) ?? stringValue(payload.type) ?? "alert.changed";
    const remoteEventId = `datto:${eventType}:${remoteUid}:${digest(payload).slice(0, 12)}`;
    const receipt = await this.database.prisma.webhookReceipt.upsert({
      where: { provider_remoteEventId: { provider: ExternalProvider.DATTO_RMM, remoteEventId } },
      create: { provider: ExternalProvider.DATTO_RMM, remoteEventId, eventType, payloadHash: digest(payload) },
      update: {},
    });
    const existing = await this.database.prisma.backgroundJob.findFirst({ where: { name: "datto.sync", status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } } });
    if (!existing) await this.database.prisma.backgroundJob.create({ data: { queue: "integrations", name: "datto.sync", payload: { receiptId: receipt.id }, runAfter: new Date() } });
    await this.database.prisma.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: new Date(), error: null } });
    return { accepted: true };
  }
}
