import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../common/database.module";
import { toJsonValue } from "../../common/json";
import type { AuthenticatedUser } from "../../auth/auth.types";
import type { ListDevicesQuery, UpdateDeviceDto } from "./devices.dto";

@Injectable()
export class DevicesService {
  constructor(private readonly database: DatabaseService) {}
  async list(query: ListDevicesQuery) {
    const isOnline = query.online === "true" ? true : query.online === "false" ? false : undefined;
    const where = { retiredAt: null, ...(query.clientId ? { clientId: query.clientId } : {}), ...(isOnline !== undefined ? { isOnline } : {}), ...(query.search ? { OR: [
      { hostname: { contains: query.search, mode: "insensitive" as const } }, { serialNumber: { contains: query.search, mode: "insensitive" as const } },
      { lastLoggedInUser: { contains: query.search, mode: "insensitive" as const } }, { internalIp: { contains: query.search, mode: "insensitive" as const } },
      { client: { name: { contains: query.search, mode: "insensitive" as const } } }
    ] } : {}) };
    const [items, total] = await this.database.prisma.$transaction([
      this.database.prisma.device.findMany({ where, include: { client: { select: { id: true, name: true, slug: true } }, location: { select: { id: true, name: true } }, rmmSite: { select: { id: true, name: true, provider: true } }, _count: { select: { tickets: true, rmmAlerts: true } } }, orderBy: [{ isOnline: "desc" }, { hostname: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.prisma.device.count({ where })
    ]);
    return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }
  async get(id: string) {
    const device = await this.database.prisma.device.findUnique({ where: { id }, include: { client: true, location: true, rmmSite: true, rmmAlerts: { orderBy: { raisedAt: "desc" }, take: 50 }, tickets: { orderBy: { updatedAt: "desc" }, take: 30, include: { assignee: { select: { displayName: true } } } }, supportEndpoint: { select: { appVersion: true, lastSeenAt: true, revokedAt: true } } } });
    if (!device) throw new NotFoundException("Device not found.");
    return device;
  }
  async update(id: string, dto: UpdateDeviceDto, actor: AuthenticatedUser) {
    const existing = await this.database.prisma.device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Device not found.");
    return this.database.prisma.$transaction(async (tx) => {
      const updated = await tx.device.update({ where: { id }, data: dto });
      await tx.auditEvent.create({ data: { actorId: actor.id, action: "device.updated", objectType: "Device", objectId: id, oldValue: toJsonValue(existing) as never, newValue: toJsonValue(updated) as never } });
      return updated;
    });
  }
}
