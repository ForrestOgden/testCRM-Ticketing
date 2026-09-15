import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateOpportunityDto {
  @IsUUID() clientId!: string;
  @IsString() @MaxLength(250) name!: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() valueCents?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsString() @MaxLength(120) pipeline!: string;
  @IsString() @MaxLength(120) stage!: string;
  @IsOptional() @IsString() expectedCloseAt?: string;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @MaxLength(250) name?: string;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsString() valueCents?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number | null;
  @IsOptional() @IsString() @MaxLength(120) pipeline?: string;
  @IsOptional() @IsString() @MaxLength(120) stage?: string;
  @IsOptional() @IsString() expectedCloseAt?: string | null;
  @IsOptional() @IsString() @MaxLength(20000) notes?: string | null;
}

export class ListOpportunitiesQuery {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 50;
}
