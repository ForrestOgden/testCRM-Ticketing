import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { Type } from "class-transformer";
import { ClientLifecycleStatus } from "@msp-crm/database";

export class CreateClientDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) dbaName?: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsEnum(ClientLifecycleStatus) lifecycleStatus?: ClientLifecycleStatus;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsInt() @Min(0) employeeCount?: number;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string;
  @IsOptional() @IsString() @MaxLength(255) primaryDomain?: string;
  @IsOptional() @IsString() @MaxLength(50) mainPhone?: string;
  @IsOptional() @IsEmail() generalEmail?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) relationshipHealth?: number;
  @IsOptional() @IsString() @MaxLength(10000) internalNotes?: string;
}

export class UpdateClientDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) dbaName?: string | null;
  @IsOptional() @IsEnum(ClientLifecycleStatus) lifecycleStatus?: ClientLifecycleStatus;
  @IsOptional() @IsString() @MaxLength(120) industry?: string | null;
  @IsOptional() @IsInt() @Min(0) employeeCount?: number | null;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string | null;
  @IsOptional() @IsString() @MaxLength(255) primaryDomain?: string | null;
  @IsOptional() @IsString() @MaxLength(50) mainPhone?: string | null;
  @IsOptional() @IsEmail() generalEmail?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) relationshipHealth?: number | null;
  @IsOptional() @IsString() @MaxLength(10000) internalNotes?: string | null;
}

export class ListClientsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(ClientLifecycleStatus) status?: ClientLifecycleStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}
