import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { TicketEntryKind, TicketPriority, TicketStatus, TicketType } from "@msp-crm/database";
import { DatabaseService } from "../../common/database.module";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { toJsonValue } from "../../common/json";
import type { ProvisionSupportEndpointDto, SupportRequestDto } from "./support.dto";

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class SupportService {
  constructor(private readonly database: DatabaseService) {}

  async provision(dto: ProvisionSupportEndpointDto, actor: AuthenticatedUser) {
    const device = await this.database.prisma.device.findUnique({
      where: { id: dto.deviceId },
      select: { id: true, hostname: true, clientId: true, client: { select: { name: true } } },
    });
    if (!device) throw new NotFoundException("Device not found.");

    const enrollmentId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hash(token);
    const previous = await this.database.prisma.supportEndpoint.findUnique({ where: { deviceId: device.id } });
    const endpoint = await this.database.prisma.$transaction(async (tx) => {
      const row = await tx.supportEndpoint.upsert({
        where: { deviceId: device.id },
        create: { deviceId: device.id, enrollmentId, tokenHash, appVersion: dto.appVersion },
        update: { enrollmentId, tokenHash, appVersion: dto.appVersion, revokedAt: null, lastSeenAt: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: previous ? "support_endpoint.rotated" : "support_endpoint.provisioned",
          objectType: "SupportEndpoint",
          objectId: row.id,
          oldValue: previous ? toJsonValue({ ...previous, tokenHash: "[redacted]" }) as never : undefined,
          newValue: toJsonValue({ ...row, tokenHash: "[redacted]" }) as never,
        },
      });
      return row;
    });

    return {
      endpointId: endpoint.id,
      enrollmentId,
      token,
      device: { id: device.id, hostname: device.hostname, clientName: device.client.name },
      apiBaseUrl: process.env.PUBLIC_API_URL ?? null,
    };
  }

  async revoke(deviceId: string, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.supportEndpoint.findUnique({ where: { deviceId } });
    if (!existing) throw new NotFoundException("Support launcher enrollment not found.");
    const revoked = await this.database.prisma.$transaction(async (tx) => {
      const row = await tx.supportEndpoint.update({ where: { deviceId }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "support_endpoint.revoked", objectType: "SupportEndpoint", objectId: row.id } });
      return row;
    });
    return { id: revoked.id, revokedAt: revoked.revokedAt };
  }

  async authenticate(enrollmentId: string | undefined, token: string | undefined) {
    if (!enrollmentId || !token) throw new UnauthorizedException("Support launcher authentication is required.");
    const endpoint = await this.database.prisma.supportEndpoint.findUnique({
      where: { enrollmentId },
      include: { device: { include: { client: true } } },
    });
    if (!endpoint || endpoint.revokedAt) throw new UnauthorizedException("Support launcher enrollment is not active.");
    const supplied = hash(token);
    if (!secureEqual(supplied, endpoint.tokenHash)) throw new UnauthorizedException("Support launcher token is invalid.");
    return endpoint;
  }

  async heartbeat(enrollmentId: string | undefined, token: string | undefined, appVersion?: string, metadata?: Record<string, unknown>) {
    const endpoint = await this.authenticate(enrollmentId, token);
    await this.database.prisma.supportEndpoint.update({
      where: { id: endpoint.id },
      data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}), ...(metadata ? { metadata: metadata as never } : {}) },
    });
    return { ok: true, deviceId: endpoint.deviceId, hostname: endpoint.device.hostname, client: endpoint.device.client.name };
  }

  async createRequest(enrollmentId: string | undefined, token: string | undefined, dto: SupportRequestDto) {
    const endpoint = await this.authenticate(enrollmentId, token);
    const contact = dto.email ? await this.database.prisma.contact.findFirst({
      where: { clientId: endpoint.device.clientId, email: { equals: dto.email.trim().toLowerCase(), mode: "insensitive" }, isInactive: false },
      select: { id: true },
    }) : null;
    const description = dto.userName ? `Submitted by ${dto.userName}\n\n${dto.description.trim()}` : dto.description.trim();
    const ticket = await this.database.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          subject: dto.subject.trim(),
          description,
          clientId: endpoint.device.clientId,
          deviceId: endpoint.deviceId,
          contactId: contact?.id,
          source: "support-launcher",
          status: TicketStatus.NEW,
          priority: TicketPriority.P3_NORMAL,
          type: TicketType.INCIDENT,
        },
      });
      await tx.ticketEntry.create({
        data: { ticketId: created.id, kind: TicketEntryKind.CUSTOMER_MESSAGE, bodyText: description },
      });
      await tx.outboxEvent.create({
        data: { eventType: "TicketCreated", aggregateType: "Ticket", aggregateId: created.id, payload: { ticketId: created.id, clientId: created.clientId, deviceId: created.deviceId, source: "support-launcher" } },
      });
      await tx.supportEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastSeenAt: new Date(),
          ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
          ...(dto.metadata ? { metadata: dto.metadata as never } : {}),
        },
      });
      return created;
    });

    return { id: ticket.id, number: ticket.number, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}`, subject: ticket.subject };
  }
}
