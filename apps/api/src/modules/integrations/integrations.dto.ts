import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateIntegrationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
