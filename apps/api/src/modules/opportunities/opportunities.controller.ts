import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { CreateOpportunityDto, ListOpportunitiesQuery, UpdateOpportunityDto } from "./opportunities.dto";
import { OpportunitiesService } from "./opportunities.service";

@Controller("opportunities")
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}
  @Get() @Permissions("opportunity.read") list(@Query() query: ListOpportunitiesQuery) { return this.opportunities.list(query); }
  @Post() @Permissions("opportunity.write") create(@Body() dto: CreateOpportunityDto, @CurrentUser() actor: AuthenticatedUser) { return this.opportunities.create(dto, actor); }
  @Patch(":id") @Permissions("opportunity.write") update(@Param("id") id: string, @Body() dto: UpdateOpportunityDto, @CurrentUser() actor: AuthenticatedUser) { return this.opportunities.update(id, dto, actor); }
}
