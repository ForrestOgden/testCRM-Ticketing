import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get()
  @Permissions("crm.read", "ticket.read")
  get(@CurrentUser() user: AuthenticatedUser) { return this.dashboard.summary(user.id); }
}
