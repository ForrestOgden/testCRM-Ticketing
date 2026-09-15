import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateContactDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(150) department?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEmail() alternateEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) officePhone?: string;
  @IsOptional() @IsString() @MaxLength(50) mobilePhone?: string;
  @IsOptional() @IsString() @MaxLength(50) preferredCommunication?: string;
  @IsOptional() @IsBoolean() isDecisionMaker?: boolean;
  @IsOptional() @IsBoolean() isTechnicalContact?: boolean;
  @IsOptional() @IsBoolean() isBillingContact?: boolean;
  @IsOptional() @IsBoolean() isVip?: boolean;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}

export class UpdateContactDto {
  @IsOptional() @IsUUID() locationId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string | null;
  @IsOptional() @IsString() @MaxLength(150) department?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsEmail() alternateEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(50) officePhone?: string | null;
  @IsOptional() @IsString() @MaxLength(50) mobilePhone?: string | null;
  @IsOptional() @IsString() @MaxLength(50) preferredCommunication?: string | null;
  @IsOptional() @IsBoolean() isDecisionMaker?: boolean;
  @IsOptional() @IsBoolean() isTechnicalContact?: boolean;
  @IsOptional() @IsBoolean() isBillingContact?: boolean;
  @IsOptional() @IsBoolean() isVip?: boolean;
  @IsOptional() @IsBoolean() isInactive?: boolean;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string | null;
}

export class ListContactsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}
