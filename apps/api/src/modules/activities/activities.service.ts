import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { CreateActivityDto, ListActivitiesQuery, UpdateActivityDto } from "./activities.dto";

function parseDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date.");
  return date;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListActivitiesQuery) {
    const where = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.state === "open" ? { completedAt: null } : {}),
      ...(query.state === "completed" ? { completedAt: { not: null } } : {})
    };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.activity.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, slug: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          ticket: { select: { id: true, number: true, subject: true } },
          owner: { select: { id: true, displayName: true } }
        },
        orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.prisma.activity.count({ where })
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async create(dto: CreateActivityDto, actor: AuthenticatedUser) {
    return this.database.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({ data: {
        kind: dto.kind, title: dto.title.trim(), body: dto.body,
        clientId: dto.clientId, contactId: dto.contactId, opportunityId: dto.opportunityId,
        ticketId: dto.ticketId, ownerId: dto.ownerId ?? actor.id, dueAt: parseDate(dto.dueAt)
      } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "activity.created", objectType: "Activity", objectId: activity.id, newValue: toJsonValue(activity) as never } });
      return activity;
    });
  }

  async update(id: string, dto: UpdateActivityDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Activity not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.activity.update({ where: { id }, data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: parseDate(dto.dueAt) } : {}),
        ...(dto.completedAt !== undefined ? { completedAt: parseDate(dto.completedAt) } : {})
      } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: updated.completedAt && !existing.completedAt ? "activity.completed" : "activity.updated", objectType: "Activity", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      if (updated.completedAt && !existing.completedAt) {
        await tx.outboxEvent.create({ data: { eventType: "ActivityCompleted", aggregateType: "Activity", aggregateId: id, payload: { activityId: id, ownerId: updated.ownerId } } });
      }
      return updated;
    });
  }
}
