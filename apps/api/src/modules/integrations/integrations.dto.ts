import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateIntegrationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsObject() secrets?: Record<string, string>;
  @IsOptional() @IsArray() @IsString({ each: true }) clearSecretKeys?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}
