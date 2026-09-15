import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DatabaseService } from "../common/database.module";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get("live")
  @Public()
  live() {
    return { status: "ok", service: "api" };
  }

  @Get("ready")
  @Public()
  async ready() {
    try {
      await this.database.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "ok" };
    } catch {
      throw new ServiceUnavailableException({
        status: "not-ready",
        database: "unavailable"
      });
    }
  }
}
