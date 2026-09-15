import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { CreateTicketDto, CreateTicketEntryDto, ListTicketsQuery, UpdateTicketDto } from "./tickets.dto";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}
  @Get() @Permissions("ticket.read") list(@Query() query: ListTicketsQuery) { return this.tickets.list(query); }
  @Get(":id") @Permissions("ticket.read") get(@Param("id") id: string) { return this.tickets.get(id); }
  @Post() @Permissions("ticket.write") create(@Body() dto: CreateTicketDto, @CurrentUser() actor: AuthenticatedUser) { return this.tickets.create(dto, actor); }
  @Patch(":id") @Permissions("ticket.write") update(@Param("id") id: string, @Body() dto: UpdateTicketDto, @CurrentUser() actor: AuthenticatedUser) { return this.tickets.update(id, dto, actor); }
  @Post(":id/entries") @Permissions("ticket.write") addEntry(@Param("id") id: string, @Body() dto: CreateTicketEntryDto, @CurrentUser() actor: AuthenticatedUser) { return this.tickets.addEntry(id, dto, actor); }
}
