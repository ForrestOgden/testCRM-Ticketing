import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { ActivityKind } from "@msp-crm/database";

export class CreateActivityDto {
  @IsEnum(ActivityKind) kind!: ActivityKind;
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() ticketId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() dueAt?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(20000) body?: string | null;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsString() dueAt?: string | null;
  @IsOptional() @IsString() completedAt?: string | null;
}

export class ListActivitiesQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsEnum(ActivityKind) kind?: ActivityKind;
  @IsOptional() @IsString() state?: "open" | "completed";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 50;
}
