import { IsEmail, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class ProvisionSupportEndpointDto {
  @IsUUID() deviceId!: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}

export class SupportRequestDto {
  @IsString() @MinLength(3) @MaxLength(240) subject!: string;
  @IsString() @MinLength(3) @MaxLength(100000) description!: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(200) userName?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
