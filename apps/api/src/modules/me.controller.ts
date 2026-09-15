import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";

@Controller("me")
export class MeController {
  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
