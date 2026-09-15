import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { CreateContactDto, ListContactsQuery, UpdateContactDto } from "./contacts.dto";

@Injectable()
export class ContactsService {
  constructor(private readonly database: DatabaseService) {}
  async list(query: ListContactsQuery) {
    const where = { ...(query.clientId ? { clientId: query.clientId } : {}), ...(query.search ? { OR: [
      { firstName: { contains: query.search, mode: "insensitive" as const } },
      { lastName: { contains: query.search, mode: "insensitive" as const } },
      { email: { contains: query.search, mode: "insensitive" as const } },
      { client: { name: { contains: query.search, mode: "insensitive" as const } } }
    ] } : {}) };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.contact.findMany({ where, include: { client: { select: { id: true, name: true, slug: true } }, location: { select: { id: true, name: true } }, _count: { select: { tickets: true } } }, orderBy: [{ isVip: "desc" }, { lastName: "asc" }, { firstName: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.prisma.contact.count({ where })
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }
  async get(id: string) {
    const contact = await this.database.prisma.contact.findUnique({ where: { id }, include: { client: true, location: true, tickets: { orderBy: { updatedAt: "desc" }, take: 25, include: { device: { select: { hostname: true } }, assignee: { select: { displayName: true } } } }, activities: { orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!contact) throw new NotFoundException("Contact not found.");
    return contact;
  }
  async create(dto: CreateContactDto, actor: AuthenticatedUser) {
    return this.database.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({ data: { ...dto, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), email: dto.email?.toLowerCase(), alternateEmail: dto.alternateEmail?.toLowerCase() } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "contact.created", objectType: "Contact", objectId: contact.id, newValue: toJsonValue(contact) as never } });
      return contact;
    });
  }
  async update(id: string, dto: UpdateContactDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Contact not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.contact.update({ where: { id }, data: { ...dto,
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() ?? null } : {}),
        ...(dto.alternateEmail !== undefined ? { alternateEmail: dto.alternateEmail?.toLowerCase() ?? null } : {})
      } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "contact.updated", objectType: "Contact", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      return updated;
    });
  }
}
