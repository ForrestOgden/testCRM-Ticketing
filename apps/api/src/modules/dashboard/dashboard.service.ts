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
  TicketStatus.SCHEDULED,
];

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async summary(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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
      tasksDueToday,
      myTickets,
      recentTickets,
      topClients,
      opportunityTotals,
      liveAlerts,
      todayTasks,
      healthBuckets,
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
      this.database.prisma.activity.count({ where: { completedAt: null, dueAt: { gte: today, lt: tomorrow } } }),
      this.database.prisma.ticket.findMany({
        where: { assigneeId: userId, status: { in: openStatuses } },
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
        take: 8,
        include: { client: { select: { name: true, slug: true } }, device: { select: { hostname: true } } },
      }),
      this.database.prisma.ticket.findMany({
        where: { status: { in: openStatuses } },
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
        take: 10,
        include: { client: { select: { name: true, slug: true } }, assignee: { select: { displayName: true } } },
      }),
      this.database.prisma.client.findMany({
        where: { archivedAt: null },
        take: 8,
        orderBy: { tickets: { _count: "desc" } },
        include: { _count: { select: { tickets: true, devices: true } } },
      }),
      this.database.prisma.opportunity.aggregate({
        where: { stage: { notIn: ["WON", "LOST"] } },
        _sum: { valueCents: true },
        _count: { id: true },
      }),
      this.database.prisma.rmmAlert.findMany({
        where: { isOpen: true },
        orderBy: [{ raisedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: { device: { select: { id: true, hostname: true, client: { select: { id: true, name: true, slug: true } } } } },
      }),
      this.database.prisma.activity.findMany({
        where: { completedAt: null, dueAt: { gte: today, lt: tomorrow }, OR: [{ ownerId: userId }, { ownerId: null }] },
        orderBy: { dueAt: "asc" },
        take: 8,
        include: { client: { select: { name: true, slug: true } }, ticket: { select: { number: true, subject: true } } },
      }),
      this.database.prisma.client.findMany({
        where: { lifecycleStatus: "ACTIVE", archivedAt: null },
        select: { relationshipHealth: true },
      }),
    ]);

    const health = healthBuckets.reduce(
      (result, client) => {
        const score = client.relationshipHealth ?? 75;
        if (score >= 80) result.healthy++;
        else if (score >= 60) result.watch++;
        else result.atRisk++;
        result.totalScore += score;
        return result;
      },
      { healthy: 0, watch: 0, atRisk: 0, totalScore: 0 },
    );

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
        tasksDueToday,
        pipelineValueCents: opportunityTotals._sum.valueCents ?? BigInt(0),
        openOpportunities: opportunityTotals._count.id,
        averageClientHealth: healthBuckets.length ? Math.round(health.totalScore / healthBuckets.length) : 100,
      },
      clientHealth: { healthy: health.healthy, watch: health.watch, atRisk: health.atRisk },
      myTickets: myTickets.map((ticket) => ({ ...ticket, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}` })),
      recentTickets: recentTickets.map((ticket) => ({ ...ticket, displayNumber: `TKT-${ticket.number.toString().padStart(6, "0")}` })),
      topClients,
      liveAlerts,
      todayTasks: todayTasks.map((task) => ({
        ...task,
        ticket: task.ticket ? { ...task.ticket, displayNumber: `TKT-${task.ticket.number.toString().padStart(6, "0")}` } : null,
      })),
    };
  }
}
