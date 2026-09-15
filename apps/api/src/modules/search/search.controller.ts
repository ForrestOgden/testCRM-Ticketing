import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { Permissions } from "../../auth/permissions.decorator";
import { DatabaseService } from "../../common/database.module";

@Controller("search")
export class SearchController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Permissions("crm.read")
  async search(@Query("q") q?: string) {
    const query = q?.trim();
    if (!query || query.length < 2) throw new BadRequestException("Search query must be at least two characters.");
    const [clients, contacts, devices, tickets] = await Promise.all([
      this.database.prisma.client.findMany({
        where: { archivedAt: null, OR: [{ name: { contains: query, mode: "insensitive" } }, { primaryDomain: { contains: query, mode: "insensitive" } }] },
        take: 8, select: { id: true, slug: true, name: true, primaryDomain: true, lifecycleStatus: true }
      }),
      this.database.prisma.contact.findMany({
        where: { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] },
        take: 8, include: { client: { select: { name: true, slug: true } } }
      }),
      this.database.prisma.device.findMany({
        where: { retiredAt: null, OR: [{ hostname: { contains: query, mode: "insensitive" } }, { serialNumber: { contains: query, mode: "insensitive" } }, { lastLoggedInUser: { contains: query, mode: "insensitive" } }, { internalIp: { contains: query, mode: "insensitive" } }] },
        take: 8, include: { client: { select: { name: true, slug: true } } }
      }),
      this.database.prisma.ticket.findMany({
        where: { OR: [{ subject: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { entries: { some: { bodyText: { contains: query, mode: "insensitive" } } } }] },
        take: 8, include: { client: { select: { name: true, slug: true } } }, orderBy: { updatedAt: "desc" }
      })
    ]);

    return [
      ...clients.map((item) => ({ type: "client", id: item.id, title: item.name, subtitle: item.primaryDomain, href: `/clients/${item.slug}` })),
      ...contacts.map((item) => ({ type: "contact", id: item.id, title: `${item.firstName} ${item.lastName}`, subtitle: `${item.email ?? "No email"} · ${item.client.name}`, href: `/contacts/${item.id}` })),
      ...devices.map((item) => ({ type: "device", id: item.id, title: item.hostname, subtitle: `${item.client.name} · ${item.serialNumber ?? "No serial"}`, href: `/devices/${item.id}` })),
      ...tickets.map((item) => ({ type: "ticket", id: item.id, title: `TKT-${item.number.toString().padStart(6, "0")} · ${item.subject}`, subtitle: item.client.name, href: `/tickets/${item.id}` }))
    ];
  }
}
