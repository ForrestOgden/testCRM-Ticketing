import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { ClientsService } from "./clients.service";
import { CreateClientDto, ListClientsQuery, UpdateClientDto } from "./clients.dto";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}
  @Get() @Permissions("crm.read") list(@Query() query: ListClientsQuery) { return this.clients.list(query); }
  @Get(":id") @Permissions("crm.read") get(@Param("id") id: string) { return this.clients.get(id); }
  @Post() @Permissions("crm.write") create(@Body() dto: CreateClientDto, @CurrentUser() actor: AuthenticatedUser) { return this.clients.create(dto, actor); }
  @Patch(":id") @Permissions("crm.write") update(@Param("id") id: string, @Body() dto: UpdateClientDto, @CurrentUser() actor: AuthenticatedUser) { return this.clients.update(id, dto, actor); }
  @Delete(":id") @Permissions("crm.archive") archive(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) { return this.clients.archive(id, actor); }
}
