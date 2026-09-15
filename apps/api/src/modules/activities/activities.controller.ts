import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { ActivitiesService } from "./activities.service";
import { CreateActivityDto, ListActivitiesQuery, UpdateActivityDto } from "./activities.dto";

@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}
  @Get() @Permissions("activity.read") list(@Query() query: ListActivitiesQuery) { return this.activities.list(query); }
  @Post() @Permissions("activity.write") create(@Body() dto: CreateActivityDto, @CurrentUser() actor: AuthenticatedUser) { return this.activities.create(dto, actor); }
  @Patch(":id") @Permissions("activity.write") update(@Param("id") id: string, @Body() dto: UpdateActivityDto, @CurrentUser() actor: AuthenticatedUser) { return this.activities.update(id, dto, actor); }
}
