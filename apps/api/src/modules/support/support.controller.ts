import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import { Public } from "../../auth/public.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { ProvisionSupportEndpointDto, SupportHeartbeatDto, SupportRequestDto } from "./support.dto";
import { SupportService } from "./support.service";

function bearer(value: string | undefined) {
  if (!value) return undefined;
  return value.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

@Controller("support")
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post("endpoints/provision")
  @Permissions("device.write")
  provision(@Body() dto: ProvisionSupportEndpointDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.support.provision(dto, actor);
  }

  @Post("endpoints/:deviceId/revoke")
  @Permissions("device.write")
  revoke(@Param("deviceId") deviceId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.support.revoke(deviceId, actor);
  }

  @Public()
  @Post("endpoint/heartbeat")
  heartbeat(
    @Headers("x-support-enrollment") enrollmentId: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Body() dto: SupportHeartbeatDto,
  ) {
    return this.support.heartbeat(enrollmentId, bearer(authorization), dto.appVersion, dto.metadata);
  }

  @Public()
  @Post("endpoint/tickets")
  createTicket(
    @Headers("x-support-enrollment") enrollmentId: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Body() dto: SupportRequestDto,
  ) {
    return this.support.createRequest(enrollmentId, bearer(authorization), dto);
  }
}
