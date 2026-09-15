import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { ContactsService } from "./contacts.service";
import { CreateContactDto, ListContactsQuery, UpdateContactDto } from "./contacts.dto";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}
  @Get() @Permissions("contact.read") list(@Query() query: ListContactsQuery) { return this.contacts.list(query); }
  @Get(":id") @Permissions("contact.read") get(@Param("id") id: string) { return this.contacts.get(id); }
  @Post() @Permissions("contact.write") create(@Body() dto: CreateContactDto, @CurrentUser() actor: AuthenticatedUser) { return this.contacts.create(dto, actor); }
  @Patch(":id") @Permissions("contact.write") update(@Param("id") id: string, @Body() dto: UpdateContactDto, @CurrentUser() actor: AuthenticatedUser) { return this.contacts.update(id, dto, actor); }
}
