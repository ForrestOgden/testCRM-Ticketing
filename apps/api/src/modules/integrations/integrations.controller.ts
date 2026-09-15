import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { UpdateIntegrationDto } from "./integrations.dto";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @Permissions("integration.manage")
  list() {
    return this.integrations.list();
  }

  @Get(":provider/:name")
  @Permissions("integration.manage")
  get(@Param("provider") provider: string, @Param("name") name: string) {
    return this.integrations.get(provider, name);
  }

  @Patch(":provider")
  @Permissions("integration.manage")
  update(@Param("provider") provider: string, @Body() dto: UpdateIntegrationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrations.upsert(provider, dto, actor);
  }

  @Post(":provider/test")
  @Permissions("integration.manage")
  test(@Param("provider") provider: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrations.test(provider, actor);
  }

  @Post(":provider/sync")
  @Permissions("integration.manage")
  sync(@Param("provider") provider: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrations.trigger(provider, actor);
  }
}
