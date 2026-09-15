import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { CreateClientDto, ListClientsQuery, UpdateClientDto } from "./clients.dto";

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

@Injectable()
export class ClientsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListClientsQuery) {
    const where = {
      archivedAt: null,
      ...(query.status ? { lifecycleStatus: query.status } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" as const } },
        { dbaName: { contains: query.search, mode: "insensitive" as const } },
        { primaryDomain: { contains: query.search, mode: "insensitive" as const } }
      ] } : {})
    };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.client.findMany({
        where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { _count: { select: { contacts: true, devices: true, tickets: true } } }
      }),
      this.database.prisma.client.count({ where })
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async get(idOrSlug: string) {
    const client = await this.database.prisma.client.findFirst({
      where: { archivedAt: null, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        accountOwner: { select: { id: true, displayName: true, email: true } },
        technicalOwner: { select: { id: true, displayName: true, email: true } },
        contacts: { orderBy: [{ isVip: "desc" }, { lastName: "asc" }], take: 50 },
        locations: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        devices: { orderBy: [{ isOnline: "desc" }, { hostname: "asc" }], take: 100 },
        rmmSites: { orderBy: { name: "asc" } },
        tickets: { orderBy: { updatedAt: "desc" }, take: 25, include: {
          contact: { select: { firstName: true, lastName: true } },
          device: { select: { hostname: true } },
          assignee: { select: { id: true, displayName: true } }
        } },
        opportunities: { orderBy: { updatedAt: "desc" }, take: 20 },
        activities: { orderBy: { createdAt: "desc" }, take: 30 },
        technicalProfile: { orderBy: { label: "asc" } },
        tags: { include: { tag: true } },
        _count: { select: { contacts: true, locations: true, devices: true, tickets: true, opportunities: true } }
      }
    });
    if (!client) throw new NotFoundException("Client not found.");
    return client;
  }

  async create(dto: CreateClientDto, actor: AuthenticatedUser) {
    const requestedSlug = slugify(dto.slug || dto.name) || "client";
    const slug = await this.uniqueSlug(requestedSlug);
    return this.database.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({ data: {
        slug, name: dto.name.trim(), dbaName: dto.dbaName?.trim(), lifecycleStatus: dto.lifecycleStatus,
        industry: dto.industry?.trim(), employeeCount: dto.employeeCount, website: dto.website,
        primaryDomain: dto.primaryDomain?.toLowerCase(), mainPhone: dto.mainPhone,
        generalEmail: dto.generalEmail?.toLowerCase(), relationshipHealth: dto.relationshipHealth,
        internalNotes: dto.internalNotes
      } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "client.created", objectType: "Client", objectId: client.id, newValue: toJsonValue(client) as never } });
      await tx.outboxEvent.create({ data: { eventType: "ClientCreated", aggregateType: "Client", aggregateId: client.id, payload: { clientId: client.id, name: client.name } } });
      return client;
    });
  }

  async update(id: string, dto: UpdateClientDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.client.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) throw new NotFoundException("Client not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id }, data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.dbaName !== undefined ? { dbaName: dto.dbaName?.trim() ?? null } : {}),
        ...(dto.lifecycleStatus !== undefined ? { lifecycleStatus: dto.lifecycleStatus } : {}),
        ...(dto.industry !== undefined ? { industry: dto.industry?.trim() ?? null } : {}),
        ...(dto.employeeCount !== undefined ? { employeeCount: dto.employeeCount } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.primaryDomain !== undefined ? { primaryDomain: dto.primaryDomain?.toLowerCase() ?? null } : {}),
        ...(dto.mainPhone !== undefined ? { mainPhone: dto.mainPhone } : {}),
        ...(dto.generalEmail !== undefined ? { generalEmail: dto.generalEmail?.toLowerCase() ?? null } : {}),
        ...(dto.relationshipHealth !== undefined ? { relationshipHealth: dto.relationshipHealth } : {}),
        ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {})
      } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "client.updated", objectType: "Client", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      await tx.outboxEvent.create({ data: { eventType: "ClientUpdated", aggregateType: "Client", aggregateId: id, payload: { clientId: id } } });
      return updated;
    });
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.client.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) throw new NotFoundException("Client not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id }, data: { archivedAt: new Date(), lifecycleStatus: "INACTIVE" } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "client.archived", objectType: "Client", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      return { archived: true };
    });
  }

  private async uniqueSlug(base: string) {
    let slug = base;
    let suffix = 2;
    while (await this.database.prisma.client.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
    return slug;
  }
}
