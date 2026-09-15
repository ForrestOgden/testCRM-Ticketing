import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class ListDevicesQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() online?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}
export class UpdateDeviceDto {
  @IsOptional() @IsString() @MaxLength(250) description?: string | null;
  @IsOptional() @IsUUID() locationId?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) rmmUrl?: string | null;
}
