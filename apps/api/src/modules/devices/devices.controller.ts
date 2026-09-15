import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { CurrentUser } from "../../auth/current-user.decorator";
import { Permissions } from "../../auth/permissions.decorator";
import type { AuthenticatedUser } from "../../auth/auth.types";
import { DevicesService } from "./devices.service";
import { ListDevicesQuery, UpdateDeviceDto } from "./devices.dto";

@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}
  @Get() @Permissions("device.read") list(@Query() query: ListDevicesQuery) { return this.devices.list(query); }
  @Get(":id") @Permissions("device.read") get(@Param("id") id: string) { return this.devices.get(id); }
  @Patch(":id") @Permissions("device.write") update(@Param("id") id: string, @Body() dto: UpdateDeviceDto, @CurrentUser() actor: AuthenticatedUser) { return this.devices.update(id, dto, actor); }
}
