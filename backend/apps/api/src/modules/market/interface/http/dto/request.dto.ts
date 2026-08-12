import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';

class RequestLocationDto {
  @IsOptional() @IsUUID() division_id?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lon?: number;
}
export class PublishRequestDto {
  @IsUUID() category_id: string;
  @IsString() @Length(1, 160) title: string;
  @IsString() @Length(1, 2000) description: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budget_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budget_max?: number;
  @IsOptional() @IsDateString() desired_date?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']) urgency = 'NORMAL';
  @ValidateNested() @Type(() => RequestLocationDto) location: RequestLocationDto;
}
export class CancelRequestDto {
  @IsString() @Length(1, 500) reason: string;
  @Type(() => Number) @IsInt() @Min(1) version: number;
}
export class ListRequestsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() cursor?: string;
}
