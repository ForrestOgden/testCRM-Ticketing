import { Controller, Get } from "@nestjs/common";
import { Permissions } from "../auth/permissions.decorator";
import { DatabaseService } from "../common/database.module";

@Controller("directory")
export class DirectoryController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Permissions("crm.read")
  async get() {
    const [users, queues, tags] = await Promise.all([
      this.database.prisma.user.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, email: true }
      }),
      this.database.prisma.ticketQueue.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" }
      }),
      this.database.prisma.tag.findMany({ orderBy: { name: "asc" } })
    ]);
    return { users, queues, tags };
  }
}
