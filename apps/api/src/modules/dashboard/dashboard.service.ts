import { Injectable } from "@nestjs/common";
import { TicketStatus } from "@msp-crm/database";
import { DatabaseService } from "../../common/database.module";

const openStatuses = [
  TicketStatus.NEW,
  TicketStatus.TRIAGE,
  TicketStatus.ASSIGNED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.WAITING_CUSTOMER,
  TicketStatus.WAITING_VENDOR,
  TicketStatus.SCHEDULED
];

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async summary(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      openTickets,
      unassigned,
      critical,
      waitingCustomer,
      resolvedToday,
      activeClients,
      totalDevices,
      onlineDevices,
      clientsWithAlerts,
      myTickets,
      recentTickets,
      topClients,
      opportunityTotals
    ] = await Promise.all([
      this.database.prisma.ticket.count({ where: { status: { in: openStatuses } } }),
      this.database.prisma.ticket.count({ where: { status: { in: openStatuses }, assigneeId: null } }),
      this.database.prisma.ticket.count({ where: { status: { in: openStatuses }, priority: "P1_CRITICAL" } }),
      this.database.prisma.ticket.count({ where: { status: "WAITING_CUSTOMER" } }),
      this.database.prisma.ticket.count({ where: { resolvedAt: { gte: today } } }),
      this.database.prisma.client.count({ where: { lifecycleStatus: "ACTIVE", archivedAt: null } }),
      this.database.prisma.device.count({ where: { retiredAt: null } }),
      this.database.prisma.device.count({ where: { retiredAt: null, isOnline: true } }),
      this.database.prisma.client.count({ where: { archivedAt: null, devices: { some: { rmmAlerts: { some: { isOpen: true } } } } } }),
      this.database.prisma.ticket.findMany({
        where: { assigneeId: userId, status: { in: openStatuses } },
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
        take: 8,
        include: { client: { select: { name: true, slug: true } }, device: { select: { hostname: true } } }
      }),
      this.database.prisma.ticket.findMany({
        orderBy: { updatedAt: "desc" }, take: 8,
        include: { client: { select: { name: true, slug: true } }, assignee: { select: { displayName: true } } }
      }),
      this.database.prisma.client.findMany({
        where: { archivedAt: null }, take: 8,
        orderBy: { tickets: { _count: "desc" } },
        include: { _count: { select: { tickets: true, devices: true } } }
      }),
      this.database.prisma.opportunity.aggregate({
        where: { stage: { notIn: ["WON", "LOST"] } },
        _sum: { valueCents: true }, _count: { id: true }
      })
    ]);

    return {
      metrics: {
        openTickets,
        unassigned,
        critical,
        waitingCustomer,
        resolvedToday,
        activeClients,
        totalDevices,
        onlineDevices,
        endpointHealthPercent: totalDevices ? Math.round((onlineDevices / totalDevices) * 1000) / 10 : 100,
        clientsWithAlerts,
        pipelineValueCents: opportunityTotals._sum.valueCents ?? BigInt(0),
        openOpportunities: opportunityTotals._count.id
      },
      myTickets: myTickets.map((ticket) => ({ ...ticket, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}` })),
      recentTickets: recentTickets.map((ticket) => ({ ...ticket, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}` })),
      topClients
    };
  }
}
