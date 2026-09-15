import { Controller, Get, Query } from "@nestjs/common";
import { Permissions } from "../../auth/permissions.decorator";
import { DatabaseService } from "../../common/database.module";

@Controller("reports")
export class ReportsController {
  constructor(private readonly database: DatabaseService) {}

  @Get("support")
  @Permissions("report.read")
  async support(@Query("days") daysInput?: string) {
    const days = Math.min(365, Math.max(1, Number(daysInput ?? 30) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [created, resolved, byStatus, byPriority, tickets, topClients] = await Promise.all([
      this.database.prisma.ticket.count({ where: { createdAt: { gte: since } } }),
      this.database.prisma.ticket.count({ where: { resolvedAt: { gte: since } } }),
      this.database.prisma.ticket.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.database.prisma.ticket.groupBy({ by: ["priority"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.database.prisma.ticket.findMany({ where: { createdAt: { gte: since }, firstResponseAt: { not: null } }, select: { createdAt: true, firstResponseAt: true } }),
      this.database.prisma.client.findMany({
        where: { archivedAt: null }, take: 10,
        orderBy: { tickets: { _count: "desc" } },
        select: { id: true, name: true, slug: true, _count: { select: { tickets: true, devices: true } } }
      })
    ]);
    const responseMinutes = tickets.map((ticket) => (ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime()) / 60000);
    const averageFirstResponseMinutes = responseMinutes.length ? Math.round((responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length) * 10) / 10 : null;
    return { days, since, created, resolved, averageFirstResponseMinutes, byStatus, byPriority, topClients };
  }
}
