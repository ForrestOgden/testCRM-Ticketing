import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { CreateOpportunityDto, ListOpportunitiesQuery, UpdateOpportunityDto } from "./opportunities.dto";

function money(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) throw new BadRequestException("valueCents must contain digits only.");
  return BigInt(value);
}

function date(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException("Invalid date.");
  return parsed;
}

@Injectable()
export class OpportunitiesService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: ListOpportunitiesQuery) {
    const where = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" as const } },
        { client: { name: { contains: query.search, mode: "insensitive" as const } } }
      ] } : {})
    };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.opportunity.findMany({
        where,
        include: { client: { select: { id: true, name: true, slug: true } }, owner: { select: { id: true, displayName: true } }, contacts: { include: { contact: true } } },
        orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.prisma.opportunity.count({ where })
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async create(dto: CreateOpportunityDto, actor: AuthenticatedUser) {
    return this.database.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({ data: {
        clientId: dto.clientId, name: dto.name.trim(), ownerId: dto.ownerId,
        valueCents: money(dto.valueCents), probability: dto.probability,
        pipeline: dto.pipeline.trim(), stage: dto.stage.trim().toUpperCase(),
        expectedCloseAt: date(dto.expectedCloseAt), notes: dto.notes
      }, include: { client: { select: { id: true, name: true, slug: true } } } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "opportunity.created", objectType: "Opportunity", objectId: opportunity.id, newValue: toJsonValue(opportunity) as never } });
      await tx.outboxEvent.create({ data: { eventType: "OpportunityCreated", aggregateType: "Opportunity", aggregateId: opportunity.id, payload: { opportunityId: opportunity.id, clientId: opportunity.clientId } } });
      return opportunity;
    });
  }

  async update(id: string, dto: UpdateOpportunityDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.opportunity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Opportunity not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.opportunity.update({ where: { id }, data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.valueCents !== undefined ? { valueCents: money(dto.valueCents) } : {}),
        ...(dto.probability !== undefined ? { probability: dto.probability } : {}),
        ...(dto.pipeline !== undefined ? { pipeline: dto.pipeline.trim() } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage.trim().toUpperCase() } : {}),
        ...(dto.expectedCloseAt !== undefined ? { expectedCloseAt: date(dto.expectedCloseAt) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {})
      }, include: { client: { select: { id: true, name: true, slug: true } }, owner: { select: { id: true, displayName: true } } } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "opportunity.updated", objectType: "Opportunity", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      const normalized = updated.stage.toUpperCase();
      const eventType = normalized === "WON" && existing.stage.toUpperCase() !== "WON" ? "OpportunityWon" : normalized === "LOST" && existing.stage.toUpperCase() !== "LOST" ? "OpportunityLost" : "OpportunityUpdated";
      await tx.outboxEvent.create({ data: { eventType, aggregateType: "Opportunity", aggregateId: id, payload: { opportunityId: id, clientId: updated.clientId, stage: updated.stage } } });
      return updated;
    });
  }
}
