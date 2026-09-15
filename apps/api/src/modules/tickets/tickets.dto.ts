import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { TicketEntryKind, TicketPriority, TicketStatus, TicketType } from "@msp-crm/database";

export class CreateTicketDto {
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(20000) description!: string;
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() deviceId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() queueId?: string;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsEnum(TicketType) type?: TicketType;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(20000) initialMessage?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @IsUUID() assigneeId?: string | null;
  @IsOptional() @IsUUID() queueId?: string | null;
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsEnum(TicketType) type?: TicketType;
  @IsOptional() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string | null;
}

export class CreateTicketEntryDto {
  @IsEnum(TicketEntryKind) kind!: TicketEntryKind;
  @IsString() @MaxLength(50000) bodyText!: string;
}

export class ListTicketsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() queueId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}
