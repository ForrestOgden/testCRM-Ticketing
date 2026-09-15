import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ExternalProvider, JobStatus } from "@msp-crm/database";
import { DatabaseService } from "../../common/database.module";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { toJsonValue } from "../../common/json";
import type { UpdateIntegrationDto } from "./integrations.dto";

function providerFromParam(value: string) {
  const normalized = value.trim().toUpperCase().replaceAll("-", "_");
  if (!Object.values(ExternalProvider).includes(normalized as ExternalProvider)) {
    throw new BadRequestException("Unsupported integration provider.");
  }
  return normalized as ExternalProvider;
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const rows = await this.database.prisma.integrationConnection.findMany({
      orderBy: [{ provider: "asc" }, { name: "asc" }],
      select: { id: true, provider: true, name: true, status: true, config: true, lastSyncAt: true, lastError: true, createdAt: true, updatedAt: true },
    });
    const jobs = await this.database.prisma.backgroundJob.groupBy({
      by: ["queue", "status"],
      where: { status: { in: [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.FAILED, JobStatus.DEAD] } },
      _count: true,
    });
    return { items: rows, jobs };
  }

  async upsert(providerParam: string, dto: UpdateIntegrationDto, actor: AuthenticatedUser) {
    const provider = providerFromParam(providerParam);
    const name = dto.name?.trim() || (provider === ExternalProvider.DATTO_RMM ? "Datto RMM" : provider === ExternalProvider.MICROSOFT_GRAPH ? "Microsoft Graph" : "Autotask");
    const previous = await this.database.prisma.integrationConnection.findUnique({ where: { provider_name: { provider, name } } });
    const status = dto.enabled === false ? "DISCONNECTED" : previous?.status ?? "CONNECTING";
    const record = await this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.integrationConnection.upsert({
        where: { provider_name: { provider, name } },
        create: { provider, name, status, config: (dto.config ?? {}) as never },
        update: { status, ...(dto.config ? { config: dto.config as never } : {}) },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: previous ? "integration.updated" : "integration.created",
          objectType: "IntegrationConnection",
          objectId: updated.id,
          oldValue: previous ? toJsonValue(previous) as never : undefined,
          newValue: toJsonValue(updated) as never,
        },
      });
      return updated;
    });
    return record;
  }

  async trigger(providerParam: string, actor: AuthenticatedUser) {
    const provider = providerFromParam(providerParam);
    let jobName: string;
    if (provider === ExternalProvider.DATTO_RMM) jobName = "datto.sync";
    else if (provider === ExternalProvider.MICROSOFT_GRAPH) jobName = "graph.subscription";
    else throw new BadRequestException("Manual sync is not implemented for this provider.");

    const existing = await this.database.prisma.backgroundJob.findFirst({
      where: { name: jobName, status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } },
    });
    if (existing) return existing;
    const job = await this.database.prisma.$transaction(async (tx) => {
      const created = await tx.backgroundJob.create({ data: { queue: "integrations", name: jobName, payload: {}, runAfter: new Date() } });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "integration.sync_requested", objectType: "BackgroundJob", objectId: created.id, newValue: { provider, jobName } } });
      return created;
    });
    return job;
  }

  async get(providerParam: string, name: string) {
    const provider = providerFromParam(providerParam);
    const row = await this.database.prisma.integrationConnection.findUnique({ where: { provider_name: { provider, name } } });
    if (!row) throw new NotFoundException("Integration connection not found.");
    const { encryptedSecret: _encryptedSecret, ...safe } = row;
    return safe;
  }
}
