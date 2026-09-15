import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TicketEntryKind, TicketStatus } from "@msp-crm/database";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { CreateTicketDto, CreateTicketEntryDto, ListTicketsQuery, UpdateTicketDto } from "./tickets.dto";

const includeSummary = {
  client: { select: { id: true, name: true, slug: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  device: { select: { id: true, hostname: true, isOnline: true, openAlertCount: true } },
  assignee: { select: { id: true, displayName: true, email: true } },
  queue: { select: { id: true, name: true } },
  _count: { select: { entries: true, attachments: true, rmmAlerts: true } }
} as const;

function withDisplayNumber<T extends { number: bigint }>(ticket: T) {
  return { ...ticket, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}` };
}

@Injectable()
export class TicketsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListTicketsQuery) {
    const where = {
      ...(query.status ? { status: query.status } : {}), ...(query.priority ? { priority: query.priority } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}), ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.queueId ? { queueId: query.queueId } : {}), ...(query.search ? { OR: [
        { subject: { contains: query.search, mode: "insensitive" as const } },
        { description: { contains: query.search, mode: "insensitive" as const } },
        { client: { name: { contains: query.search, mode: "insensitive" as const } } },
        { contact: { email: { contains: query.search, mode: "insensitive" as const } } },
        { device: { hostname: { contains: query.search, mode: "insensitive" as const } } },
        { entries: { some: { bodyText: { contains: query.search, mode: "insensitive" as const } } } }
      ] } : {})
    };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.ticket.findMany({ where, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: includeSummary }),
      this.database.prisma.ticket.count({ where })
    ]);
    return { items: items.map(withDisplayNumber), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async get(id: string) {
    const ticket = await this.database.prisma.ticket.findUnique({ where: { id }, include: {
      client: true, contact: true, location: true,
      device: { include: { rmmAlerts: { where: { isOpen: true }, orderBy: { raisedAt: "desc" } }, rmmSite: true } },
      assignee: { select: { id: true, displayName: true, email: true } }, queue: true,
      entries: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, displayName: true, email: true } }, attachments: true } },
      attachments: true, watchers: { include: { user: { select: { id: true, displayName: true } } } }, relationsFrom: true, relationsTo: true
    } });
    if (!ticket) throw new NotFoundException("Ticket not found.");
    return withDisplayNumber(ticket);
  }

  async create(dto: CreateTicketDto, actor: AuthenticatedUser) {
    const client = await this.database.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true, archivedAt: true } });
    if (!client || client.archivedAt) throw new BadRequestException("Client does not exist.");
    const ticket = await this.database.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({ data: {
        subject: dto.subject.trim(), description: dto.description.trim(), clientId: dto.clientId, contactId: dto.contactId,
        locationId: dto.locationId, deviceId: dto.deviceId, assigneeId: dto.assigneeId, queueId: dto.queueId,
        status: dto.assigneeId ? "ASSIGNED" : "NEW", priority: dto.priority, type: dto.type, category: dto.category,
        subcategory: dto.subcategory, source: dto.source ?? "crm",
        entries: dto.initialMessage ? { create: { kind: TicketEntryKind.CUSTOMER_MESSAGE, bodyText: dto.initialMessage.trim() } } : undefined
      }, include: includeSummary });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "ticket.created", objectType: "Ticket", objectId: created.id, newValue: toJsonValue(created) as never } });
      await tx.outboxEvent.create({ data: { eventType: "TicketCreated", aggregateType: "Ticket", aggregateId: created.id, payload: { ticketId: created.id, ticketNumber: created.number.toString(), priority: created.priority, clientId: created.clientId } } });
      return created;
    });
    return withDisplayNumber(ticket);
  }

  async update(id: string, dto: UpdateTicketDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Ticket not found.");
    const now = new Date();
    const statusTimes = dto.status === TicketStatus.RESOLVED ? { resolvedAt: existing.resolvedAt ?? now, closedAt: null }
      : dto.status === TicketStatus.CLOSED ? { resolvedAt: existing.resolvedAt ?? now, closedAt: now }
      : dto.status && ![TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(dto.status) ? { resolvedAt: null, closedAt: null } : {};
    const updated = await this.database.prisma.$transaction(async (tx) => {
      const record = await tx.ticket.update({ where: { id }, data: {
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}), ...(dto.queueId !== undefined ? { queueId: dto.queueId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}), ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}), ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.subcategory !== undefined ? { subcategory: dto.subcategory } : {}), ...statusTimes
      }, include: includeSummary });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "ticket.updated", objectType: "Ticket", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(record) as never } });
      await tx.outboxEvent.create({ data: { eventType: dto.status && dto.status !== existing.status ? "TicketStatusChanged" : "TicketUpdated", aggregateType: "Ticket", aggregateId: id, payload: { ticketId: id, fromStatus: existing.status, toStatus: record.status, assigneeId: record.assigneeId } } });
      return record;
    });
    return withDisplayNumber(updated);
  }

  async addEntry(id: string, dto: CreateTicketEntryDto, actor: AuthenticatedUser) {
    const ticket = await this.database.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket not found.");
    if (dto.kind === TicketEntryKind.SYSTEM_EVENT) throw new BadRequestException("System events cannot be created from the public ticket API.");
    return this.database.prisma.$transaction(async (tx) => {
      const entry = await tx.ticketEntry.create({ data: { ticketId: id, authorId: actor.id, kind: dto.kind, bodyText: dto.bodyText.trim() }, include: { author: { select: { id: true, displayName: true, email: true } } } });
      if (dto.kind === TicketEntryKind.TECHNICIAN_MESSAGE && ticket.firstResponseAt === null) await tx.ticket.update({ where: { id }, data: { firstResponseAt: new Date() } });
      const customerVisible = dto.kind !== TicketEntryKind.INTERNAL_NOTE;
      await tx.auditEvent.create({ data: { actorId: actor.id, action: customerVisible ? "ticket.reply_added" : "ticket.internal_note_added", objectType: "Ticket", objectId: id, newValue: { ticketEntryId: entry.id, kind: entry.kind } } });
      await tx.outboxEvent.create({ data: { eventType: customerVisible ? "TicketReplyAdded" : "TicketInternalNoteAdded", aggregateType: "Ticket", aggregateId: id, payload: { ticketId: id, entryId: entry.id, kind: entry.kind } } });
      return entry;
    });
  }
}
